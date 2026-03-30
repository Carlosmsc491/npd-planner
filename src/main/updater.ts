// src/main/updater.ts
// Auto-updater configuration using electron-updater
// Current version: 1.2.2 — bump package.json version before every release build

import { autoUpdater } from 'electron-updater'
import { BrowserWindow, ipcMain, app } from 'electron'
import { IPC } from '../shared/constants'

export function setupAutoUpdater(mainWindow: BrowserWindow): void {
  // Only run auto-updater in production builds — skip in dev to avoid noise
  if (!app.isPackaged) {
    console.log('[Updater] Skipping — running in development mode')
    return
  }

  // Log update events to console (electron-log can be added if needed)
  autoUpdater.logger = console

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    console.log(`[Updater] New version available: ${info.version}`)
    mainWindow.webContents.send(IPC.UPDATE_AVAILABLE)
  })

  autoUpdater.on('update-downloaded', (info) => {
    console.log(`[Updater] Version ${info.version} downloaded — ready to install`)
    mainWindow.webContents.send(IPC.UPDATE_DOWNLOADED)
  })

  autoUpdater.on('error', (err) => {
    console.error('[Updater] Error:', err.message)
  })

  // Renderer can request immediate restart to apply update
  ipcMain.on('app:restart-to-update', () => {
    autoUpdater.quitAndInstall()
  })

  // Check for updates 10 seconds after launch to avoid slowing startup
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.warn('[Updater] checkForUpdates failed:', err.message)
    })
  }, 10_000)

  // Re-check every 4 hours while the app is open
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => { /* silent */ })
  }, 4 * 60 * 60 * 1000)

  console.log(`[Updater] Configured. Current version: ${app.getVersion()}`)
}

// ── RELEASE CHECKLIST (run before every release) ──────────────────────────
// 1. Bump version in package.json
// 2. Run: npm run build:win
// 3. Check dist-electron/ contains: latest.yml + npd-planner-X.Y.Z-setup.exe
// 4. Go to GitHub → Releases → Create new release → tag vX.Y.Z
// 5. Upload BOTH files: latest.yml AND the .exe installer
// 6. Set release as "Latest release" (not draft, not pre-release)
// 7. Publish — installed apps will detect update within 10 seconds of next launch
// ─────────────────────────────────────────────────────────────────────────
