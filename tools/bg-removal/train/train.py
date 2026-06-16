#!/usr/bin/env python3
"""
train.py — fine-tune a U-Net (pretrained encoder) on the bouquet alpha labels.

Transfer learning is the right call for a small, narrow dataset: an ImageNet-
pretrained encoder + heavy-ish augmentation learns "white box = background, white
flower = foreground" from the Photoshop labels without overfitting. Runs on Apple
Silicon MPS.

Usage:
    python train/train.py [--encoder resnet34] [--img-size 768] [--batch 4]
                          [--epochs 80] [--lr 1e-4] [--val-frac 0.15]

Saves checkpoints/unet_best.pt (best val IoU) and writes QC montages to runs/.
"""

import argparse
import random
import sys
import time
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from torch.utils.data import DataLoader

import segmentation_models_pytorch as smp

sys.path.insert(0, str(Path(__file__).resolve().parent))
from dataset import BouquetDataset, read_manifest, IMAGENET_MEAN, IMAGENET_STD

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent


def split_rows(rows: list[dict], val_frac: float, seed: int) -> tuple[list[dict], list[dict]]:
    rows = list(rows)
    random.Random(seed).shuffle(rows)
    n_val = max(1, round(len(rows) * val_frac))
    return rows[n_val:], rows[:n_val]


def denorm(x: torch.Tensor) -> np.ndarray:
    """CHW normalized tensor -> HWC uint8 RGB."""
    img = x.cpu().numpy().transpose(1, 2, 0) * IMAGENET_STD + IMAGENET_MEAN
    return (np.clip(img, 0, 1) * 255).astype(np.uint8)


def qc_montage(x, logits, mask, dest: Path, n: int = 4) -> None:
    """[original | predicted alpha on gray | ground-truth label] for a few samples."""
    n = min(n, x.shape[0])
    rows = []
    for i in range(n):
        img = denorm(x[i])
        pred = (torch.sigmoid(logits[i, 0]).cpu().numpy() * 255).astype(np.uint8)
        gt = (mask[i, 0].cpu().numpy() * 255).astype(np.uint8)
        gray = np.full_like(img, 128)
        a = pred[..., None] / 255.0
        comp = (img * a + gray * (1 - a)).astype(np.uint8)
        strip = np.concatenate(
            [img, comp, np.repeat(gt[..., None], 3, axis=2)], axis=1)
        rows.append(strip)
    Image.fromarray(np.concatenate(rows, axis=0)).save(dest, quality=85)


@torch.no_grad()
def evaluate(model, loader, device) -> tuple[float, float]:
    model.eval()
    mae_sum = inter = union = 0.0
    n = 0
    for x, m in loader:
        x, m = x.to(device), m.to(device)
        p = torch.sigmoid(model(x))
        mae_sum += (p - m).abs().mean().item() * x.size(0)
        pb, mb = p > 0.5, m > 0.5
        inter += (pb & mb).sum().item()
        union += (pb | mb).sum().item()
        n += x.size(0)
    return mae_sum / n, (inter / union if union else 0.0)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", type=Path, default=ROOT / "dataset" / "manifest.csv")
    ap.add_argument("--encoder", default="resnet34")
    ap.add_argument("--img-size", type=int, default=768)
    ap.add_argument("--batch", type=int, default=4)
    ap.add_argument("--epochs", type=int, default=80)
    ap.add_argument("--lr", type=float, default=1e-4)
    ap.add_argument("--val-frac", type=float, default=0.15)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--out", type=Path, default=ROOT / "checkpoints")
    ap.add_argument("--runs", type=Path, default=ROOT / "runs")
    args = ap.parse_args()

    if not args.manifest.exists():
        sys.exit(f"ERROR: manifest not found: {args.manifest} (run prepare_pairs.py first)")
    args.out.mkdir(parents=True, exist_ok=True)
    args.runs.mkdir(parents=True, exist_ok=True)

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    torch.manual_seed(args.seed)

    train_rows, val_rows = split_rows(read_manifest(args.manifest), args.val_frac, args.seed)
    print(f"device={device} | train={len(train_rows)} val={len(val_rows)} | "
          f"encoder={args.encoder} img={args.img_size} batch={args.batch}")

    train_ds = BouquetDataset(train_rows, args.img_size, train=True)
    val_ds = BouquetDataset(val_rows, args.img_size, train=False)
    train_dl = DataLoader(train_ds, batch_size=args.batch, shuffle=True, num_workers=0, drop_last=True)
    val_dl = DataLoader(val_ds, batch_size=args.batch, shuffle=False, num_workers=0)

    model = smp.Unet(encoder_name=args.encoder, encoder_weights="imagenet",
                     in_channels=3, classes=1).to(device)
    bce = torch.nn.BCEWithLogitsLoss()
    dice = smp.losses.DiceLoss(mode="binary")
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=args.epochs)

    best_iou = -1.0
    for epoch in range(1, args.epochs + 1):
        model.train()
        t0 = time.time()
        run_loss = 0.0
        for x, m in train_dl:
            x, m = x.to(device), m.to(device)
            opt.zero_grad()
            logits = model(x)
            loss = bce(logits, m) + dice(logits, m)
            loss.backward()
            opt.step()
            run_loss += loss.item()
        sched.step()
        avg = run_loss / max(1, len(train_dl))

        if epoch % 5 == 0 or epoch == args.epochs:
            mae, iou = evaluate(model, val_dl, device)
            dt = time.time() - t0
            print(f"epoch {epoch:3}/{args.epochs}  loss={avg:.4f}  val_MAE={mae:.4f}  "
                  f"val_IoU={iou:.4f}  ({dt:.0f}s/ep)")
            # QC montage on first val batch
            xb, mb = next(iter(val_dl))
            with torch.no_grad():
                lb = model(xb.to(device))
            qc_montage(xb, lb, mb, args.runs / f"val_epoch{epoch:03}.jpg")
            if iou > best_iou:
                best_iou = iou
                torch.save({"state_dict": model.state_dict(), "encoder": args.encoder,
                            "img_size": args.img_size, "arch": "unet",
                            "val_iou": iou, "val_mae": mae, "epoch": epoch},
                           args.out / "unet_best.pt")
                print(f"   ↳ saved best (IoU={iou:.4f}) -> {args.out/'unet_best.pt'}")

    print(f"Done. Best val IoU={best_iou:.4f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
