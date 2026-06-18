// src/main/ipc/photoshopHandlers.ts
// Drive Photoshop for the Photo Manager round-trip edit (Mac-only):
//   • photoshop:open       → open a file in Photoshop for manual editing
//   • photoshop:save-return → scripted saveAs PNG to the SAME path (no dialog),
//                             so the app can pick the edited image straight back up
// Pattern mirrors tools/bg-removal/train/photoshop_retouch.py (osascript →
// `do javascript` with displayDialogs = NO so the PNG-options dialog never blocks).

import { ipcMain } from 'electron'
import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const IS_MAC = process.platform === 'darwin'
const DEFAULT_APP = 'Adobe Photoshop (Beta)'

/** Escape a POSIX path for embedding inside a single-quoted ExtendScript string. */
function jsxStr(p: string): string {
  return p.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

/** Run an ExtendScript snippet in Photoshop via osascript, waiting for it to finish. */
function runJsx(appName: string, jsx: string, timeoutSec = 600): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const jsxFile = path.join(os.tmpdir(), `npd-ps-${Date.now()}.jsx`)
    fs.writeFileSync(jsxFile, jsx, 'utf8')
    const osa =
      `with timeout of ${timeoutSec} seconds\n` +
      `tell application "${appName}"\nactivate\ndo javascript file "${jsxFile}"\nend tell\n` +
      `end timeout`
    const child = spawn('osascript', ['-e', osa])
    let stderr = ''
    child.stderr.on('data', (d) => { stderr += d.toString() })
    child.on('error', (err) => { try { fs.rmSync(jsxFile, { force: true }) } catch { /* */ } ; resolve({ ok: false, error: err.message }) })
    child.on('exit', (code) => {
      try { fs.rmSync(jsxFile, { force: true }) } catch { /* */ }
      resolve(code === 0 ? { ok: true } : { ok: false, error: stderr.trim() || `Photoshop script exited ${code}` })
    })
  })
}

export function registerPhotoshopHandlers(): void {
  // Open a file in Photoshop for the user to edit by hand.
  ipcMain.handle(
    'photoshop:open',
    async (_e, { filePath, app }: { filePath: string; app?: string }): Promise<{ ok: boolean; error?: string }> => {
      if (!IS_MAC) return { ok: false, error: 'Mac only.' }
      if (!fs.existsSync(filePath)) return { ok: false, error: 'File not found.' }
      const jsx = `app.open(new File('${jsxStr(filePath)}'));`
      return runJsx(app || DEFAULT_APP, jsx, 120)
    },
  )

  // Save the edited document back to the SAME path as a PNG (transparency kept),
  // with no save dialog. Finds the open doc by path; falls back to the active doc.
  ipcMain.handle(
    'photoshop:save-return',
    async (_e, { filePath, close, app }: { filePath: string; close?: boolean; app?: string }): Promise<{ ok: boolean; error?: string }> => {
      if (!IS_MAC) return { ok: false, error: 'Mac only.' }
      const p = jsxStr(filePath)
      const jsx = `
        var prev = app.displayDialogs;
        app.displayDialogs = DialogModes.NO;
        try {
          var target = null;
          for (var i = 0; i < app.documents.length; i++) {
            try { if (app.documents[i].fullName.fsName == new File('${p}').fsName) { target = app.documents[i]; break; } } catch (e) {}
          }
          if (!target && app.documents.length > 0) target = app.activeDocument;
          if (!target) throw new Error('No open document to save.');
          app.activeDocument = target;
          var opt = new PNGSaveOptions();
          target.saveAs(new File('${p}'), opt, true, Extension.LOWERCASE);
          ${'' /* keep open by default so the user can keep tweaking */}
          if (${close ? 'true' : 'false'}) target.close(SaveOptions.DONOTSAVECHANGES);
        } finally {
          app.displayDialogs = prev;
        }
      `
      const res = await runJsx(app || DEFAULT_APP, jsx, 300)
      if (res.ok && !fs.existsSync(filePath)) return { ok: false, error: 'Save did not produce the file.' }
      return res
    },
  )
}
