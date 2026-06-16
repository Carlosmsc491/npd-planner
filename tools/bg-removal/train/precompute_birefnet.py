#!/usr/bin/env python3
"""
precompute_birefnet.py — run pretrained BiRefNet on every original in the manifest
and cache its alpha. The refiner network (refine_train.py) trains on (image,
birefnet_alpha) -> ground_truth_alpha, so this cache lets refiner training iterate
fast without re-running the heavy BiRefNet forward every epoch.

Usage:
    python train/precompute_birefnet.py [--size 1024]

Writes dataset/birefnet_alpha/<name>.png (8-bit, letterboxed to --size) and adds a
'birefnet_alpha' column to dataset/manifest.csv.
"""
import argparse
import csv
import sys
import time
from pathlib import Path

import numpy as np
import torch
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from birefnet_model import load_birefnet
from dataset import letterbox, IMAGENET_MEAN, IMAGENET_STD

ROOT = Path(__file__).resolve().parent.parent


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", type=Path, default=ROOT / "dataset" / "manifest.csv")
    ap.add_argument("--out", type=Path, default=ROOT / "dataset" / "birefnet_alpha")
    ap.add_argument("--size", type=int, default=1024)
    args = ap.parse_args()

    if not args.manifest.exists():
        sys.exit(f"ERROR: {args.manifest} not found (run prepare_pairs.py first)")
    args.out.mkdir(parents=True, exist_ok=True)

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    print(f"device={device}  size={args.size}  loading BiRefNet...")
    model = load_birefnet(device=device)
    model.eval()

    with open(args.manifest) as fh:
        rows = list(csv.DictReader(fh))

    out_rows = []
    for i, row in enumerate(rows, 1):
        name = row["name"]
        dest = args.out / f"{name}.png"
        t0 = time.time()
        if not dest.exists():
            img = Image.open(row["original"]).convert("RGB")
            img_lb = letterbox(img, args.size, (255, 255, 255))
            x = (np.asarray(img_lb, dtype=np.float32) / 255.0 - IMAGENET_MEAN) / IMAGENET_STD
            x = torch.from_numpy(x.transpose(2, 0, 1)).unsqueeze(0).to(device)
            with torch.no_grad():
                out = model(x)
            pred = out[-1] if isinstance(out, (list, tuple)) else out
            alpha = torch.sigmoid(pred)[0, 0].clamp(0, 1).cpu().numpy()
            Image.fromarray((alpha * 255).astype(np.uint8)).save(dest)
        row["birefnet_alpha"] = str(dest)
        out_rows.append(row)
        print(f"[{i}/{len(rows)}] {name}  {time.time()-t0:.1f}s")

    fieldnames = list(out_rows[0].keys())
    with open(args.manifest, "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(out_rows)
    print(f"\nDone. Cached {len(out_rows)} alphas -> {args.out}, manifest updated.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
