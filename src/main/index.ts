import { app, BrowserWindow, ipcMain, session } from 'electron'
import { setupAutoUpdater } from './updater'
import { join } from 'path'
import { registerFileHandlers } from './ipc/fileHandlers'
import { registerNotificationHandlers } from './ipc/notificationHandlers'
import { initTrazeWindowManager, destroyTrazeWindow, registerTrazeWindowIpcHandlers, getTrazeWindowStatus } from './services/trazeWindowManager'
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
  // Override CSP headers for the Traze window so it can fetch trazeapi.com.
  // Only applies to responses from trazeapp.com — does not affect the main window.
  session.defaultSession.webRequest.onHeadersReceived(
    { urls: ['https://*.trazeapp.com/*'] },
    (details, callback) => {
      const headers = { ...details.responseHeaders }
      delete headers['content-security-policy']
      delete headers['Content-Security-Policy']
      callback({ responseHeaders: headers })
    }
  )

  registerFileHandlers(ipcMain)
  registerNotificationHandlers(ipcMain)

  // ─── Traze / AWB Integration ────────────────────────────────────────────
  registerTrazeWindowIpcHandlers()
  registerAwbIpcHandlers()
  // ────────────────────────────────────────────────────────────────────────

  const mainWindow = createWindow()

  // Initialize Traze window manager with reference to main window
  initTrazeWindowManager(mainWindow)

  // Start Traze integration after the app loads (5s delay for Firebase auth)
  mainWindow.webContents.on('did-finish-load', () => {
    setTimeout(() => {
      startTrazeIntegration(mainWindow)
    }, 5000)
  })

  // TEMP: log Traze window URL every 30s so we can see what it's doing
  setInterval(() => {
    console.log('[TrazeStatus]', getTrazeWindowStatus())
  }, 30000)

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
  destroyTrazeWindow()
})
