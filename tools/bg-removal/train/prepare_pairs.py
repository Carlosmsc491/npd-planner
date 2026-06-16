#!/usr/bin/env python3
"""
prepare_pairs.py — Turn (original photo, Photoshop cutout) pairs into pixel-aligned
ground-truth alpha labels for training.

The Photoshop cutouts are square-cropped (e.g. 3600x3600) while the originals are
full-frame (e.g. 6240x4160), so the cutout must be aligned back onto the original.
The foreground pixels are identical between the two, so ORB feature matching +
a RANSAC similarity transform recovers the mapping robustly. We then warp the
cutout's alpha into the original's frame, producing a full-resolution label whose
alpha already encodes the manual decisions (vase/box removed, white flowers kept).

Pairing:
  - default: match by filename stem  (originals/<name>.jpg  <->  cutouts/<name>.png)
  - --map CSV: rows "original_stem_substring,cutout_stem" for archives whose
    originals and cutouts use different naming (like the initial 4 samples).

Outputs (under --out / --qc):
  labels/<name>.png   8-bit alpha, same size as the original  (training target)
  qc/<name>.jpg       original with the aligned alpha edge drawn (eyeball check)

Each pair logs its inlier count; pairs below --min-inliers are flagged LOW and
skipped (bad alignment would poison training — review those by hand).
"""

import argparse
import csv
import os
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

IMG_EXTS = (".jpg", ".jpeg", ".png", ".JPG", ".JPEG", ".PNG")


def load_pairs(originals: Path, cutouts: Path, map_csv: Path | None) -> list[tuple[str, Path, Path]]:
    """Return [(name, original_path, cutout_path), ...]."""
    def find(folder: Path, stem_or_sub: str) -> Path | None:
        # exact stem first, then substring (handles "20270751" -> "...-20270751.JPG")
        for p in folder.iterdir():
            if p.suffix in IMG_EXTS and p.stem == stem_or_sub:
                return p
        for p in folder.iterdir():
            if p.suffix in IMG_EXTS and stem_or_sub in p.stem:
                return p
        return None

    pairs: list[tuple[str, Path, Path]] = []
    if map_csv:
        with map_csv.open() as fh:
            for row in csv.reader(fh):
                if not row or row[0].lstrip().startswith("#"):
                    continue
                orig_key, cut_key = row[0].strip(), row[1].strip()
                op, cp = find(originals, orig_key), find(cutouts, cut_key)
                if op and cp:
                    pairs.append((orig_key, op, cp))
                else:
                    print(f"  ! map row unmatched: {orig_key} / {cut_key}", file=sys.stderr)
    else:
        cuts = {p.stem: p for p in cutouts.iterdir() if p.suffix in IMG_EXTS}
        for op in sorted(originals.iterdir()):
            if op.suffix in IMG_EXTS and op.stem in cuts:
                pairs.append((op.stem, op, cuts[op.stem]))
    return pairs


def gather_from_pairs_dir(root: Path) -> tuple[list[tuple[str, Path, Path]], list[str]]:
    """Each (possibly nested) folder holding exactly one JPG + one PNG is a pair.

    The JPG is the original, the PNG is the cutout, and the label is named after the
    original's stem (unique photo IDs). Folders with a different count are flagged.
    """
    pairs: list[tuple[str, Path, Path]] = []
    flagged: list[str] = []
    for dirpath, _, files in os.walk(root):
        fs = [Path(dirpath) / f for f in files if not f.startswith(".")]
        jpgs = [f for f in fs if f.suffix.lower() in (".jpg", ".jpeg")]
        pngs = [f for f in fs if f.suffix.lower() == ".png"]
        if len(jpgs) == 1 and len(pngs) == 1:
            pairs.append((jpgs[0].stem, jpgs[0], pngs[0]))
        elif jpgs or pngs:
            flagged.append(f"{Path(dirpath).name}: {len(jpgs)} jpg / {len(pngs)} png")
    return pairs, flagged


def align_alpha(orig: Image.Image, cut: Image.Image, work_width: int) -> tuple[np.ndarray | None, int]:
    """Warp the cutout's alpha into the original's full-resolution frame.

    Returns (alpha_uint8 same HxW as original, inlier_count), or (None, n) if the
    transform could not be estimated.
    """
    ow, oh = orig.size
    cw, ch = cut.size

    so = work_width / ow
    sc = work_width / cw
    o_small = np.array(orig.resize((work_width, round(oh * so)), Image.LANCZOS))
    c_small = cut.resize((work_width, round(ch * sc)), Image.LANCZOS)
    c_rgba = np.array(c_small)

    # Composite the cutout on white so it resembles the original's white backdrop.
    c_rgb = c_rgba[:, :, :3].copy()
    c_rgb[c_rgba[:, :, 3] < 10] = 255

    og = cv2.cvtColor(o_small, cv2.COLOR_RGB2GRAY)
    cg = cv2.cvtColor(c_rgb, cv2.COLOR_RGB2GRAY)

    orb = cv2.ORB_create(6000)
    k1, d1 = orb.detectAndCompute(cg, None)   # cutout = source
    k2, d2 = orb.detectAndCompute(og, None)   # original = destination
    if d1 is None or d2 is None:
        return None, 0

    matches = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True).match(d1, d2)
    matches = sorted(matches, key=lambda m: m.distance)[:500]
    if len(matches) < 4:
        return None, 0

    src = np.float32([k1[m.queryIdx].pt for m in matches]).reshape(-1, 1, 2)
    dst = np.float32([k2[m.trainIdx].pt for m in matches]).reshape(-1, 1, 2)
    M, inliers = cv2.estimateAffinePartial2D(src, dst, method=cv2.RANSAC, ransacReprojThreshold=3)
    if M is None:
        return None, 0
    n_inliers = int(inliers.sum()) if inliers is not None else 0

    # M maps cutout_small -> original_small:  x_orig_small = A @ x_cut_small + t
    # with  x_cut_small = sc * x_cut_full  and  x_orig_full = x_orig_small / so.
    # So the full-resolution transform cutout_full -> original_full is:
    #   x_orig_full = (sc/so) * A @ x_cut_full + t/so
    A, t = M[:, :2], M[:, 2]
    M_full = np.empty((2, 3), dtype=np.float64)
    M_full[:, :2] = (sc / so) * A
    M_full[:, 2] = t / so

    cut_alpha_full = np.array(cut.split()[-1])  # full-res alpha channel
    warped = cv2.warpAffine(cut_alpha_full, M_full, (ow, oh), flags=cv2.INTER_LINEAR)
    return warped, n_inliers


def qc_overlay(orig: Image.Image, alpha: np.ndarray, max_width: int = 1100) -> Image.Image:
    o = np.array(orig)
    edges = cv2.Canny((alpha > 128).astype(np.uint8) * 255, 50, 150)
    edges = cv2.dilate(edges, np.ones((2, 2), np.uint8))
    o[edges > 0] = [255, 0, 0]
    img = Image.fromarray(o)
    if img.width > max_width:
        img = img.resize((max_width, round(img.height * max_width / img.width)), Image.LANCZOS)
    return img


def main() -> int:
    here = Path(__file__).resolve().parent
    ds = here.parent / "dataset"
    ap = argparse.ArgumentParser(description="Align Photoshop cutouts to originals -> alpha labels.")
    ap.add_argument("--originals", type=Path, default=ds / "originals")
    ap.add_argument("--cutouts", type=Path, default=ds / "cutouts")
    ap.add_argument("--pairs-dir", type=Path,
                    help="folder of subfolders, each holding one original (jpg) + one cutout (png)")
    ap.add_argument("--out", type=Path, default=ds / "labels")
    ap.add_argument("--qc", type=Path, default=ds / "qc")
    ap.add_argument("--map", type=Path, help="CSV mapping for mismatched names")
    ap.add_argument("--work-width", type=int, default=1400, help="matching resolution")
    ap.add_argument("--min-inliers", type=int, default=60, help="flag/skip pairs below this")
    args = ap.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    args.qc.mkdir(parents=True, exist_ok=True)

    if args.pairs_dir:
        if not args.pairs_dir.is_dir():
            sys.exit(f"ERROR: not a folder: {args.pairs_dir}")
        pairs, flagged = gather_from_pairs_dir(args.pairs_dir)
        for f in flagged:
            print(f"  ! skipped (not 1 jpg + 1 png): {f}", file=sys.stderr)
    else:
        for d in (args.originals, args.cutouts):
            if not d.is_dir():
                sys.exit(f"ERROR: not a folder: {d}")
        pairs = load_pairs(args.originals, args.cutouts, args.map)
    if not pairs:
        sys.exit("ERROR: no pairs found (check names or pass --pairs-dir / --map)")

    ok = low = fail = 0
    manifest: list[dict] = []
    for name, op, cp in pairs:
        orig = Image.open(op).convert("RGB")
        cut = Image.open(cp).convert("RGBA")
        alpha, inl = align_alpha(orig, cut, args.work_width)
        if alpha is None:
            print(f"FAIL {name}: could not estimate transform")
            fail += 1
            continue
        flag = "LOW " if inl < args.min_inliers else "OK  "
        print(f"{flag}{name}: inliers={inl}")
        if inl < args.min_inliers:
            low += 1
            continue
        label_path = args.out / f"{name}.png"
        Image.fromarray(alpha).save(label_path)
        qc_overlay(orig, alpha).save(args.qc / f"{name}.jpg", quality=85)
        manifest.append({"name": name, "original": str(op), "label": str(label_path),
                         "inliers": inl})
        ok += 1

    # Manifest lets the training loader pair each label with its original without
    # copying the (large) originals out of their source folders.
    manifest_path = args.out.parent / "manifest.csv"
    with manifest_path.open("w", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=["name", "original", "label", "inliers"])
        writer.writeheader()
        writer.writerows(manifest)

    print(f"\nDone: {ok} labels written, {low} flagged LOW (skipped), {fail} failed.")
    print(f"Labels: {args.out}   QC: {args.qc}   Manifest: {manifest_path}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
