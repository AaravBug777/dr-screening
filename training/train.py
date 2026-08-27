"""
Train a DR severity classifier.

Usage:
    python train.py

Prints a confusion matrix and quadratic weighted kappa (the standard metric
for this task — plain accuracy is misleading given the class imbalance)
every epoch, and saves the best checkpoint by val kappa.

NOTE on import structure (Windows): on some Windows + CUDA setups, having
torch, timm, and sklearn.metrics all loaded at module import time causes a
silent native-level crash the moment any real computation happens afterward
(a DLL/thread-pool init conflict). The safe workaround found through testing
isn't a strict import order — it's keeping the risky combination from ever
being loaded *before* the dataframe-building step completes. So timm,
sklearn.metrics, tqdm, and the DataLoader/nn imports are deliberately done
inside functions (deferred), not at the top of this file, and are only
reached after build_full_dataframe() has already succeeded.
"""
import cv2
cv2.setNumThreads(0)
cv2.ocl.setUseOpenCL(False)

import json
import os

import config
from dataset import DRDataset, build_full_dataframe, get_class_weights


def get_device():
    import torch
    if torch.cuda.is_available():
        return torch.device("cuda")
    if torch.backends.mps.is_available():
        return torch.device("mps")
    print("No GPU found — training on CPU will be slow. Consider Colab/Kaggle GPU runtime.")
    return torch.device("cpu")


def build_model():
    import timm
    model = timm.create_model(config.MODEL_NAME, pretrained=True, num_classes=config.NUM_CLASSES)
    return model


def evaluate(model, loader, device, criterion):
    import torch
    from sklearn.metrics import cohen_kappa_score, confusion_matrix

    model.eval()
    all_preds, all_labels = [], []
    total_loss = 0.0
    with torch.no_grad():
        for imgs, labels in loader:
            imgs, labels = imgs.to(device), labels.to(device)
            logits = model(imgs)
            loss = criterion(logits, labels)
            total_loss += loss.item() * imgs.size(0)
            preds = logits.argmax(dim=1).cpu().numpy()
            all_preds.extend(preds)
            all_labels.extend(labels.cpu().numpy())

    avg_loss = total_loss / len(loader.dataset)
    kappa = cohen_kappa_score(all_labels, all_preds, weights="quadratic")
    cm = confusion_matrix(all_labels, all_preds, labels=list(range(config.NUM_CLASSES)))
    return avg_loss, kappa, cm


def print_confusion_matrix(cm):
    print("Confusion matrix (rows=true, cols=pred):")
    header = "        " + "".join(f"{name[:6]:>8}" for name in config.CLASS_NAMES)
    print(header)
    for i, row in enumerate(cm):
        row_str = "".join(f"{v:>8}" for v in row)
        print(f"{config.CLASS_NAMES[i][:6]:>8}{row_str}")


def main():
    os.makedirs(config.OUTPUT_DIR, exist_ok=True)

    # --- Step 1: build the dataframe using only the lighter imports that
    # dataset.py already pulled in (cv2, pandas, base torch, sklearn.model_selection).
    # Deliberately NOT importing timm / sklearn.metrics / tqdm / torch.nn / DataLoader
    # yet — see module docstring for why.
    print("Building dataset...")
    train_df, val_df = build_full_dataframe()
    print(f"Train: {len(train_df)} images | Val: {len(val_df)} images")
    print("Class distribution (train):")
    print(train_df["label"].value_counts().sort_index())

    train_ds = DRDataset(train_df, train=True)
    val_ds = DRDataset(val_df, train=False)
    print("Dataset objects created.")

    # --- Step 2: only now bring in the heavier/riskier imports, after the
    # dataframe step has already completed successfully.
    import torch
    import torch.nn as nn
    from torch.utils.data import DataLoader
    from tqdm import tqdm

    device = get_device()
    print(f"Using device: {device}")

    train_loader = DataLoader(train_ds, batch_size=config.BATCH_SIZE, shuffle=True,
                               num_workers=config.NUM_WORKERS, pin_memory=True)
    val_loader = DataLoader(val_ds, batch_size=config.BATCH_SIZE, shuffle=False,
                             num_workers=config.NUM_WORKERS, pin_memory=True)

    model = build_model().to(device)
    print("Model created and moved to device.")

    class_weights = get_class_weights(train_df).to(device)
    criterion = nn.CrossEntropyLoss(weight=class_weights)

    optimizer = torch.optim.AdamW(model.parameters(), lr=config.LEARNING_RATE,
                                   weight_decay=config.WEIGHT_DECAY)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=config.NUM_EPOCHS)

    best_kappa = -1.0

    for epoch in range(config.NUM_EPOCHS):
        model.train()
        running_loss = 0.0
        pbar = tqdm(train_loader, desc=f"Epoch {epoch+1}/{config.NUM_EPOCHS}")
        for imgs, labels in pbar:
            imgs, labels = imgs.to(device), labels.to(device)
            optimizer.zero_grad()
            logits = model(imgs)
            loss = criterion(logits, labels)
            loss.backward()
            optimizer.step()
            running_loss += loss.item() * imgs.size(0)
            pbar.set_postfix(loss=loss.item())

        scheduler.step()
        train_loss = running_loss / len(train_loader.dataset)
        val_loss, val_kappa, cm = evaluate(model, val_loader, device, criterion)

        print(f"\nEpoch {epoch+1}: train_loss={train_loss:.4f} val_loss={val_loss:.4f} val_kappa={val_kappa:.4f}")
        print_confusion_matrix(cm)

        if val_kappa > best_kappa:
            best_kappa = val_kappa
            torch.save({
                "model_state_dict": model.state_dict(),
                "model_name": config.MODEL_NAME,
                "epoch": epoch,
                "val_kappa": val_kappa,
            }, config.CHECKPOINT_PATH)
            print(f"New best model saved (kappa={val_kappa:.4f}) -> {config.CHECKPOINT_PATH}")

    with open(config.LABEL_MAP_PATH, "w") as f:
        json.dump({i: name for i, name in enumerate(config.CLASS_NAMES)}, f, indent=2)

    print(f"\nTraining complete. Best val kappa: {best_kappa:.4f}")
    print(f"Best checkpoint: {config.CHECKPOINT_PATH}")


if __name__ == "__main__":
    main()
