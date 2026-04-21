/**
 * cameraHandlers.ts
 * IPC handlers for the photo capture module (gphoto2 tethering)
 * Mac only — Fase 1
 */

import { ipcMain, BrowserWindow } from 'electron'
import { cameraManager } from '../camera/CameraManager'

export function registerCameraHandlers(mainWindow: BrowserWindow): void {

  // Renderer asks: is there a camera connected?
  ipcMain.handle('camera:check-connection', async () => {
    return await cameraManager.checkConnection()
  })

  // Renderer requests tethering start
  ipcMain.handle('camera:start-tethering', async (_event, outputDir: string) => {
    return await cameraManager.startTethering(outputDir)
  })

  // Renderer requests tethering stop
  ipcMain.handle('camera:stop-tethering', async () => {
    await cameraManager.stopTethering()
  })

  // Forward photo-received events to renderer
  cameraManager.on('photo-received', (event: { tempPath: string; filename: string }) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('camera:photo-received', event)
    }
  })

  // Poll camera connection every 10 seconds, notify renderer on change
  let lastStatus = { connected: false, model: null as string | null }
  const pollInterval = setInterval(async () => {
    if (mainWindow.isDestroyed()) {
      clearInterval(pollInterval)
      return
    }
    const status = await cameraManager.checkConnection()
    if (status.connected !== lastStatus.connected || status.model !== lastStatus.model) {
      lastStatus = status
      mainWindow.webContents.send('camera:status-changed', status)
    }
  }, 10_000)
}
