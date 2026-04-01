import { app, BrowserWindow, ipcMain, globalShortcut, Menu, MenuItem } from 'electron'
import { setupAutoUpdater } from './updater'
import { join } from 'path'
import { registerFileHandlers } from './ipc/fileHandlers'
import { registerNotificationHandlers } from './ipc/notificationHandlers'
import { startTrazeIntegration, stopTrazeIntegration } from './services/trazeIntegrationService'
import { registerAwbIpcHandlers } from './ipc/awbIpcHandlers'
import { errorReporter } from './services/errorReporter'
import { startTrashCleanupService, registerTrashCleanupHandlers } from './services/trashCleanupService'
import { registerRecipeHandlers } from './ipc/recipeIpcHandlers'
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

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('[Main] Failed to load:', errorCode, errorDescription)
  })
  
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

  win.on('ready-to-show', () => {
    console.log('[Main] Window ready to show')
    const remainingTime = Math.max(0, splashMinTime - Date.now())
    setTimeout(() => {
      closeSplashWindow()
      setTimeout(() => {
        win.show()
      }, 700)
    }, remainingTime)
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

// Set app user model ID so Windows notifications show "NPD Planner" not "electron.app.NPD Planner"
app.setAppUserModelId('NPD Planner')

app.whenReady().then(() => {
  createSplashWindow()
  splashMinTime = Date.now() + 5500  // Full animation (5s) + 0.5s hold on final frame

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
  startTrashCleanupService()
  errorReporter.log('App started')

  const mainWindow = createWindow()

  // Iniciar integración Traze después de que carga el app (5s para Firebase auth)
  mainWindow.webContents.on('did-finish-load', () => {
    setTimeout(() => {
      startTrazeIntegration(mainWindow)
    }, 5000)
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

app.on('before-quit', () => {
  stopTrazeIntegration()
  // Trash cleanup service will stop automatically when app exits
})

// Global error handlers
process.on('uncaughtException', (error) => {
  console.error('[Main] Uncaught exception:', error)
  errorReporter.handleError('uncaughtException', error.message, error.stack)
})

process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason)
  const stack = reason instanceof Error ? reason.stack : undefined
  errorReporter.handleError('unhandledRejection', message, stack)
})
