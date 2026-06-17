#!/usr/bin/env python3
"""
enhance.py — approximate the Photoshop Camera Raw 'RETOUCH' preset.

Replicates the global look of the user's preset (exposure, highlight recovery,
shadow lift, clarity/texture local contrast, sharpening, slight red-luminance cut).
Not byte-identical to Adobe's engine, but visually very close. Operates on an
8-bit RGB array; alpha is handled by the caller.
"""
import cv2
import numpy as np

# RETOUCH.xmp values
P = dict(exposure=0.30, highlights=-81, shadows=42, clarity=12, texture=19,
         sharpness=38, red_lum=-15)


def _srgb_to_lin(x):
    return np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)


def _lin_to_srgb(x):
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(np.clip(x, 0, None), 1 / 2.4) - 0.055)


def _unsharp(img, radius, amount):
    blur = cv2.GaussianBlur(img, (0, 0), max(0.3, radius))
    return np.clip(img + amount * (img - blur), 0, 1)


def enhance_rgb(rgb: np.ndarray, p: dict = P) -> np.ndarray:
    img = rgb.astype(np.float32) / 255.0

    # Exposure — gain in linear light
    if p["exposure"]:
        lin = _srgb_to_lin(img) * (2.0 ** p["exposure"])
        img = np.clip(_lin_to_srgb(np.clip(lin, 0, 1)), 0, 1)

    # Highlights / Shadows — region-weighted lift/compress
    h, s = p["highlights"] / 100.0, p["shadows"] / 100.0
    hi_w = np.clip((img - 0.5) / 0.5, 0, 1) ** 1.5      # strong near white
    lo_w = np.clip((0.5 - img) / 0.5, 0, 1) ** 1.5      # strong near black
    img = np.clip(img + h * 0.5 * hi_w + s * 0.5 * lo_w, 0, 1)

    # Clarity (large-radius local contrast) + Texture (mid) + Sharpness (fine)
    base = max(img.shape[:2])
    if p["clarity"]:
        img = _unsharp(img, base * 0.02, p["clarity"] / 100.0)
    if p["texture"]:
        img = _unsharp(img, base * 0.004, p["texture"] / 100.0)
    if p["sharpness"]:
        img = _unsharp(img, 1.2, p["sharpness"] / 100.0 * 0.8)

    # Red luminance −  (HSL approx: dim value on red hues)
    if p["red_lum"]:
        hsv = cv2.cvtColor((np.clip(img, 0, 1) * 255).astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32)
        red = ((hsv[:, :, 0] < 10) | (hsv[:, :, 0] > 170)).astype(np.float32)
        hsv[:, :, 2] *= (1 + p["red_lum"] / 100.0 * red * 0.6)
        img = cv2.cvtColor(np.clip(hsv, 0, 255).astype(np.uint8), cv2.COLOR_HSV2RGB).astype(np.float32) / 255.0

    return (np.clip(img, 0, 1) * 255).astype(np.uint8)
