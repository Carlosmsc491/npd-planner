#!/usr/bin/env python3
"""
photoshop_retouch.py — drive Photoshop to apply a recorded Action (Camera Raw
'RETOUCH') to every cutout PNG, preserving transparency.

Generates an ExtendScript (.jsx) with the folders + action/set baked in, then
tells Photoshop to run it via AppleScript. Output PNGs keep their alpha.

    python train/photoshop_retouch.py --action "ACTION" --set "SET" \
        --app "Adobe Photoshop (Beta)" --in ../batch_out --out ../retocados

NOTE: the first run, macOS will ask permission to control Photoshop — approve it.
"""
import argparse
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

JSX = r'''#target photoshop
(function () {
  var prevDlg = app.displayDialogs;
  app.displayDialogs = DialogModes.NO;   // no Camera Raw / save dialogs -> no hang
  var inF = new Folder(%(indir)s);
  var outF = new Folder(%(outdir)s);
  if (!outF.exists) outF.create();
  var files = inF.getFiles(/\.png$/i);
  var n = 0;
  for (var i = 0; i < files.length; i++) {
    if (!(files[i] instanceof File)) continue;
    var doc = app.open(files[i]);
    try { app.doAction(%(action)s, %(set)s); } catch (e) {}
    var base = doc.name.replace(/\.[^.]+$/, "");
    var out = new File(outF.fsName + "/" + base + ".png");
    var opt = new PNGSaveOptions();
    doc.saveAs(out, opt, true, Extension.LOWERCASE);
    doc.close(SaveOptions.DONOTSAVECHANGES);
    n++;
  }
  app.displayDialogs = prevDlg;
  return "OK " + n;
})();
'''


def q(s: str) -> str:
    return '"' + str(s).replace("\\", "\\\\").replace('"', '\\"') + '"'


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--action", required=True, help="Action name as in the Actions panel")
    ap.add_argument("--set", required=True, help="Action SET (folder) name")
    ap.add_argument("--app", default="Adobe Photoshop (Beta)", help="Photoshop app name")
    ap.add_argument("--in", dest="inp", type=Path, default=ROOT / "batch_out")
    ap.add_argument("--out", type=Path, default=ROOT / "retocados")
    args = ap.parse_args()

    jsx = JSX % {"indir": q(args.inp.resolve()), "outdir": q(args.out.resolve()),
                 "action": q(args.action), "set": q(args.set)}
    f = Path(tempfile.gettempdir()) / "npd_retouch.jsx"
    f.write_text(jsx)

    # `with timeout` so AppleScript waits for Photoshop to finish the whole batch
    osa = (f'with timeout of 7200 seconds\n'
           f'tell application "{args.app}"\nactivate\n'
           f'do javascript file "{f}"\nend tell\nend timeout')
    print(f"Ejecutando '{args.action}' (set '{args.set}') en {args.app} sobre {args.inp} …")
    r = subprocess.run(["osascript", "-e", osa], capture_output=True, text=True)
    if r.returncode != 0:
        print("ERROR:", r.stderr.strip(), file=sys.stderr)
        return 1
    print("Photoshop:", r.stdout.strip() or "(sin salida)")
    print(f"Retocados en: {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
