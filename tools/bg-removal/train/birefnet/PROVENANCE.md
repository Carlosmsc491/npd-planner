# Vendored BiRefNet model code

Source: HuggingFace `ZhengPeng7/BiRefNet`, snapshot `e2bf8e4460fc8fa32bba5ea4d94b3233d367b0e4`
Files: `birefnet.py`, `BiRefNet_config.py` (copied verbatim, unmodified).

Vendored on purpose so we load BiRefNet **without** `transformers` `trust_remote_code`
(no auto-fetch + auto-exec of remote code). The weights (`model.safetensors`, ~900MB)
are not vendored — they're pulled on demand with `huggingface_hub.hf_hub_download`
(a data download, no code execution) and cached.

## Security review (before vendoring)
- No network / sockets / urllib / requests / subprocess / os.system / os.popen.
- No pickle / marshal / base64 / compile / file writes or deletes.
- `import os` is used only for `os.path.expanduser`/`os.path.join` to build the
  author's default *training* weight paths; with `bb_pretrained=False` they are
  never read.
- `eval(...)` calls instantiate **hardcoded internal class names** (e.g.
  `BasicDecBlk`, `swin_v1_l`) from the model's own Config defaults — not external
  input. Ugly but not a code-execution vector with our fixed config.

We instantiate `BiRefNet(bb_pretrained=False)` and `load_state_dict` from the
safetensors weights — see `train/birefnet_model.py`.
