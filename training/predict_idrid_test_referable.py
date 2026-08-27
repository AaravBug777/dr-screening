"""
Runs the production PyTorch DL grader (with its final calibrated
temperature + threshold, same as backend/main.py) on an IDRiD Disease
Grading split and dumps referable-DR predictions to JSON, keyed by image
name.

This exists so MATLAB can compare, on the EXACT SAME images:
  (a) DL-alone (this script's output)
  (b) MATLAB structural-features-alone (matlab/grading/trainStructuralReferableNet.m)
  (c) an integrated combination of both
-- the SIH26038 brief's Expected Solution explicitly asks for validation
showing "the integrated pipeline outperforms any single technique
approach"; this is what actually produces that evidence, on real data,
rather than asserting it. Run once for --split test (the reported ablation
metric, matlab/tests/compareIntegratedVsSingleTechnique.m) and once for
--split train restricted to the same 200-image subsample MATLAB used
(matlab/tests/extractStructuralFeatures.m's cache) so a combiner can be
FIT on that calibration set and reported only on the untouched test split
-- the same calibrate-then-held-out-test discipline
training/calibrate_referable_threshold.py already established for the
single-technique threshold, applied here to the combiner too. See
matlab/tests/fitIntegratedCombiner.m.

Usage:
    python predict_idrid_test_referable.py --split test
    python predict_idrid_test_referable.py --split train --names-from ../matlab/tests/structural_features_train.mat
Produces:
    outputs/idrid_<split>_referable_predictions.json
"""
import argparse
import json
import os

import cv2
cv2.setNumThreads(0)
cv2.ocl.setUseOpenCL(False)

import pandas as pd
import torch
import torch.nn.functional as F

import config
from dataset import ben_graham_preprocess, get_transforms
from gradcam import load_trained_model

IDRID_DIR = config.IDRID_DIR


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--split", choices=["train", "test"], default="test")
    parser.add_argument("--restrict-to", default=None,
                         help="Optional path to a .mat file (scipy-loadable) with an imageNames cell array -- "
                              "restricts predictions to exactly that image subset, e.g. MATLAB's train subsample.")
    args = parser.parse_args()

    if args.split == "test":
        img_dir = os.path.join(IDRID_DIR, "B. Disease Grading", "1. Original Images", "b. Testing Set")
        csv_path = os.path.join(IDRID_DIR, "B. Disease Grading", "2. Groundtruths", "b. IDRiD_Disease Grading_Testing Labels.csv")
    else:
        img_dir = os.path.join(IDRID_DIR, "B. Disease Grading", "1. Original Images", "a. Training Set")
        csv_path = os.path.join(IDRID_DIR, "B. Disease Grading", "2. Groundtruths", "a. IDRiD_Disease Grading_Training Labels.csv")

    out_path = os.path.join(config.OUTPUT_DIR, f"idrid_{args.split}_referable_predictions.json")

    restrict_names = None
    if args.restrict_to:
        from scipy.io import loadmat
        mat = loadmat(args.restrict_to)
        restrict_names = {str(n[0]) for n in mat["imageNames"].flatten()}
        print(f"Restricting to {len(restrict_names)} image names from {args.restrict_to}")

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = load_trained_model(config.CHECKPOINT_PATH, device)
    model.eval()
    transform = get_transforms(train=False)

    df = pd.read_csv(csv_path)
    name_col = df.columns[0]
    grade_col = df.columns[1]

    predictions = []
    for _, row in df.iterrows():
        image_name = str(row[name_col]).strip()
        if restrict_names is not None and image_name not in restrict_names:
            continue
        grade = int(row[grade_col])
        image_path = os.path.join(img_dir, image_name + ".jpg")
        if not os.path.isfile(image_path):
            print(f"  (missing image, skipping: {image_name})")
            continue

        img = cv2.imread(image_path)
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        processed = ben_graham_preprocess(img)
        tensor = transform(image=processed)["image"].unsqueeze(0).to(device)

        with torch.no_grad():
            logits = model(tensor)
            probs = F.softmax(logits / config.REFERABLE_TEMPERATURE, dim=1).cpu().numpy()[0]

        referable_probability = float(sum(probs[2:]))
        is_referable = referable_probability > config.REFERABLE_THRESHOLD
        pred_class = int(probs.argmax())

        predictions.append({
            "image": image_name,
            "true_grade": grade,
            "true_referable": bool(grade >= 2),
            "predicted_class": pred_class,
            "referable_probability": referable_probability,
            "referable_predicted": bool(is_referable),
        })

    os.makedirs(config.OUTPUT_DIR, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump({
            "model": "EfficientNet-B3, 5-epoch checkpoint",
            "referable_temperature": config.REFERABLE_TEMPERATURE,
            "referable_threshold": config.REFERABLE_THRESHOLD,
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
