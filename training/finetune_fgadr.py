"""
Targeted fine-tune of the production DR grader after FGADR revealed specific
failures (referable specificity 25.9%, Mild recall 2.4%, PDR recall 27% on the
1,842-image FGADR Seg-set -- see README).

Design (all deliberate):
  * Starts from the CURRENT checkpoint (best_model.pt), not from scratch, at a
    lower LR -- adds the FGADR domain without discarding what was learned.
  * FGADR is split BY IMAGE, stratified by grade, into 60% train / 15% val /
    25% test (outputs/fgadr_split.csv). The test 25% is never seen here.
  * REPLAY: a class-capped sample of APTOS+EyePACS *train* rows is mixed in so
    the model does not forget the original populations (val rows never used).
  * MILD: replay keeps up to REPLAY_CAP mild images, FGADR mild is repeated
    like the rest of FGADR, and the mild class loss weight is multiplied by
    MILD_BOOST on top of inverse-frequency weighting.
  * Every epoch is saved separately (outputs/finetune/epoch_N.pt); the deployed
    best_model.pt is NEVER touched by this script. A candidate only replaces it
    after eval_checkpoint.py shows it wins on held-out data.

Usage: python finetune_fgadr.py
"""
import os
import shutil

import cv2
cv2.setNumThreads(0)
cv2.ocl.setUseOpenCL(False)

import numpy as np
import pandas as pd

import config
from dataset import DRDataset, build_full_dataframe

FGADR_DIR = os.environ.get("FGADR_DIR", "./data/fgadr")
REPLAY_CAP = {0: 1500, 1: 1500, 2: 1500, 3: 700, 4: 700}
FGADR_REPEAT = 2
MILD_BOOST = 1.5
EPOCHS = 4
LR = 1e-4
ORIG_VAL_N = 1200
OUT_DIR = os.path.join(config.OUTPUT_DIR, "finetune")


def load_fgadr_split():
    split_path = os.path.join(config.OUTPUT_DIR, "fgadr_split.csv")
    if os.path.isfile(split_path):
        return pd.read_csv(split_path)
    from sklearn.model_selection import train_test_split
    df = pd.read_csv(os.path.join(FGADR_DIR, "Seg-set", "DR_Seg_Grading_Label.csv"),
                     header=None, names=["image", "label"])
    df["path"] = df["image"].apply(lambda x: os.path.abspath(os.path.join(FGADR_DIR, "Seg-set", "Original_Images", x)))
    train, rest = train_test_split(df, test_size=0.40, stratify=df["label"], random_state=config.SEED)
    val, test = train_test_split(rest, test_size=0.625, stratify=rest["label"], random_state=config.SEED)
    df["split"] = "train"
    df.loc[val.index, "split"] = "val"
    df.loc[test.index, "split"] = "test"
    os.makedirs(config.OUTPUT_DIR, exist_ok=True)
    df.to_csv(split_path, index=False)
    return df


def report(name, y, pred, ref_prob):
    from sklearn.metrics import cohen_kappa_score
    qwk = cohen_kappa_score(y, pred, weights="quadratic")
    rec = [float((pred[y == g] == g).mean()) if (y == g).any() else float("nan") for g in range(5)]
    tr = y >= 2
    rp = ref_prob > config.TTA_REFERABLE_THRESHOLD
    sens = float(rp[tr].mean()) if tr.any() else float("nan")
    spec = float((~rp[~tr]).mean()) if (~tr).any() else float("nan")
    print(f"  [{name}] n={len(y)} QWK={qwk:.3f} recall/grade={[round(r, 2) for r in rec]} "
          f"referable sens={sens:.3f} spec={spec:.3f}", flush=True)
    return qwk


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    backup = os.path.join(config.OUTPUT_DIR, "best_model_pre_fgadr_backup.pt")
    if not os.path.isfile(backup):
        shutil.copy(config.CHECKPOINT_PATH, backup)
        print(f"Backed up current checkpoint -> {backup}")

    fg = load_fgadr_split()
    print("FGADR split:", fg["split"].value_counts().to_dict())
    fg_train = fg[fg["split"] == "train"][["path", "label"]]
    fg_val = fg[fg["split"] == "val"][["path", "label"]]

    train_df, val_df = build_full_dataframe()
    rng = np.random.RandomState(config.SEED)
    replay = pd.concat([
        g.sample(n=min(len(g), REPLAY_CAP[int(k)]), random_state=config.SEED)
        for k, g in train_df.groupby("label")
    ])
    mixed = pd.concat([replay[["path", "label"]]] + [fg_train] * FGADR_REPEAT, ignore_index=True)
    orig_val = pd.concat([
        g.sample(n=min(len(g), max(1, int(ORIG_VAL_N * len(g) / len(val_df)))), random_state=config.SEED)
        for _, g in val_df.groupby("label")
    ])[["path", "label"]]
    print("Mixed train class counts:", mixed["label"].value_counts().sort_index().to_dict())
    print(f"FGADR val n={len(fg_val)}, original-population val n={len(orig_val)}")

    import torch
    import torch.nn as nn
    from torch.utils.data import DataLoader
    from tqdm import tqdm
    import timm

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    train_loader = DataLoader(DRDataset(mixed, train=True), batch_size=config.BATCH_SIZE, shuffle=True,
                              num_workers=config.NUM_WORKERS, pin_memory=True)
    val_loaders = {
        "FGADR-val": DataLoader(DRDataset(fg_val, train=False), batch_size=config.BATCH_SIZE, shuffle=False,
                                num_workers=config.NUM_WORKERS),
        "orig-val": DataLoader(DRDataset(orig_val, train=False), batch_size=config.BATCH_SIZE, shuffle=False,
                               num_workers=config.NUM_WORKERS),
    }

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
                    logits = model(imgs.to(device)).cpu()
                    probs = torch.softmax(logits / config.TTA_REFERABLE_TEMPERATURE, dim=1).numpy()
                    ys.append(labels.numpy()); ps.append(probs.argmax(1)); rp.append(probs[:, 2:].sum(1))
            scores.append(report(name, np.concatenate(ys), np.concatenate(ps), np.concatenate(rp)))
        return float(np.mean(scores))

    print("Baseline (starting checkpoint) on the same val sets:")
    base = evaluate()
    best = base
    for epoch in range(EPOCHS):
        model.train()
        pbar = tqdm(train_loader, desc=f"Epoch {epoch+1}/{EPOCHS}", mininterval=30)
        for imgs, labels in pbar:
            imgs, labels = imgs.to(device), labels.to(device)
            optimizer.zero_grad()
            loss = criterion(model(imgs), labels)
            loss.backward()
            optimizer.step()
            pbar.set_postfix(loss=loss.item())
        scheduler.step()
        print(f"Epoch {epoch+1} validation:", flush=True)
        score = evaluate()
        path = os.path.join(OUT_DIR, f"epoch_{epoch+1}.pt")
        torch.save({"model_state_dict": model.state_dict(), "model_name": config.MODEL_NAME,
                    "epoch": epoch, "val_score": score}, path)
        if score > best:
            best = score
            shutil.copy(path, os.path.join(OUT_DIR, "best.pt"))
            print(f"  new best mean val QWK={score:.4f} -> finetune/best.pt", flush=True)

    print(f"\nDone. Baseline mean val QWK={base:.4f}, best fine-tuned={best:.4f}")


if __name__ == "__main__":
    main()
