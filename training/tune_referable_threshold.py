"""
Tune the referable-DR decision threshold to target the SIH26038 brief's
sensitivity requirement (>90%), trading away some of the current model's
specificity headroom (94.5% combined vs. an 85% floor -- see README.md).

Why a separate threshold from argmax: the model's predicted_label (used for
the on-screen 5-way grade) stays argmax -- "which single grade is most
likely" is a different question from "should this go to a human reviewer",
which has an asymmetric cost (a missed referable case is far worse than an
unnecessary review) that argmax doesn't account for. Instead of picking
whichever of the 5 classes is individually most likely, this compares the
COMBINED probability mass on referable classes (Moderate/Severe/Proliferative,
i.e. grade >= 2) against a tunable threshold T -- lowering T flags more
borderline cases as referable, raising sensitivity at the cost of specificity.

Tuned HERE on the model's own held-out validation split (the same
APTOS+EyePACS split train.py already uses for checkpoint selection) --
deliberately NOT on Messidor-2/IDRiD, which stay untouched as the final
generalization check (tuning and reporting on the same external data would
inflate how good the result looks). validate_referable_threshold.py applies
the resulting fixed threshold to those external sets afterward.

Usage:
    python tune_referable_threshold.py
"""
import cv2
cv2.setNumThreads(0)
cv2.ocl.setUseOpenCL(False)

import os

import numpy as np

import config
from dataset import DRDataset, build_full_dataframe


CACHE_PATH = "val_probs_cache.npz"


def main():
    # Cache the (expensive, ~9 min) inference pass -- re-running this every
    # time just to try a different threshold sweep granularity is wasteful;
    # only the (cheap, seconds) sweep below needs to change between runs.
    if os.path.exists(CACHE_PATH):
        print(f"Loading cached probabilities from {CACHE_PATH}...")
        cached = np.load(CACHE_PATH)
        all_probs, all_labels = cached["probs"], cached["labels"]
        print(f"Val: {len(all_labels)} images (cached)")
    else:
        print("Rebuilding the same train/val split train.py used (same SEED)...")
        _, val_df = build_full_dataframe()
        print(f"Val: {len(val_df)} images (should match train.py's reported val size)")

        import torch
        from torch.utils.data import DataLoader
        from tqdm import tqdm
        from gradcam import load_trained_model

        device = "cuda" if torch.cuda.is_available() else "cpu"
        model = load_trained_model(config.CHECKPOINT_PATH, device)

        val_ds = DRDataset(val_df, train=False)
        loader = DataLoader(val_ds, batch_size=config.BATCH_SIZE, shuffle=False, num_workers=config.NUM_WORKERS)

        all_probs, all_labels = [], []
        model.eval()
        with torch.no_grad():
            for imgs, labels in tqdm(loader, desc="Scoring val split"):
                imgs = imgs.to(device)
                logits = model(imgs)
                probs = torch.softmax(logits, dim=1).cpu().numpy()
                all_probs.append(probs)
                all_labels.extend(labels.numpy())
        all_probs = np.concatenate(all_probs, axis=0)
        all_labels = np.array(all_labels)
        np.savez(CACHE_PATH, probs=all_probs, labels=all_labels)
        print(f"Cached to {CACHE_PATH} for reuse (delete this file to force a recompute against a new checkpoint).")

    from sklearn.metrics import confusion_matrix

    p_referable = all_probs[:, 2:].sum(axis=1)  # P(Moderate) + P(Severe) + P(Proliferative)
    true_referable = (all_labels >= 2).astype(int)

    print(f"\nTrue referable in val split: {true_referable.sum()} ({100*true_referable.mean():.1f}%)")
    print(f"\n{'T':>6} {'sensitivity':>12} {'specificity':>12}")
    results = []
    for t in np.arange(0.90, 0.05, -0.01):
        pred_referable = (p_referable > t).astype(int)
        cm = confusion_matrix(true_referable, pred_referable, labels=[0, 1])
        tn, fp, fn, tp = cm.ravel()
        sens = tp / max(1, tp + fn)
        spec = tn / max(1, tn + fp)
        results.append((t, sens, spec))
        print(f"{t:>6.2f} {sens:>12.4f} {spec:>12.4f}")

    # Report honestly, not just the first thing that clears one bar: is
    # there a threshold clearing BOTH targets simultaneously? If not, that's
    # a real finding (the model's calibration doesn't currently support
    # hitting both), not something to paper over by picking whichever
    # threshold clears sensitivity alone while quietly failing specificity.
    both_targets = [(t, s, p) for t, s, p in results if s >= 0.90 and p >= 0.85]
    print()
    if both_targets:
        best_t, best_sens, best_spec = max(both_targets, key=lambda r: r[2])
        print(f"Threshold(s) clearing BOTH targets exist. Recommended: T={best_t:.2f} "
              f"(sensitivity={best_sens:.4f}, specificity={best_spec:.4f} -- "
              f"maximizing specificity among those that clear both).")
    else:
        best_sens_t, best_sens, spec_at_best_sens = max(results, key=lambda r: r[1])
        sens_ge_90 = [(t, s, p) for t, s, p in results if s >= 0.90]
        print("No single threshold in [0.05, 0.90] clears BOTH targets simultaneously on this split --")
        print(f"  best achievable sensitivity: {best_sens:.4f} at T={best_sens_t:.2f} (specificity there: {spec_at_best_sens:.4f})")
        if sens_ge_90:
            t90, sens90, spec90 = max(sens_ge_90, key=lambda r: r[2])  # best specificity among those clearing 90% sensitivity
            print(f"  best specificity among thresholds with sensitivity>=90%: "
                  f"T={t90:.2f} (sensitivity={sens90:.4f}, specificity={spec90:.4f})")
            best_t = t90
        else:
            best_t = best_sens_t
        print("  Reporting this honestly rather than picking a threshold that silently misses one target.")

    print(f"\nUse this T in config.py's REFERABLE_THRESHOLD, then run "
          f"validate_referable_threshold.py to confirm it generalizes to Messidor-2/IDRiD.")


if __name__ == "__main__":
    main()
