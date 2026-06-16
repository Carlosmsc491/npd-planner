# Training — fine-tune a model to Photoshop-level cutouts

Goal: reach manual-Photoshop quality on Elite Flower bouquets, especially the hard
case the heuristic pipeline can't solve — telling a **white vase/box** (remove) apart
from **white flowers** (keep). A model fine-tuned on paired data *learns* this from
examples; color rules can't.

Approach: **fine-tune** a pretrained segmentation/matting model on our pairs — NOT
train from scratch (that needs 10k+ images, a big GPU, and gives worse results).

## Data: bring matched pairs

```
dataset/originals/<name>.jpg    full-frame studio photo (white background)
dataset/cutouts/<name>.png      the Photoshop result (transparent), SAME <name>
```

When originals and cutouts use different names (like the first 4 samples), pass a
mapping CSV instead — see `pairs.example.csv`.

## Step 1 — Prepare labels  ✅ (done, validated)

Cutouts are square-cropped (3600²) while originals are full-frame (6240×4160), so we
align the cutout back onto the original (ORB features + RANSAC similarity transform)
and warp its alpha into the original's frame. The result is a pixel-aligned label
that already encodes the manual decisions (box removed, white flowers kept).

```bash
# real dataset (names match):
./.venv/bin/python train/prepare_pairs.py
# the 4 samples (names differ):
./.venv/bin/python train/prepare_pairs.py \
    --originals samples/input --cutouts samples/reference --map train/pairs.example.csv \
    --out dataset/labels --qc dataset/qc
```

Writes `dataset/labels/<name>.png` (8-bit alpha, full size) + `dataset/qc/<name>.jpg`
(original with the alpha edge in red — **always eyeball QC before training**). Pairs
with too few inliers are flagged `LOW` and skipped.

Validated on the 4 samples: 299–495 inliers, alignment cuts cleanly above the vase.

## Step 2 — Fine-tune  (next, pending ~50 pairs)

- **Compute:** local Apple Silicon (MPS). So: start light, train at moderate
  resolution (~1024²), small batch. Heavy models (BiRefNet) likely need a cloud GPU.
- **Model:** start by fine-tuning U2Net / ISNet (lighter, proven training recipe,
  MPS-feasible); compare against the birefnet baseline. Move to BiRefNet fine-tune if
  quality demands it and a GPU is available.
- **Targets:** the aligned alpha labels from Step 1.
- **Augmentation:** flips, small rotations/scale, brightness — keep backgrounds white.
- **Eval:** hold out ~20%; report alpha MAE + mask IoU + visual QC montages, and
  compare against the rembg baseline on the same held-out images.

## Status
- [x] Data-prep / alignment pipeline (`prepare_pairs.py`) — validated on 4 pairs
- [ ] ~50 paired examples collected (incl. several white-flower bouquets)
- [ ] Dataset loader + augmentation
- [ ] Fine-tune script (MPS) + checkpointing
- [ ] Eval vs baseline + iterate
