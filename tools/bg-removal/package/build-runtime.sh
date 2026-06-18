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
PY_TAG="20250612"                 # python-build-standalone release date tag
PY_VER="3.12.11"                  # CPython version
PBS_ARCH="aarch64-apple-darwin"   # arm64 macOS

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOL="$(cd "$HERE/.." && pwd)"    # tools/bg-removal
BUILD="$HERE/build"
STAGE="$BUILD/runtime"
DIST="$HERE/dist"
ASSET="bg-removal-runtime-mac-arm64.tar.gz"

echo "==> Clean staging"
rm -rf "$BUILD" "$DIST"
mkdir -p "$STAGE" "$DIST"

echo "==> 1/6  Fetch relocatable Python (python-build-standalone $PY_VER)"
PBS_URL="https://github.com/astral-sh/python-build-standalone/releases/download/${PY_TAG}/cpython-${PY_VER}+${PY_TAG}-${PBS_ARCH}-install_only.tar.gz"
curl -fL "$PBS_URL" -o "$BUILD/python.tar.gz"
tar -xzf "$BUILD/python.tar.gz" -C "$STAGE"   # creates $STAGE/python/
PYBIN="$STAGE/python/bin/python3"
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

echo "==> 4/6  Pre-download model weights (BiRefNet + rembg) into models/"
mkdir -p "$STAGE/models/hf" "$STAGE/models/u2net"
TMPVENV="$BUILD/venv"
"$PYBIN" -m venv "$TMPVENV"
"$TMPVENV/bin/pip" install --no-index --find-links "$STAGE/wheels" -r "$STAGE/requirements-runtime.txt"
HF_HOME="$STAGE/models/hf" U2NET_HOME="$STAGE/models/u2net" BG_STAGE="$STAGE" \
  "$TMPVENV/bin/python" - <<'PY'
import os, sys
stage = os.environ["BG_STAGE"]
sys.path.insert(0, os.path.join(stage, "train"))
sys.path.insert(0, stage)
# BiRefNet weights (safetensors) via huggingface_hub → cached under HF_HOME
from birefnet_model import load_birefnet
load_birefnet(device="cpu")
# rembg birefnet-general ONNX → cached under U2NET_HOME
from rembg import new_session
new_session("birefnet-general")
print("models cached OK")
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
