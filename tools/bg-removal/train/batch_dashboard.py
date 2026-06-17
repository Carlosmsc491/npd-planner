#!/usr/bin/env python3
"""
batch_dashboard.py — professional LIVE dashboard for batch_run.py.

Polls batch_out/_status.json and shows a real progress bar, %, ETA, the actual
current step, and a growing grid of finished previews. Smooth JS polling (no
flicker, no fake steps).

    python train/batch_dashboard.py     # open http://localhost:8801
"""
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "batch_out"
PORT = 8801

PAGE = """<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>NPD · Recorte de fondo — Lote en vivo</title>
<style>
:root{--bg:#0e1014;--card:#171a21;--bord:#252a33;--muted:#8a93a3;--accent:#1D9E75;--accent2:#3bd5a8}
*{box-sizing:border-box} body{font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;
background:var(--bg);color:#e9edf2;margin:0;padding:28px;max-width:1280px;margin:auto}
.top{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:18px}
h1{font-size:20px;font-weight:700;margin:0;letter-spacing:.2px}
h1 span{color:var(--accent2)}
.pill{padding:6px 14px;border-radius:999px;font-weight:700;font-size:13px}
.pill.run{background:rgba(29,158,117,.18);color:var(--accent2);border:1px solid rgba(59,213,168,.35)}
.pill.done{background:rgba(59,213,168,.22);color:#bff5e3}
.bar{background:#1c2129;border:1px solid var(--bord);border-radius:12px;height:34px;overflow:hidden;position:relative}
.bar .fill{height:100%;background:linear-gradient(90deg,var(--accent),var(--accent2));
transition:width .5s ease;display:flex;align-items:center;justify-content:flex-end;padding-right:12px;
color:#04140d;font-weight:800;min-width:42px}
.sub{color:var(--muted);font-size:13px;margin:6px 2px 0}
.now{background:var(--card);border:1px solid var(--bord);border-radius:14px;padding:16px 18px;margin:16px 0}
.now .lbl{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.06em}
.now .step{font-size:17px;font-weight:600;margin-top:6px;display:flex;align-items:center;gap:10px}
.spin{width:14px;height:14px;border:2px solid #2c333f;border-top-color:var(--accent2);border-radius:50%;
animation:s .8s linear infinite;display:inline-block} @keyframes s{to{transform:rotate(360deg)}}
.sbar{height:7px;background:#1c2129;border-radius:6px;overflow:hidden;margin-top:10px}
.sbar i{display:block;height:100%;background:var(--accent2);transition:width .4s ease}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:16px 0}
.s{background:var(--card);border:1px solid var(--bord);border-radius:12px;padding:12px 14px}
.s .l{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.05em}
.s .v{font-size:23px;font-weight:800;margin-top:3px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:14px;margin-top:8px}
.card{background:var(--card);border:1px solid var(--bord);border-radius:12px;overflow:hidden;
animation:in .4s ease} @keyframes in{from{opacity:0;transform:translateY(8px)}to{opacity:1}}
.card img{width:100%;display:block;aspect-ratio:1/1;object-fit:cover;background:#222}
.card .meta{display:flex;justify-content:space-between;align-items:center;padding:8px 10px;gap:8px}
.card .nm{font-size:12px;color:#cdd5df;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.card .t{font-size:11px;color:var(--accent2);font-weight:700;white-space:nowrap}
.card.err{border-color:#7a2a2a} .card.err .t{color:#ff8a8a}
h2{font-size:14px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin:18px 2px 10px}
.empty{color:var(--muted);padding:30px;text-align:center}
</style></head><body>
<div class="top"><h1>NPD · Recorte de fondo <span>— lote en vivo</span></h1>
<div id="pill" class="pill run">Iniciando…</div></div>
<div class="bar"><div id="fill" class="fill" style="width:0%">0%</div></div>
<div id="subline" class="sub"></div>
<div class="now"><div class="lbl">Ahora</div>
  <div id="step" class="step"><span class="spin"></span><span>Preparando…</span></div>
  <div class="sbar"><i id="sfill" style="width:0%"></i></div></div>
<div class="stats">
  <div class="s"><div class="l">Procesadas</div><div id="st_done" class="v">0</div></div>
  <div class="s"><div class="l">Transcurrido</div><div id="st_el" class="v">0s</div></div>
  <div class="s"><div class="l">Falta (ETA)</div><div id="st_eta" class="v">—</div></div>
  <div class="s"><div class="l">Promedio/foto</div><div id="st_avg" class="v">—</div></div>
</div>
<h2>Resultados</h2>
<div id="grid" class="grid"><div class="empty">Esperando primeras fotos…</div></div>
<script>
function fmt(s){s=Math.round(s);let h=(s/3600)|0,m=((s%3600)/60)|0,x=s%60;
return h?`${h}h ${m}m`:(m?`${m}m ${x}s`:`${x}s`)}
async function tick(){
 let r; try{r=await (await fetch('/api/status?'+Date.now())).json()}catch(e){return}
 const pct = r.total? Math.round(100*r.done/r.total):0;
 const f=document.getElementById('fill'); f.style.width=pct+'%'; f.textContent=pct+'%';
 document.getElementById('subline').textContent=`${r.done} / ${r.total} fotos`;
 const pill=document.getElementById('pill');
 if(r.finished){pill.className='pill done';pill.textContent='✅ Completado';
   document.getElementById('step').innerHTML='<span>Listo — todas las fotos procesadas.</span>';
   document.getElementById('sfill').style.width='100%';}
 else{pill.className='pill run';pill.textContent='Procesando';
   const c=r.current||{};
   document.getElementById('step').innerHTML='<span class="spin"></span><span>'+
     (c.index?`Foto ${c.index}/${r.total}: ${c.name||''} — `:'')+(c.step||'…')+'</span>';
   document.getElementById('sfill').style.width=(c.step_pct||0)+'%';}
 document.getElementById('st_done').textContent=r.done+' / '+r.total;
 document.getElementById('st_el').textContent=fmt(r.elapsed_s||0);
 document.getElementById('st_eta').textContent=r.finished?'—':fmt(r.eta_s||0);
 document.getElementById('st_avg').textContent=r.avg_s?fmt(r.avg_s):'—';
 const g=document.getElementById('grid');
 if(r.items&&r.items.length){
   g.innerHTML=r.items.map(it=>{
     if(it.error) return `<div class="card err"><div class="meta"><span class="nm">${it.name}</span><span class="t">error</span></div></div>`;
     return `<div class="card"><img loading="lazy" src="/thumb/${encodeURIComponent(it.thumb.split('/').pop())}"><div class="meta"><span class="nm">${it.name}</span><span class="t">${it.seconds}s</span></div></div>`;
   }).join('');
 }
}
tick(); setInterval(tick, 1500);
</script></body></html>"""


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        if self.path.startswith("/api/status"):
            p = OUT / "_status.json"
            data = p.read_bytes() if p.exists() else b'{"total":0,"done":0,"items":[]}'
            self.send_response(200); self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store"); self.end_headers()
            self.wfile.write(data); return
        if self.path.startswith("/thumb/"):
            from urllib.parse import unquote
            fn = unquote(self.path.split("/thumb/", 1)[1].split("?")[0])
            f = OUT / "_thumbs" / fn
            if f.exists():
                self.send_response(200); self.send_header("Content-Type", "image/jpeg")
                self.send_header("Cache-Control", "max-age=3600"); self.end_headers()
                self.wfile.write(f.read_bytes())
            else:
                self.send_response(404); self.end_headers()
            return
        self.send_response(200); self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers(); self.wfile.write(PAGE.encode("utf-8"))


if __name__ == "__main__":
    print(f"Dashboard del lote: http://localhost:{PORT}")
    HTTPServer(("127.0.0.1", PORT), H).serve_forever()
