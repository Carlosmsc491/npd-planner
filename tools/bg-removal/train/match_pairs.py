#!/usr/bin/env python3
"""
match_pairs.py — visually match loose originals to cutouts, then build aligned labels.

For folders where originals (JPG) and cutouts (PNG) are NOT paired by filename
(different prices/numbers, grouped by letter), we match each original to its cutout
by ORB feature inliers (the true pair shares pixels -> high inliers). A filename
"group" token (the letter after the price) narrows candidates for speed; unmatched
originals fall back to matching against all remaining cutouts.

Matched pairs are aligned (reusing prepare_pairs.align_alpha) into full-res alpha
labels and APPENDED to dataset/manifest.csv.

    python train/match_pairs.py --dir "samples/input/do not touch/untitled folder"
"""
import argparse
import csv
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from prepare_pairs import count_inliers, align_alpha, qc_overlay

ROOT = Path(__file__).resolve().parent.parent
GROUP_RE = re.compile(r"\$\s*[\d.]+\s+(.+?)\s*-\s*\d+", re.IGNORECASE)


def group_of(stem: str) -> str | None:
    m = GROUP_RE.search(stem)
    return m.group(1).strip().upper() if m else None


def key_for(path: Path, by_folder: bool) -> str | None:
    """Candidate-grouping key: parent folder name, or the filename letter token."""
    return path.parent.name if by_folder else group_of(path.stem)


def gather(folder: Path, exclude: list[str]):
    jpg, png = [], []
    for f in folder.rglob("*"):
        if f.name.startswith(".") or not f.is_file():
            continue
        if any(ex in f.parts for ex in exclude):
            continue
        if f.suffix.lower() in (".jpg", ".jpeg"):
            jpg.append(f)
        elif f.suffix.lower() == ".png":
            png.append(f)
    return jpg, png


def ns_name(op: Path, base: Path) -> str:
    """Globally-unique label name = original path relative to base ('/'->'__').

    Prevents collisions when different batches contain different photos that happen
    to share a filename (e.g. two distinct '$12.99 MOTHER'S DAY - 8')."""
    try:
        rel = op.relative_to(base)
    except ValueError:
        return op.stem
    return str(rel.with_suffix("")).replace("/", "__")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", type=Path, required=True, help="folder with loose originals + cutouts")
    ap.add_argument("--out", type=Path, default=ROOT / "dataset" / "labels")
    ap.add_argument("--qc", type=Path, default=ROOT / "dataset" / "qc")
    ap.add_argument("--manifest", type=Path, default=ROOT / "dataset" / "manifest.csv")
    ap.add_argument("--work-width", type=int, default=1400)
    ap.add_argument("--min-inliers", type=int, default=60, help="min inliers to accept a pair")
    ap.add_argument("--match-min", type=int, default=25, help="min inliers to consider a candidate match")
    ap.add_argument("--min-score", type=float, default=0.50,
                    help="reject pairs whose warped cutout structure doesn't match the "
                         "original (different physical unit, not the same photo)")
    ap.add_argument("--group-by-folder", action="store_true",
                    help="group candidates by parent folder (use when each subfolder holds "
                         "its own originals + cutouts, e.g. GUID-named cutouts)")
    ap.add_argument("--exclude", nargs="*", default=[],
                    help="folder names to skip while gathering (to isolate one batch)")
    ap.add_argument("--name-base", type=Path, default=ROOT / "samples" / "input" / "do not touch",
                    help="base for globally-unique label names")
    args = ap.parse_args()

    if not args.dir.is_dir():
        sys.exit(f"ERROR: not a folder: {args.dir}")
    args.out.mkdir(parents=True, exist_ok=True)
    args.qc.mkdir(parents=True, exist_ok=True)

    originals, cutouts = gather(args.dir, args.exclude)
    print(f"originals={len(originals)}  cutouts={len(cutouts)}")

    # group cutouts (by parent folder, or by filename letter token) for candidate lookup
    cut_groups: dict[str | None, list[Path]] = {}
    for c in cutouts:
        cut_groups.setdefault(key_for(c, args.group_by_folder), []).append(c)

    # score candidates: for each original, same-group cutouts first
    cut_imgs = {c: Image.open(c).convert("RGBA") for c in cutouts}
    scored: list[tuple[int, Path, Path]] = []  # (inliers, original, cutout)
    for i, op in enumerate(originals, 1):
        g = key_for(op, args.group_by_folder)
        cands = cut_groups.get(g, []) or cutouts
        # fast path: exact filename-stem match within the group (names that align)
        exact = [c for c in cands if c.stem.strip().lower() == op.stem.strip().lower()]
        if exact:
            scored.append((9999, op, exact[0]))
            print(f"  [{i}/{len(originals)}] {op.stem[:34]:36} -> {exact[0].stem[:24]:24} (exact)")
            continue
        oimg = Image.open(op).convert("RGB")
        best = (0, None)
        for cp in cands:
            n = count_inliers(oimg, cut_imgs[cp])
            if n > best[0]:
                best = (n, cp)
        if best[1] is not None and best[0] >= args.match_min:
            scored.append((best[0], op, best[1]))
        print(f"  [{i}/{len(originals)}] {op.stem[:34]:36} -> {best[1].stem[:24] if best[1] else 'NONE':24} ({best[0]} inl)")

    # greedy one-to-one assignment (highest inliers first)
    scored.sort(reverse=True, key=lambda x: x[0])
    used_o, used_c, pairs = set(), set(), []
    for n, op, cp in scored:
        if op in used_o or cp in used_c:
            continue
        used_o.add(op); used_c.add(cp); pairs.append((n, op, cp))

    # existing manifest (append, dedup by name)
    existing = []
    if args.manifest.exists():
        existing = list(csv.DictReader(args.manifest.open()))
    have = {r["name"] for r in existing}

    ok = low = badphoto = 0
    new_rows = []
    for n, op, cp in pairs:
        name = ns_name(op, args.name_base)
        if name in have:
            continue
        orig = Image.open(op).convert("RGB")
        cut = Image.open(cp).convert("RGBA")
        alpha, inl, score = align_alpha(orig, cut, args.work_width)
        if alpha is None or inl < args.min_inliers:
            low += 1
            print(f"LOW  {name[:36]} (align inliers={inl})")
            continue
        if score < args.min_score:
            badphoto += 1
            print(f"DIFF-UNIT  {name[:36]} (score={score:.2f} < {args.min_score}) -> rejected")
            continue
        label_path = args.out / f"{name}.png"
        Image.fromarray(alpha).save(label_path)
        qc_overlay(orig, alpha).save(args.qc / f"{name}.jpg", quality=85)
        new_rows.append({"name": name, "original": str(op), "label": str(label_path),
                         "inliers": inl, "score": round(score, 3), "cutout": str(cp)})
        ok += 1

    unmatched = [op for op in originals if op not in used_o]
    all_rows = existing + new_rows
    # Preserve any extra columns the manifest already has (e.g. birefnet_alpha).
    base = ["name", "original", "label", "inliers"]
    extra = sorted({k for r in all_rows for k in r} - set(base))
    fieldnames = base + extra
    for r in all_rows:
        for k in fieldnames:
            r.setdefault(k, "")
    tmp = args.manifest.with_suffix(".csv.tmp")  # atomic write: never truncate on error
    with tmp.open("w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(all_rows)
    tmp.replace(args.manifest)

    print(f"\nNew pairs added: {ok} | low-inliers: {low} | diff-unit rejected: {badphoto} | "
          f"unmatched originals: {len(unmatched)}")
    if unmatched:
        print("  unmatched:", ", ".join(p.stem[:20] for p in unmatched[:10]))
    print(f"Manifest total now: {len(all_rows)} pairs -> {args.manifest}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
