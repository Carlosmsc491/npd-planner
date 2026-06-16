# Background Removal Tool (bouquets)

Removes the dirty white background from bouquet photos and outputs a clean
**transparent PNG** (or a solid-color fill). Built for iteration: every knob lives
in a YAML config, every run is logged, and `--compare` writes a side-by-side so you
can eyeball quality against your manual Photoshop result.

Stack: **rembg + Pillow + numpy/scipy**. Standalone — not wired into the app yet.

---

## Setup (one time)

```bash
cd tools/bg-removal
python3.12 -m venv .venv
./.venv/bin/pip install -r requirements.txt
```

> The first run of each model downloads ~170 MB to `~/.u2net/` (needs internet, once).

## Usage

```bash
# single image -> transparent PNG
./.venv/bin/python remove_bg.py samples/input/foo.jpg output/foo.png

# whole folder (batch)
./.venv/bin/python remove_bg.py samples/input/ output/

# with a side-by-side montage, comparing against your Photoshop reference
./.venv/bin/python remove_bg.py samples/input/foo.jpg output/foo.png \
    --compare --reference samples/reference/foo_photoshop.png
```

Options: `--config PATH` · `--model NAME` · `--bg "#000000"|transparent` ·
`--compare` · `--reference PATH` · `--recursive` · `--no-vase`.

Exit code is `0` only if every image succeeded; otherwise `1`. Each run writes
`logs/run_<timestamp>.log` and a `.csv` summary (file · model · ms · vase% · status).

---

## Tuning without touching code

Copy the defaults and edit your personal copy — it's merged on top automatically
and is gitignored:

```bash
cp config.default.yaml config.yaml   # then edit config.yaml
```

What each block does:

| Block | What to turn when… |
|---|---|
| `model.name` | edges/cutout look wrong → try `birefnet-general` (best, slower) or `u2net` |
| `alpha_matting` | fuzzy petal/leaf edges look cut with scissors → keep enabled; raise `erode_size` for a wider refine band |
| `mask_postprocess.erosion` | white halo around the subject → increase 1–2 px |
| `mask_postprocess.feather` | edges too hard → increase; too soft/glowy → decrease |
| `vase_removal` | the white vase/box is or isn't being removed cleanly → see below |
| `threshold.binarize` | you want a hard 0/255 cutout (no semi-transparent pixels) |
| `output.background` | `transparent` (default) or a hex fill like `#000000` |

### Vase removal (the tricky part)

rembg keeps the white vase/box as foreground. A second pass removes it: inside the
**bottom `region_bottom_pct`** of the subject, pixels that are **neutral**
(`saturation < max_saturation`) and **bright** (`value > min_value`) are treated as
vase and erased; green foliage stays. With `connect_to_bottom: true`, only blobs
that reach the subject's bottom edge are removed, so a white flower higher in the
arrangement is safe.

- **Vase not fully removed** → raise `region_bottom_pct`, raise `max_saturation`, lower `min_value`.
- **It ate a white/cream flower** → lower `region_bottom_pct`, lower `max_saturation`, keep `connect_to_bottom: true`, or run that image with `--no-vase`.

The log warns when vase removal deletes >25% of the subject (usually a sign it's too aggressive).

---

## Layout

```
remove_bg.py        CLI: args, config merge, batch loop, logging, --compare
pipeline.py         processing steps (rembg, mask cleanup, vase removal, composite)
config.default.yaml versioned defaults (do not edit; copy to config.yaml)
samples/input/      put test photos here          (gitignored)
samples/reference/  put Photoshop references here  (gitignored)
output/             results                        (gitignored)
logs/               per-run .log + .csv            (gitignored)
```
