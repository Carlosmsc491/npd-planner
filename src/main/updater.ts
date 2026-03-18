// src/main/updater.ts
// Auto-updater configuration using electron-updater

import { autoUpdater } from 'electron-updater'
import { BrowserWindow, ipcMain, app } from 'electron'
import { IPC } from '../shared/constants'

export function setupAutoUpdater(mainWindow: BrowserWindow): void {
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
      console.warn('[Updater] checkForUpdates failed (expected in dev):', err.message)
    })
  }, 10_000)

  // Re-check every 4 hours while the app is open
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => { /* silent */ })
  }, 4 * 60 * 60 * 1000)

  console.log(`[Updater] Configured. Current version: ${app.getVersion()}`)
}
