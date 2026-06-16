#!/usr/bin/env python3
"""
rebuild_manifest.py — rebuild dataset/manifest.csv from the labels on disk.

The labels in dataset/labels/<name>.png are the source of truth (each is a
confirmed, aligned pair). This finds each label's original by stem under the
search root, attaches its cached birefnet_alpha if present, and writes a fresh,
complete manifest. Use to recover after an interrupted match run.

    python train/rebuild_manifest.py --search "samples/input/do not touch"
"""
import argparse
import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IMG = (".jpg", ".jpeg")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--labels", type=Path, default=ROOT / "dataset" / "labels")
    ap.add_argument("--birefnet", type=Path, default=ROOT / "dataset" / "birefnet_alpha")
    ap.add_argument("--search", type=Path, default=ROOT / "samples" / "input" / "do not touch")
    ap.add_argument("--manifest", type=Path, default=ROOT / "dataset" / "manifest.csv")
    args = ap.parse_args()

    # index every candidate original by lowercased stem
    originals: dict[str, Path] = {}
    for f in args.search.rglob("*"):
        if f.is_file() and f.suffix.lower() in IMG and not f.name.startswith("."):
            originals.setdefault(f.stem.strip().lower(), f)

    rows, orphans = [], []
    for label in sorted(args.labels.glob("*.png")):
        name = label.stem
        op = originals.get(name.strip().lower())
        if not op:
            orphans.append(name)
            continue
        ba = args.birefnet / f"{name}.png"
        rows.append({"name": name, "original": str(op), "label": str(label),
                     "inliers": "", "birefnet_alpha": str(ba) if ba.exists() else ""})

    tmp = args.manifest.with_suffix(".csv.tmp")
    with tmp.open("w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=["name", "original", "label", "inliers", "birefnet_alpha"])
        w.writeheader()
        w.writerows(rows)
    tmp.replace(args.manifest)

    print(f"Rebuilt manifest: {len(rows)} pairs  ({sum(1 for r in rows if r['birefnet_alpha'])} with birefnet_alpha)")
    if orphans:
        print(f"  {len(orphans)} labels with no original found:", ", ".join(o[:20] for o in orphans[:8]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
