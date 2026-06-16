#!/usr/bin/env python3
"""
birefnet_probe.py — one-off feasibility check before building the BiRefNet fine-tune.

Loads BiRefNet (PyTorch, from HuggingFace), runs an inference forward at a given
resolution, then a TRAINING forward+backward at batch 1 (the memory-heavy case) to
confirm it fits on this Mac's MPS / 24 GB. Reports time and whether it OOMs.

    python train/birefnet_probe.py [--size 1024]
"""
import argparse
import os
import time

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")  # some ops fall back to CPU

import torch


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--size", type=int, default=1024)
    ap.add_argument("--model", default="ZhengPeng7/BiRefNet")
    args = ap.parse_args()

    import sys
    sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent))
    from birefnet_model import load_birefnet  # vendored loader, no trust_remote_code

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    print(f"device={device}  size={args.size}  loading vendored BiRefNet (weights ~1GB, cached)...")
    t = time.time()
    model = load_birefnet(device=device)  # already float32 on device
    n_params = sum(p.numel() for p in model.parameters()) / 1e6
    print(f"loaded in {time.time()-t:.0f}s  params={n_params:.0f}M")

    x = torch.randn(1, 3, args.size, args.size, device=device)

    # 1) inference forward
    model.eval()
    try:
        t = time.time()
        with torch.no_grad():
            out = model(x)
        pred = out[-1] if isinstance(out, (list, tuple)) else out
        pred = pred.sigmoid() if hasattr(pred, "sigmoid") else pred
        print(f"INFERENCE ok  forward={time.time()-t:.1f}s  out_shape={tuple(pred.shape)}")
    except Exception as e:  # noqa: BLE001
        print(f"INFERENCE FAILED: {type(e).__name__}: {e}")
        return 1

    # 2) training forward + backward (batch 1) — the real memory test.
    # Freeze BatchNorm (use running stats) so batch=1 + 1x1 feature maps don't error,
    # and so tiny-batch fine-tuning stays stable.
    model.train()
    for m in model.modules():
        if isinstance(m, torch.nn.modules.batchnorm._BatchNorm):
            m.eval()
    target = torch.rand(1, 1, args.size, args.size, device=device)
    bce = torch.nn.BCEWithLogitsLoss()
    opt = torch.optim.AdamW(model.parameters(), lr=1e-5)
    try:
        t = time.time()
        out = model(x)
        # training forward returns [scaled_preds, class_preds]; scaled_preds is a list
        # of side maps whose LAST element is the full-res prediction.
        preds = out[0] if isinstance(out, (list, tuple)) else out
        if isinstance(preds, (list, tuple)) and len(preds) == 2 and isinstance(preds[0], (list, tuple)):
            preds = preds[1]  # out_ref case: ([gdt_pred, gdt_label], outs)
        logits = preds[-1] if isinstance(preds, (list, tuple)) else preds
        loss = bce(logits, target)
        loss.backward()
        opt.step()
        print(f"TRAIN step ok  fwd+bwd={time.time()-t:.1f}s  -> BiRefNet fine-tune fits at {args.size}px batch 1")
    except Exception as e:  # noqa: BLE001
        print(f"TRAIN step FAILED ({type(e).__name__}): {e}")
        print("  -> too heavy locally at this size; try a smaller --size or use a cloud GPU.")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
