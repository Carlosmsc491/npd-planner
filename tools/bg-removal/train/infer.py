#!/usr/bin/env python3
"""
infer.py — high-quality hybrid inference (the deliverable).

Pipeline per image:
  1. BiRefNet at high res (default 2048)         -> crisp base alpha
  2. Refiner U-Net (RGB + birefnet_alpha)        -> "remove" mask (the box / strays)
     corrected = birefnet_alpha * (1 - remove)   -> edges stay BiRefNet-crisp
  3. Un-letterbox to the original aspect/resolution
  4. Guided-filter the alpha with the original as guide -> snap edges to the image
  5. Edge sharpen (crisp, no soft fade) + optional binarize
  6. Square-crop & center to 3600x3600 @ 300 DPI (transparent PNG)

Usage:
    python train/infer.py INPUT OUTPUT [--checkpoint checkpoints/refiner_best.pt]
                          [--bire-size 2048] [--compare]
"""
import argparse
import sys
import time
from pathlib import Path

import cv2
import numpy as np
import torch
from PIL import Image
from scipy import ndimage as ndi

import segmentation_models_pytorch as smp

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
from birefnet_model import load_birefnet
from dataset import letterbox, IMAGENET_MEAN, IMAGENET_STD
import pipeline  # square_crop, make_comparison

IMG_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}

# ── Default processing parameters — the SINGLE SOURCE OF TRUTH ────────────────
# Both the CLI (argparse in main) and the persistent studio_worker.py read these,
# so the warm worker (Photo Studio + Photo Manager) and the command-line tool can
# never drift. To retune the cut-out, change the value here once.
DEFAULTS = {
    "bire_size":     2048,
    "gf_radius":     8,
    "gf_eps":        1e-4,
    "sharp":         2.0,
    "decontam_sat":  32,
    "decontam_val":  200,
    "decontam_cov":  0.65,
    "decontam_win":  25,
    "no_decontam":   False,
    "edge_shift":    2,
    "min_component": 0.005,
    "no_trash":      False,
    "canvas":        3600,
    "margin":        0.03,
    "dpi":           300,
    "compare":       False,
}


def default_args() -> argparse.Namespace:
    """A Namespace pre-filled with DEFAULTS, so studio_worker.py runs the cut-out
    with exactly the same parameters as `python infer.py`."""
    return argparse.Namespace(**DEFAULTS)


def _boxf(x: np.ndarray, r: int) -> np.ndarray:
    return cv2.boxFilter(x, -1, (r, r), borderType=cv2.BORDER_REFLECT)


def guided_filter(guide: np.ndarray, src: np.ndarray, r: int, eps: float) -> np.ndarray:
    """Edge-preserving filter (He et al.): snap `src` (alpha) to `guide` (gray) edges."""
    I, p = guide.astype(np.float32), src.astype(np.float32)
    mI, mp = _boxf(I, r), _boxf(p, r)
    a = (_boxf(I * p, r) - mI * mp) / (_boxf(I * I, r) - mI * mI + eps)
    b = mp - a * mI
    return _boxf(a, r) * I + _boxf(b, r)


def decontaminate_white(rgb: np.ndarray, alpha: np.ndarray, sat_thr: int, val_thr: int,
                        cov_thr: float, win: int) -> np.ndarray:
    """Remove near-white pixels where local alpha coverage is low (edges / lacy foliage).

    A solid white flower's interior has high local coverage and is spared; the white
    halo around edges and the white specks between thin foliage strands are removed
    — the automatic version of the Photoshop "magic eraser on white" along edges.
    """
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    sat, val = hsv[:, :, 1], hsv[:, :, 2]
    nearwhite = (sat < sat_thr) & (val > val_thr)
    coverage = cv2.boxFilter(alpha.astype(np.float32), -1, (win, win))
    remove = nearwhite & (coverage < cov_thr) & (alpha > 0)
    out = alpha.copy()
    out[remove] = 0.0
    return out


def defringe_edges(rgb: np.ndarray, alpha: np.ndarray, shift_px: int,
                   val_thr: int = 165) -> np.ndarray:
    """Kill the white halo on thin foliage by contracting the matte at washed-out
    edges.

    The studio-white background bleeds into thin stems/leaves as a green↔white
    *blend* — too saturated for the HSV white test in decontaminate_white, so it
    survives as a bright fringe (visible as a halo on dark backgrounds). Here we
    erode the matte inward, but ONLY on partial-alpha edge pixels that are bright
    (washed toward white). Saturated flower edges keep their full matte.
    """
    if shift_px <= 0:
        return alpha
    edge = (alpha > 0.02) & (alpha < 0.98)
    val = rgb.max(axis=2).astype(np.float32)               # ~HSV Value
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (shift_px * 2 + 1, shift_px * 2 + 1))
    eroded = cv2.erode(alpha, k)
    bright_edge = edge & (val > val_thr)
    out = alpha.copy()
    out[bright_edge] = np.minimum(out[bright_edge], eroded[bright_edge])
    return out


def keep_large_components(alpha: np.ndarray, min_frac: float,
                          largest_only: bool = False) -> np.ndarray:
    """Drop disconnected blobs that aren't the bouquet.

    largest_only=True keeps just the single biggest connected component (the
    bouquet) — removes stray studio objects (shears, spray cans, debris) no matter
    their size, since each photo is one bouquet. Otherwise keeps every component
    >= min_frac of the largest (only removes small specks)."""
    binary = alpha > 0.3
    labels, n = ndi.label(binary, structure=np.ones((3, 3)))
    if n <= 1:
        return alpha
    sizes = np.bincount(labels.ravel())
    sizes[0] = 0
    if largest_only:
        keep = [int(sizes.argmax())]
    else:
        keep = np.where(sizes >= min_frac * sizes.max())[0]
    mask = np.isin(labels, keep)
    out = alpha.copy()
    out[~mask] = 0.0
    return out


def load_refiner(ckpt: Path, device: str):
    c = torch.load(ckpt, map_location=device, weights_only=False)
    m = smp.Unet(c["encoder"], encoder_weights=None, in_channels=c["in_channels"], classes=1)
    m.load_state_dict(c["state_dict"])
    return m.to(device).eval(), int(c["img_size"])


def _norm_chw(pil: Image.Image) -> np.ndarray:
    a = (np.asarray(pil, np.float32) / 255.0 - IMAGENET_MEAN) / IMAGENET_STD
    return a.transpose(2, 0, 1)


def unletterbox(alpha_sq: np.ndarray, ow: int, oh: int) -> np.ndarray:
    """Square (letterboxed) alpha -> original aspect at full resolution."""
    s = alpha_sq.shape[0]
    scale = s / max(ow, oh)
    nw, nh = round(ow * scale), round(oh * scale)
    x0, y0 = (s - nw) // 2, (s - nh) // 2
    crop = alpha_sq[y0:y0 + nh, x0:x0 + nw]
    return cv2.resize(crop, (ow, oh), interpolation=cv2.INTER_LINEAR)


@torch.no_grad()
def process(path: Path, birefnet, refiner, ref_size: int, device: str, args) -> Image.Image:
    orig = Image.open(path).convert("RGB")
    ow, oh = orig.size

    # 1) BiRefNet at high res
    xb = torch.from_numpy(_norm_chw(letterbox(orig, args.bire_size, (255, 255, 255)))).unsqueeze(0).to(device)
    out = birefnet(xb)
    pred = out[-1] if isinstance(out, (list, tuple)) else out
    ba = torch.sigmoid(pred)[0, 0].float().cpu().numpy()

    # 2) Refiner -> remove mask -> corrected (crisp from BiRefNet)
    rgb_r = _norm_chw(letterbox(orig, ref_size, (255, 255, 255)))
    ba_r = cv2.resize(ba, (ref_size, ref_size), interpolation=cv2.INTER_LINEAR)
    xr = torch.from_numpy(np.concatenate([rgb_r, ba_r[None]], 0)).unsqueeze(0).float().to(device)
    remove = torch.sigmoid(refiner(xr))[0, 0].cpu().numpy()
    remove = np.clip((remove - 0.3) / 0.7, 0, 1)  # suppress subject-interior noise (no fade)
    remove = cv2.resize(remove, (args.bire_size, args.bire_size), interpolation=cv2.INTER_LINEAR)
    corrected = np.clip(ba * (1 - remove), 0, 1)

    # 3) back to original res, 4) guided-filter snap to image edges
    alpha = unletterbox(corrected, ow, oh)
    orig_rgb = np.asarray(orig)
    guide = np.asarray(orig.convert("L"), np.float32) / 255.0
    alpha = np.clip(guided_filter(guide, alpha, args.gf_radius, args.gf_eps), 0, 1)

    # A) white-fringe decontamination (halo on edges + specks in thin foliage)
    if not args.no_decontam:
        alpha = decontaminate_white(orig_rgb, alpha, args.decontam_sat, args.decontam_val,
                                    args.decontam_cov, args.decontam_win)

    # 5) crisp edge (compress the transition band; no soft fade)
    if args.sharp > 1:
        alpha = np.clip((alpha - 0.5) * args.sharp + 0.5, 0, 1)

    # C) anti-halo defringe — contract the matte at washed-out edges (thin foliage)
    alpha = defringe_edges(orig_rgb, alpha, args.edge_shift)

    # B) drop small disconnected blobs (floating trash)
    if not args.no_trash:
        alpha = keep_large_components(alpha, args.min_component)

    rgba = Image.fromarray(np.dstack([orig_rgb, (alpha * 255).astype(np.uint8)]), "RGBA")
    return pipeline.square_crop(rgba, {"canvas_size": args.canvas, "margin_pct": args.margin})


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("output")
    ap.add_argument("--checkpoint", type=Path, default=HERE.parent / "checkpoints" / "refiner_best.pt")
    ap.add_argument("--bire-size", type=int, default=DEFAULTS["bire_size"])
    ap.add_argument("--gf-radius", type=int, default=DEFAULTS["gf_radius"])
    ap.add_argument("--gf-eps", type=float, default=DEFAULTS["gf_eps"])
    ap.add_argument("--sharp", type=float, default=DEFAULTS["sharp"])
    # A) white decontamination
    ap.add_argument("--decontam-sat", type=int, default=DEFAULTS["decontam_sat"], help="HSV S below = neutral")
    ap.add_argument("--decontam-val", type=int, default=DEFAULTS["decontam_val"], help="HSV V above = bright")
    ap.add_argument("--decontam-cov", type=float, default=DEFAULTS["decontam_cov"],
                    help="remove near-white only where local alpha coverage is below this")
    ap.add_argument("--decontam-win", type=int, default=DEFAULTS["decontam_win"], help="coverage window (px)")
    ap.add_argument("--no-decontam", action="store_true")
    # C) anti-halo defringe — contract the matte at bright/washed edges (px @ full res)
    ap.add_argument("--edge-shift", type=int, default=DEFAULTS["edge_shift"],
                    help="contract the matte by N px on washed-out edges (0 = off) — kills the white halo on thin foliage")
    # B) trash removal
    ap.add_argument("--min-component", type=float, default=DEFAULTS["min_component"],
                    help="drop blobs smaller than this fraction of the largest")
    ap.add_argument("--no-trash", action="store_true")
    ap.add_argument("--canvas", type=int, default=DEFAULTS["canvas"])
    ap.add_argument("--margin", type=float, default=DEFAULTS["margin"])
    ap.add_argument("--dpi", type=int, default=DEFAULTS["dpi"])
    ap.add_argument("--compare", action="store_true")
    ap.add_argument("--device", choices=["mps", "cpu"], default=None,
                    help="force device; default mps if available (use cpu to avoid "
                         "competing with a running MPS training job)")
    args = ap.parse_args()

    in_path, out_path = Path(args.input), Path(args.output)
    if not args.checkpoint.exists():
        sys.exit(f"ERROR: checkpoint not found: {args.checkpoint} (train refine_train.py first)")

    device = args.device or ("mps" if torch.backends.mps.is_available() else "cpu")
    print(f"device={device}  loading models...")
    birefnet = load_birefnet(device=device)
    birefnet.eval()
    refiner, ref_size = load_refiner(args.checkpoint, device)

    if in_path.is_file():
        inputs = [in_path]
        single = True
    else:
        inputs = sorted(p for p in in_path.iterdir() if p.suffix.lower() in IMG_EXTS)
        single = False
        out_path.mkdir(parents=True, exist_ok=True)

    for i, src in enumerate(inputs, 1):
        t = time.time()
        result = process(src, birefnet, refiner, ref_size, device, args)
        dest = out_path if single and out_path.suffix.lower() == ".png" else \
            (out_path if single else out_path) / f"{src.stem}.png"
        if single and out_path.suffix.lower() == ".png":
            dest = out_path
        dest.parent.mkdir(parents=True, exist_ok=True)
        result.save(dest, dpi=(args.dpi, args.dpi))
        print(f"[{i}/{len(inputs)}] {src.name} -> {dest.name}  {time.time()-t:.1f}s")
        if args.compare:
            cmp_dir = (dest.parent / "_compare")
            cmp_dir.mkdir(exist_ok=True)
            pipeline.make_comparison(Image.open(src).convert("RGB"), result).save(
                cmp_dir / f"{src.stem}_compare.jpg", quality=90)
        if device == "mps":  # release cached MPS memory so batch time stays flat
            torch.mps.empty_cache()
    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
