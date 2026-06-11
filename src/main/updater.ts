// src/main/updater.ts
// Auto-updater configuration using electron-updater
// Current version: 1.2.2 — bump package.json version before every release build

import { autoUpdater } from 'electron-updater'
import { BrowserWindow, ipcMain, app, shell } from 'electron'
import { IPC } from '../shared/constants'

const RELEASES_URL = 'https://github.com/Carlosmsc491/npd-planner/releases/latest'

// Transient connectivity failures (no DNS, offline, timeouts). These resolve on
// their own and must not surface as a red error banner to the user.
function isNetworkError(message: string): boolean {
  return /net::|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|ERR_CONNECTION|ERR_NETWORK|ENOTFOUND|ETIMEDOUT|ESOCKETTIMEDOUT|ECONNREFUSED|ECONNRESET|EAI_AGAIN/i.test(message)
}

// When Windows is shutting down / restarting, NSIS must NOT start a silent
// install — an interrupted install leaves a half-deleted app folder that forces
// the user to reinstall. Called from the window's 'session-end' handler.
export function deferInstallOnShutdown(): void {
  if (process.platform === 'win32') {
    autoUpdater.autoInstallOnAppQuit = false
    console.warn('[Updater] OS session ending — deferring install to next run')
  }
}

export function setupAutoUpdater(mainWindow: BrowserWindow): void {
  // Only run auto-updater in production builds — skip in dev to avoid noise
  if (!app.isPackaged) {
    console.log('[Updater] Skipping — running in development mode')
    return
  }

  // Log update events to console (electron-log can be added if needed)
  autoUpdater.logger = console

  // On Mac, autoDownload=false so the user can confirm before downloading the DMG.
  // On Windows, autoDownload=true keeps the existing silent background download.
  if (process.platform !== 'win32') {
    autoUpdater.autoDownload = false
  } else {
    autoUpdater.autoDownload = true
  }

  // autoInstallOnAppQuit only works on Windows (NSIS installer).
  // On Mac, electron-updater cannot auto-install a DMG on quit — omit the flag.
  if (process.platform === 'win32') {
    autoUpdater.autoInstallOnAppQuit = true
  }

  autoUpdater.on('update-available', (info) => {
    console.log(`[Updater] New version available: ${info.version}`)
    mainWindow.webContents.send(IPC.UPDATE_AVAILABLE)
  })

  autoUpdater.on('update-downloaded', (info) => {
    console.log(`[Updater] Version ${info.version} downloaded — ready to install`)
    mainWindow.webContents.send(IPC.UPDATE_DOWNLOADED)
  })

  autoUpdater.on('error', (err) => {
    if (isNetworkError(err.message)) {
      // Offline / DNS hiccup — the scheduled retry will pick it up. No banner.
      console.warn('[Updater] Network error (silenced):', err.message)
      return
    }
    console.error('[Updater] Error:', err.message)
    try { mainWindow.webContents.send('app:updater-error', err.message) } catch { /* ignore */ }
  })

  // Renderer can request immediate restart to apply update.
  // Windows: quitAndInstall() triggers the NSIS silent install.
  // Mac: the build is unsigned (identity: null), so electron-updater cannot
  // install the DMG — open the GitHub release so the user downloads it.
  ipcMain.on('app:restart-to-update', () => {
    if (process.platform === 'win32') {
      autoUpdater.quitAndInstall()
    } else {
      shell.openExternal(RELEASES_URL).catch(() => { /* ignore */ })
    }
  })

  // Renderer can manually trigger a check. User-initiated, so even network
  // failures get feedback — but with a readable message, not net:: codes.
  ipcMain.on('app:check-for-updates', () => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.warn('[Updater] manual check failed:', err.message)
      const msg = isNetworkError(err.message)
        ? 'No internet connection. The app will keep retrying automatically.'
        : err.message
      try { mainWindow.webContents.send('app:updater-error', msg) } catch { /* ignore */ }
    })
  })

  // Startup check 10s after launch (machine may not have network yet after
  // waking up) with backoff retries: 30s → 2min → 10min, then the 4h cycle.
  const RETRY_DELAYS_MS = [30_000, 120_000, 600_000]
  let retryAttempt = 0
  function scheduledCheck(): void {
    autoUpdater.checkForUpdates()
      .then(() => { retryAttempt = 0 })
      .catch((err) => {
        console.warn('[Updater] scheduled check failed:', err.message)
        if (retryAttempt < RETRY_DELAYS_MS.length) {
          setTimeout(scheduledCheck, RETRY_DELAYS_MS[retryAttempt])
          retryAttempt++
        }
      })
  }
  setTimeout(scheduledCheck, 10_000)

  // Re-check every 4 hours while the app is open
  setInterval(() => { retryAttempt = 0; scheduledCheck() }, 4 * 60 * 60 * 1000)

  console.log(`[Updater] Configured. Current version: ${app.getVersion()}`)
}

// ── WINDOWS RELEASE CHECKLIST (run before every release) ─────────────────
// 1. Bump version in package.json
// 2. Run: npm run build:win
// 3. Check dist-electron/ contains: latest.yml + npd-planner-X.Y.Z-setup.exe
// 4. Go to GitHub → Releases → Create new release → tag vX.Y.Z
// 5. Upload BOTH files: latest.yml AND the .exe installer
// 6. Set release as "Latest release" (not draft, not pre-release)
// 7. Publish — installed apps will detect update within 10 seconds of next launch
// ─────────────────────────────────────────────────────────────────────────

// ── MAC RELEASE CHECKLIST ─────────────────────────────────────────────────
// 1. Bump version in package.json
// 2. Run: npm run build:mac
// 3. Check dist-electron/ contains: latest-mac.yml + npd-planner-X.Y.Z.dmg
// 4. Upload BOTH files to GitHub Release: latest-mac.yml AND the .dmg
// 5. Users will see an "Update available" notification — they click to install
// ─────────────────────────────────────────────────────────────────────────
