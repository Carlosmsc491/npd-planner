#!/usr/bin/env python3
"""
studio_worker.py — persistent bg-removal worker for Photo Studio.

Loads BiRefNet + Refiner once at startup, then processes jobs from stdin
until the pipe closes. One JSON object per line on stdin/stdout.

  → {"id": "abc", "input": "/abs/photo.jpg", "output": "/abs/out.png"}
  ← {"ready": true}                                  (after models loaded)
  ← {"id": "abc", "ok": true, "output": "/abs/out.png"}
  ← {"id": "abc", "ok": false, "error": "..."}
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))

import torch
from infer import process, load_refiner, default_args
from birefnet_model import load_birefnet

ROOT = HERE.parent

# Pipeline parameters come straight from infer.py's single source of truth, so the
# warm worker and `python infer.py` can never drift. Retune in infer.DEFAULTS only.
ARGS = default_args()


def emit(obj: dict) -> None:
    print(json.dumps(obj), flush=True)


def main() -> None:
    ckpt = ROOT / "checkpoints" / "refiner_best.pt"
    if not ckpt.exists():
        emit({"error": f"Checkpoint not found: {ckpt}"})
        sys.exit(1)

    device = "mps" if torch.backends.mps.is_available() else "cpu"

    birefnet = load_birefnet(device=device)
    birefnet.eval()
    refiner, ref_size = load_refiner(ckpt, device)

    emit({"ready": True})

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            job = json.loads(line)
        except json.JSONDecodeError:
            continue

        job_id = job.get("id", "")
        inp = Path(job.get("input", ""))
        out = Path(job.get("output", ""))

        try:
            out.parent.mkdir(parents=True, exist_ok=True)
            with torch.no_grad():
                result = process(inp, birefnet, refiner, ref_size, device, ARGS)
            result.save(str(out), dpi=(ARGS.dpi, ARGS.dpi))
            if device == "mps":
                torch.mps.empty_cache()
            emit({"id": job_id, "ok": True, "output": str(out)})
        except Exception as e:
            emit({"id": job_id, "ok": False, "error": str(e)})


if __name__ == "__main__":
    main()
