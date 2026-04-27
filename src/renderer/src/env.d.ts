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
  recipeScanProject: (rootPath: string) => Promise<Array<{ relativePath: string; displayName: string; price: string; option: string; name: string; recipeUid: string }>>
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
  // Camera / Photo Capture
  startCameraTethering: (outputDir: string) => Promise<{ success: boolean; error?: string }>
  stopCameraTethering: () => Promise<void>
  isTetheringActive: () => Promise<boolean>
  checkCameraConnection: () => Promise<{ connected: boolean; model: string | null }>
  onCameraStatusChanged: (cb: (data: { connected: boolean; model: string | null }) => void) => () => void
  onCameraPhotoReceived: (cb: (data: { tempPath: string; filename: string }) => void) => () => void
  onCameraLog: (cb: (msg: string) => void) => () => void
  onCameraTetheringError: (cb: (msg: string) => void) => () => void
  cameraCopyFile: (sourcePath: string, destPath: string) => Promise<{ success: boolean; error?: string }>
  startFolderWatch: (watchPath: string) => Promise<{ success: boolean; error?: string }>
  stopFolderWatch: () => Promise<void>
  recipeRenameWithPhotos: (input: import('./types').RenameWithPhotosInput) => Promise<import('./types').RenameWithPhotosResult>
  recipeWriteIndex: (indexPath: string, content: string) => Promise<{ success: boolean; error?: string }>
  recipeWriteUid: (filePath: string, uid: string) => Promise<{ success: boolean; error?: string }>
  recipeGenerateUid: () => Promise<string>
  copyToSelected: (args: { sourcePath: string; destPath: string }) => Promise<{ success: boolean; error?: string }>
  deleteFromSelected: (args: { filePath: string }) => Promise<{ success: boolean; error?: string }>
  convertPngToJpg: (args: { sourcePng: string; destJpg: string; quality?: number }) => Promise<{ success: boolean; error?: string }>
  // Excel / Python
  excelCheckDependencies: () => Promise<{ available: boolean; error?: string }>
  insertPhotoInExcel: (args: { excelPath: string; jpgPath: string }) => Promise<{ success: boolean; error?: string }>
  photoSaveAs: (entries: { srcPath: string; archivePath: string }[], destFolder: string) => Promise<{ success: boolean; errors: string[] }>
  photoShowSaveDialog: (defaultFilename: string) => Promise<string | null>
  photoExportZip: (entries: { srcPath: string; archivePath: string }[], destZipPath: string) => Promise<{ success: boolean; error?: string }>
  // Crash reporting
  saveCrashLocal: (report: unknown) => Promise<{ success: boolean; filePath?: string }>
  getCrashReportsDir: () => Promise<string>
  // App utilities
  getUserDataPath: () => Promise<string>
  getDefaultTemplatePath: () => Promise<string>
  readFileAsDataUrl: (filePath: string) => Promise<string>
  testWriteAccess: (dirPath: string) => Promise<{ success: boolean; error?: string }>
  // File utilities
  fileExists: (filePath: string) => Promise<boolean>
  // Email attachments (.msg)
  readMsgFile: (filePath: string) => Promise<{
    success: boolean
    subject?: string
    from?: string
    to?: string
    date?: string | null
    bodyHtml?: string | null
    bodyText?: string
    error?: string
  }>
  parseAndAttachEmail: (req: {
    msgFilePath: string
    sharePointRoot: string
    year: string
    clientName: string
    taskTitle: string
  }) => Promise<{ success: boolean; emailAttachment?: unknown; error?: string }>
  // Generic Traze / AWB IPC channels
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
  on: (channel: string, listener: (...args: unknown[]) => void) => void
  off: (channel: string, listener: (...args: unknown[]) => void) => void
  send: (channel: string, ...args: unknown[]) => void
}

interface Window {
  electronAPI: IElectronAPI
}
