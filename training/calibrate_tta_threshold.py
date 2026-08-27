"""
Fits temperature + referable-DR threshold specifically for TTA-averaged
probabilities, on the cached per-view logits (cache_tta_logits.py) --
same calibrate-on-a-split/report-on-a-genuinely-held-out-split discipline
as calibrate_referable_threshold.py, applied to TTA because
validate_tta.py found TTA shifts the probability distribution enough that
reusing the non-TTA threshold isn't safe to assume.

Key difference from calibrate_referable_threshold.py: the "probability"
for a candidate temperature T is the TTA average -- mean over the 6 cached
views of softmax(view_logits / T) -- not softmax of a single logit vector.
Temperature fitting therefore searches over the AVERAGED probability's NLL,
not a single view's.

Usage:
    python calibrate_tta_threshold.py
"""
import numpy as np
from sklearn.model_selection import train_test_split

import config

CACHE_PATH = "tta_logits_cache.npz"
MIN_SENSITIVITY = 0.90  # same hard constraint as calibrate_referable_threshold.py
CALIBRATION_MARGIN = 0.02  # same safety margin, same reason: a first pass with none crossed the line on sampling noise


def softmax(logits, T=1.0):
    z = logits / T
    z = z - z.max(axis=-1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=-1, keepdims=True)


def tta_avg_probs(view_logits, T):
    """view_logits: (N, 6, 5). Returns (N, 5) -- mean over views of softmax(logit/T)."""
    per_view_probs = softmax(view_logits, T)  # (N, 6, 5)
    return per_view_probs.mean(axis=1)


def fit_temperature_tta(view_logits, labels):
    best_T, best_nll = 1.0, np.inf
    for T in np.arange(0.3, 5.01, 0.05):
        probs = tta_avg_probs(view_logits, T)
        p_true = probs[np.arange(len(labels)), labels]
        nll = -np.log(np.clip(p_true, 1e-12, 1.0)).mean()
        if nll < best_nll:
            best_nll, best_T = nll, T
    return best_T, best_nll


def sens_spec(true_referable, pred_referable):
    tp = np.sum(pred_referable & true_referable)
    fn = np.sum(~pred_referable & true_referable)
    tn = np.sum(~pred_referable & ~true_referable)
    fp = np.sum(pred_referable & ~true_referable)
    return tp / max(1, tp + fn), tn / max(1, tn + fp)


def main():
    d = np.load(CACHE_PATH, allow_pickle=True)
    view_logits, labels, dataset_tag = d["logits"], d["labels"], d["dataset_tag"]
    print(f"Loaded {len(labels)} images x 6 TTA views from {CACHE_PATH}")

    true_referable_all = (labels >= 2).astype(int)
    strata = np.array([f"{t}_{r}" for t, r in zip(dataset_tag, true_referable_all)])
    idx = np.arange(len(labels))
    calib_idx, test_idx = train_test_split(idx, test_size=0.5, stratify=strata, random_state=config.SEED)

    calib_logits, calib_labels = view_logits[calib_idx], labels[calib_idx]
    test_logits, test_labels = view_logits[test_idx], labels[test_idx]
    print(f"Calibration set: n={len(calib_idx)}   Held-out test set: n={len(test_idx)}")

    # --- Step 1: temperature, fit on TTA-averaged probabilities ---
    T, nll = fit_temperature_tta(calib_logits, calib_labels)
    print(f"\nFitted TTA temperature T={T:.2f} (NLL={nll:.4f} on calibration set)")
    print(f"(For comparison, the non-TTA REFERABLE_TEMPERATURE in config.py is {config.REFERABLE_TEMPERATURE})")

    # --- Step 2: threshold sweep on calibration half ---
    calib_probs = tta_avg_probs(calib_logits, T)
    calib_true_referable = (calib_labels >= 2).astype(int).astype(bool)
    calib_p_referable = calib_probs[:, 2:].sum(axis=1)

    required = MIN_SENSITIVITY + CALIBRATION_MARGIN
    print(f"\nRequiring calibration-set sensitivity >= {required:.2%}")
    candidates = []
    for t in np.arange(0.90, 0.01, -0.01):
        pred = calib_p_referable > t
        sens, spec = sens_spec(calib_true_referable, pred)
        candidates.append((t, sens, spec))

    valid = [(t, s, p) for t, s, p in candidates if s >= required - 1e-9]
    if not valid:
        best_t, best_sens, best_spec = max(candidates, key=lambda r: r[1])
        print(f"WARNING: no threshold reaches {required:.2%} on calibration set. Closest: t={best_t:.2f} (sens={best_sens:.4f})")
    else:
        best_t, best_sens, best_spec = max(valid, key=lambda r: r[2])
        print(f"Selected threshold: t={best_t:.2f} (calibration sensitivity={best_sens:.4f}, specificity={best_spec:.4f})")

    # --- Step 3: apply to the untouched held-out test half ---
    test_probs = tta_avg_probs(test_logits, T)
    test_true_referable = (test_labels >= 2).astype(int).astype(bool)
    test_p_referable = test_probs[:, 2:].sum(axis=1)
    test_pred = test_p_referable > best_t
    final_sens, final_spec = sens_spec(test_true_referable, test_pred)
    final_referral_rate = test_pred.mean()

    print(f"\n=== TTA-calibrated result on held-out test half (n={len(test_idx)}) ===")
    print(f"  T={T:.2f}  threshold={best_t:.2f}")
    print(f"  sensitivity={final_sens*100:.2f}%  specificity={final_spec*100:.2f}%  referral_rate={final_referral_rate*100:.1f}%")

    # For comparison: single-view (no TTA) calibrated result on the SAME held-out images/split
    single_view_logits = test_logits[:, 0, :]  # view 0 = identity, i.e. the plain single-view prediction
    single_probs = softmax(single_view_logits, config.REFERABLE_TEMPERATURE)
    single_p_referable = single_probs[:, 2:].sum(axis=1)
    single_pred = single_p_referable > config.REFERABLE_THRESHOLD
    single_sens, single_spec = sens_spec(test_true_referable, single_pred)
    print(f"\n  (For reference, single-view existing calibration on this SAME held-out split: "
          f"sensitivity={single_sens*100:.2f}%  specificity={single_spec*100:.2f}%)")

    # 5-class kappa comparison too
    from sklearn.metrics import cohen_kappa_score
    test_preds_tta = test_probs.argmax(axis=1)
    test_preds_single = single_probs.argmax(axis=1)
    k_tta = cohen_kappa_score(test_labels, test_preds_tta, weights="quadratic")
    k_single = cohen_kappa_score(test_labels, test_preds_single, weights="quadratic")
    print(f"\n  5-class quadratic weighted kappa on held-out test half: TTA={k_tta:.4f}  single-view={k_single:.4f}")

    if final_sens >= MIN_SENSITIVITY - 1e-9:
        print(f"\nConstraint (sensitivity>={MIN_SENSITIVITY:.0%}) HOLDS. Recommended values for TTA mode:")
        print(f"  TTA_REFERABLE_TEMPERATURE = {T:.2f}")
        print(f"  TTA_REFERABLE_THRESHOLD = {best_t:.2f}")
    else:
        print(f"\nWARNING: constraint (sensitivity>={MIN_SENSITIVITY:.0%}) DOES NOT hold on held-out test half.")


if __name__ == "__main__":
    main()
