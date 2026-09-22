"""
6-view TTA logits for a v3 checkpoint over the manifest's cal and test rows,
read from the 1024px cache (so evaluation uses exactly the preprocessing the
model trained on, and costs no re-preprocessing).

Saves raw per-view logits, not probabilities, so temperature and threshold can
be refitted later without another forward pass -- same contract as
eval_checkpoint.py, which serves the OLD preprocessing/resolution.

Usage: python eval_v3.py <checkpoint.pt> <tag> [--dim 640] [--batch 16]
Produces: outputs/evalv3_<tag>.npz  (keys: <split>_<source>_logits / _labels)
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
from build_cache import cache_path
from train_v3 import CachedDataset, build_transforms


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("checkpoint")
    ap.add_argument("tag")
    ap.add_argument("--dim", type=int, default=config.TRAIN_DIM)
    ap.add_argument("--batch", type=int, default=16)
    args = ap.parse_args()

    from torch.utils.data import DataLoader
    import timm
    from tta import _build_views

    man = pd.read_csv(os.path.join(config.OUTPUT_DIR, "manifest.csv"))
    man["cache"] = [cache_path(p, s) for p, s in zip(man["path"], man["source"])]
    man = man[man["cache"].apply(os.path.exists)]

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    ckpt = torch.load(args.checkpoint, map_location="cpu")
    model = timm.create_model(ckpt.get("model_name", config.MODEL_NAME), pretrained=False,
                              num_classes=config.NUM_CLASSES)
    model.load_state_dict(ckpt["model_state_dict"])
    model.to(device).to(memory_format=torch.channels_last).eval()
    print(f"{args.checkpoint}: epoch {ckpt.get('epoch')}, cal_qwk {ckpt.get('cal_qwk')}, dim {args.dim}")

    _, t_eval = build_transforms(args.dim)
    views = _build_views()
    out = {}
    for (split, source), g in man[man.split.isin(["cal", "test"])].groupby(["split", "source"]):
        g = g.reset_index(drop=True)
        loader = DataLoader(CachedDataset(g, t_eval), batch_size=args.batch, num_workers=6, shuffle=False)
        chunks = []
        with torch.no_grad(), torch.amp.autocast("cuda", enabled=device.type == "cuda"):
            for imgs, _ in loader:
                imgs = imgs.to(device, memory_format=torch.channels_last)
                chunks.append(np.stack([model(fwd(imgs)).float().cpu().numpy() for fwd, _ in views], axis=1))
        key = f"{split}_{source}"
        out[key + "_logits"] = np.concatenate(chunks)          # (N, 6, 5)
        out[key + "_labels"] = g.label.values.astype(np.int64)
        print(f"  {key}: {len(g)}", flush=True)

    path = os.path.join(config.OUTPUT_DIR, f"evalv3_{args.tag}.npz")
    np.savez(path, **out)
    print("saved", path)


if __name__ == "__main__":
    main()
