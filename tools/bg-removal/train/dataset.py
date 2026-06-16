#!/usr/bin/env python3
"""
dataset.py — paired (original, alpha label) dataset for fine-tuning.

Reads dataset/manifest.csv (written by prepare_pairs.py). Originals are full-frame
landscape; we letterbox to a square training size with white padding (so the model
keeps seeing white = background) and the alpha label is padded with 0. Augmentation
is done manually (no albumentations dependency) to stay version-proof.
"""

import csv
import random
from pathlib import Path

import numpy as np
import torch
from PIL import Image, ImageEnhance
from torch.utils.data import Dataset

IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


def read_manifest(path: Path) -> list[dict]:
    with open(path) as fh:
        return list(csv.DictReader(fh))


def letterbox(img: Image.Image, size: int, fill) -> Image.Image:
    """Resize keeping aspect to fit size x size, pad the rest with `fill`, centered."""
    w, h = img.size
    scale = size / max(w, h)
    nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
    img = img.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new(img.mode, (size, size), fill)
    canvas.paste(img, ((size - nw) // 2, (size - nh) // 2))
    return canvas


class BouquetDataset(Dataset):
    def __init__(self, rows: list[dict], img_size: int = 768, train: bool = True):
        self.rows = rows
        self.img_size = img_size
        self.train = train

    def __len__(self) -> int:
        return len(self.rows)

    def _augment(self, img: Image.Image, mask: Image.Image) -> tuple[Image.Image, Image.Image]:
        if random.random() < 0.5:  # horizontal flip
            img = img.transpose(Image.FLIP_LEFT_RIGHT)
            mask = mask.transpose(Image.FLIP_LEFT_RIGHT)
        if random.random() < 0.7:  # small rotation (white bg / 0 mask)
            ang = random.uniform(-12, 12)
            img = img.rotate(ang, resample=Image.BILINEAR, fillcolor=(255, 255, 255))
            mask = mask.rotate(ang, resample=Image.BILINEAR, fillcolor=0)
        if random.random() < 0.5:  # brightness / contrast jitter
            img = ImageEnhance.Brightness(img).enhance(random.uniform(0.8, 1.2))
            img = ImageEnhance.Contrast(img).enhance(random.uniform(0.85, 1.15))
        return img, mask

    def __getitem__(self, idx: int):
        r = self.rows[idx]
        img = Image.open(r["original"]).convert("RGB")
        mask = Image.open(r["label"]).convert("L")

        img = letterbox(img, self.img_size, (255, 255, 255))
        mask = letterbox(mask, self.img_size, 0)
        if self.train:
            img, mask = self._augment(img, mask)

        x = np.asarray(img, dtype=np.float32) / 255.0
        x = (x - IMAGENET_MEAN) / IMAGENET_STD
        x = torch.from_numpy(x.transpose(2, 0, 1)).contiguous()
        m = torch.from_numpy(np.asarray(mask, dtype=np.float32) / 255.0).unsqueeze(0)
        return x, m
