"""
Full retrain from ImageNet weights on ALL six populations (see build_manifest.py),
at 512px from the precomputed 1024px cache (build_cache.py).

What is deliberately different from train.py, and why:

  * DATA: 44k train images from 5 populations (train.py: ~33k from 2). The
    cross-population threshold failure that blocked deploying the earlier
    fine-tunes is a symptom of a model that has only ever seen APTOS+EyePACS;
    score distributions cannot align on populations never trained on.
  * RESOLUTION: 512 (train.py: 380), from a 1024px cache (live pipeline: 640).
    Microaneurysms define the Mild grade and were ~1.6px at the old settings,
    ~2.2px now. 640 was measured too (2.7px) but costs ~2x the time and would
    only upsample DDR, which is natively 512.
  * LOSS: soft ORDINAL targets -- a little probability mass on the adjacent
    grades -- because the reported metric (QWK) penalises by squared distance
    while plain cross-entropy treats "No DR graded as PDR" and "No DR graded
    as Mild" as equally wrong. Output stays 5-class so the whole downstream
    stack (gradcam.py, tta.py, the app's probability strip and its
    referable = sum(p[2:]) rule, ONNX export for MATLAB) is unchanged.
  * SAMPLING: class-balanced sampler (sqrt inverse frequency) instead of
    inverse-frequency loss weights; the raw data is 28,553 grade-0 vs 1,486
    grade-3.
  * SELECTION: best epoch by mean QWK on the multi-population 'cal' split,
    NOT the APTOS/EyePACS 'val' split. 'test' is never read here.
  * AMP + gradient accumulation + channels_last, to fit 512px on 8GB.

Does not touch best_model.pt. Writes outputs/v3/epoch_N.pt and best.pt.
Usage: python train_v3.py [--epochs 14] [--batch 12] [--accum 2] [--dim 512]
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

import config
from build_cache import cache_path

DEFAULT_OUT_DIR = os.path.join(config.OUTPUT_DIR, "v3")


def soft_ordinal_targets(labels, n_classes, smooth):
    """One-hot with `smooth` total mass moved to the IMMEDIATELY adjacent grades
    (split evenly, or all to the single neighbour at the ends)."""
    import torch
    t = torch.zeros(len(labels), n_classes, device=labels.device)
    t.scatter_(1, labels.view(-1, 1), 1.0 - smooth)
    for off in (-1, 1):
        nb = labels + off
        ok = (nb >= 0) & (nb < n_classes)
        if ok.any():
            both = ((labels > 0) & (labels < n_classes - 1)).float()[ok]
            share = smooth * (0.5 * both + 1.0 * (1 - both))
            t[torch.where(ok)[0], nb[ok]] += share
    return t


def build_transforms(dim):
    import albumentations as A
    from albumentations.pytorch import ToTensorV2
    norm = [A.Normalize(mean=(0.485, 0.456, 0.406), std=(0.229, 0.224, 0.225)), ToTensorV2()]
    # Flips + rot90 are kept because test-time augmentation averages over exactly
    # that dihedral-4 group (tta.py); the model must be trained to be invariant to it.
    train = A.Compose([
        A.RandomResizedCrop(size=(dim, dim), scale=(0.85, 1.0), ratio=(0.95, 1.05), p=1.0),
        A.HorizontalFlip(p=0.5), A.VerticalFlip(p=0.5), A.RandomRotate90(p=0.5),
        A.Affine(translate_percent=0.04, scale=(0.94, 1.06), rotate=(-25, 25), p=0.5),
        A.RandomBrightnessContrast(brightness_limit=0.12, contrast_limit=0.12, p=0.5),
    ] + norm)
    return train, A.Compose([A.Resize(dim, dim)] + norm)


class CachedDataset:
    def __init__(self, df, transform):
        self.df = df.reset_index(drop=True)
        self.transform = transform

    def __len__(self):
        return len(self.df)

    def __getitem__(self, i):
        import torch
        r = self.df.iloc[i]
        img = cv2.imread(r["cache"])
        if img is None:  # cache miss: fail loudly rather than train on a black frame
            raise FileNotFoundError(r["cache"])
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        return self.transform(image=img)["image"], torch.tensor(int(r["label"]), dtype=torch.long)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=14)
    ap.add_argument("--batch", type=int, default=8)
    ap.add_argument("--accum", type=int, default=2)
    ap.add_argument("--dim", type=int, default=config.TRAIN_DIM)
    ap.add_argument("--lr", type=float, default=3e-4)
    ap.add_argument("--smooth", type=float, default=0.12)
    ap.add_argument("--arch", default=config.MODEL_NAME)
    ap.add_argument("--epoch-samples", type=int, default=22000,
                    help="images drawn per epoch by the balanced sampler; a full pass is 44k but the "
                         "sampler already down-weights the dominant grade-0 class, so shorter epochs "
                         "give more frequent checkpoints/eval for the same samples seen")
    ap.add_argument("--val-samples", type=int, default=2000,
                    help="subsample of the APTOS/EyePACS val split used for per-epoch monitoring only "
                         "(selection uses cal); the full 5.8k costs several minutes per epoch")
    ap.add_argument("--out-dir", default=DEFAULT_OUT_DIR,
                    help="separate directory per run -- a second architecture must not overwrite v3's checkpoints")
    ap.add_argument("--resume", default="")
    args = ap.parse_args()
    OUT_DIR = args.out_dir
    os.makedirs(OUT_DIR, exist_ok=True)

    man = pd.read_csv(os.path.join(config.OUTPUT_DIR, "manifest.csv"))
    man["cache"] = [cache_path(p, s) for p, s in zip(man["path"], man["source"])]
    have = man["cache"].apply(os.path.exists)
    if not have.all():
        print(f"WARNING: {(~have).sum()} of {len(man)} images are not cached; skipping them")
        man = man[have].reset_index(drop=True)
    tr = man[man.split == "train"].reset_index(drop=True)
    cal = man[man.split == "cal"].reset_index(drop=True)
    val = man[man.split == "val"].reset_index(drop=True)
    if 0 < args.val_samples < len(val):
        val = val.sample(n=args.val_samples, random_state=config.SEED).reset_index(drop=True)
    assert (man.split == "test").any() and "test" not in {"train"}, "manifest missing test rows"
    print(f"train={len(tr)} cal={len(cal)} val={len(val)}  (test rows present but never read here)")
    print("train by source:", tr.source.value_counts().to_dict())
    print("train by label :", tr.label.value_counts().sort_index().to_dict())

    import torch
    import torch.nn.functional as F
    from torch.utils.data import DataLoader, WeightedRandomSampler
    from sklearn.metrics import cohen_kappa_score
    from tqdm import tqdm
    import timm

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    t_train, t_eval = build_transforms(args.dim)

    counts = tr.label.value_counts().sort_index().values.astype(float)
    w = (1.0 / counts) ** 0.5          # sqrt inverse frequency: rebalances without flattening
    sample_w = w[tr.label.values]
    n_per_epoch = min(args.epoch_samples, len(tr)) if args.epoch_samples > 0 else len(tr)
    sampler = WeightedRandomSampler(torch.as_tensor(sample_w, dtype=torch.double), n_per_epoch, replacement=True)
    print("sampler class weights:", dict(zip(range(5), np.round(w / w.sum(), 4))))

    dl = lambda ds, **k: DataLoader(ds, batch_size=args.batch, num_workers=6, pin_memory=True,
                                    persistent_workers=True, **k)
    train_loader = dl(CachedDataset(tr, t_train), sampler=sampler)
    eval_loaders = {"cal": dl(CachedDataset(cal, t_eval), shuffle=False),
                    "val": dl(CachedDataset(val, t_eval), shuffle=False)}

    model = timm.create_model(args.arch, pretrained=not args.resume, num_classes=config.NUM_CLASSES)
    if args.resume:
        model.load_state_dict(torch.load(args.resume, map_location="cpu")["model_state_dict"])
        print("resumed from", args.resume)
    model.to(device).to(memory_format=torch.channels_last)

    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=config.WEIGHT_DECAY)
    steps = args.epochs * (len(train_loader) // args.accum + 1)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=args.lr, total_steps=steps, pct_start=0.25)
    scaler = torch.amp.GradScaler("cuda", enabled=device.type == "cuda")

    def evaluate(loader, df):
        model.eval()
        preds, probs = [], []
        with torch.no_grad(), torch.amp.autocast("cuda", enabled=device.type == "cuda"):
            for imgs, _ in loader:
                p = torch.softmax(model(imgs.to(device, memory_format=torch.channels_last)).float(), 1).cpu().numpy()
                probs.append(p); preds.append(p.argmax(1))
        preds = np.concatenate(preds); probs = np.concatenate(probs)
        y = df.label.values
        out = {"qwk": float(cohen_kappa_score(y, preds, weights="quadratic")),
               "acc": float((preds == y).mean()),
               "mild": float((preds[y == 1] == 1).mean()) if (y == 1).any() else float("nan")}
        per = {}
        for s, g in df.groupby("source"):
            i = g.index.values
            per[s] = round(float(cohen_kappa_score(y[i], preds[i], weights="quadratic")), 3)
        out["per_source_qwk"] = per
        return out

    # When resuming, carry the previous best forward: starting at -1 would let the
    # first resumed epoch overwrite best.pt with a WORSE model than we already have.
    history, best = [], -1.0
    if args.resume:
        best = float(torch.load(args.resume, map_location="cpu").get("cal_qwk", -1.0))
        print(f"resumed run must beat cal QWK {best:.4f} to overwrite best.pt")
    for epoch in range(args.epochs):
        model.train()
        t0 = time.time()
        running = 0.0
        opt.zero_grad(set_to_none=True)
        pbar = tqdm(train_loader, desc=f"Epoch {epoch+1}/{args.epochs}", mininterval=30)
        for i, (imgs, labels) in enumerate(pbar):
            imgs = imgs.to(device, non_blocking=True, memory_format=torch.channels_last)
            labels = labels.to(device, non_blocking=True)
            with torch.amp.autocast("cuda", enabled=device.type == "cuda"):
                logits = model(imgs)
                target = soft_ordinal_targets(labels, config.NUM_CLASSES, args.smooth)
                loss = -(target * torch.log_softmax(logits.float(), 1)).sum(1).mean() / args.accum
            scaler.scale(loss).backward()
            if (i + 1) % args.accum == 0:
                scaler.step(opt); scaler.update(); opt.zero_grad(set_to_none=True)
                if sched.last_epoch < steps - 1:
                    sched.step()
            running += loss.item() * args.accum
            pbar.set_postfix(loss=f"{running/(i+1):.4f}")

        rec = {"epoch": epoch + 1, "train_loss": running / len(train_loader),
               "minutes": round((time.time() - t0) / 60, 1), "lr": sched.get_last_lr()[0]}
        for name, loader in eval_loaders.items():
            rec[name] = evaluate(loader, {"cal": cal, "val": val}[name])
        history.append(rec)
        print(json.dumps(rec), flush=True)

        path = os.path.join(OUT_DIR, f"epoch_{epoch+1}.pt")
        torch.save({"model_state_dict": model.state_dict(), "model_name": args.arch,
                    "epoch": epoch + 1, "dim": args.dim, "cal_qwk": rec["cal"]["qwk"]}, path)
        if rec["cal"]["qwk"] > best:
            best = rec["cal"]["qwk"]
            torch.save({"model_state_dict": model.state_dict(), "model_name": args.arch,
                        "epoch": epoch + 1, "dim": args.dim, "cal_qwk": best},
                       os.path.join(OUT_DIR, "best.pt"))
            print(f"  new best cal QWK={best:.4f} -> {os.path.join(OUT_DIR, 'best.pt')}", flush=True)
        json.dump(history, open(os.path.join(OUT_DIR, "history.json"), "w"), indent=2)

    print(f"Done. best cal QWK={best:.4f}")


if __name__ == "__main__":
    main()
