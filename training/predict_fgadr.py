"""
Runs the production DL grader (6-view TTA, same config.TTA_* calibration
as backend/main.py's live /predict path) over the FGADR Seg-set (1,842
images, 3-ophthalmologist grades 0-4) -- an independent held-out check
never used for training, calibration, or combiner fitting. Unlike
predict_ddr_referable.py this keeps the FULL 5-class probability vector
per image, so per-grade behavior (esp. Mild) can be analysed, not just
the binary referable decision.

Usage: python predict_fgadr.py
Produces: outputs/fgadr_predictions.json
"""
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

FGADR_DIR = os.environ.get("FGADR_DIR", "./data/fgadr")


def softmax(logits, T):
    z = logits / T
    z = z - z.max(axis=-1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=-1, keepdims=True)


def main():
    img_dir = os.path.join(FGADR_DIR, "Seg-set", "Original_Images")
    df = pd.read_csv(os.path.join(FGADR_DIR, "Seg-set", "DR_Seg_Grading_Label.csv"),
                     header=None, names=["image", "grade"])

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = load_trained_model(config.CHECKPOINT_PATH, device)
    model.eval()
    transform = get_transforms(train=False)
    views = _build_views()

    predictions = []
    t0 = time.time()
    for idx, row in df.iterrows():
        name = str(row["image"]).strip()
        grade = int(row["grade"])
        img = cv2.imread(os.path.join(img_dir, name))
        if img is None:
            print(f"  (unreadable, skipping: {name})", flush=True)
            continue
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        tensor = transform(image=ben_graham_preprocess(img))["image"].unsqueeze(0).to(device)

        view_logits = np.zeros((len(views), config.NUM_CLASSES), dtype=np.float32)
        with torch.no_grad():
            for v, (forward_fn, _) in enumerate(views):
                view_logits[v, :] = model(forward_fn(tensor)).cpu().numpy()[0]

        probs = softmax(view_logits, config.TTA_REFERABLE_TEMPERATURE).mean(axis=0)
        ref_p = float(probs[2:].sum())
        predictions.append({
            "image": os.path.splitext(name)[0],
            "true_grade": grade,
            "true_referable": bool(grade >= 2),
            "predicted_class": int(probs.argmax()),
            "probs": [float(p) for p in probs],
            "referable_probability": ref_p,
            "referable_predicted": bool(ref_p > config.TTA_REFERABLE_THRESHOLD),
        })
        if (idx + 1) % 100 == 0:
            e = time.time() - t0
            print(f"  {idx+1}/{len(df)} ({e:.0f}s, {e/(idx+1):.2f}s/image)", flush=True)

    os.makedirs(config.OUTPUT_DIR, exist_ok=True)
    out = os.path.join(config.OUTPUT_DIR, "fgadr_predictions.json")
    with open(out, "w") as f:
        json.dump({"source": "FGADR Seg-set (independent, held-out)",
                   "tta_referable_temperature": config.TTA_REFERABLE_TEMPERATURE,
                   "tta_referable_threshold": config.TTA_REFERABLE_THRESHOLD,
                   "predictions": predictions}, f)

    tp = sum(p["referable_predicted"] and p["true_referable"] for p in predictions)
    fn = sum((not p["referable_predicted"]) and p["true_referable"] for p in predictions)
    tn = sum((not p["referable_predicted"]) and (not p["true_referable"]) for p in predictions)
    fp = sum(p["referable_predicted"] and (not p["true_referable"]) for p in predictions)
    print(f"\nFGADR (n={len(predictions)}): referable sensitivity={100*tp/max(1,tp+fn):.1f}% "
          f"specificity={100*tn/max(1,tn+fp):.1f}%", flush=True)
    print(f"Wrote {out}", flush=True)


if __name__ == "__main__":
    main()
