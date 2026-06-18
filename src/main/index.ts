import { app, BrowserWindow, ipcMain, globalShortcut, Menu, MenuItem } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { setupAutoUpdater, deferInstallOnShutdown } from './updater'
import { join } from 'path'
import { registerFileHandlers } from './ipc/fileHandlers'
import { registerNotificationHandlers } from './ipc/notificationHandlers'
import { startTrazeIntegration, stopTrazeIntegration } from './services/trazeIntegrationService'
import { hasActiveTrazeBrowser, closeActiveTrazeBrowser } from './services/trazePlaywrightService'
import { registerAwbIpcHandlers } from './ipc/awbIpcHandlers'
import { errorReporter } from './services/errorReporter'
import { startTrashCleanupService, registerTrashCleanupHandlers } from './services/trashCleanupService'
import { registerRecipeHandlers } from './ipc/recipeIpcHandlers'
import { registerPhotoManifestHandlers } from './ipc/photoManifestHandlers'
import { registerCameraHandlers } from './ipc/cameraHandlers'
import { registerConvertHandlers } from './ipc/convertHandlers'
import { registerBgRemovalHandlers } from './ipc/bgRemovalHandlers'
import { registerExcelHandlers } from './ipc/excelHandlers'
import { registerCrashReportHandlers } from './ipc/crashReportHandlers'
import { registerEmailHandlers } from './ipc/emailHandlers'
import { registerReportHandlers } from './ipc/reportHandlers'
import { createSplashWindow, closeSplashWindow } from './splash'

const isDev = process.env.NODE_ENV === 'development' || !!process.env.ELECTRON_RENDERER_URL
let splashMinTime = 0

// Remove the native menu bar in production (Windows + Linux)
// On Mac we keep a minimal menu so Cmd+Q / Cmd+H / system shortcuts still work
if (!isDev) {
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      {
        label: app.name,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' },
        ],
      },
    ]))
  } else {
    // Windows / Linux — remove completely
    Menu.setApplicationMenu(null)
  }
}

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
  
  // DevTools disabled in production - use Ctrl+Shift+R to reload if needed
  // win.webContents.openDevTools()

  win.webContents.on('dom-ready', () => {
    console.log('[Main] DOM ready')
  })
  
  win.webContents.on('console-message', (_event, level, message, _line, _sourceId) => {
    console.log(`[Renderer:${level}] ${message}`)
    if (level === 3) errorReporter.log(`[Error] ${message}`)
  })

  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('[Main] Renderer crashed:', details)
    errorReporter.handleError('renderer-crash', `Renderer crashed: ${details.reason}`)
  })
  
  // Enable native right-click context menu for text fields
  win.webContents.on('context-menu', (_event, params) => {
    const menu = new Menu()

    if (params.isEditable) {
      if (params.selectionText) {
        menu.append(new MenuItem({
          label: 'Cut',
          role: 'cut',
          enabled: params.editFlags.canCut,
        }))
        menu.append(new MenuItem({
          label: 'Copy',
          role: 'copy',
          enabled: params.editFlags.canCopy,
        }))
      } else {
        menu.append(new MenuItem({
          label: 'Copy',
          role: 'copy',
          enabled: params.editFlags.canCopy,
        }))
      }
      menu.append(new MenuItem({
        label: 'Paste',
        role: 'paste',
        enabled: params.editFlags.canPaste,
      }))
      menu.append(new MenuItem({ type: 'separator' }))
      menu.append(new MenuItem({
        label: 'Select All',
        role: 'selectAll',
        enabled: params.editFlags.canSelectAll,
      }))
    } else if (params.selectionText) {
      menu.append(new MenuItem({
        label: 'Copy',
        role: 'copy',
      }))
    }

    if (menu.items.length > 0) {
      menu.popup({ window: win })
    }
  })

  let windowShown = false
  function showMainWindow() {
    if (windowShown) return
    windowShown = true
    const remainingTime = Math.max(0, splashMinTime - Date.now())
    setTimeout(() => {
      closeSplashWindow()
      setTimeout(() => {
        if (!win.isDestroyed()) win.show()
      }, 700)
    }, remainingTime)
  }

  win.on('ready-to-show', () => {
    console.log('[Main] Window ready to show')
    showMainWindow()
  })

  // Windows: the OS session is ending (shutdown / restart / log-off — e.g. the
  // user closed the laptop and Windows decided to update). NSIS must not start
  // a silent install in that window of time: an interrupted install leaves the
  // app half-deleted and the user has to reinstall.
  if (process.platform === 'win32') {
    win.on('session-end', () => deferInstallOnShutdown())
  }

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('[Main] Failed to load — forcing window show:', errorCode, errorDescription)
    showMainWindow()
  })

  // Safety net: if ready-to-show never fires within 20s, force-show the window
  setTimeout(() => {
    if (!windowShown) {
      console.warn('[Main] Splash timeout — forcing window show after 20s')
      showMainWindow()
    }
  }, 20_000)
  
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

// Set app user model ID so Windows notifications show "NPD Planner" not "electron.app.NPD Planner"
app.setAppUserModelId('NPD Planner')

// ── Single-instance lock ──────────────────────────────────────────────────────
// Prevents multiple windows when the user double/triple-clicks the .exe
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  // Another instance is already running — quit immediately
  app.quit()
} else {
  // If a second instance tries to launch, focus the existing window instead
  app.on('second-instance', (_event, _argv, _cwd) => {
    const [existing] = BrowserWindow.getAllWindows()
    if (existing && !existing.isDestroyed()) {
      if (existing.isMinimized()) existing.restore()
      existing.focus()
    } else if (app.isReady()) {
      // The running instance is a zombie without a window (e.g. it survived a
      // crash). Doing nothing here made the app look broken — every launch
      // "did nothing" until users reinstalled. Give them a window instead.
      createWindow()
    }
  })
}

app.whenReady().then(() => {
  createSplashWindow()
  splashMinTime = Date.now() + 5500  // Full animation (5s) + 0.5s hold on final frame

  // ── App utility handlers ───────────────────────────────────────────────────
  ipcMain.handle('app:get-user-data-path', () => app.getPath('userData'))

  ipcMain.handle('app:clear-firebase-cache', async () => {
    try {
      const { session } = await import('electron')
      await session.defaultSession.clearStorageData({
        storages: ['indexdb', 'localstorage', 'sessionstorage', 'shadercache', 'cachestorage'],
      })
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('app:get-default-template-path', () => {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'templates', 'ELITE QUOTE BOUQUET 2026.xlsx')
    }
    // In dev, __dirname = out/main, so walk up to repo root
    return path.join(__dirname, '../../resources/templates/ELITE QUOTE BOUQUET 2026.xlsx')
  })

  ipcMain.handle('app:read-file-as-dataurl', (_event, filePath: string) => {
    return new Promise<string>((resolve, reject) => {
      fs.readFile(filePath, (err, buffer) => {
        if (err) { reject(err); return }
        const ext  = path.extname(filePath).toLowerCase().replace('.', '')
        const mime = (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' : `image/${ext}`
        resolve(`data:${mime};base64,${buffer.toString('base64')}`)
      })
    })
  })



  ipcMain.handle('storage:test-write-access', async (_event, dirPath: string) => {
    try {
      const testFile = path.join(dirPath, '.npd-test-write')
      fs.writeFileSync(testFile, 'test')
      fs.unlinkSync(testFile)
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // Error reporter IPC handlers
  ipcMain.handle('error-report:send', async (_event, report) => {
    const reportPath = await errorReporter.generateReportFile(report)
    await errorReporter.openEmailWithReport(reportPath, report)
    return { success: true }
  })

  registerFileHandlers(ipcMain)
  registerNotificationHandlers(ipcMain)
  registerAwbIpcHandlers()
  registerTrashCleanupHandlers()
  registerRecipeHandlers()
  registerPhotoManifestHandlers()
  registerExcelHandlers()
  registerCrashReportHandlers()
  registerEmailHandlers()
  registerReportHandlers()
  registerCameraHandlers()
  registerConvertHandlers()
  registerBgRemovalHandlers()
  startTrashCleanupService()
  errorReporter.log('App started')

  const mainWindow = createWindow()

  // Iniciar integración Traze 60s después de cargar. A los 5s lanzaba el
  // Chromium de Playwright justo cuando el splash termina y el usuario abre el
  // board — la descarga del CSV competía con la carga inicial de tasks (CPU y
  // disco), especialmente en Mac donde el primer spawn de Chromium es pesado.
  mainWindow.webContents.on('did-finish-load', () => {
    setTimeout(() => {
      startTrazeIntegration(mainWindow)
    }, 60_000)
  })

  // Auto-updater — check for new GitHub Releases on startup (skipped in dev)
  if (!isDev) setupAutoUpdater(mainWindow)

  // Register Ctrl+Shift+R to force reload (hard refresh)
  globalShortcut.register('CommandOrControl+Shift+R', () => {
    console.log('[Main] Force reload triggered (Ctrl+Shift+R)')
    mainWindow.webContents.reloadIgnoringCache()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const newWindow = createWindow()
      // Re-register shortcut for new window
      globalShortcut.register('CommandOrControl+Shift+R', () => {
        console.log('[Main] Force reload triggered (Ctrl+Shift+R)')
        newWindow.webContents.reloadIgnoringCache()
      })
    }
  })
})

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll()
  if (process.platform !== 'darwin') app.quit()
})

let trazeBrowserClosed = false
app.on('before-quit', (event) => {
  stopTrazeIntegration()
  // Kill any in-flight Traze Chromium — it runs from INSIDE the install dir
  // and an orphan blocks the NSIS updater ("NPD Planner cannot be closed").
  // Quit is deferred (max 3s) until the browser dies, then resumed.
  if (!trazeBrowserClosed && hasActiveTrazeBrowser()) {
    event.preventDefault()
    trazeBrowserClosed = true
    closeActiveTrazeBrowser().finally(() => app.quit())
    return
  }
  trazeBrowserClosed = true
  // Trash cleanup service will stop automatically when app exits
})

app.on('will-quit', () => {
  // Covers quit paths that never fire window-all-closed (e.g. Cmd+Q on Mac)
  globalShortcut.unregisterAll()
})

// Global error handlers
process.on('uncaughtException', (error) => {
  console.error('[Main] Uncaught exception:', error)
  errorReporter.handleError('uncaughtException', error.message, error.stack)
  // A windowless main process keeps holding the single-instance lock, so every
  // new launch quits immediately — to the user, "the app stopped opening".
  // If we're in that state, exit so the next launch starts clean.
  if (app.isReady() && BrowserWindow.getAllWindows().length === 0) {
    app.exit(1)
  }
})

process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason)
  const stack = reason instanceof Error ? reason.stack : undefined
  errorReporter.handleError('unhandledRejection', message, stack)
})
