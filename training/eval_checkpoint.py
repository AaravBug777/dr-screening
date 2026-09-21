"""
Runs 6-view TTA for one checkpoint over held-out evaluation sets and caches
the raw per-view LOGITS (N,6,5), so temperature/threshold can be recalibrated
cheaply afterwards without another forward pass.

Sets: fgadr_test (461, never trained on), fgadr_val (276, used only for
checkpoint selection/calibration), ddr (the 2,000-image stratified sample),
idrid_test (103). Messidor-2/IDRiD-train regression check uses the existing
old-model cache (tta_logits_cache.npz) vs. the new model via --messidor.

Usage: python eval_checkpoint.py <checkpoint.pt> <tag> [--messidor]
Produces: outputs/eval_<tag>.npz
"""
import argparse
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


def build_sets(include_messidor):
    sets = {}
    fg = pd.read_csv(os.path.join(config.OUTPUT_DIR, "fgadr_split.csv"))
    for s in ("test", "val"):
        d = fg[fg["split"] == s]
        sets[f"fgadr_{s}"] = (d["path"].tolist(), d["label"].astype(int).tolist())
    ddr = pd.read_csv(os.path.join(config.OUTPUT_DIR, "ddr_sample_images.csv"))
    sets["ddr"] = ([os.path.abspath(os.path.join("data/ddr/DR_grading/DR_grading", f)) for f in ddr["id_code"]],
                   ddr["diagnosis"].astype(int).tolist())
    from validate_external import load_idrid_grading_df, load_messidor2_df
    idrid = load_idrid_grading_df()
    sets["idrid_all"] = (idrid["path"].tolist(), idrid["label"].astype(int).tolist())
    if include_messidor:
        m2 = load_messidor2_df()
        m2 = m2[m2["path"].apply(os.path.exists)]
        sets["messidor2"] = (m2["path"].tolist(), m2["label"].astype(int).tolist())
    return sets


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("checkpoint")
    ap.add_argument("tag")
    ap.add_argument("--messidor", action="store_true")
    args = ap.parse_args()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = load_trained_model(args.checkpoint, device)
    model.eval()
    transform = get_transforms(train=False)
    views = _build_views()

    out = {}
    for name, (paths, labels) in build_sets(args.messidor).items():
        logits = np.zeros((len(paths), len(views), config.NUM_CLASSES), dtype=np.float32)
        keep = np.ones(len(paths), dtype=bool)
        for i, p in enumerate(paths):
            img = cv2.imread(p)
            if img is None:
                keep[i] = False
                continue
            tensor = transform(image=ben_graham_preprocess(cv2.cvtColor(img, cv2.COLOR_BGR2RGB)))["image"].unsqueeze(0).to(device)
            with torch.no_grad():
                for v, (fwd, _) in enumerate(views):
                    logits[i, v] = model(fwd(tensor)).cpu().numpy()[0]
            if (i + 1) % 200 == 0:
                print(f"  {name}: {i+1}/{len(paths)}", flush=True)
        out[f"{name}_logits"] = logits[keep]
        out[f"{name}_labels"] = np.array(labels)[keep]
        print(f"{name}: done ({keep.sum()} images)", flush=True)

    np.savez(os.path.join(config.OUTPUT_DIR, f"eval_{args.tag}.npz"), **out)
    print("saved", args.tag, flush=True)


if __name__ == "__main__":
    main()
