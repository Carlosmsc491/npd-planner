#!/usr/bin/env python3
"""
remove_bg.py — Batch background removal for bouquet photos.

Removes the (dirty white) background from a single image or a whole folder,
producing transparent PNGs (default) or a solid-color fill. All tuning lives in
config.default.yaml / config.yaml — see README.md.

Usage:
    python remove_bg.py INPUT OUTPUT [options]

      INPUT          image file OR a folder of images
      OUTPUT         output file (single) OR output folder (batch)

    Options:
      --config PATH  YAML config (default: config.default.yaml, with config.yaml merged on top)
      --model NAME   override the rembg model (isnet-general-use, u2net, birefnet-general, ...)
      --bg COLOR     override background: "transparent" or a hex like "#000000"
      --compare      also write a side-by-side montage (original | result [| reference])
      --reference P  reference image (e.g. the Photoshop result) shown as a 3rd compare panel
      --recursive    recurse into subfolders (folder mode)
      --no-vase      disable the vase/box removal step for this run

Exits 0 if every image succeeded, 1 if any failed (details in stderr + the log).
"""

import argparse
import csv
import logging
import sys
import time
from copy import deepcopy
from datetime import datetime
from pathlib import Path

import yaml
from PIL import Image

import pipeline

HERE = Path(__file__).resolve().parent
LOG_DIR = HERE / "logs"
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}

log = logging.getLogger("bg-removal")


# ── config ───────────────────────────────────────────────────────────────────

def deep_merge(base: dict, overlay: dict) -> dict:
    """Recursively merge overlay onto a copy of base (overlay wins)."""
    out = deepcopy(base)
    for key, val in (overlay or {}).items():
        if isinstance(val, dict) and isinstance(out.get(key), dict):
            out[key] = deep_merge(out[key], val)
        else:
            out[key] = val
    return out


def load_config(config_arg: str | None) -> dict:
    """Load config.default.yaml, then merge the user override on top."""
    default_path = HERE / "config.default.yaml"
    if not default_path.exists():
        sys.exit(f"ERROR: missing {default_path}")
    cfg = yaml.safe_load(default_path.read_text()) or {}

    if config_arg:
        override_path = Path(config_arg)
        if not override_path.exists():
            sys.exit(f"ERROR: --config not found: {override_path}")
    else:
        override_path = HERE / "config.yaml"  # optional personal override

    if override_path.exists():
        overlay = yaml.safe_load(override_path.read_text()) or {}
        cfg = deep_merge(cfg, overlay)
        log.info("Config: %s + %s", default_path.name, override_path.name)
    else:
        log.info("Config: %s (no override)", default_path.name)
    return cfg


def apply_cli_overrides(cfg: dict, args: argparse.Namespace) -> dict:
    if args.model:
        cfg["model"]["name"] = args.model
    if args.bg:
        cfg["output"]["background"] = args.bg
        if args.bg.strip().lower() != "transparent":
            cfg["output"]["format"] = cfg["output"].get("format", "png")
    if args.no_vase:
        cfg["vase_removal"]["enabled"] = False
    if args.no_square:
        cfg["square_crop"]["enabled"] = False
    return cfg


# ── io helpers ─────────────────────────────────────────────────────────────────

def gather_inputs(in_path: Path, recursive: bool) -> list[Path]:
    if in_path.is_file():
        return [in_path]
    globber = in_path.rglob if recursive else in_path.glob
    return sorted(p for p in globber("*") if p.suffix.lower() in IMAGE_EXTS)


def output_path_for(src: Path, in_path: Path, out_path: Path, fmt: str, single: bool) -> Path:
    """Resolve where a processed image should be written."""
    ext = ".jpg" if fmt.lower() in ("jpg", "jpeg") else ".png"
    if single:
        # If OUTPUT has an image extension, honor it; otherwise treat as a folder.
        if out_path.suffix.lower() in IMAGE_EXTS:
            return out_path
        out_path.mkdir(parents=True, exist_ok=True)
        return out_path / (src.stem + ext)
    rel = src.relative_to(in_path)
    dest = out_path / rel.with_suffix(ext)
    dest.parent.mkdir(parents=True, exist_ok=True)
    return dest


def save_image(img: Image.Image, dest: Path, cfg: dict) -> None:
    dpi = int(cfg["output"].get("dpi", 300))
    fmt = dest.suffix.lower()
    if fmt in (".jpg", ".jpeg"):
        if img.mode == "RGBA":  # JPEG has no alpha — flatten on black
            bg = Image.new("RGBA", img.size, (0, 0, 0, 255))
            img = Image.alpha_composite(bg, img).convert("RGB")
        img.convert("RGB").save(dest, quality=int(cfg["output"].get("jpg_quality", 95)),
                                dpi=(dpi, dpi))
    else:
        img.save(dest, dpi=(dpi, dpi))


def compare_path_for(dest: Path, out_path: Path, single: bool) -> Path:
    base = (dest.parent if single else out_path) / "_compare"
    base.mkdir(parents=True, exist_ok=True)
    return base / (dest.stem + "_compare.jpg")


# ── logging ────────────────────────────────────────────────────────────────────

def setup_logging() -> tuple[Path, Path]:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_file = LOG_DIR / f"run_{ts}.log"
    csv_file = LOG_DIR / f"run_{ts}.csv"

    log.setLevel(logging.INFO)
    log.handlers.clear()
    fmt = logging.Formatter("%(asctime)s  %(levelname)-7s %(message)s", "%H:%M:%S")
    for handler in (logging.StreamHandler(sys.stdout), logging.FileHandler(log_file)):
        handler.setFormatter(fmt)
        log.addHandler(handler)
    return log_file, csv_file


# ── main ───────────────────────────────────────────────────────────────────────

def main() -> int:
    parser = argparse.ArgumentParser(description="Background removal for bouquet photos.")
    parser.add_argument("input", help="image file or folder")
    parser.add_argument("output", help="output file (single) or folder (batch)")
    parser.add_argument("--config", help="YAML config path")
    parser.add_argument("--model", help="override rembg model")
    parser.add_argument("--bg", help='override background ("transparent" or hex like #000000)')
    parser.add_argument("--compare", action="store_true", help="write side-by-side montage")
    parser.add_argument("--reference", help="reference image for the compare montage")
    parser.add_argument("--recursive", action="store_true", help="recurse into subfolders")
    parser.add_argument("--no-vase", action="store_true", help="disable vase removal")
    parser.add_argument("--no-square", action="store_true", help="disable square crop/center")
    args = parser.parse_args()

    log_file, csv_file = setup_logging()

    in_path = Path(args.input)
    if not in_path.exists():
        log.error("Input not found: %s", in_path)
        return 1
    out_path = Path(args.output)
    single = in_path.is_file()

    cfg = apply_cli_overrides(load_config(args.config), args)
    model_name = cfg["model"]["name"]
    fmt = cfg["output"]["format"]

    reference_img = None
    if args.reference:
        try:
            reference_img = Image.open(args.reference).convert("RGBA")
        except Exception as exc:  # noqa: BLE001 — surface, don't crash the batch
            log.warning("Could not open --reference %s: %s", args.reference, exc)

    inputs = gather_inputs(in_path, args.recursive)
    if not inputs:
        log.error("No images found at %s", in_path)
        return 1

    log.info("Model: %s | background: %s | vase_removal: %s | %d image(s)",
             model_name, cfg["output"]["background"],
             cfg["vase_removal"]["enabled"], len(inputs))
    log.info("Loading model (first run downloads ~170 MB)...")
    session = pipeline.get_session(model_name)

    rows: list[dict] = []
    ok = err = 0
    for idx, src in enumerate(inputs, 1):
        row = {"file": str(src), "model": model_name, "ms": "", "vase_pct": "",
               "status": "OK", "message": ""}
        try:
            img = Image.open(src).convert("RGB")
            result, stats = pipeline.process_image(img, cfg, session)
            dest = output_path_for(src, in_path, out_path, fmt, single)
            save_image(result, dest, cfg)
            row["ms"] = stats["ms"]
            row["vase_pct"] = "" if stats["vase_pct"] is None else stats["vase_pct"]

            warn = ""
            if isinstance(stats["vase_pct"], (int, float)) and stats["vase_pct"] > 25:
                warn = f"  (!) vase removed {stats['vase_pct']}% of subject — check output"
            log.info("[%d/%d] %s -> %s  %dms%s",
                     idx, len(inputs), src.name, dest.name, stats["ms"], warn)

            if args.compare:
                montage = pipeline.make_comparison(img, result, reference_img)
                montage.save(compare_path_for(dest, out_path, single), quality=90)
            ok += 1
        except Exception as exc:  # noqa: BLE001 — one bad image shouldn't kill the batch
            row["status"] = "ERROR"
            row["message"] = str(exc)
            log.error("[%d/%d] %s FAILED: %s", idx, len(inputs), src.name, exc)
            err += 1
        rows.append(row)

    with csv_file.open("w", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=["file", "model", "ms", "vase_pct",
                                                "status", "message"])
        writer.writeheader()
        writer.writerows(rows)

    log.info("Done: %d OK, %d error(s). Log: %s | CSV: %s",
             ok, err, log_file.name, csv_file.name)
    return 0 if err == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
