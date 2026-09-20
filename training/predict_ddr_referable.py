"""
DDR-scale extension of predict_idrid_test_referable.py: runs the SAME
production DL grader (6-view TTA, config.TTA_REFERABLE_TEMPERATURE/
THRESHOLD, matching backend/main.py's live /predict path exactly) against
a stratified sample of the DDR dataset (Li et al., "Diagnostic Assessment
of Deep Learning Algorithms for Diabetic Retinopathy Screening", 2019) --
a THIRD, fully independent real dataset (different clinics/cameras than
both IDRiD and Messidor-2, which the existing ablation's test/calibration
sets already use) never touched by this project's training, threshold
calibration, structural-classifier training, or combiner fitting.

Purpose: matlab/tests/compareIntegratedVsSingleTechnique.m's ablation
(the brief's "integrated pipeline outperforms any single technique" claim)
was previously only evidenced on IDRiD's official 103-image test set. This
adds a SECOND, independently-sourced, much larger held-out evaluation
(stratified sample, size chosen for MATLAB structural-extraction runtime
-- see extractDDRStructuralFeatures.m's own cap discussion) using the
SAME already-fit combiner and thresholds, nothing here or in DDR
extraction ever refits anything -- exactly the same "does it generalize"
question this project has repeatedly asked of MAPLES-DR for the
segmentation module, now asked of the full integration claim.

DDR's DR_grading.csv uses the same 0-4 ICDR severity scale as
APTOS/IDRiD/Messidor-2 (0=no DR ... 4=proliferative); referable is defined
identically to every other split in this project: grade >= 2.

Samples STRATIFIED by referable/non-referable (proportional, preserving
real prevalence -- not class-balanced -- matching extractStructuralFeatures.m's
maxN branch exactly, rng seed 42 for reproducibility with that same
convention) rather than running all 12,522 images, purely for the MATLAB
side's extraction-time budget (see extractDDRStructuralFeatures.m). Also
writes the exact sampled image list to a CSV so the MATLAB structural
extraction script reads the IDENTICAL image set -- deliberately NOT
re-deriving the same "random" sample independently in MATLAB, since
NumPy's and MATLAB's RNGs don't produce the same sequence from a shared
seed, which would silently misalign the two sides of the ablation.

Usage:
    python predict_ddr_referable.py [--sample-size 2000]
Produces:
    outputs/ddr_referable_predictions.json
    outputs/ddr_sample_images.csv   (id_code, diagnosis -- read by
        matlab/tests/extractDDRStructuralFeatures.m)
"""
import argparse
import json
import os
import time

import cv2
cv2.setNumThreads(0)
cv2.ocl.setUseOpenCL(False)

import numpy as np
import pandas as pd
import torch

import config
from dataset import ben_graham_preprocess, get_transforms
from gradcam import load_trained_model
from tta import _build_views

DDR_DIR = os.environ.get("DDR_DIR", "./data/ddr")


def softmax(logits, T):
    z = logits / T
    z = z - z.max(axis=-1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=-1, keepdims=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--sample-size", type=int, default=2000)
    args = parser.parse_args()

    img_dir = os.path.join(DDR_DIR, "DR_grading", "DR_grading")
    csv_path = os.path.join(DDR_DIR, "DR_grading.csv")
    out_json_path = os.path.join(config.OUTPUT_DIR, "ddr_referable_predictions.json")
    out_sample_csv_path = os.path.join(config.OUTPUT_DIR, "ddr_sample_images.csv")

    df = pd.read_csv(csv_path)
    df["referable"] = (df["diagnosis"] >= 2).astype(int)

    rng = np.random.RandomState(42)  # matches SEED=42 elsewhere in this project
    n_total = len(df)
    if args.sample_size < n_total:
        idx0 = df.index[df["referable"] == 0].to_numpy()
        idx1 = df.index[df["referable"] == 1].to_numpy()
        frac = args.sample_size / n_total
        n0 = round(frac * len(idx0))
        n1 = args.sample_size - n0
        n1 = min(n1, len(idx1))
        keep0 = rng.choice(idx0, size=n0, replace=False)
        keep1 = rng.choice(idx1, size=n1, replace=False)
        keep_idx = np.sort(np.concatenate([keep0, keep1]))
        df = df.loc[keep_idx].reset_index(drop=True)

    print(f"Sampled {len(df)}/{n_total} DDR images (referable prevalence in sample: "
          f"{100 * df['referable'].mean():.1f}%, {int(df['referable'].sum())}/{len(df)})")

    os.makedirs(config.OUTPUT_DIR, exist_ok=True)
    df[["id_code", "diagnosis"]].to_csv(out_sample_csv_path, index=False)
    print(f"Wrote sampled image list to {out_sample_csv_path} (for MATLAB structural extraction to reuse)")

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Device: {device}")
    model = load_trained_model(config.CHECKPOINT_PATH, device)
    model.eval()
    transform = get_transforms(train=False)
    views = _build_views()

    predictions = []
    t0 = time.time()
    for idx, row in df.iterrows():
        image_name = str(row["id_code"]).strip()
        grade = int(row["diagnosis"])
        image_path = os.path.join(img_dir, image_name)
        if not os.path.isfile(image_path):
            print(f"  (missing image, skipping: {image_name})")
            continue

        img = cv2.imread(image_path)
        if img is None:
            print(f"  (unreadable image, skipping: {image_name})")
            continue
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        processed = ben_graham_preprocess(img)
        tensor = transform(image=processed)["image"].unsqueeze(0).to(device)

        view_logits = np.zeros((len(views), config.NUM_CLASSES), dtype=np.float32)
        with torch.no_grad():
            for v, (forward_fn, _) in enumerate(views):
                view_tensor = forward_fn(tensor)
                view_logits[v, :] = model(view_tensor).cpu().numpy()[0]

        per_view_probs = softmax(view_logits, config.TTA_REFERABLE_TEMPERATURE)
        probs = per_view_probs.mean(axis=0)

        referable_probability = float(probs[2:].sum())
        is_referable = referable_probability > config.TTA_REFERABLE_THRESHOLD
        pred_class = int(probs.argmax())

        # Image name stored WITHOUT extension, matching predict_idrid_test_referable.py's
        # convention (its IDRiD CSV also omits the extension) -- keeps loadAligned's
        # `intersect` join in compareIntegratedVsSingleTechnique.m working the same way
        # for DDR as for IDRiD, no special-casing needed there.
        stem = os.path.splitext(image_name)[0]
        predictions.append({
            "image": stem,
            "true_grade": grade,
            "true_referable": bool(grade >= 2),
            "predicted_class": pred_class,
            "referable_probability": referable_probability,
            "referable_predicted": bool(is_referable),
        })

        if (idx + 1) % 100 == 0:
            elapsed = time.time() - t0
            print(f"  {idx+1}/{len(df)}  ({elapsed:.0f}s elapsed, {elapsed/(idx+1):.2f}s/image)")

    with open(out_json_path, "w") as f:
        json.dump({
            "model": "EfficientNet-B3, 5-epoch checkpoint, TTA (6-view)",
            "tta_referable_temperature": config.TTA_REFERABLE_TEMPERATURE,
            "tta_referable_threshold": config.TTA_REFERABLE_THRESHOLD,
            "source": "DDR (stratified sample, independent third dataset)",
            "predictions": predictions,
        }, f, indent=2)

    n = len(predictions)
    tp = sum(1 for p in predictions if p["referable_predicted"] and p["true_referable"])
    fn = sum(1 for p in predictions if not p["referable_predicted"] and p["true_referable"])
    tn = sum(1 for p in predictions if not p["referable_predicted"] and not p["true_referable"])
    fp = sum(1 for p in predictions if p["referable_predicted"] and not p["true_referable"])
    sens = tp / max(1, tp + fn)
    spec = tn / max(1, tn + fp)
    print(f"\nDL-alone on DDR sample (n={n}): sensitivity={sens*100:.1f}% specificity={spec*100:.1f}%")
    print(f"Wrote {n} predictions to {out_json_path}")


if __name__ == "__main__":
    main()
