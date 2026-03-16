import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { registerFileHandlers } from './ipc/fileHandlers'
import { registerNotificationHandlers } from './ipc/notificationHandlers'

const isDev = process.env.NODE_ENV === 'development' || !!process.env.ELECTRON_RENDERER_URL

function createWindow(): void {
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
}

app.whenReady().then(() => {
  registerFileHandlers(ipcMain)
  registerNotificationHandlers(ipcMain)
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
