"""
Does test-time augmentation (tta.py) actually help, on real external data,
with the ALREADY-CALIBRATED temperature/threshold -- or does averaging
predictions shift the probability distribution enough that
REFERABLE_TEMPERATURE/REFERABLE_THRESHOLD need refitting? Answered
empirically here before tta.py is wired into the live app, not assumed.

Uses a stratified subsample (not the full 2,260-image external set) to
keep this tractable -- TTA costs ~6x the forward passes of a single
prediction, so validating it needs actual per-image inference, unlike the
threshold-only checks elsewhere that could reuse cached logits.

Usage:
    python validate_tta.py
"""
import cv2
cv2.setNumThreads(0)
cv2.ocl.setUseOpenCL(False)

import numpy as np
import pandas as pd
import torch
from sklearn.metrics import cohen_kappa_score, accuracy_score
from sklearn.model_selection import train_test_split

import config
from dataset import ben_graham_preprocess, get_transforms
from gradcam import GradCAM, load_trained_model
from tta import generate_tta
from validate_external import load_messidor2_df, load_idrid_grading_df

SAMPLE_N = 400


def sens_spec(referable_true, referable_prob, threshold):
    pred = referable_prob > threshold
    tp = np.sum(pred & referable_true)
    fn = np.sum(~pred & referable_true)
    tn = np.sum(~pred & ~referable_true)
    fp = np.sum(pred & ~referable_true)
    return tp / max(1, tp + fn), tn / max(1, tn + fp)


def main():
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = load_trained_model(config.CHECKPOINT_PATH, device)
    cam_tool = GradCAM(model)
    transform = get_transforms(train=False)

    m2 = load_messidor2_df(); m2["dataset"] = "messidor2"
    idrid = load_idrid_grading_df(); idrid["dataset"] = "idrid"
    df = pd.concat([m2, idrid], ignore_index=True)
    df = df[df["path"].apply(lambda p: __import__("os").path.exists(p))].reset_index(drop=True)

    strata = df["dataset"] + "_" + (df["label"] >= 2).astype(str)
    _, sample_idx = train_test_split(
        np.arange(len(df)), test_size=SAMPLE_N, stratify=strata, random_state=config.SEED
    )
    sample = df.iloc[sample_idx].reset_index(drop=True)
    print(f"Sampled {len(sample)} images (stratified by dataset x referable), from n={len(df)} total.")

    labels = sample["label"].values
    referable_true = labels >= 2

    preds_notta, probs_notta = [], []
    preds_tta, probs_tta = [], []

    for i, row in sample.iterrows():
        img = cv2.imread(row["path"])
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        processed = ben_graham_preprocess(img)
        tensor = transform(image=processed)["image"].unsqueeze(0).to(device)

        with torch.no_grad():
            logits = model(tensor)
            import torch.nn.functional as F
            p = F.softmax(logits / config.REFERABLE_TEMPERATURE, dim=1).cpu().numpy()[0]
        preds_notta.append(int(p.argmax()))
        probs_notta.append(p)

        _, cls_tta, p_tta = generate_tta(cam_tool, tensor, temperature=config.REFERABLE_TEMPERATURE)
        preds_tta.append(cls_tta)
        probs_tta.append(p_tta)

        if (i + 1) % 50 == 0:
            print(f"  {i+1}/{len(sample)}")

    probs_notta = np.array(probs_notta)
    probs_tta = np.array(probs_tta)
    preds_notta = np.array(preds_notta)
    preds_tta = np.array(preds_tta)

    print("\n=== 5-class quadratic weighted kappa ===")
    k_notta = cohen_kappa_score(labels, preds_notta, weights="quadratic")
    k_tta = cohen_kappa_score(labels, preds_tta, weights="quadratic")
    a_notta = accuracy_score(labels, preds_notta)
    a_tta = accuracy_score(labels, preds_tta)
    print(f"  No TTA: kappa={k_notta:.4f}  accuracy={a_notta:.4f}")
    print(f"  TTA:    kappa={k_tta:.4f}  accuracy={a_tta:.4f}")

    print(f"\n=== Referable-DR at the EXISTING threshold={config.REFERABLE_THRESHOLD} (no refitting) ===")
    ref_prob_notta = probs_notta[:, 2:].sum(axis=1)
    ref_prob_tta = probs_tta[:, 2:].sum(axis=1)
    sens_n, spec_n = sens_spec(referable_true, ref_prob_notta, config.REFERABLE_THRESHOLD)
    sens_t, spec_t = sens_spec(referable_true, ref_prob_tta, config.REFERABLE_THRESHOLD)
    print(f"  No TTA: sensitivity={sens_n*100:.1f}%  specificity={spec_n*100:.1f}%")
    print(f"  TTA:    sensitivity={sens_t*100:.1f}%  specificity={spec_t*100:.1f}%")

    print(f"\n=== Prediction agreement ===")
    agree = np.mean(preds_notta == preds_tta)
    print(f"  TTA agrees with single-view argmax on {agree*100:.1f}% of images ({np.sum(preds_notta != preds_tta)} disagreements)")

    if k_tta >= k_notta and sens_t >= 0.90:
        print("\nRESULT: TTA does not hurt (kappa) and sensitivity holds at the existing threshold -- safe to wire in without refitting.")
    elif sens_t < 0.90:
        print(f"\nRESULT: TTA shifts probabilities enough that sensitivity at the existing threshold={config.REFERABLE_THRESHOLD} "
              f"drops to {sens_t*100:.1f}% -- refit REFERABLE_THRESHOLD against TTA-averaged probabilities before shipping this.")
    else:
        print(f"\nRESULT: mixed -- kappa {'improved' if k_tta > k_notta else 'did not improve'}, sensitivity held. Review before deciding.")


if __name__ == "__main__":
    main()
