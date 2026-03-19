import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/constants'

// Allowed channels for generic invoke/on/off/send
const INVOKE_CHANNELS = [
  'awb:get-latest-csv',
  'traze:check-auth',
  'traze:download-now',
  'traze:get-status',
  // Traze credentials and status
  'traze:save-credentials',
  'traze:load-credentials',
  'traze:has-credentials',
  'traze:clear-credentials',
  'traze:get-process-status',
  'traze:get-logs',
  'traze:clear-logs',
  'traze:refresh-csv',
  // Traze preferences
  'traze:get-preferences',
  'traze:set-view-browser',
] as const

const EVENT_CHANNELS = [
  'traze:csv-downloaded',
  'traze:csv-error',
  'traze:needs-login',
  'traze:login-success',
] as const

const SEND_CHANNELS = [
  'traze:show-login-window',
  'app:restart-to-update',
] as const

// Custom APIs for renderer
const electronAPI = {
  copyFile: (sourcePath: string, destPath: string, createDirs: boolean) =>
    ipcRenderer.invoke(IPC.FILE_COPY, { sourcePath, destPath, createDirs }),

  verifySharePointFolder: (folderPath: string, verificationSubfolder: string) =>
    ipcRenderer.invoke(IPC.SHAREPOINT_VERIFY, { folderPath, verificationSubfolder }),

  selectFolder: () =>
    ipcRenderer.invoke(IPC.FILE_SELECT_FOLDER),

  openFile: (filePath: string) =>
    ipcRenderer.invoke(IPC.FILE_OPEN, filePath),

  selectFile: () =>
    ipcRenderer.invoke(IPC.FILE_SELECT),

  readFileBase64: (filePath: string) =>
    ipcRenderer.invoke(IPC.FILE_READ_BASE64, filePath),

  resolveSharePointPath: (sharePointRoot: string, relativePath: string) =>
    ipcRenderer.invoke(IPC.SHAREPOINT_RESOLVE_PATH, sharePointRoot, relativePath),

  sendNotification: (title: string, body: string, taskId: string, boardType: string, silent?: boolean) =>
    ipcRenderer.send(IPC.NOTIFICATION_SEND, { title, body, taskId, boardType, silent }),

  getAppVersion: () =>
    ipcRenderer.invoke(IPC.APP_VERSION),

  onUpdateAvailable: (callback: () => void) => {
    ipcRenderer.on(IPC.UPDATE_AVAILABLE, callback)
    return () => ipcRenderer.removeListener(IPC.UPDATE_AVAILABLE, callback)
  },

  onUpdateDownloaded: (callback: () => void) => {
    ipcRenderer.on(IPC.UPDATE_DOWNLOADED, callback)
    return () => ipcRenderer.removeListener(IPC.UPDATE_DOWNLOADED, callback)
  },

  onNotificationClicked: (callback: (taskId: string) => void) => {
    ipcRenderer.on(IPC.NOTIFICATION_CLICKED, (_event, taskId) => callback(taskId))
    return () => ipcRenderer.removeAllListeners(IPC.NOTIFICATION_CLICKED)
  },

  // ── Generic invoke for Traze / AWB channels ───────────────────────────────
  invoke: (channel: string, ...args: unknown[]): Promise<unknown> => {
    if ((INVOKE_CHANNELS as readonly string[]).includes(channel)) {
      return ipcRenderer.invoke(channel, ...args)
    }
    return Promise.reject(new Error(`Channel "${channel}" not in allowlist`))
  },

  // ── Generic event subscription ────────────────────────────────────────────
  on: (channel: string, listener: (...args: unknown[]) => void): void => {
    if ((EVENT_CHANNELS as readonly string[]).includes(channel)) {
      ipcRenderer.on(channel, listener as Parameters<typeof ipcRenderer.on>[1])
    }
  },

  off: (channel: string, listener: (...args: unknown[]) => void): void => {
    if ((EVENT_CHANNELS as readonly string[]).includes(channel)) {
      ipcRenderer.removeListener(channel, listener as Parameters<typeof ipcRenderer.removeListener>[1])
    }
  },

  // ── Generic one-way send ──────────────────────────────────────────────────
  send: (channel: string, ...args: unknown[]): void => {
    if ((SEND_CHANNELS as readonly string[]).includes(channel)) {
      ipcRenderer.send(channel, ...args)
    }
  },
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electronAPI', electronAPI)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in d.ts)
  window.electronAPI = electronAPI
}
