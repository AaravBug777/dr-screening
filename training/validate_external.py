"""
Validate the trained DR classifier against external, held-out datasets it
was never trained on: Messidor-2 and IDRiD's Disease Grading subset.

Why this matters: train.py's val_kappa is measured on a held-out split of
the SAME population the model trained on (APTOS + EyePACS). That doesn't
tell you how the model performs on images from a different clinic, camera,
or population -- exactly the "APTOS alone is only ~3,662 images" and
generalization concerns the top-level README's "Known limitations" section
flags. This script is that check.

Usage:
    python validate_external.py

Expects a trained checkpoint at ../training/outputs/best_model.pt (see
train.py) and MESSIDOR2_DIR / IDRID_DIR (see config.py) populated:
    - Messidor-2: MESSIDOR2_DIR/messidor_data.csv + MESSIDOR2_DIR/IMAGES/
    - IDRiD Disease Grading: IDRID_DIR/B. Disease Grading/...

NOTE on import structure (Windows): same deferred-import pattern as
train.py (see its docstring) -- torch/timm/sklearn.metrics/tqdm loaded
together at module import time can crash on some Windows+CUDA setups. The
lightweight dataframe-building step runs first; heavier imports come after.
"""
import cv2
cv2.setNumThreads(0)
cv2.ocl.setUseOpenCL(False)

import os
import pandas as pd

import config
from dataset import DRDataset
from train import print_confusion_matrix  # lightweight import -- see train.py's own deferred-import docstring; only pulls in cv2/json/os/config/dataset at module level


def load_messidor2_df():
    """Messidor-2: adjudicated 5-point ICDR grades (Krause et al. 2018),
    same 0-4 scale as APTOS/EyePACS/IDRiD -- no remapping needed. Drops the
    handful of images marked ungradable (no grade to compare against)."""
    csv_path = os.path.join(config.MESSIDOR2_DIR, "messidor_data.csv")
    img_dir = os.path.join(config.MESSIDOR2_DIR, "IMAGES")
    df = pd.read_csv(csv_path)

    ungradable = (df["adjudicated_gradable"] == 0).sum()
    if ungradable:
        print(f"Messidor-2: dropping {ungradable} images marked ungradable (no grade available)")
    df = df[df["adjudicated_gradable"] == 1].copy()

    df["path"] = df["image_id"].apply(lambda x: os.path.join(img_dir, x))
    df["label"] = df["adjudicated_dr_grade"].astype(int)
    return df[["path", "label"]].reset_index(drop=True)


def load_idrid_grading_df():
    """IDRiD Disease Grading: both the 413-image training split and the
    103-image testing split are combined -- the model was never trained on
    either, so from its perspective both are equally "held out". Same 0-4
    ICDR scale."""
    base = os.path.join(config.IDRID_DIR, "B. Disease Grading")
    splits = [
        ("2. Groundtruths/a. IDRiD_Disease Grading_Training Labels.csv", "1. Original Images/a. Training Set"),
        ("2. Groundtruths/b. IDRiD_Disease Grading_Testing Labels.csv", "1. Original Images/b. Testing Set"),
    ]

    dfs = []
    for csv_rel, img_rel in splits:
        d = pd.read_csv(os.path.join(base, csv_rel))
        d = d[["Image name", "Retinopathy grade"]].dropna()
        img_dir = os.path.join(base, img_rel)
        d["path"] = d["Image name"].apply(lambda x: os.path.join(img_dir, f"{x}.jpg"))
        d["label"] = d["Retinopathy grade"].astype(int)
        dfs.append(d[["path", "label"]])

    return pd.concat(dfs, ignore_index=True)


def evaluate_dataset(name, df, model, device):
    import torch
    from torch.utils.data import DataLoader
    from sklearn.metrics import cohen_kappa_score, confusion_matrix, accuracy_score
    from tqdm import tqdm

    exists_mask = df["path"].apply(os.path.exists)
    missing = (~exists_mask).sum()
    if missing:
        print(f"[{name}] Warning: {missing} image paths not found, dropping.")
    df = df[exists_mask].reset_index(drop=True)

    ds = DRDataset(df, train=False)
    loader = DataLoader(ds, batch_size=config.BATCH_SIZE, shuffle=False, num_workers=config.NUM_WORKERS)

    model.eval()
    all_preds, all_labels = [], []
    with torch.no_grad():
        for imgs, labels in tqdm(loader, desc=name):
            imgs = imgs.to(device)
            logits = model(imgs)
            preds = logits.argmax(dim=1).cpu().numpy()
            all_preds.extend(preds)
            all_labels.extend(labels.numpy())

    kappa = cohen_kappa_score(all_labels, all_preds, weights="quadratic")
    acc = accuracy_score(all_labels, all_preds)
    cm = confusion_matrix(all_labels, all_preds, labels=list(range(config.NUM_CLASSES)))

    print(f"\n=== {name} (n={len(all_labels)}) ===")
    print(f"Quadratic weighted kappa: {kappa:.4f}")
    print(f"Accuracy: {acc:.4f}")
    print_confusion_matrix(cm)

    return {"name": name, "n": len(all_labels), "kappa": kappa, "accuracy": acc}


def main():
    print("Loading external dataset labels...")
    messidor_df = load_messidor2_df()
    idrid_df = load_idrid_grading_df()
    print(f"Messidor-2: {len(messidor_df)} gradable images")
    print(f"IDRiD Disease Grading: {len(idrid_df)} images")

    import torch
    from gradcam import load_trained_model

    if not os.path.exists(config.CHECKPOINT_PATH):
        raise SystemExit(
            f"No checkpoint found at {config.CHECKPOINT_PATH}. Train a model first (train.py) "
            "before validating generalization."
        )

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Using device: {device}")
    model = load_trained_model(config.CHECKPOINT_PATH, device)

    results = []
    results.append(evaluate_dataset("Messidor-2", messidor_df, model, device))
    results.append(evaluate_dataset("IDRiD Disease Grading", idrid_df, model, device))

    combined_df = pd.concat([messidor_df, idrid_df], ignore_index=True)
    results.append(evaluate_dataset("Combined external", combined_df, model, device))

    print("\n=== Summary: external generalization vs. train.py's val_kappa ===")
    for r in results:
        print(f"{r['name']:<25} n={r['n']:<6} kappa={r['kappa']:.4f}  accuracy={r['accuracy']:.4f}")
    print(
        "\nCompare these kappas against the val_kappa train.py reported at the end of training "
        "(same metric, held-out APTOS+EyePACS split). A meaningfully lower external kappa here "
        "is a real generalization gap, not a bug -- worth reporting alongside the training "
        "kappa, not instead of it."
    )


if __name__ == "__main__":
    main()
