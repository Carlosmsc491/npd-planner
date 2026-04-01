/**
 * Splash Screen Manager
 * Shows a centered white window with the Lottie logo animation
 * while the main app window loads in the background.
 */
import { BrowserWindow, app } from 'electron'
import { join } from 'path'

let splashWindow: BrowserWindow | null = null

function getResourcesPath(): string {
  const isDev = process.env.NODE_ENV === 'development' || !!process.env.ELECTRON_RENDERER_URL
  if (isDev) {
    return join(__dirname, '../../resources')
  }
  // In production, resources are unpacked from the asar to app.asar.unpacked/resources/
  // app.getAppPath() = .../resources/app.asar
  // so '../app.asar.unpacked/resources' is the correct location
  return join(app.getAppPath(), '..', 'app.asar.unpacked', 'resources')
}

export function createSplashWindow(): BrowserWindow {
  const resourcesPath = getResourcesPath()

  splashWindow = new BrowserWindow({
    width: 700,
    height: 500,
    frame: false,
    resizable: false,
    movable: false,
    center: true,
    show: false,
    backgroundColor: '#FFFFFF',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  splashWindow.loadFile(join(resourcesPath, 'splash.html')).catch(err => {
    // If splash.html can't be found, log and destroy the window gracefully.
    // Never let this crash the main process.
    console.error('[Splash] Failed to load splash.html:', err)
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.destroy()
      splashWindow = null
    }
  })

  splashWindow.once('ready-to-show', () => {
    splashWindow?.show()
  })

  return splashWindow
}

export function closeSplashWindow(): void {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.executeJavaScript(`
      document.body.style.opacity = '0';
    `)
    setTimeout(() => {
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.destroy()
        splashWindow = null
      }
    }, 600)
  }
}
