"""
Builds ONE manifest over all six populations, with frozen splits, for the
full retrain (see README's retrain section). Written once to
outputs/manifest.csv and then treated as read-only: every later stage
(caching, training, calibration, testing) reads this file, so no stage can
silently disagree with another about what is train vs. test.

Columns: path, label (0-4 ICDR), source, split.

Splits:
  train  -- trainable
  val    -- model selection during training (APTOS/EyePACS only, the
            historical 15% split, kept so 'val' means what it always meant)
  cal    -- threshold/temperature calibration ONLY, never trained on;
            deliberately multi-population (APTOS/EyePACS val is NOT used
            for this, since a threshold fit on the training populations is
            exactly what failed to transfer before)
  test   -- frozen final test suite, never trained on, never calibrated on

Test suite is inherited from the splits already frozen earlier in this
project so the new model's numbers stay comparable with the old model's:
FGADR test (461), the DDR 2,000-image stratified sample, Messidor-2 test
half (872), and ALL of IDRiD (516) -- IDRiD is kept 100% untouched by
every stage, so it is the one genuinely unimpeachable number at the end.
"""
import os

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split

import config
from validate_external import load_idrid_grading_df, load_messidor2_df

OUT = os.path.join(config.OUTPUT_DIR, "manifest.csv")
DDR_DIR = "./data/ddr"
FGADR_DIR = "./data/fgadr"


def rows(paths, labels, source, split):
    return pd.DataFrame({"path": [os.path.abspath(p) for p in paths],
                         "label": np.asarray(labels, dtype=int),
                         "source": source, "split": split})


def main():
    parts = []

    # --- APTOS + EyePACS: the historical 85/15 train/val split, same SEED,
    # so 'val' is the same population-adjacent split it has always been. ---
    aptos = pd.read_csv(os.path.join(config.APTOS_DIR, "train.csv"))
    aptos["path"] = aptos["id_code"].apply(lambda x: os.path.join(config.APTOS_DIR, "train_images", f"{x}.png"))
    aptos = aptos.rename(columns={"diagnosis": "label"})[["path", "label"]]
    aptos["source"] = "aptos"

    ep_csv = os.path.join(config.EYEPACS_DIR, "trainLabels.csv")
    if os.path.exists(ep_csv):
        ep = pd.read_csv(ep_csv)
        ep["path"] = ep["image"].apply(lambda x: os.path.join(config.EYEPACS_DIR, "train", f"{x}.jpeg"))
        ep = ep.rename(columns={"level": "label"})[["path", "label"]]
        ep["source"] = "eyepacs"
    else:
        ep = pd.DataFrame(columns=["path", "label", "source"])

    core = pd.concat([aptos, ep], ignore_index=True)
    core = core[core["path"].apply(os.path.exists)].reset_index(drop=True)
    tr, va = train_test_split(core, test_size=config.VAL_SPLIT, stratify=core["label"], random_state=config.SEED)
    parts += [rows(tr["path"], tr["label"], tr["source"], "train"),
              rows(va["path"], va["label"], va["source"], "val")]

    # --- DDR: the 2,000-image stratified sample is the frozen test set; of
    # the rest, a stratified 1,000 become 'cal' and the remainder train. ---
    ddr = pd.read_csv(os.path.join(DDR_DIR, "DR_grading.csv"))
    ddr["path"] = ddr["id_code"].apply(lambda x: os.path.join(DDR_DIR, "DR_grading", "DR_grading", x))
    ddr = ddr.rename(columns={"diagnosis": "label"})
    held = set(pd.read_csv(os.path.join(config.OUTPUT_DIR, "ddr_sample_images.csv"))["id_code"])
    is_test = ddr["id_code"].isin(held)
    parts.append(rows(ddr.loc[is_test, "path"], ddr.loc[is_test, "label"], "ddr", "test"))
    rest = ddr[~is_test].reset_index(drop=True)
    rest_tr, rest_cal = train_test_split(rest, test_size=1000, stratify=rest["label"], random_state=config.SEED)
    parts += [rows(rest_tr["path"], rest_tr["label"], "ddr", "train"),
              rows(rest_cal["path"], rest_cal["label"], "ddr", "cal")]

    # --- FGADR: reuse the split frozen for the earlier fine-tunes; its
    # 'val' becomes 'cal' here (it was only ever used for selection). ---
    fg = pd.read_csv(os.path.join(config.OUTPUT_DIR, "fgadr_split.csv"))
    fg_map = {"train": "train", "val": "cal", "test": "test"}
    for s, out in fg_map.items():
        d = fg[fg["split"] == s]
        parts.append(rows(d["path"], d["label"], "fgadr", out))

    # --- Messidor-2: reuse the frozen three-way split (train / cal / test). ---
    m2 = pd.read_csv(os.path.join(config.OUTPUT_DIR, "messidor2_split.csv"))
    for s in ("train", "cal", "test"):
        d = m2[m2["split"] == s]
        parts.append(rows(d["path"], d["label"], "messidor2", s))

    # --- IDRiD: ENTIRELY test. Never trained on, never calibrated on. ---
    idrid = load_idrid_grading_df()
    parts.append(rows(idrid["path"], idrid["label"], "idrid", "test"))

    man = pd.concat(parts, ignore_index=True)
    missing = ~man["path"].apply(os.path.exists)
    if missing.any():
        print(f"WARNING: dropping {missing.sum()} manifest rows whose image file is missing")
        man = man[~missing].reset_index(drop=True)

    # A path must never appear in two different splits -- that is exactly the
    # leak this manifest exists to prevent, so fail loudly rather than train.
    dup = man.groupby("path")["split"].nunique()
    if (dup > 1).any():
        raise SystemExit(f"FATAL: {(dup > 1).sum()} images appear in more than one split")

    man.to_csv(OUT, index=False)
    print(f"Wrote {OUT}: {len(man)} images\n")
    print(pd.crosstab(man["source"], man["split"], margins=True), "\n")
    print(pd.crosstab(man["label"], man["split"], margins=True))


if __name__ == "__main__":
    main()
