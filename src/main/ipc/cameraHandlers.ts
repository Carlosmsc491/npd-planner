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

export function registerCameraHandlers(mainWindow: BrowserWindow): void {
  // Keep the initial reference but prefer dynamic lookup for push events
  void mainWindow

  // Renderer asks: is there a camera connected?
  ipcMain.handle('camera:check-connection', async () => {
    return await cameraManager.checkConnection()
  })

  // Renderer requests tethering start
  ipcMain.handle('camera:start-tethering', async (_event, outputDir: string) => {
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

  // Direct file copy for camera photos — no SharePoint path validation
  ipcMain.handle('camera:copy-file', async (
    _event,
    sourcePath: string,
    destPath: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      fs.mkdirSync(path.dirname(destPath), { recursive: true })
      fs.copyFileSync(sourcePath, destPath)
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // Copy a photo to the SELECTED/ folder
  ipcMain.handle('photo:copy-to-selected', async (
    _event,
    { sourcePath, destPath }: { sourcePath: string; destPath: string }
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      fs.mkdirSync(path.dirname(destPath), { recursive: true })
      fs.copyFileSync(sourcePath, destPath)
      return { success: true }
    } catch (err) {
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
      fs.mkdirSync(path.dirname(destJpg), { recursive: true })
      await sharp(sourcePng).jpeg({ quality: quality ?? 90 }).toFile(destJpg)
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
          await new Promise<void>((resolve, reject) => {
            // Pass paths as separate arguments to avoid command injection via destZipPath.
            // PowerShell -Command receives them as $args[0] and $args[1] so no quoting needed.
            const srcGlob = path.join(tmpDir, '*')
            const ps = spawn('powershell', [
              '-NoProfile', '-NonInteractive',
              '-Command', 'Compress-Archive -Path $args[0] -DestinationPath $args[1] -Force',
              '-args', srcGlob, destZipPath,
            ])
            ps.on('close', code =>
              code === 0 ? resolve() : reject(new Error(`PowerShell exit ${code}`))
            )
          })
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

  // Poll camera connection every 10 seconds, notify renderer on change
  let lastStatus = { connected: false, model: null as string | null }
  const pollInterval = setInterval(async () => {
    const win = getWindow()
    if (!win) { clearInterval(pollInterval); return }
    const status = await cameraManager.checkConnection()
    if (status.connected !== lastStatus.connected || status.model !== lastStatus.model) {
      lastStatus = status
      win.webContents.send('camera:status-changed', status)
    }
  }, 10_000)
}
