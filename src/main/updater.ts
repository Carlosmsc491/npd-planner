// src/main/updater.ts
// Auto-updater configuration using electron-updater

import { autoUpdater } from 'electron-updater'
import { BrowserWindow } from 'electron'
import { IPC } from '../shared/constants'

export function setupAutoUpdater(mainWindow: BrowserWindow): void {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', () => {
    mainWindow.webContents.send(IPC.UPDATE_AVAILABLE)
  })

  autoUpdater.on('update-downloaded', () => {
    mainWindow.webContents.send(IPC.UPDATE_DOWNLOADED)
  })

  autoUpdater.on('error', (err) => {
    console.error('Auto-updater error:', err)
  })

  // Check for updates (will fail silently in dev — no publish config)
  autoUpdater.checkForUpdatesAndNotify().catch(() => {
    // Expected to fail in dev environment
  })
}
