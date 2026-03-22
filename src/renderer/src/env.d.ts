/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string
  readonly VITE_FIREBASE_AUTH_DOMAIN: string
  readonly VITE_FIREBASE_PROJECT_ID: string
  readonly VITE_FIREBASE_STORAGE_BUCKET: string
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string
  readonly VITE_FIREBASE_APP_ID: string
  readonly VITE_APP_VERSION: string
  readonly VITE_ALLOWED_DOMAIN: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// ─── Electron bridge (exposed by preload/index.ts via contextBridge) ──────────
interface IpcFileResponse {
  success: boolean
  error?: string
}

interface IpcSharePointVerifyResponse {
  valid: boolean
  error?: string
}

interface IElectronAPI {
  copyFile: (sourcePath: string, destPath: string, createDirs: boolean) => Promise<IpcFileResponse>
  verifySharePointFolder: (folderPath: string, verificationSubfolder: string) => Promise<IpcSharePointVerifyResponse>
  selectFolder: () => Promise<string | null>
  selectFile: () => Promise<string | null>
  readFileBase64: (filePath: string) => Promise<string | null>
  openFile: (filePath: string) => Promise<void>
  resolveSharePointPath: (sharePointRoot: string, relativePath: string) => Promise<string>
  openExternal: (url: string) => Promise<{ success: boolean; error?: string }>
  sendNotification: (title: string, body: string, taskId: string, boardType: string, silent?: boolean) => void
  getAppVersion: () => Promise<string>
  onUpdateAvailable: (callback: () => void) => () => void
  onUpdateDownloaded: (callback: () => void) => () => void
  onNotificationClicked: (callback: (taskId: string) => void) => () => void
  deleteTrashFolder: (folderPath: string) => Promise<{ success: boolean; error?: string }>
  saveTextFile: (destPath: string, content: string) => Promise<{ success: boolean; error?: string }>
  // Recipe Manager
  recipeReadCells: (filePath: string, cells: string[]) => Promise<Record<string, string>>
  recipeWriteCells: (filePath: string, changes: { cell: string; value: string | number | boolean | null }[]) => Promise<{ success: boolean }>
  recipeGenerateFromTemplate: (templatePath: string, outputPath: string, recipeData: unknown) => Promise<{ success: boolean }>
  recipeRenameFile: (oldPath: string, newPath: string) => Promise<{ success: boolean }>
  recipeIsFileOpen: (filePath: string) => Promise<boolean>
  recipeCreateFolder: (folderPath: string) => Promise<{ success: boolean }>
  recipeScanProject: (rootPath: string) => Promise<Array<{ relativePath: string; displayName: string; price: string; option: string; name: string }>>
  recipeOpenInExcel: (filePath: string) => Promise<{ success: boolean; error?: string }>
  // Generic Traze / AWB IPC channels
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
  on: (channel: string, listener: (...args: unknown[]) => void) => void
  off: (channel: string, listener: (...args: unknown[]) => void) => void
  send: (channel: string, ...args: unknown[]) => void
}

interface Window {
  electronAPI: IElectronAPI
}
