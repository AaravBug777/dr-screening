"""
Extracts the Messidor-2 slice of tta_logits_cache.npz (2,260 images:
1,744 Messidor-2 + 516 IDRiD, cached by cache_tta_logits.py) as a
standalone referable-DR prediction JSON, in the exact format
predict_idrid_test_referable.py already produces -- so
matlab/tests/compareIntegratedVsSingleTechnique.m's combiner-fitting step
can use these 1,744 REAL, adjudicated-label Messidor-2 images as
additional calibration data, on top of the full 413-image IDRiD training
split, instead of the previous 200-image IDRiD-only subsample.

Why this needs no new model inference: cache_tta_logits.py already ran
all 6 TTA views' forward pass for every one of these images and saved the
raw per-view LOGITS (not yet averaged/thresholded). This script just
re-derives the exact same sample (same code, same config.SEED, so the
row order matches the cache file exactly -- verified by re-checking the
label array matches before trusting it) to recover each row's real image
PATH, then applies the CURRENT config.TTA_REFERABLE_TEMPERATURE/
TTA_REFERABLE_THRESHOLD to the cached logits. No forward pass needed --
cheap, and automatically stays consistent if the temperature/threshold are
ever recalibrated again (this script doesn't hardcode this session's
values).

Usage:
    python build_messidor2_calibration_probs.py
Produces:
    outputs/messidor2_calibration_referable_predictions.json
"""
import json
import os

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split

import config
from validate_external import load_messidor2_df, load_idrid_grading_df

CACHE_PATH = "tta_logits_cache.npz"
SAMPLE_N = 10_000  # must match cache_tta_logits.py's SAMPLE_N exactly, or the reconstructed sample order won't match the cache


def softmax(logits, T):
    z = logits / T
    z = z - z.max(axis=-1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=-1, keepdims=True)


def main():
    cache = np.load(CACHE_PATH, allow_pickle=True)
    cached_logits = cache["logits"]       # (N, 6, 5)
    cached_labels = cache["labels"]       # (N,)
    cached_tags = cache["dataset_tag"]    # (N,)

    # Reconstruct the EXACT sample cache_tta_logits.py built -- same source
    # dataframes, same concat order, same stratified train_test_split call
    # with the same random_state. This only works because both scripts
    # build the dataframe the same way; verified below by checking the
    # reconstructed labels match the cached ones exactly before trusting
    # the path alignment for a single image.
    m2 = load_messidor2_df(); m2["dataset"] = "messidor2"
    idrid = load_idrid_grading_df(); idrid["dataset"] = "idrid"
    df = pd.concat([m2, idrid], ignore_index=True)
    df = df[df["path"].apply(os.path.exists)].reset_index(drop=True)

    strata = df["dataset"] + "_" + (df["label"] >= 2).astype(str)
    if len(df) > SAMPLE_N:
        _, sample_idx = train_test_split(
            np.arange(len(df)), test_size=SAMPLE_N, stratify=strata, random_state=config.SEED
        )
        sample = df.iloc[sample_idx].reset_index(drop=True)
    else:
        sample = df

    if len(sample) != len(cached_labels):
        raise RuntimeError(
            f"Reconstructed sample has {len(sample)} rows but the cache has {len(cached_labels)} -- "
            "the dataframe-building code must have changed since the cache was built. Re-run "
            "cache_tta_logits.py before trusting this script's output."
        )
    mismatches = np.sum(sample["label"].values.astype(np.int64) != cached_labels)
    if mismatches:
        raise RuntimeError(
            f"{mismatches}/{len(sample)} labels disagree between the reconstructed sample and the cache -- "
            "row order doesn't actually match; this script's path<->logit alignment cannot be trusted. "
            "Re-run cache_tta_logits.py, or fix whatever changed in load_messidor2_df/load_idrid_grading_df."
        )
    print(f"Reconstructed sample matches the cache exactly: {len(sample)} rows, 0 label mismatches.")

    # TTA-averaged probabilities at the CURRENT calibrated temperature --
    # not hardcoded to this session's 0.80, so this stays correct if
    # recalibrated later.
    per_view_probs = softmax(cached_logits, config.TTA_REFERABLE_TEMPERATURE)  # (N, 6, 5)
    probs = per_view_probs.mean(axis=1)  # (N, 5)
    referable_probability = probs[:, 2:].sum(axis=1)
    predicted_class = probs.argmax(axis=1)
    referable_predicted = referable_probability > config.TTA_REFERABLE_THRESHOLD

    is_m2 = cached_tags == "messidor2"
    print(f"Messidor-2 slice: {is_m2.sum()} of {len(sample)} cached images.")

    predictions = []
    for i in np.where(is_m2)[0]:
        image_name = os.path.splitext(os.path.basename(sample.loc[i, "path"]))[0]
        predictions.append({
            "image": image_name,
            # ABSOLUTE path: this JSON is read by MATLAB (extractMessidor2CalibrationFeatures.m),
            # which runs from a DIFFERENT working directory (matlab/, not training/) --
            # a relative path here resolved against Python's cwd is simply wrong once
            # MATLAB tries to open it against ITS OWN cwd. Caught the hard way: a first
            # version stored the raw relative path and every single one of 1,744 images
            # silently "failed to open" in MATLAB (0/1744 extracted) before this was fixed.
            "image_path": os.path.abspath(sample.loc[i, "path"]),
            "true_grade": int(cached_labels[i]),
            "true_referable": bool(cached_labels[i] >= 2),
            "predicted_class": int(predicted_class[i]),
            "referable_probability": float(referable_probability[i]),
            "referable_predicted": bool(referable_predicted[i]),
        })

    out_path = os.path.join(config.OUTPUT_DIR, "messidor2_calibration_referable_predictions.json")
    os.makedirs(config.OUTPUT_DIR, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump({
            "model": "EfficientNet-B3, 5-epoch checkpoint, TTA (6-view)",
            "tta_referable_temperature": config.TTA_REFERABLE_TEMPERATURE,
            "tta_referable_threshold": config.TTA_REFERABLE_THRESHOLD,
            "note": "Calibration-only data for the MATLAB integration ablation combiner -- NOT used to tune "
                    "TTA_REFERABLE_TEMPERATURE/THRESHOLD themselves (those were already fixed before this script "
                    "ran), and NEVER used as a reported test set anywhere.",
            "predictions": predictions,
        }, f, indent=2)

    n = len(predictions)
    tp = sum(1 for p in predictions if p["referable_predicted"] and p["true_referable"])
    fn = sum(1 for p in predictions if not p["referable_predicted"] and p["true_referable"])
    tn = sum(1 for p in predictions if not p["referable_predicted"] and not p["true_referable"])
    fp = sum(1 for p in predictions if p["referable_predicted"] and not p["true_referable"])
    sens = tp / max(1, tp + fn)
    spec = tn / max(1, tn + fp)
    print(f"\nTTA DL-alone on this Messidor-2 calibration slice (n={n}): sensitivity={sens*100:.1f}% specificity={spec*100:.1f}%")
    print(f"Wrote {n} predictions to {out_path}")


if __name__ == "__main__":
    main()
