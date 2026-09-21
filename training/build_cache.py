"""
Pre-computes Ben Graham preprocessing ONCE per image to disk, at a higher
working resolution than the live pipeline has used so far.

Two reasons this exists:
  1. SPEED. Training currently re-runs crop + resize + a large Gaussian blur
     on every image every epoch, some of them 4288x2848. That, not the GPU,
     is the throughput bottleneck. Caching makes epochs 3-5x cheaper, which
     is what makes training at 640px affordable at all.
  2. RESOLUTION. dataset.ben_graham_preprocess caps its working image at
     640px. IDRiD's native 4288x2848 with a median microaneurysm of ~18px
     (matlab checkLesionSizes.m) shrinks to ~2.7px at that cap and ~1.6px
     after the 380px training resize -- i.e. the lesions that DEFINE the
     Mild grade are largely destroyed before the model sees them. Caching at
     CACHE_DIM=1024 roughly doubles their pixel size.

CONSISTENCY REQUIREMENT: the cache is Ben Graham at 1024, and training then
resizes 1024 -> TRAIN_DIM. Because the blur sigma is height-relative, that is
NOT identical to Ben Graham at TRAIN_DIM. Inference must therefore do the
same thing (ben_graham_preprocess(img, max_working_dim=1024), then resize),
or the model sees a different image distribution than it trained on. See
config.PREPROCESS_WORKING_DIM, which both sides read.

JPEG q95 rather than PNG: ~15GB instead of ~55GB, and the content is resized
down to 640 for training anyway. Resumable -- already-cached files are
skipped, so an interrupted run can just be re-run.

Usage: python build_cache.py [--limit N] [--workers N]
"""
import argparse
import os
import time
from multiprocessing import Pool

import cv2
cv2.setNumThreads(0)
cv2.ocl.setUseOpenCL(False)

import pandas as pd

import config
from dataset import ben_graham_fast

CACHE_ROOT = os.path.join("data", "cache_%d" % config.PREPROCESS_WORKING_DIM)
JPEG_Q = 95


def cache_path(src_path, source):
    stem = os.path.splitext(os.path.basename(src_path))[0]
    return os.path.join(CACHE_ROOT, source, stem + ".jpg")


def _init():
    cv2.setNumThreads(0)
    cv2.ocl.setUseOpenCL(False)


def process(task):
    src, dst = task
    if os.path.exists(dst):
        return "skip"
    img = cv2.imread(src)
    if img is None:
        return "unreadable:" + src
    img = ben_graham_fast(cv2.cvtColor(img, cv2.COLOR_BGR2RGB), config.PREPROCESS_WORKING_DIM)
    ok = cv2.imwrite(dst, cv2.cvtColor(img, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, JPEG_Q])
    return "ok" if ok else "writefail:" + dst


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--workers", type=int, default=16)  # RAM-bound, not CPU-bound: each worker holds a full-size fundus
    args = ap.parse_args()

    man = pd.read_csv(os.path.join(config.OUTPUT_DIR, "manifest.csv"))
    for s in man["source"].unique():
        os.makedirs(os.path.join(CACHE_ROOT, s), exist_ok=True)
    tasks = [(r.path, cache_path(r.path, r.source)) for r in man.itertuples()]
    if args.limit:
        tasks = tasks[:args.limit]

    t0 = time.time()
    counts = {"ok": 0, "skip": 0}
    problems = []
    with Pool(args.workers, initializer=_init) as pool:
        for i, res in enumerate(pool.imap_unordered(process, tasks, chunksize=16), 1):
            counts[res] = counts.get(res, 0) + 1 if res in ("ok", "skip") else counts.get(res, 0)
            if res not in ("ok", "skip"):
                problems.append(res)
            if i % 2000 == 0:
                el = time.time() - t0
                print(f"  {i}/{len(tasks)} ({el:.0f}s, {i/el:.1f} img/s, eta {(len(tasks)-i)/(i/el)/60:.0f} min)", flush=True)

    el = time.time() - t0
    print(f"\nDone: {counts.get('ok',0)} written, {counts.get('skip',0)} already cached, "
          f"{len(problems)} problems, in {el/60:.1f} min ({len(tasks)/max(el,1):.1f} img/s)")
    for p in problems[:10]:
        print("  ", p)
    if os.path.isdir(CACHE_ROOT):
        size = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(CACHE_ROOT) for f in fs)
        print(f"Cache size: {size/1e9:.1f} GB")


if __name__ == "__main__":
    main()
