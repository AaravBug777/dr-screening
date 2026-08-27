"""
Dataset loading + preprocessing for diabetic retinopathy fundus images.

Handles:
- APTOS 2019 (train.csv with id_code, diagnosis)
- EyePACS (trainLabels.csv with image, level) — optional, merged in if present
- "Ben Graham" preprocessing: crop to the circular fundus, then apply a
  Gaussian-blur-subtraction contrast enhancement. This is the standard
  preprocessing used by top APTOS Kaggle solutions and makes lesions
  (microaneurysms, hemorrhages) far more visible to the CNN.
"""
import os
import cv2

# Windows fix: configure cv2 threading immediately after import, before any
# other native-heavy library (torch/sklearn/pandas) has a chance to load.
# See the note in train.py for why order matters here.
cv2.setNumThreads(0)
cv2.ocl.setUseOpenCL(False)

import numpy as np
import pandas as pd
import torch
from torch.utils.data import Dataset
from sklearn.model_selection import train_test_split
import albumentations as A
from albumentations.pytorch import ToTensorV2

from config import APTOS_DIR, EYEPACS_DIR, IMG_SIZE, VAL_SPLIT, SEED


def crop_to_fundus(img, tol=7):
    """Crop away the black border around the circular fundus image."""
    gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    mask = gray > tol
    if mask.sum() == 0:
        return img
    coords = np.argwhere(mask)
    y0, x0 = coords.min(axis=0)
    y1, x1 = coords.max(axis=0) + 1
    return img[y0:y1, x0:x1]


def ben_graham_preprocess(img, sigma_frac=10, max_working_dim=640):
    """
    Ben Graham's preprocessing: subtract local average color (Gaussian blur)
    to normalize illumination and boost lesion contrast.

    Downscales large images first (some source images are several thousand
    pixels wide) since the Gaussian blur cost scales with image size and the
    result gets resized down to the model's input size right after anyway —
    this keeps preprocessing fast without changing the visual result.
    """
    img = crop_to_fundus(img)

    h, w = img.shape[:2]
    if max(h, w) > max_working_dim:
        scale = max_working_dim / max(h, w)
        img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)

    height = img.shape[0]
    sigma = height / sigma_frac
    blurred = cv2.GaussianBlur(img, (0, 0), sigma)
    img = cv2.addWeighted(img, 4, blurred, -4, 128)
    return img


def load_aptos_df():
    csv_path = os.path.join(APTOS_DIR, "train.csv")
    img_dir = os.path.join(APTOS_DIR, "train_images")
    df = pd.read_csv(csv_path)
    df["path"] = df["id_code"].apply(lambda x: os.path.join(img_dir, f"{x}.png"))
    df["label"] = df["diagnosis"]
    return df[["path", "label"]]


def load_eyepacs_df():
    csv_path = os.path.join(EYEPACS_DIR, "trainLabels.csv")
    img_dir = os.path.join(EYEPACS_DIR, "train")
    if not os.path.exists(csv_path):
        return pd.DataFrame(columns=["path", "label"])
    df = pd.read_csv(csv_path)
    df["path"] = df["image"].apply(lambda x: os.path.join(img_dir, f"{x}.jpeg"))
    df["label"] = df["level"]
    return df[["path", "label"]]


def build_full_dataframe():
    """Combine APTOS (+ EyePACS if available), drop missing files, split train/val."""
    dfs = [load_aptos_df()]
    eyepacs_df = load_eyepacs_df()
    if len(eyepacs_df) > 0:
        dfs.append(eyepacs_df)
    df = pd.concat(dfs, ignore_index=True)

    exists_mask = df["path"].apply(os.path.exists)
    missing = (~exists_mask).sum()
    if missing > 0:
        print(f"Warning: {missing} image paths not found, dropping them.")
    df = df[exists_mask].reset_index(drop=True)

    train_df, val_df = train_test_split(
        df, test_size=VAL_SPLIT, stratify=df["label"], random_state=SEED
    )
    return train_df.reset_index(drop=True), val_df.reset_index(drop=True)


def get_transforms(train=True):
    if train:
        return A.Compose([
            A.Resize(IMG_SIZE, IMG_SIZE),
            A.HorizontalFlip(p=0.5),
            A.VerticalFlip(p=0.5),
            A.RandomRotate90(p=0.5),
            A.ShiftScaleRotate(shift_limit=0.05, scale_limit=0.1, rotate_limit=25, p=0.5),
            A.RandomBrightnessContrast(brightness_limit=0.15, contrast_limit=0.15, p=0.5),
            A.Normalize(mean=(0.485, 0.456, 0.406), std=(0.229, 0.224, 0.225)),
            ToTensorV2(),
        ])
    return A.Compose([
        A.Resize(IMG_SIZE, IMG_SIZE),
        A.Normalize(mean=(0.485, 0.456, 0.406), std=(0.229, 0.224, 0.225)),
        ToTensorV2(),
    ])


class DRDataset(Dataset):
    def __init__(self, df, train=True):
        self.df = df.reset_index(drop=True)
        self.transform = get_transforms(train)

    def __len__(self):
        return len(self.df)

    def __getitem__(self, idx):
        row = self.df.iloc[idx]
        img = cv2.imread(row["path"])
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        img = ben_graham_preprocess(img)
        augmented = self.transform(image=img)
        img_tensor = augmented["image"]
        label = torch.tensor(int(row["label"]), dtype=torch.long)
        return img_tensor, label


def get_class_weights(df):
    """Inverse-frequency class weights, for use in a weighted loss (severe imbalance in this data)."""
    counts = df["label"].value_counts().sort_index()
    n = len(df)
    k = len(counts)
    weights = n / (k * counts)
    return torch.tensor(weights.values, dtype=torch.float32)
