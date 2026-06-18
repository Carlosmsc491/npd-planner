#!/usr/bin/env bash
# build-runtime.sh — produce the downloadable Background Removal engine package.
#
# Output: bg-removal-runtime-mac-arm64.tar.gz  (+ .sha256 sidecar)
# Upload both to the GitHub Release tagged  bg-runtime-<VERSION>  (see VERSION below):
#   gh release create bg-runtime-v1 \
#     tools/bg-removal/package/dist/bg-removal-runtime-mac-arm64.tar.gz \
#     tools/bg-removal/package/dist/bg-removal-runtime-mac-arm64.tar.gz.sha256 \
#     --repo Carlosmsc491/npd-planner --title "BG Removal engine v1" --notes "Runtime for Background Removal"
#
# The package contains (extracted into userData/bg-removal-runtime/ by the app):
#   python/                 relocatable CPython (python-build-standalone, arm64)
#   wheels/                 all runtime deps as offline wheels (~1.3 GB)
#   train/                  the Python tool (batch_run.py, infer.py, birefnet/, …)
#   checkpoints/            refiner_best.pt (the trained refiner)
#   config.default.yaml
#   requirements-runtime.txt
#   models/hf  models/u2net pre-downloaded model weights (no first-run download)
#
# On the user's Mac the app does: extract → create .venv from python/ →
# pip install --no-index --find-links wheels  → delete wheels → mark ready.
#
# Run on an Apple Silicon Mac with the dev tool already working:
#   bash tools/bg-removal/package/build-runtime.sh
set -euo pipefail

VERSION="v1"
PY_TAG="20260610"                 # python-build-standalone release date tag
PY_VER="3.12.13"                  # CPython version
PBS_ARCH="aarch64-apple-darwin"   # arm64 macOS

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOL="$(cd "$HERE/.." && pwd)"    # tools/bg-removal
BUILD="$HERE/build"
STAGE="$BUILD/runtime"
DIST="$HERE/dist"
ASSET="bg-removal-runtime-mac-arm64.tar.gz"

# Resumable: keep $STAGE across runs so a transient network failure doesn't
# force re-downloading Python + 1.3 GB of wheels. Pass --fresh to wipe it.
mkdir -p "$STAGE" "$DIST"
if [ "${1:-}" = "--fresh" ]; then echo "==> Fresh build (wiping staging)"; rm -rf "$BUILD"; mkdir -p "$STAGE"; fi
rm -f "$DIST/$ASSET" "$DIST/$ASSET.sha256"
PYBIN="$STAGE/python/bin/python3"

echo "==> 1/6  Fetch relocatable Python (python-build-standalone $PY_VER)"
if [ ! -x "$PYBIN" ]; then
  PBS_URL="https://github.com/astral-sh/python-build-standalone/releases/download/${PY_TAG}/cpython-${PY_VER}+${PY_TAG}-${PBS_ARCH}-install_only.tar.gz"
  curl -fL --retry 5 --retry-all-errors "$PBS_URL" -o "$BUILD/python.tar.gz"
  tar -xzf "$BUILD/python.tar.gz" -C "$STAGE"   # creates $STAGE/python/
else
  echo "    (already present, skipping)"
fi
"$PYBIN" --version

echo "==> 2/6  Copy tool sources + checkpoint + config"
cp -R "$TOOL/train" "$STAGE/train"
# Root-level modules batch_run.py imports via HERE.parent (sys.path) — required.
cp "$TOOL/pipeline.py" "$STAGE/"
cp "$TOOL/remove_bg.py" "$STAGE/" 2>/dev/null || true
mkdir -p "$STAGE/checkpoints"
cp "$TOOL/checkpoints/refiner_best.pt" "$STAGE/checkpoints/"
cp "$TOOL/config.default.yaml" "$STAGE/" 2>/dev/null || true
cp "$TOOL/requirements-runtime.txt" "$STAGE/"
# Drop training-only junk from the copied tree to keep the package lean.
rm -rf "$STAGE/train/__pycache__" "$STAGE/train/birefnet/__pycache__"

echo "==> 3/6  Download offline wheels for the runtime deps (arm64 / this Python)"
mkdir -p "$STAGE/wheels"
"$PYBIN" -m pip download \
  --dest "$STAGE/wheels" \
  --only-binary=:all: \
  -r "$STAGE/requirements-runtime.txt"

echo "==> 4/6  Pre-download model weights (BiRefNet safetensors) into models/"
# Only BiRefNet is needed at runtime: batch_run.py / infer.py call load_birefnet
# (HF safetensors) + the refiner. They use pipeline.square_crop only — never
# rembg's new_session — so the ~973 MB rembg ONNX is intentionally NOT bundled.
mkdir -p "$STAGE/models/hf"
TMPVENV="$BUILD/venv"
[ -x "$TMPVENV/bin/python" ] || "$PYBIN" -m venv "$TMPVENV"
"$TMPVENV/bin/pip" install --no-index --find-links "$STAGE/wheels" -r "$STAGE/requirements-runtime.txt"
HF_HOME="$STAGE/models/hf" HF_HUB_ENABLE_HF_TRANSFER=0 BG_STAGE="$STAGE" \
  "$TMPVENV/bin/python" - <<'PY'
import os, sys, time
stage = os.environ["BG_STAGE"]
sys.path.insert(0, os.path.join(stage, "train"))
sys.path.insert(0, stage)
from birefnet_model import load_birefnet
# Retry — HF downloads can time out transiently.
for attempt in range(1, 6):
    try:
        load_birefnet(device="cpu")
        print("BiRefNet weights cached OK")
        break
    except Exception as e:
        print(f"  attempt {attempt} failed: {e}")
        if attempt == 5:
            raise
        time.sleep(5)
PY
# the temp venv was only to fetch models; the package ships wheels, not a venv
rm -rf "$TMPVENV"

echo "==> 5/6  Tar the package"
( cd "$STAGE" && tar -czf "$DIST/$ASSET" . )

echo "==> 6/6  Checksum"
( cd "$DIST" && shasum -a 256 "$ASSET" | tee "$ASSET.sha256" )

echo ""
echo "Done → $DIST/$ASSET"
du -h "$DIST/$ASSET"
echo "Upload it (and the .sha256) to release tag: bg-runtime-$VERSION"
