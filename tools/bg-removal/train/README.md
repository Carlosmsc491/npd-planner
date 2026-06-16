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

## Step 2 — Hybrid model (BiRefNet + refiner)

We need crisp, high-resolution edges (no soft/fade/pixelated). Fine-tuning BiRefNet
itself is infeasible locally: its deformable-conv **backward** falls back to CPU on
MPS (~6 min/step → ~19 days). But BiRefNet **inference** is fine (2s@1024, 10s@2048)
and already gives crisp edges + keeps white flowers — it only wrongly keeps the white
vase/box. So:

- **Pretrained BiRefNet (frozen, inference only)** → crisp base alpha.
- **Small U-Net "refiner"** (4ch: RGB + birefnet_alpha) learns only what to REMOVE
  (`target = relu(birefnet_alpha - gt)`); `corrected = birefnet_alpha * (1 - remove)`
  so edges stay exactly as crisp as BiRefNet. Trains fast on MPS.
- **Full-res edge refinement** at inference: guided filter snaps the alpha to the
  real image edges, then an edge-sharpen step keeps the boundary crisp (no fade).

BiRefNet code is **vendored + reviewed** in `train/birefnet/` and loaded without
`trust_remote_code` (see `birefnet/PROVENANCE.md`).

```bash
python train/precompute_birefnet.py --size 1024     # cache BiRefNet alpha per image
python train/refine_train.py --epochs 120 --img-size 1024   # train the refiner (MPS)
python train/infer.py INPUT OUTPUT --compare        # high-quality hybrid inference
```

`infer.py`: BiRefNet@2048 → refiner → corrected → un-letterbox → guided filter →
sharpen → square-crop 3600² @ 300 DPI transparent PNG.

If quality ever needs the absolute max, a full BiRefNet fine-tune on a cloud GPU
(~$2-10, 2-5h; deformable convs run native on CUDA) reuses this same dataset.

## Status
- [x] Data-prep / alignment (`prepare_pairs.py`) — 65 labels from the sample set
- [x] BiRefNet vendored + MPS feasibility probed (inference ok, train infeasible)
- [x] Precompute BiRefNet alpha + manifest
- [x] Refiner train script + QC (smoke: corrected IoU 0.90 at 10 ep)
- [x] High-quality hybrid inference (`infer.py`) with guided-filter edge refine
- [ ] Full refiner training run + eval vs baseline on held-out
- [ ] Carlos visual sign-off on quality
