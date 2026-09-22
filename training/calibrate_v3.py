"""
Phase 2: fit temperature + referable threshold for a v3 checkpoint on the
MULTI-POPULATION cal split, then report on the frozen test suite.

Why this differs from every earlier calibration in this project: previous
thresholds were fitted on one population (Messidor-2, or a Messidor-2/IDRiD
mix) and did not transfer -- a Messidor-tuned threshold collapsed specificity
on IDRiD/DDR/FGADR, which is what blocked deploying the earlier fine-tunes.
Here the threshold is chosen to satisfy a sensitivity floor on EVERY
calibration source at once (worst-case, not average), and the test report is
per-source so a single flattering aggregate cannot hide one bad population.

Temperature is fitted by 5-class NLL (proper calibration -- keeps the
displayed probability strip meaningful), NOT jointly searched with the
threshold: a joint search previously slid to the grid edge (T=0.5) and would
have made displayed confidences near-binary.

Usage: python calibrate_v3.py <tag> [--floor 0.92] [--compare old]
"""
import argparse
import json
import os

import numpy as np
from sklearn.metrics import cohen_kappa_score

import config


def sm(logits, T):
    z = logits / T
    z = z - z.max(-1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(-1, keepdims=True)


def load(tag):
    d = np.load(os.path.join(config.OUTPUT_DIR, f"evalv3_{tag}.npz"))
    sets = {}
    for k in d.files:
        if not k.endswith("_logits"):
            continue
        name = k[:-7]
        split, source = name.split("_", 1)
        sets.setdefault(split, {})[source] = (d[k], d[name + "_labels"])
    return sets


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("tag")
    ap.add_argument("--floor", type=float, default=0.92, help="min referable sensitivity required on EVERY cal source")
    args = ap.parse_args()

    sets = load(args.tag)
    cal, test = sets["cal"], sets["test"]
    print("cal sources:", {k: len(v[1]) for k, v in cal.items()})
    print("test sources:", {k: len(v[1]) for k, v in test.items()}, "\n")

    # --- temperature by 5-class NLL on pooled cal ---
    Ts = np.arange(0.4, 2.01, 0.05)
    logits = np.concatenate([v[0] for v in cal.values()])
    labels = np.concatenate([v[1] for v in cal.values()])
    nll = [-np.log(np.clip(sm(l := logits, T).mean(1)[np.arange(len(labels)), labels], 1e-9, 1)).mean() for T in Ts]
    T = float(Ts[int(np.argmin(nll))])
    print(f"temperature (NLL-optimal on pooled cal): T={T:.2f}")

    # --- threshold: highest specificity whose sensitivity floor holds on EVERY cal source ---
    probs = {s: sm(v[0], T).mean(1) for s, v in cal.items()}
    best = None
    for thr in np.arange(0.02, 0.90, 0.005):
        se, sp = [], []
        for s, (lg, y) in cal.items():
            r = probs[s][:, 2:].sum(1) > thr
            tr = y >= 2
            se.append(r[tr].mean() if tr.any() else 1.0)
            sp.append((~r[~tr]).mean() if (~tr).any() else 1.0)
        if min(se) >= args.floor and (best is None or np.mean(sp) > best[0]):
            best = (float(np.mean(sp)), float(thr), float(min(se)))
    if best is None:
        print(f"No threshold reaches {args.floor:.0%} sensitivity on every cal source -- "
              f"relax --floor or improve the model.")
        return
    spec_mean, thr, worst_se = best
    print(f"threshold: {thr:.3f}  (worst-source cal sensitivity {worst_se:.3f}, mean cal specificity {spec_mean:.3f})\n")

    rows = []
    for s, (lg, y) in sorted(test.items()):
        p = sm(lg, T).mean(1)
        pred = p.argmax(1)
        r = p[:, 2:].sum(1) > thr
        tr = y >= 2
        rows.append(dict(source=s, n=len(y),
                         qwk=round(float(cohen_kappa_score(y, pred, weights="quadratic")), 3),
                         acc=round(float((pred == y).mean()), 3),
                         mild=round(float((pred[y == 1] == 1).mean()), 3) if (y == 1).any() else None,
                         sens=round(float(r[tr].mean()), 3) if tr.any() else None,
                         spec=round(float((~r[~tr]).mean()), 3) if (~tr).any() else None))
    print(f"{'TEST source':12s} {'n':>5s} {'QWK':>6s} {'acc':>6s} {'mild':>6s} {'sens':>6s} {'spec':>6s}")
    for r in rows:
        print(f"{r['source']:12s} {r['n']:5d} {r['qwk']:6.3f} {r['acc']:6.3f} "
              f"{(r['mild'] if r['mild'] is not None else float('nan')):6.3f} "
              f"{(r['sens'] if r['sens'] is not None else float('nan')):6.3f} "
              f"{(r['spec'] if r['spec'] is not None else float('nan')):6.3f}")
    worst_sens = min(r["sens"] for r in rows if r["sens"] is not None)
    worst_spec = min(r["spec"] for r in rows if r["spec"] is not None)
    print(f"\nWORST-CASE across test sources: sensitivity {worst_sens:.3f}, specificity {worst_spec:.3f}")
    print("SIH targets are >=0.90 sensitivity and >=0.85 specificity.",
          "Met on every test source." if (worst_sens >= 0.90 and worst_spec >= 0.85) else "NOT met on every test source.")

    out = dict(tag=args.tag, temperature=T, threshold=thr, floor=args.floor, test=rows,
               worst_sens=worst_sens, worst_spec=worst_spec)
    json.dump(out, open(os.path.join(config.OUTPUT_DIR, f"calibration_{args.tag}.json"), "w"), indent=2)


if __name__ == "__main__":
    main()
