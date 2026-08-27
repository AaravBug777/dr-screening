"""
Compute the exact metric the SIH26038 brief specifies: sensitivity and
specificity for REFERABLE DR (grade >= 2), on the same external held-out
data validate_external.py already uses (Messidor-2 + IDRiD Disease
Grading) -- neither dataset was used for training.

Brief's target: >90% sensitivity, >85% specificity for referable DR.
Quadratic weighted kappa (what train.py/validate_external.py report) is the
right metric for the 5-class ordinal task, but it isn't the specific
binary metric the brief names -- this fills that gap.

Usage:
    python compute_referable_metrics.py
"""
import cv2
cv2.setNumThreads(0)
cv2.ocl.setUseOpenCL(False)

import os
import pandas as pd

import config
from dataset import DRDataset
from validate_external import load_messidor2_df, load_idrid_grading_df


def evaluate_referable(name, df, model, device):
    import torch
    from torch.utils.data import DataLoader
    from sklearn.metrics import confusion_matrix
    from tqdm import tqdm

    exists_mask = df["path"].apply(os.path.exists)
    df = df[exists_mask].reset_index(drop=True)

    ds = DRDataset(df, train=False)
    loader = DataLoader(ds, batch_size=config.BATCH_SIZE, shuffle=False, num_workers=config.NUM_WORKERS)

    model.eval()
    all_preds, all_labels = [], []
    with torch.no_grad():
        for imgs, labels in tqdm(loader, desc=name):
            imgs = imgs.to(device)
            logits = model(imgs)
            preds = logits.argmax(dim=1).cpu().numpy()
            all_preds.extend(preds)
            all_labels.extend(labels.numpy())

    # Referable DR: grade >= 2 (Moderate NPDR or worse) -- the SIH brief's
    # own threshold, matching what simulink/throughputParams.m's
    # ReferralRate is also anchored on.
    true_referable = [1 if l >= 2 else 0 for l in all_labels]
    pred_referable = [1 if p >= 2 else 0 for p in all_preds]

    cm = confusion_matrix(true_referable, pred_referable, labels=[0, 1])
    tn, fp, fn, tp = cm.ravel()
    sensitivity = tp / max(1, tp + fn)  # recall on referable cases: did we catch them
    specificity = tn / max(1, tn + fp)  # recall on non-referable cases: did we avoid false alarms

    print(f"\n=== {name} referable DR (grade>=2), n={len(all_labels)} ===")
    print(f"  True referable: {sum(true_referable)} ({100*sum(true_referable)/len(true_referable):.1f}%)")
    print(f"  Sensitivity: {sensitivity:.4f} ({'MEETS' if sensitivity >= 0.90 else 'BELOW'} the >90% target)")
    print(f"  Specificity: {specificity:.4f} ({'MEETS' if specificity >= 0.85 else 'BELOW'} the >85% target)")
    print(f"  Confusion: TN={tn} FP={fp} FN={fn} TP={tp}")

    return {"name": name, "n": len(all_labels), "sensitivity": sensitivity, "specificity": specificity,
            "tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)}


def main():
    print("Loading external dataset labels...")
    messidor_df = load_messidor2_df()
    idrid_df = load_idrid_grading_df()

    import torch
    from gradcam import load_trained_model

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Using device: {device}")
    model = load_trained_model(config.CHECKPOINT_PATH, device)

    results = []
    results.append(evaluate_referable("Messidor-2", messidor_df, model, device))
    results.append(evaluate_referable("IDRiD Disease Grading", idrid_df, model, device))
    combined_df = pd.concat([messidor_df, idrid_df], ignore_index=True)
    results.append(evaluate_referable("Combined external", combined_df, model, device))

    print("\n=== Summary vs. SIH26038 brief's target (>90% sensitivity, >85% specificity) ===")
    for r in results:
        print(f"{r['name']:<25} n={r['n']:<6} sensitivity={r['sensitivity']:.4f}  specificity={r['specificity']:.4f}")


if __name__ == "__main__":
    main()
