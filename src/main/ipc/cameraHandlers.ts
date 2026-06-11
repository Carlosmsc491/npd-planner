/**
 * cameraHandlers.ts
 * IPC handlers for the photo capture module (gphoto2 tethering)
 * Mac only — Fase 1
 */

import { ipcMain, BrowserWindow, dialog } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { spawn } from 'child_process'
import { cameraManager } from '../camera/CameraManager'

/** Always resolve to the current active BrowserWindow — avoids stale references. */
function getWindow(): BrowserWindow | null {
  const wins = BrowserWindow.getAllWindows()
  return wins.find(w => !w.isDestroyed()) ?? null
}

export function registerCameraHandlers(): void {

  // Renderer asks: is there a camera connected?
  ipcMain.handle('camera:check-connection', async () => {
    return await cameraManager.checkConnection()
  })

  // Renderer requests tethering start
  ipcMain.handle('camera:start-tethering', async (_event, outputDir: string) => {
    // Purge stale temp captures (>48h) — DSLR JPEGs are 15-25MB each and this
    // folder was never cleaned, growing by gigabytes over time.
    try {
      if (fs.existsSync(outputDir)) {
        const cutoff = Date.now() - 48 * 60 * 60 * 1000
        for (const name of fs.readdirSync(outputDir)) {
          const p = path.join(outputDir, name)
          try {
            const st = fs.statSync(p)
            if (st.isFile() && st.mtimeMs < cutoff) fs.unlinkSync(p)
          } catch { /* skip busy/missing files */ }
        }
      }
    } catch { /* cleanup is best-effort */ }
    return await cameraManager.startTethering(outputDir)
  })

  // Renderer queries whether tethering is already running
  ipcMain.handle('camera:is-tethering', () => {
    return cameraManager.isTethering()
  })

  // Renderer requests tethering stop
  ipcMain.handle('camera:stop-tethering', async () => {
    await cameraManager.stopTethering()
  })

  // Direct file copy for camera photos — no SharePoint path validation.
  // Atomic (tmp + rename, so a crash can't leave a truncated JPG) and
  // exclusive (refuses to overwrite an existing photo — sequence collisions
  // must surface as errors, not silent data loss).
  ipcMain.handle('camera:copy-file', async (
    _event,
    sourcePath: string,
    destPath: string
  ): Promise<{ success: boolean; error?: string }> => {
    const tmpPath = `${destPath}.tmp-${process.pid}`
    try {
      if (fs.existsSync(destPath)) {
        return { success: false, error: `EEXIST: a photo named "${path.basename(destPath)}" already exists` }
      }
      await fs.promises.mkdir(path.dirname(destPath), { recursive: true })
      await fs.promises.copyFile(sourcePath, tmpPath)
      await fs.promises.rename(tmpPath, destPath)
      return { success: true }
    } catch (err) {
      try { await fs.promises.unlink(tmpPath) } catch { /* ignore */ }
      return { success: false, error: String(err) }
    }
  })

  // Copy a photo to the SELECTED/ folder (atomic: tmp + rename, overwrite OK)
  ipcMain.handle('photo:copy-to-selected', async (
    _event,
    { sourcePath, destPath }: { sourcePath: string; destPath: string }
  ): Promise<{ success: boolean; error?: string }> => {
    const tmpPath = `${destPath}.tmp-${process.pid}`
    try {
      await fs.promises.mkdir(path.dirname(destPath), { recursive: true })
      await fs.promises.copyFile(sourcePath, tmpPath)
      // Windows rename fails when the destination exists — remove it first
      await fs.promises.rm(destPath, { force: true })
      await fs.promises.rename(tmpPath, destPath)
      return { success: true }
    } catch (err) {
      try { await fs.promises.unlink(tmpPath) } catch { /* ignore */ }
      return { success: false, error: String(err) }
    }
  })

  // Delete a photo from the SELECTED/ folder (best-effort — missing file is not an error)
  ipcMain.handle('photo:delete-from-selected', async (
    _event,
    { filePath }: { filePath: string }
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // Convert PNG to JPG using sharp (Fase 3 — READY tab)
  ipcMain.handle('photo:convert-png-to-jpg', async (
    _event,
    { sourcePng, destJpg, quality }: { sourcePng: string; destJpg: string; quality?: number }
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const sharp = require('sharp')
      await fs.promises.mkdir(path.dirname(destJpg), { recursive: true })
      await sharp(sourcePng)
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .jpeg({ quality: quality ?? 90 })
        .toFile(destJpg)
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // Watch Folder mode (used when gphoto2 tethering is unavailable)
  ipcMain.handle('camera:start-folder-watch', (_event, watchPath: string) => {
    return cameraManager.startFolderWatch(watchPath)
  })

  ipcMain.handle('camera:stop-folder-watch', async () => {
    await cameraManager.stopFolderWatch()
  })

  // ── Photo export helpers ───────────────────────────────────────────────────

  /** Copy selected photos to a user-chosen folder, maintaining the provided subfolder structure. */
  ipcMain.handle(
    'photo:save-as',
    async (
      _event,
      entries: { srcPath: string; archivePath: string }[],
      destFolder: string
    ): Promise<{ success: boolean; errors: string[] }> => {
      const errors: string[] = []
      for (const { srcPath, archivePath } of entries) {
        try {
          const destPath = path.join(destFolder, archivePath)
          fs.mkdirSync(path.dirname(destPath), { recursive: true })
          fs.copyFileSync(srcPath, destPath)
        } catch (err) {
          errors.push(`${path.basename(srcPath)}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
      return { success: errors.length === 0, errors }
    }
  )

  /** Show a native Save File dialog and return the chosen path (or null if cancelled). */
  ipcMain.handle(
    'photo:show-save-dialog',
    async (event, defaultFilename: string): Promise<string | null> => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return null
      const result = await dialog.showSaveDialog(win, {
        defaultPath: defaultFilename,
        filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
        title: 'Save Photos as ZIP',
        buttonLabel: 'Create ZIP',
      })
      return result.canceled ? null : (result.filePath ?? null)
    }
  )

  /** Create a ZIP archive of the provided entries at destZipPath. */
  ipcMain.handle(
    'photo:export-zip',
    async (
      _event,
      entries: { srcPath: string; archivePath: string }[],
      destZipPath: string
    ): Promise<{ success: boolean; error?: string }> => {
      const tmpDir = path.join(os.tmpdir(), `npd-photos-${Date.now()}`)
      try {
        fs.mkdirSync(tmpDir, { recursive: true })

        // Stage files in temp dir with the requested folder structure
        for (const { srcPath, archivePath } of entries) {
          const stagePath = path.join(tmpDir, archivePath)
          fs.mkdirSync(path.dirname(stagePath), { recursive: true })
          fs.copyFileSync(srcPath, stagePath)
        }

        // Ensure destination directory exists
        fs.mkdirSync(path.dirname(destZipPath), { recursive: true })

        // Use platform-native zip tooling
        if (process.platform === 'win32') {
          // A temp -File script with param() is the only reliable way to pass
          // arbitrary paths: the previous '-Command ... -args' invocation is
          // not valid PowerShell syntax (Compress-Archive received an unknown
          // -args parameter) and the export failed.
          const psScript = [
            'param([string]$Src, [string]$Dest)',
            '$ErrorActionPreference = "Stop"',
            'Compress-Archive -Path $Src -DestinationPath $Dest -Force',
          ].join('\r\n')
          const psFile = path.join(os.tmpdir(), `npd-zip-${Date.now()}.ps1`)
          fs.writeFileSync(psFile, psScript, 'utf8')
          try {
            await new Promise<void>((resolve, reject) => {
              const srcGlob = path.join(tmpDir, '*')
              const ps = spawn('powershell', [
                '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
                '-File', psFile, srcGlob, destZipPath,
              ])
              let stderr = ''
              ps.stderr?.on('data', (d: Buffer) => { stderr += d.toString() })
              ps.on('close', code =>
                code === 0 ? resolve() : reject(new Error(`PowerShell exit ${code}: ${stderr.trim()}`))
              )
            })
          } finally {
            try { fs.unlinkSync(psFile) } catch { /* ignore */ }
          }
        } else {
          // `zip` is a macOS built-in (/usr/bin/zip) — always present on the only non-Windows platform this app targets.
          await new Promise<void>((resolve, reject) => {
            const proc = spawn('zip', ['-r', destZipPath, '.'], { cwd: tmpDir })
            proc.on('close', code =>
              code === 0 ? resolve() : reject(new Error(`zip exit ${code}`))
            )
          })
        }

        return { success: true }
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) }
      } finally {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch { /* best-effort */ }
      }
    }
  )

  // Forward photo-received events to renderer
  cameraManager.on('photo-received', (event: { tempPath: string; filename: string }) => {
    console.log('[cameraHandlers] photo-received →', event.filename)
    const win = getWindow()
    if (win) {
      win.webContents.send('camera:photo-received', event)
    } else {
      console.warn('[cameraHandlers] no active window, cannot send photo-received')
    }
  })

  // Forward gphoto2 log lines to renderer (shown in CapturePage console area)
  cameraManager.on('log', (msg: string) => {
    const win = getWindow()
    if (win) win.webContents.send('camera:log', msg)
  })

  // Forward tethering errors to renderer
  cameraManager.on('tethering-error', (msg: string) => {
    const win = getWindow()
    if (win) win.webContents.send('camera:tethering-error', msg)
  })

  // Poll camera connection every 10 seconds, notify renderer on change.
  // Skipped while tethering: spawning `gphoto2 --auto-detect` probes the USB
  // bus and can interfere with the active gphoto2 capture session.
  let lastStatus = { connected: false, model: null as string | null }
  const pollInterval = setInterval(async () => {
    const win = getWindow()
    if (!win) { clearInterval(pollInterval); return }
    if (cameraManager.isTethering()) return
    const status = await cameraManager.checkConnection()
    if (status.connected !== lastStatus.connected || status.model !== lastStatus.model) {
      lastStatus = status
      win.webContents.send('camera:status-changed', status)
    }
  }, 10_000)
}
