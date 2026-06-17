#!/usr/bin/env python3
"""
monitor_server.py — live training dashboard in the browser.

Reads runs/status.json (written each epoch by refine_train.py) and shows progress,
metrics, ETA and the latest QC montage. Auto-refreshes.

    python train/monitor_server.py          # then open http://localhost:8800
"""
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

RUNS = Path(__file__).resolve().parent.parent / "runs"
PORT = 8800


def fmt(s: int) -> str:
    s = int(s)
    h, m = s // 3600, (s % 3600) // 60
    return f"{h}h {m}m" if h else f"{m}m {s % 60}s"


def page() -> bytes:
    sp = RUNS / "status.json"
    if not sp.exists():
        body = "<h2>Esperando a que arranque el entrenamiento…</h2>"
        return wrap(body)
    s = json.loads(sp.read_text())
    pct = 100 * s["epoch"] / max(1, s["total"])
    done = s.get("done")
    head = ("✅ Entrenamiento TERMINADO" if done
            else f"🟢 Entrenando — época {s['epoch']} / {s['total']}")
    qc = s.get("latest_qc", "")
    qc_html = (f'<img src="/qc?ts={s["epoch"]}" alt="QC"/>' if qc
               else "<p>(aún sin QC; primer QC en la época 10)</p>")
    cards = "".join(card(k, v) for k, v in [
        ("Best IoU", f'{s["best_iou"]:.4f} <small>(ep {s["best_epoch"]})</small>'),
        ("Última IoU", f'{s["last_iou"]:.4f}'),
        ("MAE", f'{s["last_mae"]:.4f}'),
        ("Loss", f'{s["loss"]:.4f}'),
        ("Transcurrido", fmt(s["elapsed_s"])),
        ("Falta (ETA)", fmt(s["eta_s"]) if not done else "—"),
        ("Seg/época", f'{s["sec_per_epoch"]}s'),
        ("Modelo", f'{s["encoder"]} @{s["img_size"]}'),
    ])
    body = f"""
      <h2>{head}</h2>
      <div class="bar"><div class="fill" style="width:{pct:.1f}%">{pct:.0f}%</div></div>
      <p class="sub">{s['n_train']} train · {s['n_val']} val</p>
      <div class="grid">{cards}</div>
      <h3>Último QC (original | birefnet | quitar | corregido | ground-truth)</h3>
      {qc_html}
    """
    return wrap(body, done)


def card(label: str, value: str) -> str:
    return f'<div class="c"><div class="l">{label}</div><div class="v">{value}</div></div>'


def wrap(body: str, done: bool = False) -> bytes:
    refresh = "" if done else '<meta http-equiv="refresh" content="15">'
    html = f"""<!doctype html><html><head><meta charset="utf-8">{refresh}
    <title>NPD · Entrenamiento</title><style>
    body{{font-family:-apple-system,system-ui,sans-serif;background:#0f1115;color:#e8e8e8;margin:0;padding:24px;max-width:1100px;margin:auto}}
    h2{{font-weight:600}} .sub{{color:#9aa}}
    .bar{{background:#23262d;border-radius:10px;overflow:hidden;height:30px;margin:10px 0}}
    .fill{{background:linear-gradient(90deg,#1D9E75,#3bd5a8);color:#021;font-weight:700;text-align:center;line-height:30px;white-space:nowrap}}
    .grid{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:16px 0}}
    .c{{background:#1a1d24;border:1px solid #262a33;border-radius:10px;padding:12px}}
    .l{{color:#8a93a3;font-size:12px;text-transform:uppercase;letter-spacing:.04em}}
    .v{{font-size:22px;font-weight:700;margin-top:4px}} small{{color:#8a93a3;font-weight:400}}
    img{{width:100%;border-radius:10px;border:1px solid #262a33}}
    </style></head><body>{body}<p class="sub">Se actualiza solo cada 15s.</p></body></html>"""
    return html.encode("utf-8")


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):  # quiet
        pass

    def do_GET(self):
        if self.path.startswith("/qc"):
            try:
                s = json.loads((RUNS / "status.json").read_text())
                data = (RUNS / s["latest_qc"]).read_bytes()
                self.send_response(200); self.send_header("Content-Type", "image/jpeg")
                self.send_header("Cache-Control", "no-store"); self.end_headers()
                self.wfile.write(data)
            except Exception:
                self.send_response(404); self.end_headers()
            return
        self.send_response(200); self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(page())


if __name__ == "__main__":
    print(f"Dashboard en http://localhost:{PORT}  (Ctrl+C para cerrar)")
    HTTPServer(("127.0.0.1", PORT), H).serve_forever()
