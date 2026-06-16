#!/usr/bin/env python3
"""
birefnet_model.py — load BiRefNet from VENDORED code (no trust_remote_code).

We import the reviewed, vendored model definition in train/birefnet/ and load the
official weights (model.safetensors) pulled as a plain data download. This avoids
transformers' auto-fetch-and-execute of remote code. See train/birefnet/PROVENANCE.md.
"""
import sys
from pathlib import Path

import torch
from safetensors.torch import load_file

sys.path.insert(0, str(Path(__file__).resolve().parent))
from birefnet import BiRefNet  # vendored package (train/birefnet/)

REPO = "ZhengPeng7/BiRefNet"
WEIGHTS_FILE = "model.safetensors"


def load_birefnet(device: str = "cpu", weights: str | None = None) -> torch.nn.Module:
    """Build BiRefNet with random backbone init and load the fine/pre-trained weights."""
    if weights is None:
        from huggingface_hub import hf_hub_download
        weights = hf_hub_download(REPO, WEIGHTS_FILE)  # data download, cached
    model = BiRefNet(bb_pretrained=False)
    state = load_file(weights)
    missing, unexpected = model.load_state_dict(state, strict=False)
    if missing or unexpected:
        print(f"[birefnet] load_state_dict: {len(missing)} missing, {len(unexpected)} unexpected keys")
    return model.float().to(device)
