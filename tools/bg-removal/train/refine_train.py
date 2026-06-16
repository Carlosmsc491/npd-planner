#!/usr/bin/env python3
"""
refine_train.py — train the small "box remover" that fixes pretrained BiRefNet.

Pretrained BiRefNet already gives a CRISP cutout but keeps the white vase/box. We
keep its crisp edges and train a small U-Net to predict only WHAT TO REMOVE:

    target_remove = relu(birefnet_alpha - ground_truth_alpha)   # the box (+ extras)
    corrected_alpha = birefnet_alpha * (1 - predicted_remove)

Edges therefore stay exactly as crisp as BiRefNet's; the refiner only carves out the
box region (a coarse, smooth area where softness is harmless). Trains fast on MPS.

Run after precompute_birefnet.py:
    python train/refine_train.py [--encoder resnet34] [--img-size 1024] [--epochs 120]
"""
import argparse
import csv
import random
import sys
import time
from pathlib import Path

import numpy as np
import torch
from PIL import Image, ImageEnhance
from torch.utils.data import DataLoader, Dataset

import segmentation_models_pytorch as smp

sys.path.insert(0, str(Path(__file__).resolve().parent))
from dataset import letterbox, IMAGENET_MEAN, IMAGENET_STD

ROOT = Path(__file__).resolve().parent.parent


class RefinerDataset(Dataset):
    def __init__(self, rows: list[dict], img_size: int, train: bool):
        self.rows, self.size, self.train = rows, img_size, train

    def __len__(self) -> int:
        return len(self.rows)

    def __getitem__(self, idx: int):
        r = self.rows[idx]
        s = self.size
        img = letterbox(Image.open(r["original"]).convert("RGB"), s, (255, 255, 255))
        ba = Image.open(r["birefnet_alpha"]).convert("L").resize((s, s), Image.LANCZOS)
        gt = letterbox(Image.open(r["label"]).convert("L"), s, 0)

        if self.train:
            if random.random() < 0.5:
                img, ba, gt = (im.transpose(Image.FLIP_LEFT_RIGHT) for im in (img, ba, gt))
            if random.random() < 0.6:
                ang = random.uniform(-10, 10)
                img = img.rotate(ang, Image.BILINEAR, fillcolor=(255, 255, 255))
                ba = ba.rotate(ang, Image.BILINEAR, fillcolor=0)
                gt = gt.rotate(ang, Image.BILINEAR, fillcolor=0)
            if random.random() < 0.5:
                img = ImageEnhance.Brightness(img).enhance(random.uniform(0.85, 1.15))

        rgb = (np.asarray(img, np.float32) / 255.0 - IMAGENET_MEAN) / IMAGENET_STD
        ba01 = np.asarray(ba, np.float32) / 255.0
        gt01 = np.asarray(gt, np.float32) / 255.0
        remove = np.clip(ba01 - gt01, 0.0, 1.0)  # what BiRefNet kept that should go

        x = np.concatenate([rgb.transpose(2, 0, 1), ba01[None]], axis=0)
        return (torch.from_numpy(x).float(),
                torch.from_numpy(remove[None]).float(),
                torch.from_numpy(ba01[None]).float(),
                torch.from_numpy(gt01[None]).float())


def split_rows(rows, val_frac, seed):
    rows = list(rows)
    random.Random(seed).shuffle(rows)
    n_val = max(1, round(len(rows) * val_frac))
    return rows[n_val:], rows[:n_val]


def qc(x, ba, gt, remove_pred, dest, n=4):
    n = min(n, x.shape[0])
    rows = []
    for i in range(n):
        rgb = (x[i, :3].cpu().numpy().transpose(1, 2, 0) * IMAGENET_STD + IMAGENET_MEAN)
        rgb = (np.clip(rgb, 0, 1) * 255).astype(np.uint8)
        b = ba[i, 0].cpu().numpy()
        rem = remove_pred[i, 0].cpu().numpy()
        corr = np.clip(b * (1 - rem), 0, 1)
        g = gt[i, 0].cpu().numpy()
        gray = np.full_like(rgb, 128)
        comp = (rgb * corr[..., None] + gray * (1 - corr[..., None])).astype(np.uint8)
        def g3(a):
            return np.repeat((a * 255).astype(np.uint8)[..., None], 3, axis=2)
        rows.append(np.concatenate([rgb, g3(b), g3(rem), comp, g3(g)], axis=1))
    Image.fromarray(np.concatenate(rows, axis=0)).save(dest, quality=85)


@torch.no_grad()
def evaluate(model, loader, device):
    model.eval()
    mae = inter = union = n = 0.0
    for x, _, ba, gt in loader:
        x, ba, gt = x.to(device), ba.to(device), gt.to(device)
        rem = torch.sigmoid(model(x))
        corr = (ba * (1 - rem)).clamp(0, 1)
        mae += (corr - gt).abs().mean().item() * x.size(0)
        cb, gb = corr > 0.5, gt > 0.5
        inter += (cb & gb).sum().item()
        union += (cb | gb).sum().item()
        n += x.size(0)
    return mae / n, (inter / union if union else 0.0)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", type=Path, default=ROOT / "dataset" / "manifest.csv")
    ap.add_argument("--encoder", default="resnet34")
    ap.add_argument("--img-size", type=int, default=1024)
    ap.add_argument("--batch", type=int, default=2)
    ap.add_argument("--epochs", type=int, default=120)
    ap.add_argument("--lr", type=float, default=2e-4)
    ap.add_argument("--val-frac", type=float, default=0.15)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--out", type=Path, default=ROOT / "checkpoints")
    ap.add_argument("--runs", type=Path, default=ROOT / "runs")
    args = ap.parse_args()

    with open(args.manifest) as fh:
        rows = list(csv.DictReader(fh))
    if not rows or "birefnet_alpha" not in rows[0]:
        sys.exit("ERROR: run precompute_birefnet.py first (manifest needs birefnet_alpha)")
    args.out.mkdir(parents=True, exist_ok=True)
    args.runs.mkdir(parents=True, exist_ok=True)

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    torch.manual_seed(args.seed)
    tr, va = split_rows(rows, args.val_frac, args.seed)
    print(f"device={device} train={len(tr)} val={len(va)} encoder={args.encoder} "
          f"img={args.img_size} batch={args.batch}")

    tdl = DataLoader(RefinerDataset(tr, args.img_size, True), batch_size=args.batch,
                     shuffle=True, num_workers=0, drop_last=True)
    vdl = DataLoader(RefinerDataset(va, args.img_size, False), batch_size=args.batch,
                     shuffle=False, num_workers=0)

    model = smp.Unet(args.encoder, encoder_weights="imagenet", in_channels=4, classes=1).to(device)
    bce = torch.nn.BCEWithLogitsLoss()
    dice = smp.losses.DiceLoss(mode="binary")
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=args.epochs)

    best = -1.0
    for ep in range(1, args.epochs + 1):
        model.train()
        t0, run = time.time(), 0.0
        for x, rem, ba, gt in tdl:
            x, rem = x.to(device), rem.to(device)
            opt.zero_grad()
            logits = model(x)
            loss = bce(logits, rem) + dice(logits, rem)
            loss.backward()
            opt.step()
            run += loss.item()
        sched.step()
        if ep % 10 == 0 or ep == args.epochs:
            mae, iou = evaluate(model, vdl, device)
            print(f"epoch {ep:3}/{args.epochs} loss={run/max(1,len(tdl)):.4f} "
                  f"corrected_MAE={mae:.4f} corrected_IoU={iou:.4f} ({time.time()-t0:.0f}s/ep)")
            xb, _, bab, gtb = next(iter(vdl))
            with torch.no_grad():
                rp = torch.sigmoid(model(xb.to(device))).cpu()
            qc(xb, bab, gtb, rp, args.runs / f"refine_ep{ep:03}.jpg")
            if iou > best:
                best = iou
                torch.save({"state_dict": model.state_dict(), "encoder": args.encoder,
                            "img_size": args.img_size, "in_channels": 4, "arch": "unet-refiner",
                            "val_iou": iou, "val_mae": mae, "epoch": ep},
                           args.out / "refiner_best.pt")
                print(f"   ↳ saved best (corrected IoU={iou:.4f})")
    print(f"Done. Best corrected IoU={best:.4f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
