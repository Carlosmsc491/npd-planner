#!/usr/bin/env python3
"""mem_probe.py — does the refiner fit at a given config? One fwd+bwd step on MPS."""
import argparse
import os
import time

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
import torch
import segmentation_models_pytorch as smp

ap = argparse.ArgumentParser()
ap.add_argument("--encoder", default="resnet50")
ap.add_argument("--img-size", type=int, default=1536)
ap.add_argument("--batch", type=int, default=2)
a = ap.parse_args()

dev = "mps" if torch.backends.mps.is_available() else "cpu"
try:
    m = smp.Unet(a.encoder, encoder_weights="imagenet", in_channels=4, classes=1).to(dev)
    for mod in m.modules():
        if isinstance(mod, torch.nn.modules.batchnorm._BatchNorm):
            mod.eval()
    x = torch.randn(a.batch, 4, a.img_size, a.img_size, device=dev)
    y = torch.rand(a.batch, 1, a.img_size, a.img_size, device=dev)
    opt = torch.optim.AdamW(m.parameters(), lr=1e-4)
    t = time.time()
    opt.zero_grad()
    loss = torch.nn.functional.binary_cross_entropy_with_logits(m(x), y)
    loss.backward()
    opt.step()
    torch.mps.synchronize() if dev == "mps" else None
    print(f"OK   {a.encoder} @{a.img_size} batch{a.batch}  step={time.time()-t:.1f}s")
except Exception as e:  # noqa: BLE001
    print(f"FAIL {a.encoder} @{a.img_size} batch{a.batch}  {type(e).__name__}: {str(e)[:80]}")
