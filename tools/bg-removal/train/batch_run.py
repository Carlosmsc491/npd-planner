#!/usr/bin/env python3
"""
batch_run.py — process a folder with the trained model, writing LIVE status + previews.

Runs the real pipeline (BiRefNet@2048 -> refiner -> guided filter -> decontaminate
-> sharpen -> trash removal -> square crop) and after every real step updates
batch_out/_status.json and a preview thumbnail, so batch_dashboard.py can show
genuine live progress (no fake steps).

    python train/batch_run.py [--in batch_in] [--out batch_out] [--bire-size 2048]
"""
import argparse
import json
import sys
import time
from pathlib import Path

import cv2
import numpy as np
import torch
from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
from infer import (guided_filter, decontaminate_white, keep_large_components,
                   unletterbox, _norm_chw, load_refiner, IMG_EXTS)
from birefnet_model import load_birefnet
from dataset import letterbox
import pipeline

ROOT = HERE.parent

# pipeline params (match infer.py defaults)
BIRE = 2048
GF_R, GF_EPS, SHARP = 8, 1e-4, 2.0
DEC_SAT, DEC_VAL, DEC_COV, DEC_WIN = 32, 200, 0.65, 25
MIN_COMP, CANVAS, MARGIN, DPI = 0.005, 3600, 0.03, 300


def checkerboard(size: int, sq: int = 22) -> Image.Image:
    a = np.zeros((size, size, 3), np.uint8)
    for y in range(0, size, sq):
        for x in range(0, size, sq):
            a[y:y + sq, x:x + sq] = 235 if ((x // sq + y // sq) % 2 == 0) else 205
    return Image.fromarray(a, "RGB")


def make_thumb(rgba: Image.Image, dest: Path, size: int = 460) -> None:
    im = rgba.convert("RGBA").resize((size, size), Image.LANCZOS)
    bg = checkerboard(size).convert("RGBA")
    Image.alpha_composite(bg, im).convert("RGB").save(dest, quality=88)


class Status:
    def __init__(self, out: Path, total: int):
        self.path = out / "_status.json"
        self.d = {"total": total, "done": 0, "running": True, "finished": False,
                  "current": {}, "items": [], "elapsed_s": 0, "eta_s": 0, "avg_s": 0,
                  "started": time.time()}
        self.write()

    def write(self):
        self.d["elapsed_s"] = round(time.time() - self.d["started"])
        done = self.d["done"]
        self.d["avg_s"] = round(self.d["elapsed_s"] / done) if done else 0
        self.d["eta_s"] = self.d["avg_s"] * (self.d["total"] - done)
        tmp = self.path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(self.d))
        tmp.replace(self.path)

    def step(self, name: str, idx: int, text: str, pct: int):
        self.d["current"] = {"name": name, "index": idx, "step": text, "step_pct": pct}
        self.write()

    def finish_item(self, name: str, secs: float, thumb: str):
        self.d["done"] += 1
        self.d["items"].insert(0, {"name": name, "seconds": round(secs, 1), "thumb": thumb})
        self.d["current"] = {}
        self.write()


@torch.no_grad()
def process_one(path: Path, birefnet, refiner, ref_size: int, device: str,
                out: Path, thumbs: Path, st: Status, idx: int) -> None:
    name = path.name
    st.step(name, idx, "Loading image…", 5)
    orig = Image.open(path).convert("RGB")
    ow, oh = orig.size
    orig_rgb = np.asarray(orig)

    st.step(name, idx, "BiRefNet — base cutout (2048)…", 25)
    xb = torch.from_numpy(_norm_chw(letterbox(orig, BIRE, (255, 255, 255)))).unsqueeze(0).to(device)
    out_b = birefnet(xb)
    pred = out_b[-1] if isinstance(out_b, (list, tuple)) else out_b
    ba = torch.sigmoid(pred)[0, 0].float().cpu().numpy()

    st.step(name, idx, "Refiner — removing base & debris…", 60)
    rgb_r = _norm_chw(letterbox(orig, ref_size, (255, 255, 255)))
    ba_r = cv2.resize(ba, (ref_size, ref_size), interpolation=cv2.INTER_LINEAR)
    xr = torch.from_numpy(np.concatenate([rgb_r, ba_r[None]], 0)).unsqueeze(0).float().to(device)
    remove = torch.sigmoid(refiner(xr))[0, 0].cpu().numpy()
    remove = np.clip((remove - 0.3) / 0.7, 0, 1)
    remove = cv2.resize(remove, (BIRE, BIRE), interpolation=cv2.INTER_LINEAR)
    corrected = np.clip(ba * (1 - remove), 0, 1)

    st.step(name, idx, "Refining edges (guided filter)…", 75)
    alpha = unletterbox(corrected, ow, oh)
    guide = np.asarray(orig.convert("L"), np.float32) / 255.0
    alpha = np.clip(guided_filter(guide, alpha, GF_R, GF_EPS), 0, 1)

    st.step(name, idx, "Cleaning white fringe & floating debris…", 88)
    alpha = decontaminate_white(orig_rgb, alpha, DEC_SAT, DEC_VAL, DEC_COV, DEC_WIN)
    if SHARP > 1:
        alpha = np.clip((alpha - 0.5) * SHARP + 0.5, 0, 1)
    alpha = keep_large_components(alpha, MIN_COMP, largest_only=True)  # keep only the bouquet

    st.step(name, idx, "Square crop 3600 & saving…", 95)
    rgba = Image.fromarray(np.dstack([orig_rgb, (alpha * 255).astype(np.uint8)]), "RGBA")
    result = pipeline.square_crop(rgba, {"canvas_size": CANVAS, "margin_pct": MARGIN})
    dest = out / f"{path.stem}.png"
    result.save(dest, dpi=(DPI, DPI))
    thumb_rel = f"_thumbs/{path.stem}.jpg"
    make_thumb(result, thumbs / f"{path.stem}.jpg")
    if device == "mps":
        torch.mps.empty_cache()
    return thumb_rel


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", type=Path, default=ROOT / "batch_in")
    ap.add_argument("--out", type=Path, default=ROOT / "batch_out")
    ap.add_argument("--checkpoint", type=Path, default=ROOT / "checkpoints" / "refiner_best.pt")
    # auto-retouch in Photoshop after the cutout batch finishes
    ap.add_argument("--retouch", action="store_true", help="run the Photoshop action afterwards")
    ap.add_argument("--rt-action", default="RETOUCH ACTION")
    ap.add_argument("--rt-set", default="Default Actions")
    ap.add_argument("--rt-app", default="Adobe Photoshop (Beta)")
    ap.add_argument("--rt-out", type=Path, default=ROOT / "retocados")
    args = ap.parse_args()

    imgs = sorted(p for p in args.inp.iterdir() if p.suffix.lower() in IMG_EXTS)
    args.out.mkdir(parents=True, exist_ok=True)
    thumbs = args.out / "_thumbs"
    thumbs.mkdir(exist_ok=True)
    if not imgs:
        print(f"No images in {args.inp}")
        return 1

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    st = Status(args.out, len(imgs))
    st.step("—", 0, "Loading models (BiRefNet + refiner)…", 0)
    birefnet = load_birefnet(device=device)
    birefnet.eval()
    refiner, ref_size = load_refiner(args.checkpoint, device)

    for i, p in enumerate(imgs, 1):
        t0 = time.time()
        try:
            thumb_rel = process_one(p, birefnet, refiner, ref_size, device, args.out, thumbs, st, i)
            st.finish_item(p.name, time.time() - t0, thumb_rel)
            print(f"[{i}/{len(imgs)}] {p.name}  {time.time()-t0:.1f}s", flush=True)
        except Exception as e:  # noqa: BLE001
            st.d["items"].insert(0, {"name": p.name, "seconds": 0, "thumb": "", "error": str(e)[:80]})
            st.d["done"] += 1
            st.write()
            print(f"[{i}/{len(imgs)}] {p.name} ERROR: {e}", flush=True)

    st.d["running"] = False
    st.d["finished"] = True
    st.d["current"] = {}
    st.write()
    print("Cutouts ready.", flush=True)

    if args.retouch:
        import subprocess
        print("Abriendo Photoshop y aplicando RETOUCH al lote…", flush=True)
        subprocess.run([sys.executable, str(HERE / "photoshop_retouch.py"),
                        "--action", args.rt_action, "--set", args.rt_set,
                        "--app", args.rt_app, "--in", str(args.out),
                        "--out", str(args.rt_out)])
    print("Done.", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
