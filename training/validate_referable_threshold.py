"""
Apply config.REFERABLE_THRESHOLD (tuned on the internal val split by
tune_referable_threshold.py) to the external held-out test sets
(Messidor-2, IDRiD) to check it generalizes -- these were never used for
tuning, so this is the honest final check, same principle as
validate_external.py's kappa numbers.

Also reports the actual referral rate at this threshold (fraction of images
flagged referable) alongside the argmax-based rate for comparison -- this
feeds simulink/throughputParams.m's ReferralRate.

Usage:
    python validate_referable_threshold.py
"""
import cv2
cv2.setNumThreads(0)
cv2.ocl.setUseOpenCL(False)

import os

import numpy as np
import pandas as pd

import config
from dataset import DRDataset
from validate_external import load_messidor2_df, load_idrid_grading_df


def score_dataset(name, df, model, device):
    import torch
    from torch.utils.data import DataLoader
    from tqdm import tqdm

    exists_mask = df["path"].apply(os.path.exists)
    df = df[exists_mask].reset_index(drop=True)

    ds = DRDataset(df, train=False)
    loader = DataLoader(ds, batch_size=config.BATCH_SIZE, shuffle=False, num_workers=config.NUM_WORKERS)

    model.eval()
    all_probs, all_labels = [], []
    with torch.no_grad():
        for imgs, labels in tqdm(loader, desc=name):
            imgs = imgs.to(device)
            logits = model(imgs)
            probs = torch.softmax(logits, dim=1).cpu().numpy()
            all_probs.append(probs)
            all_labels.extend(labels.numpy())
    return np.concatenate(all_probs, axis=0), np.array(all_labels)


def report(name, probs, labels, threshold):
    from sklearn.metrics import confusion_matrix

    true_referable = (labels >= 2).astype(int)
    p_referable = probs[:, 2:].sum(axis=1)

    argmax_pred = probs.argmax(axis=1)
    argmax_referable = (argmax_pred >= 2).astype(int)
    tn, fp, fn, tp = confusion_matrix(true_referable, argmax_referable, labels=[0, 1]).ravel()
    argmax_sens = tp / max(1, tp + fn)
    argmax_spec = tn / max(1, tn + fp)
    argmax_rate = argmax_referable.mean()

    thresh_referable = (p_referable > threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(true_referable, thresh_referable, labels=[0, 1]).ravel()
    thresh_sens = tp / max(1, tp + fn)
    thresh_spec = tn / max(1, tn + fp)
    thresh_rate = thresh_referable.mean()

    print(f"\n=== {name} (n={len(labels)}) ===")
    print(f"  Argmax (old):      sensitivity={argmax_sens:.4f}  specificity={argmax_spec:.4f}  referral_rate={argmax_rate:.4f}")
    print(f"  Threshold={threshold:.2f} (new): sensitivity={thresh_sens:.4f}  specificity={thresh_spec:.4f}  referral_rate={thresh_rate:.4f}")

    return {"name": name, "n": len(labels), "sens": thresh_sens, "spec": thresh_spec, "referral_rate": thresh_rate}


def main():
    threshold = config.REFERABLE_THRESHOLD
    print(f"Validating REFERABLE_THRESHOLD={threshold} (tuned on internal val split) against external test sets...")

    messidor_df = load_messidor2_df()
    idrid_df = load_idrid_grading_df()

    import torch
    from gradcam import load_trained_model

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = load_trained_model(config.CHECKPOINT_PATH, device)

    m_probs, m_labels = score_dataset("Messidor-2", messidor_df, model, device)
    i_probs, i_labels = score_dataset("IDRiD Disease Grading", idrid_df, model, device)
    c_probs = np.concatenate([m_probs, i_probs], axis=0)
    c_labels = np.concatenate([m_labels, i_labels], axis=0)

    results = []
    results.append(report("Messidor-2", m_probs, m_labels, threshold))
    results.append(report("IDRiD Disease Grading", i_probs, i_labels, threshold))
    results.append(report("Combined external", c_probs, c_labels, threshold))

    print(f"\n=== Summary: REFERABLE_THRESHOLD={threshold} on external test sets (never used for tuning) ===")
    for r in results:
        print(f"{r['name']:<25} n={r['n']:<6} sensitivity={r['sens']:.4f}  specificity={r['spec']:.4f}  referral_rate={r['referral_rate']:.4f}")


if __name__ == "__main__":
    main()
