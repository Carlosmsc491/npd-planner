import { app, BrowserWindow, ipcMain } from 'electron'
import { setupAutoUpdater } from './updater'
import { join } from 'path'
import { registerFileHandlers } from './ipc/fileHandlers'
import { registerNotificationHandlers } from './ipc/notificationHandlers'
import { startTrazeIntegration, stopTrazeIntegration } from './services/trazeIntegrationService'
import { registerAwbIpcHandlers } from './ipc/awbIpcHandlers'

const isDev = process.env.NODE_ENV === 'development' || !!process.env.ELECTRON_RENDERER_URL

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false,
    },
  })
  win.on('ready-to-show', () => win.show())
  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

app.whenReady().then(() => {
  registerFileHandlers(ipcMain)
  registerNotificationHandlers(ipcMain)
  registerAwbIpcHandlers()

  const mainWindow = createWindow()

  // Iniciar integración Traze después de que carga el app (5s para Firebase auth)
  mainWindow.webContents.on('did-finish-load', () => {
    setTimeout(() => {
      startTrazeIntegration(mainWindow)
    }, 5000)
  })

  // Auto-updater — check for new GitHub Releases on startup (skipped in dev)
  if (!isDev) setupAutoUpdater(mainWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  stopTrazeIntegration()
})
