"""
Measures what actually fits and how fast it runs on THIS GPU, before committing a
night to a training run. Written because a previous plan assumed 640px would be
affordable, and only after launching did it turn out to be ~30 h -- forcing a
restart at 512.

For each (architecture, resolution, gradient-checkpointing) combination it finds
the largest batch that fits in VRAM, times a real forward+backward+step, and
converts that into the number that actually matters: hours to see a target number
of training samples (v3 saw ~308k).

Gradient checkpointing recomputes activations in the backward pass instead of
storing them: ~30% slower per step, but large memory savings, which is what may
make 768px viable at all.

Usage: python benchmark_archs.py [--samples 300000]
"""
import argparse
import time

import torch
import timm


def pick(*candidates):
    """First timm name that exists (names vary between timm versions)."""
    available = set(timm.list_models())
    for c in candidates:
        if c in available:
            return c
    for c in candidates:  # fall back to a wildcard match
        hits = timm.list_models(c + "*")
        if hits:
            return hits[0]
    return None


def bench(arch, dim, ckpt, batches, samples):
    try:
        model = timm.create_model(arch, pretrained=False, num_classes=5)
    except Exception as e:
        return f"{arch}: create failed ({type(e).__name__})"
    model = model.cuda().to(memory_format=torch.channels_last)
    if ckpt:
        try:
            model.set_grad_checkpointing(True)
        except Exception:
            return None  # this model doesn't support it; skip the variant
    opt = torch.optim.AdamW(model.parameters(), lr=1e-4)
    scaler = torch.amp.GradScaler("cuda")
    best = None
    for bs in batches:
        try:
            torch.cuda.empty_cache()
            torch.cuda.reset_peak_memory_stats()
            x = torch.randn(bs, 3, dim, dim, device="cuda").to(memory_format=torch.channels_last)
            y = torch.randint(0, 5, (bs,), device="cuda")
            for i in range(5):
                if i == 2:
                    torch.cuda.synchronize()
                    t0 = time.time()
                with torch.amp.autocast("cuda"):
                    loss = torch.nn.functional.cross_entropy(model(x), y)
                scaler.scale(loss).backward()
                scaler.step(opt)
                scaler.update()
                opt.zero_grad(set_to_none=True)
            torch.cuda.synchronize()
            ips = bs / ((time.time() - t0) / 3)
            peak = torch.cuda.max_memory_allocated() / 1e9
            if peak < 7.6 and (best is None or ips > best[1]):   # leave headroom for the data loader
                best = (bs, ips, peak)
        except torch.cuda.OutOfMemoryError:
            torch.cuda.empty_cache()
            continue
        except RuntimeError as e:
            if "out of memory" not in str(e).lower():
                raise
            torch.cuda.empty_cache()
            continue
    del model, opt
    torch.cuda.empty_cache()
    if best is None:
        return f"{arch:24s} {dim:4d} ckpt={int(ckpt)}  does not fit"
    bs, ips, peak = best
    return (f"{arch:24s} {dim:4d} ckpt={int(ckpt)}  batch {bs:2d}  {peak:4.1f} GB  "
            f"{ips:5.1f} img/s   {samples/ips/3600:5.1f} h for {samples//1000}k samples")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--samples", type=int, default=300000, help="training samples to project time for (v3 saw ~308k)")
    args = ap.parse_args()

    print(f"GPU: {torch.cuda.get_device_name(0)}  {torch.cuda.get_device_properties(0).total_memory/1e9:.1f} GB\n")
    b3 = pick("efficientnet_b3")
    v2s = pick("efficientnetv2_s", "tf_efficientnetv2_s", "efficientnetv2_rw_s")
    cnx = pick("convnext_tiny")
    print(f"resolved names: b3={b3}  effv2s={v2s}  convnext={cnx}\n")

    combos = [
        (b3, 640, False), (b3, 768, False), (b3, 768, True), (b3, 1024, True),
        (v2s, 512, False), (v2s, 640, False), (v2s, 640, True),
        (cnx, 512, False), (cnx, 640, False), (cnx, 640, True),
    ]
    print(f"{'arch':24s} {'dim':>4s} {'ckpt':>6s}  {'best batch / VRAM / throughput / projected time':s}")
    for arch, dim, ck in combos:
        if arch is None:
            continue
        r = bench(arch, dim, ck, [2, 4, 6, 8, 12, 16], args.samples)
        if r:
            print(r, flush=True)


if __name__ == "__main__":
    main()
