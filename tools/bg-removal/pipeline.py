#!/usr/bin/env python3
"""
pipeline.py — Image-processing steps for bouquet background removal.

Pure, config-driven functions. No CLI, no I/O of config/log files — that lives
in remove_bg.py. Each step takes a PIL image (+ a config sub-dict) and returns a
PIL image, so steps compose and are easy to tune/replace independently.

Order of the full pipeline (see process_image):
    load RGB -> rembg cutout (RGBA) -> mask cleanup -> vase removal
             -> optional binarize -> composite on background color
"""

import time
from typing import Optional

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from rembg import remove, new_session

# rembg sessions are expensive to build (load the ONNX model); cache per model.
_SESSIONS: dict[str, object] = {}


def get_session(model_name: str):
    """Return a cached rembg session for the given model, building it on first use."""
    if model_name not in _SESSIONS:
        _SESSIONS[model_name] = new_session(model_name)
    return _SESSIONS[model_name]


def parse_color(value: str) -> tuple[int, int, int]:
    """'#000000' / '000' / 'fff' -> (r, g, b). Raises ValueError on bad input."""
    s = value.strip().lstrip("#")
    if len(s) == 3:
        s = "".join(c * 2 for c in s)
    if len(s) != 6:
        raise ValueError(f"Invalid color: {value!r} (expected hex like #000000)")
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def run_rembg(pil_rgb: Image.Image, session, am: dict,
              post_process_mask: bool = True) -> Image.Image:
    """Run rembg and return an RGBA cutout. `am` is the alpha_matting config block."""
    kwargs = dict(session=session, post_process_mask=bool(post_process_mask))
    if am.get("enabled"):
        kwargs.update(
            alpha_matting=True,
            alpha_matting_foreground_threshold=int(am["foreground_threshold"]),
            alpha_matting_background_threshold=int(am["background_threshold"]),
            alpha_matting_erode_size=int(am["erode_size"]),
        )
    return remove(pil_rgb, **kwargs).convert("RGBA")


def cutout(pil_rgb: Image.Image, session, am: dict, max_working_px: int = 0,
           post_process_mask: bool = True) -> Image.Image:
    """
    Full-resolution RGBA cutout. When max_working_px > 0 and the image is larger,
    segmentation + alpha matting run on a downscaled copy and only the alpha is
    upscaled back — keeps RGB at full res but avoids matting a huge image.
    """
    w, h = pil_rgb.size
    if not max_working_px or max(w, h) <= max_working_px:
        return run_rembg(pil_rgb, session, am, post_process_mask)

    scale = max_working_px / max(w, h)
    small = pil_rgb.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    alpha = run_rembg(small, session, am, post_process_mask).getchannel("A").resize((w, h), Image.LANCZOS)
    rgba = pil_rgb.convert("RGBA")
    rgba.putalpha(alpha)
    return rgba


def postprocess_mask(rgba: Image.Image, cfg: dict) -> Image.Image:
    """Clean the alpha channel: erosion / dilation / median / feather (each off when 0)."""
    arr = np.array(rgba)
    alpha = arr[:, :, 3]

    erosion = int(cfg.get("erosion", 0))
    dilation = int(cfg.get("dilation", 0))
    median = int(cfg.get("median", 0))
    feather = float(cfg.get("feather", 0))

    if erosion > 0:
        alpha = ndi.grey_erosion(alpha, size=(2 * erosion + 1, 2 * erosion + 1))
    if dilation > 0:
        alpha = ndi.grey_dilation(alpha, size=(2 * dilation + 1, 2 * dilation + 1))
    if median > 0:
        size = median if median % 2 == 1 else median + 1
        alpha = ndi.median_filter(alpha, size=size)
    if feather > 0:
        alpha = ndi.gaussian_filter(alpha, sigma=feather)

    arr[:, :, 3] = np.clip(alpha, 0, 255).astype(np.uint8)
    return Image.fromarray(arr, "RGBA")


def remove_vase(rgba: Image.Image, cfg: dict, cutoff: int = 128) -> tuple[Image.Image, float]:
    """
    Remove the white vase/box at the bottom while keeping green foliage.

    Strategy: within the bottom slice of the subject, the vase reads as neutral
    (low HSV saturation) AND bright (high HSV value), whereas foliage is green
    and saturated. We zero the alpha of those neutral-bright pixels. When
    `connect_to_bottom` is set, only blobs that reach the subject's bottom edge
    are removed, so a white flower higher up in the arrangement is never touched.

    Returns (rgba, percent_of_subject_removed).
    """
    arr = np.array(rgba)
    alpha = arr[:, :, 3]
    rgb = arr[:, :, :3]
    h, w = alpha.shape

    subject = alpha > 16
    n_subject = int(subject.sum())
    if n_subject == 0:
        return rgba, 0.0

    ys = np.where(subject.any(axis=1))[0]
    y0, y1 = int(ys.min()), int(ys.max())
    bbox_h = y1 - y0 + 1
    region_top = max(y0, y1 - int(bbox_h * float(cfg["region_bottom_pct"])))

    # HSV from the raw RGB (alpha ignored); we only read inside `subject` anyway.
    hsv = np.array(Image.fromarray(rgb, "RGB").convert("HSV"))
    sat = hsv[:, :, 1]
    val = hsv[:, :, 2]

    region = np.zeros((h, w), dtype=bool)
    region[region_top:y1 + 1, :] = True

    candidate = (
        subject
        & region
        & (sat < int(cfg["max_saturation"]))
        & (val > int(cfg["min_value"]))
    )

    if not candidate.any():
        return rgba, 0.0

    if cfg.get("connect_to_bottom", True):
        labels, n = ndi.label(candidate, structure=np.ones((3, 3)))
        # Seed band: bottom 5% of the subject bbox (>= 3 px). Keep only blobs that
        # reach it, so the vase (pinned to the bottom) goes and stray flecks stay.
        band = max(3, int(bbox_h * 0.05))
        seed_rows = labels[max(y0, y1 - band + 1):y1 + 1, :]
        keep = set(np.unique(seed_rows)) - {0}
        if not keep:
            return rgba, 0.0
        box = np.isin(labels, list(keep))
    else:
        box = candidate

    alpha[box] = 0
    feather = float(cfg.get("feather", 0))
    if feather > 0:
        alpha = ndi.gaussian_filter(alpha, sigma=feather)
        alpha[box] = 0  # re-clear: the blur would otherwise smear a faint "ghost" of the box back in

    arr[:, :, 3] = np.clip(alpha, 0, 255).astype(np.uint8)
    pct = 100.0 * int(box.sum()) / n_subject
    return Image.fromarray(arr, "RGBA"), pct


def apply_threshold(rgba: Image.Image, cutoff: int) -> Image.Image:
    """Force a hard 0/255 alpha cutout at `cutoff` (no semi-transparency)."""
    arr = np.array(rgba)
    arr[:, :, 3] = np.where(arr[:, :, 3] >= int(cutoff), 255, 0).astype(np.uint8)
    return Image.fromarray(arr, "RGBA")


def square_crop(rgba: Image.Image, cfg: dict) -> Image.Image:
    """Trim to the subject and center it on a square transparent canvas (matches references)."""
    arr = np.array(rgba)
    mask = arr[:, :, 3] > 16
    if not mask.any():
        return rgba

    ys, xs = np.where(mask)
    cropped = rgba.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))

    canvas = int(cfg.get("canvas_size", 3600))
    margin = float(cfg.get("margin_pct", 0.04))
    target = max(1, int(canvas * (1 - 2 * margin)))

    w, h = cropped.size
    scale = target / max(w, h)
    new_size = (max(1, round(w * scale)), max(1, round(h * scale)))
    cropped = cropped.resize(new_size, Image.LANCZOS)

    out = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    out.alpha_composite(cropped, ((canvas - new_size[0]) // 2, (canvas - new_size[1]) // 2))
    return out


def composite_background(rgba: Image.Image, background: str) -> Image.Image:
    """Place the cutout on a solid color, or keep transparency if background=='transparent'."""
    if str(background).strip().lower() == "transparent":
        return rgba
    r, g, b = parse_color(background)
    canvas = Image.new("RGBA", rgba.size, (r, g, b, 255))
    return Image.alpha_composite(canvas, rgba).convert("RGB")


def process_image(pil_rgb: Image.Image, cfg: dict, session) -> tuple[Image.Image, dict]:
    """Run the full pipeline. Returns (result_image, stats)."""
    t0 = time.time()
    stats: dict = {"vase_pct": None}

    max_px = int(cfg.get("performance", {}).get("max_working_px", 0) or 0)
    ppm = bool(cfg.get("model", {}).get("post_process_mask", True))
    rgba = cutout(pil_rgb, session, cfg.get("alpha_matting", {}), max_px, ppm)
    rgba = postprocess_mask(rgba, cfg.get("mask_postprocess", {}))

    if cfg.get("vase_removal", {}).get("enabled"):
        rgba, pct = remove_vase(rgba, cfg["vase_removal"], int(cfg["threshold"]["cutoff"]))
        stats["vase_pct"] = round(pct, 1)

    if cfg.get("threshold", {}).get("binarize"):
        rgba = apply_threshold(rgba, int(cfg["threshold"]["cutoff"]))

    if cfg.get("square_crop", {}).get("enabled"):
        rgba = square_crop(rgba, cfg["square_crop"])

    result = composite_background(rgba, cfg["output"]["background"])
    stats["ms"] = int((time.time() - t0) * 1000)
    return result, stats


def make_comparison(
    original: Image.Image,
    result: Image.Image,
    reference: Optional[Image.Image] = None,
    panel_height: int = 720,
) -> Image.Image:
    """Side-by-side montage [original | result | reference?] with labels."""
    gray = (128, 128, 128)
    label_h = 34
    gap = 12

    panels: list[tuple[str, Image.Image]] = [("ORIGINAL", original), ("RESULT", result)]
    if reference is not None:
        panels.append(("REFERENCE", reference))

    rendered: list[Image.Image] = []
    for _, img in panels:
        rgba = img.convert("RGBA")
        scale = panel_height / rgba.height
        rgba = rgba.resize((max(1, int(rgba.width * scale)), panel_height), Image.LANCZOS)
        backed = Image.new("RGBA", rgba.size, (*gray, 255))
        rendered.append(Image.alpha_composite(backed, rgba).convert("RGB"))

    total_w = sum(p.width for p in rendered) + gap * (len(rendered) - 1)
    canvas = Image.new("RGB", (total_w, panel_height + label_h), (30, 30, 30))
    draw = ImageDraw.Draw(canvas)

    x = 0
    for (label, _), panel in zip(panels, rendered):
        canvas.paste(panel, (x, label_h))
        draw.text((x + 8, 8), label, fill=(255, 255, 255))
        x += panel.width + gap

    return canvas
