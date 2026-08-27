"""
Caches raw per-view logits (no temperature, no averaging yet) for all 6 TTA
views (see tta.py) over a large stratified sample of the external
(Messidor-2 + IDRiD) validation set. Forward-pass only -- no Grad-CAM
backward pass, since calibration only needs the probabilities, not the
heatmap -- much cheaper than the full generate_tta() and lets the actual
calibration/threshold sweep in calibrate_tta_threshold.py be re-run
instantly against different candidate temperatures, the same
cache-then-sweep pattern calibrate_referable_threshold.py already
established for the non-TTA case.

Usage:
    python cache_tta_logits.py
Produces:
    tta_logits_cache.npz  -- logits (N, 6, 5), labels (N,), dataset_tag (N,)
"""
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
from validate_external import load_messidor2_df, load_idrid_grading_df

CACHE_PATH = "tta_logits_cache.npz"
SAMPLE_N = 10_000  # effectively "all of it" -- the full 2,260-image external set, so TTA calibration is directly comparable to the existing single-view calibration (which used the full set, not a subsample) rather than a smaller, differently-composed sample


def main():
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = load_trained_model(config.CHECKPOINT_PATH, device)
    model.eval()
    transform = get_transforms(train=False)
    views = _build_views()

    m2 = load_messidor2_df(); m2["dataset"] = "messidor2"
    idrid = load_idrid_grading_df(); idrid["dataset"] = "idrid"
    df = pd.concat([m2, idrid], ignore_index=True)
    df = df[df["path"].apply(lambda p: __import__("os").path.exists(p))].reset_index(drop=True)

    from sklearn.model_selection import train_test_split
    strata = df["dataset"] + "_" + (df["label"] >= 2).astype(str)
    if len(df) > SAMPLE_N:
        _, sample_idx = train_test_split(
            np.arange(len(df)), test_size=SAMPLE_N, stratify=strata, random_state=config.SEED
        )
        sample = df.iloc[sample_idx].reset_index(drop=True)
    else:
        sample = df
    print(f"Caching TTA logits for {len(sample)} images (stratified sample of {len(df)} total external images).")

    all_logits = np.zeros((len(sample), len(views), config.NUM_CLASSES), dtype=np.float32)
    labels = sample["label"].values.astype(np.int64)
    dataset_tag = sample["dataset"].values

    import time
    t0 = time.time()
    with torch.no_grad():
        for i, row in sample.iterrows():
            img = cv2.imread(row["path"])
            img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            processed = ben_graham_preprocess(img)
            tensor = transform(image=processed)["image"].unsqueeze(0).to(device)

            for v, (forward_fn, _) in enumerate(views):
                view_tensor = forward_fn(tensor)
                logits = model(view_tensor).cpu().numpy()[0]
                all_logits[i, v, :] = logits

            if (i + 1) % 100 == 0:
                elapsed = time.time() - t0
                print(f"  {i+1}/{len(sample)}  ({elapsed:.0f}s elapsed, {elapsed/(i+1):.2f}s/image)")

    np.savez(CACHE_PATH, logits=all_logits, labels=labels, dataset_tag=dataset_tag)
    print(f"\nSaved {CACHE_PATH}: logits shape {all_logits.shape}")


if __name__ == "__main__":
    main()
