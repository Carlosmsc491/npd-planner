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
  recipeListFolder: (folderPath: string) => Promise<Array<{ name: string; isDirectory: boolean; size: number; modifiedAt: string; fullPath: string }>>
  recipeDeleteItem: (itemPath: string) => Promise<{ success: boolean; error?: string }>
  recipePathExists: (folderPath: string) => Promise<boolean>
  recipeRenameItem: (oldPath: string, newPath: string) => Promise<{ success: boolean; error?: string }>
  recipeCreateFileFromTemplate: (templatePath: string, destFolder: string, fileName: string) => Promise<{ success: boolean; destPath?: string; error?: string }>
  recipeCreateImportTemplate: (destPath: string) => Promise<{ success: boolean; error?: string }>
  recipeBatchWriteCells: (batch: Array<{ filePath: string; updates: Array<{ sheet: string; cell: string; value: string }> }>) => Promise<{ success: boolean }>
  recipeParseImportExcel: (filePath: string) => Promise<{
    success: boolean
    rows?: Array<{ name: string; srp: string; boxType: string; pickNeeded: string; holiday: string }>
    error?: string
  }>
  recipeValidateProjectFolder: (folderPath: string) => Promise<{
    valid: boolean
    config?: {
      projectName: string
      createdAt: string
      customerDefault: string
      holidayDefault: string
      wetPackDefault: boolean
      distributionDefault: Record<string, number>
      templatePath: string
      notes: string
    }
    error?: string
  }>
  // Generic Traze / AWB IPC channels
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
  on: (channel: string, listener: (...args: unknown[]) => void) => void
  off: (channel: string, listener: (...args: unknown[]) => void) => void
  send: (channel: string, ...args: unknown[]) => void
}

interface Window {
  electronAPI: IElectronAPI
}
