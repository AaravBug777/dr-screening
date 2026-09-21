"""
Fine-tune v2: FGADR-only fine-tune (finetune_fgadr.py) fixed FGADR/IDRiD/Mild
but regressed Messidor-2 and DDR sensitivity, i.e. it drifted toward FGADR's
labeling. v2 trains on a broader mix so no single source dominates:

  * FGADR train (60% split, x2), as before
  * Messidor-2 "train" quarter (x2) -- Messidor-2 is split BY IMAGE into
    train / cal / test (test = the same 872-image half evaluated before;
    cal = calibration only, never trained on)
  * DDR: class-capped sample of rows NOT in the 2,000-image DDR eval sample
  * replayed APTOS/EyePACS train rows (smaller caps than v1)
  * Mild oversampled via the DDR caps and a MILD_BOOST loss weight
Held out throughout (never trained on): FGADR test, Messidor-2 test half,
the DDR eval sample, all of IDRiD. Checkpoint chosen by the mean QWK over
FGADR-val, original-population val and Messidor-2 cal. Every epoch is saved
under outputs/finetune_v2/; the deployed best_model.pt is never touched.
"""
import os

import cv2
cv2.setNumThreads(0)
cv2.ocl.setUseOpenCL(False)

import numpy as np
import pandas as pd

import config
from dataset import DRDataset, build_full_dataframe

REPLAY_CAP = {0: 1000, 1: 1000, 2: 1000, 3: 500, 4: 500}
DDR_CAP = {0: 400, 1: 400, 2: 400, 3: 150, 4: 250}
FGADR_REPEAT = 2
M2_REPEAT = 2
MILD_BOOST = 1.5
EPOCHS = 5
LR = 1e-4
ORIG_VAL_N = 1200
OUT_DIR = os.path.join(config.OUTPUT_DIR, "finetune_v2")
DDR_DIR = "./data/ddr"


def messidor_split():
    path = os.path.join(config.OUTPUT_DIR, "messidor2_split.csv")
    if os.path.isfile(path):
        return pd.read_csv(path)
    from sklearn.model_selection import train_test_split
    from validate_external import load_messidor2_df
    m2 = load_messidor2_df()
    m2 = m2[m2["path"].apply(os.path.exists)].reset_index(drop=True)
    y = m2["label"].values
    idx = np.arange(len(m2))
    # identical to compare_models.py: a/b halves, stratified on referable, seed 42
    a, b = train_test_split(idx, test_size=0.5, stratify=(y >= 2), random_state=42)
    a_train, a_cal = train_test_split(a, test_size=0.5, stratify=(y[a] >= 2), random_state=42)
    m2["split"] = "test"
    m2.loc[a_train, "split"] = "train"
    m2.loc[a_cal, "split"] = "cal"
    m2["path"] = m2["path"].apply(os.path.abspath)
    m2[["path", "label", "split"]].to_csv(path, index=False)
    return m2[["path", "label", "split"]]


def report(name, y, pred, ref_prob):
    from sklearn.metrics import cohen_kappa_score
    qwk = cohen_kappa_score(y, pred, weights="quadratic")
    rec = [round(float((pred[y == g] == g).mean()), 2) if (y == g).any() else None for g in range(5)]
    tr = y >= 2
    rp = ref_prob > config.TTA_REFERABLE_THRESHOLD
    sens = float(rp[tr].mean()) if tr.any() else float("nan")
    spec = float((~rp[~tr]).mean()) if (~tr).any() else float("nan")
    print(f"  [{name}] n={len(y)} QWK={qwk:.3f} recall/grade={rec} sens={sens:.3f} spec={spec:.3f}", flush=True)
    return qwk


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    fg = pd.read_csv(os.path.join(config.OUTPUT_DIR, "fgadr_split.csv"))
    fg_train = fg[fg["split"] == "train"][["path", "label"]]
    fg_val = fg[fg["split"] == "val"][["path", "label"]]

    m2 = messidor_split()
    print("Messidor-2 split:", m2["split"].value_counts().to_dict())
    m2_train = m2[m2["split"] == "train"][["path", "label"]]
    m2_cal = m2[m2["split"] == "cal"][["path", "label"]]

    ddr = pd.read_csv(os.path.join(DDR_DIR, "DR_grading.csv"))
    held = set(pd.read_csv(os.path.join(config.OUTPUT_DIR, "ddr_sample_images.csv"))["id_code"])
    ddr = ddr[~ddr["id_code"].isin(held)]
    ddr_s = pd.concat([g.sample(n=min(len(g), DDR_CAP[int(k)]), random_state=config.SEED) for k, g in ddr.groupby("diagnosis")])
    ddr_train = pd.DataFrame({
        "path": [os.path.abspath(os.path.join(DDR_DIR, "DR_grading", "DR_grading", f)) for f in ddr_s["id_code"]],
        "label": ddr_s["diagnosis"].values})

    train_df, val_df = build_full_dataframe()
    replay = pd.concat([g.sample(n=min(len(g), REPLAY_CAP[int(k)]), random_state=config.SEED)
                        for k, g in train_df.groupby("label")])[["path", "label"]]
    mixed = pd.concat([replay] + [fg_train] * FGADR_REPEAT + [m2_train] * M2_REPEAT + [ddr_train], ignore_index=True)
    orig_val = pd.concat([g.sample(n=min(len(g), max(1, int(ORIG_VAL_N * len(g) / len(val_df)))), random_state=config.SEED)
                          for _, g in val_df.groupby("label")])[["path", "label"]]
    print("Mixed train class counts:", mixed["label"].value_counts().sort_index().to_dict(), "total", len(mixed))
    print(f"val sets: FGADR-val={len(fg_val)} orig-val={len(orig_val)} M2-cal={len(m2_cal)}")

    import torch
    import torch.nn as nn
    from torch.utils.data import DataLoader
    from tqdm import tqdm
    import timm

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    train_loader = DataLoader(DRDataset(mixed, train=True), batch_size=config.BATCH_SIZE, shuffle=True,
                              num_workers=config.NUM_WORKERS, pin_memory=True)
    val_loaders = {n: DataLoader(DRDataset(d, train=False), batch_size=config.BATCH_SIZE, shuffle=False,
                                 num_workers=config.NUM_WORKERS)
                   for n, d in (("FGADR-val", fg_val), ("orig-val", orig_val), ("M2-cal", m2_cal))}

    ckpt = torch.load(config.CHECKPOINT_PATH, map_location=device)
    model = timm.create_model(ckpt["model_name"], pretrained=False, num_classes=config.NUM_CLASSES)
    model.load_state_dict(ckpt["model_state_dict"])
    model.to(device)

    counts = mixed["label"].value_counts().sort_index()
    w = len(mixed) / (len(counts) * counts.values)
    w[1] *= MILD_BOOST
    criterion = nn.CrossEntropyLoss(weight=torch.tensor(w, dtype=torch.float32).to(device))
    print("Class loss weights:", [round(float(x), 2) for x in w])
    optimizer = torch.optim.AdamW(model.parameters(), lr=LR, weight_decay=config.WEIGHT_DECAY)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=EPOCHS)

    def evaluate():
        model.eval()
        scores = []
        for name, loader in val_loaders.items():
            ys, ps, rp = [], [], []
            with torch.no_grad():
                for imgs, labels in loader:
                    probs = torch.softmax(model(imgs.to(device)).cpu() / config.TTA_REFERABLE_TEMPERATURE, dim=1).numpy()
                    ys.append(labels.numpy()); ps.append(probs.argmax(1)); rp.append(probs[:, 2:].sum(1))
            scores.append(report(name, np.concatenate(ys), np.concatenate(ps), np.concatenate(rp)))
        return float(np.mean(scores))

    print("Baseline (starting checkpoint):", flush=True)
    best = evaluate()
    print(f"  baseline mean QWK={best:.4f}", flush=True)
    for epoch in range(EPOCHS):
        model.train()
        for imgs, labels in tqdm(train_loader, desc=f"Epoch {epoch+1}/{EPOCHS}", mininterval=60):
            imgs, labels = imgs.to(device), labels.to(device)
            optimizer.zero_grad()
            criterion(model(imgs), labels).backward()
            optimizer.step()
        scheduler.step()
        print(f"Epoch {epoch+1} validation:", flush=True)
        score = evaluate()
        path = os.path.join(OUT_DIR, f"epoch_{epoch+1}.pt")
        torch.save({"model_state_dict": model.state_dict(), "model_name": config.MODEL_NAME,
                    "epoch": epoch, "val_score": score}, path)
        if score > best:
            best = score
            import shutil
            shutil.copy(path, os.path.join(OUT_DIR, "best.pt"))
            print(f"  new best mean QWK={score:.4f} -> finetune_v2/best.pt", flush=True)
    print(f"Done. best mean val QWK={best:.4f}", flush=True)


if __name__ == "__main__":
    main()
