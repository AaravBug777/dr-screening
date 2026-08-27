"""
Runs the production PyTorch DL grader -- test-time augmentation, 6-view
average, matching EXACTLY what backend/main.py's live /predict path does
(training/tta.py, config.TTA_REFERABLE_TEMPERATURE/THRESHOLD) -- on an
IDRiD Disease Grading split and dumps referable-DR predictions to JSON,
keyed by image name.

FIXED A REAL STALENESS BUG: this script previously used
config.REFERABLE_TEMPERATURE/REFERABLE_THRESHOLD -- the OLDER, SUPERSEDED
single-view calibration, not the TTA-based one the live app has actually
used since TTA shipped (see top-level README's "Round 4" section). That
meant "DL-alone" in the integration ablation
(matlab/tests/compareIntegratedVsSingleTechnique.m) was being compared
against a DIFFERENT, no-longer-deployed version of the DL grader than the
one actually running in the app -- an apples-to-oranges comparison that
would have made a false claim either way (a real "does the deployed system
get beaten" question, answered against a system that isn't deployed).
Fixed by switching to the same 6-view TTA path the live app uses.

This exists so MATLAB can compare, on the EXACT SAME images:
  (a) DL-alone (this script's output)
  (b) MATLAB structural-features-alone (matlab/grading/trainStructuralReferableNet.m)
  (c) an integrated combination of both
-- the SIH26038 brief's Expected Solution explicitly asks for validation
showing "the integrated pipeline outperforms any single technique
approach"; this is what actually produces that evidence, on real data,
rather than asserting it. Run once for --split test (the reported ablation
metric, matlab/tests/compareIntegratedVsSingleTechnique.m -- an untouched
103-image set nothing here is ever fit on) and once for --split train,
now the FULL 413-image official IDRiD training set (previously a
200-image subsample, capped only for MATLAB extraction runtime, not data
scarcity -- see extractStructuralFeatures.m) plus
build_messidor2_calibration_probs.py's 1,744 real Messidor-2 images, so
the combiner is fit on ~2,150 calibration images instead of 200 -- and
reported only on the untouched test split, the same calibrate-then-
held-out-test discipline training/calibrate_referable_threshold.py
already established for the single-technique threshold, applied here to
the combiner too. See matlab/tests/compareIntegratedVsSingleTechnique.m.

Usage:
    python predict_idrid_test_referable.py --split test
    python predict_idrid_test_referable.py --split train
Produces:
    outputs/idrid_<split>_referable_predictions.json
"""
import argparse
import json
import os

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

IDRID_DIR = config.IDRID_DIR


def softmax(logits, T):
    z = logits / T
    z = z - z.max(axis=-1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=-1, keepdims=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--split", choices=["train", "test"], default="test")
    args = parser.parse_args()

    if args.split == "test":
        img_dir = os.path.join(IDRID_DIR, "B. Disease Grading", "1. Original Images", "b. Testing Set")
        csv_path = os.path.join(IDRID_DIR, "B. Disease Grading", "2. Groundtruths", "b. IDRiD_Disease Grading_Testing Labels.csv")
    else:
        img_dir = os.path.join(IDRID_DIR, "B. Disease Grading", "1. Original Images", "a. Training Set")
        csv_path = os.path.join(IDRID_DIR, "B. Disease Grading", "2. Groundtruths", "a. IDRiD_Disease Grading_Training Labels.csv")

    out_path = os.path.join(config.OUTPUT_DIR, f"idrid_{args.split}_referable_predictions.json")

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = load_trained_model(config.CHECKPOINT_PATH, device)
    model.eval()
    transform = get_transforms(train=False)
    views = _build_views()

    df = pd.read_csv(csv_path)
    name_col = df.columns[0]
    grade_col = df.columns[1]

    predictions = []
    import time
    t0 = time.time()
    for idx, (_, row) in enumerate(df.iterrows()):
        image_name = str(row[name_col]).strip()
        grade = int(row[grade_col])
        image_path = os.path.join(img_dir, image_name + ".jpg")
        if not os.path.isfile(image_path):
            print(f"  (missing image, skipping: {image_name})")
            continue

        img = cv2.imread(image_path)
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        processed = ben_graham_preprocess(img)
        tensor = transform(image=processed)["image"].unsqueeze(0).to(device)

        view_logits = np.zeros((len(views), config.NUM_CLASSES), dtype=np.float32)
        with torch.no_grad():
            for v, (forward_fn, _) in enumerate(views):
                view_tensor = forward_fn(tensor)
                view_logits[v, :] = model(view_tensor).cpu().numpy()[0]

        per_view_probs = softmax(view_logits, config.TTA_REFERABLE_TEMPERATURE)  # (6, 5)
        probs = per_view_probs.mean(axis=0)  # (5,) -- TTA average, matching backend/main.py's live /predict path exactly

        referable_probability = float(probs[2:].sum())
        is_referable = referable_probability > config.TTA_REFERABLE_THRESHOLD
        pred_class = int(probs.argmax())

        predictions.append({
            "image": image_name,
            "true_grade": grade,
            "true_referable": bool(grade >= 2),
            "predicted_class": pred_class,
            "referable_probability": referable_probability,
            "referable_predicted": bool(is_referable),
        })

        if (idx + 1) % 50 == 0:
            elapsed = time.time() - t0
            print(f"  {idx+1}/{len(df)}  ({elapsed:.0f}s elapsed, {elapsed/(idx+1):.2f}s/image)")

    os.makedirs(config.OUTPUT_DIR, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump({
            "model": "EfficientNet-B3, 5-epoch checkpoint, TTA (6-view)",
            "tta_referable_temperature": config.TTA_REFERABLE_TEMPERATURE,
            "tta_referable_threshold": config.TTA_REFERABLE_THRESHOLD,
            "predictions": predictions,
        }, f, indent=2)

    n = len(predictions)
    tp = sum(1 for p in predictions if p["referable_predicted"] and p["true_referable"])
    fn = sum(1 for p in predictions if not p["referable_predicted"] and p["true_referable"])
    tn = sum(1 for p in predictions if not p["referable_predicted"] and not p["true_referable"])
    fp = sum(1 for p in predictions if p["referable_predicted"] and not p["true_referable"])
    sens = tp / max(1, tp + fn)
    spec = tn / max(1, tn + fp)
    print(f"\nDL-alone on IDRiD {args.split} split (n={n}): sensitivity={sens*100:.1f}% specificity={spec*100:.1f}%")
    print(f"Wrote {n} predictions to {out_path}")


if __name__ == "__main__":
    main()
