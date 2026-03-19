import { app, BrowserWindow, ipcMain } from 'electron'
import { setupAutoUpdater } from './updater'
import { join } from 'path'
import { registerFileHandlers } from './ipc/fileHandlers'
import { registerNotificationHandlers } from './ipc/notificationHandlers'
import { startTrazeIntegration, stopTrazeIntegration } from './services/trazeIntegrationService'
import { registerAwbIpcHandlers } from './ipc/awbIpcHandlers'

const isDev = process.env.NODE_ENV === 'development' || !!process.env.ELECTRON_RENDERER_URL

function createWindow(): BrowserWindow {
  console.log('[Main] Creating window...')
  console.log('[Main] __dirname:', __dirname)
  console.log('[Main] app.getAppPath():', app.getAppPath())
  console.log('[Main] isDev:', isDev)
  
  // Use app.getAppPath() for reliable path resolution in packaged app
  const appPath = app.getAppPath()
  const preloadPath = join(appPath, 'out/preload/index.js')
  
  console.log('[Main] Preload path:', preloadPath)
  
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      sandbox: false,
    },
  })
  
  // Open DevTools immediately so we catch errors from page initialization
  win.webContents.openDevTools()

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('[Main] Failed to load:', errorCode, errorDescription)
  })
  
  win.webContents.on('dom-ready', () => {
    console.log('[Main] DOM ready')
  })
  
  win.webContents.on('console-message', (_event, level, message, _line, _sourceId) => {
    console.log(`[Renderer:${level}] ${message}`)
  })
  
  win.on('ready-to-show', () => {
    console.log('[Main] Window ready to show')
    win.show()
  })
  
  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    console.log('[Main] Loading dev URL:', process.env.ELECTRON_RENDERER_URL)
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    const htmlPath = join(appPath, 'out/renderer/index.html')
    console.log('[Main] Loading file:', htmlPath)
    win.loadFile(htmlPath).catch(err => {
      console.error('[Main] Error loading file:', err)
    })
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
