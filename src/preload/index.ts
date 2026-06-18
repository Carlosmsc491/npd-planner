import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/constants'
import type { ConvertScanResult, ConvertBatchJob, ConvertBatchResult, ConvertProgress, ConvertEstimate, ConvertEstimateOptions, PathStat } from '../shared/convert'
import type { BgRemovalJob, BgRemovalResult, BgRemovalStatus, BgRemovalSetup } from '../shared/bgRemoval'

// Allowed channels for generic invoke/on/off/send
const INVOKE_CHANNELS = [
  'error-report:send',
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
  'traze:chromium-available',
  // SharePoint template files
  'file:save-text',
  'file:html-to-pdf',
  // Folder picker dialog
  'dialog:open-folder',
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
  // Synchronous platform string ("darwin" | "win32" | …). Exposed via the
  // namespaced bridge rather than a global `window.process` shim, which in the
  // renderer aliases globalThis.process and can break browser libs that probe it.
  platform: process.platform,

  copyFile: (sourcePath: string, destPath: string, createDirs: boolean, resolvedFolder?: string) =>
    ipcRenderer.invoke(IPC.FILE_COPY, { sourcePath, destPath, createDirs, resolvedFolder }),

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

  openExternal: (url: string) =>
    ipcRenderer.invoke(IPC.OPEN_EXTERNAL, url),

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

  onUpdaterError: (callback: (msg: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, msg: string) => callback(msg)
    ipcRenderer.on('app:updater-error', handler)
    return () => ipcRenderer.removeListener('app:updater-error', handler)
  },

  checkForUpdatesNow: (): void => {
    ipcRenderer.send('app:check-for-updates')
  },

  onNotificationClicked: (callback: (taskId: string) => void) => {
    ipcRenderer.on(IPC.NOTIFICATION_CLICKED, (_event, taskId) => callback(taskId))
    return () => ipcRenderer.removeAllListeners(IPC.NOTIFICATION_CLICKED)
  },

  sendErrorReport: (report: unknown) =>
    ipcRenderer.invoke('error-report:send', report),

  onErrorData: (callback: (data: unknown) => void) => {
    ipcRenderer.on('error-data', (_event, data) => callback(data))
  },

  saveCrashLocal: (report: unknown) =>
    ipcRenderer.invoke('crash:save-local', report),

  getCrashReportsDir: () =>
    ipcRenderer.invoke('crash:get-reports-dir'),

  deleteTrashFolder: (folderPath: string) =>
    ipcRenderer.invoke('trash:delete-folder', folderPath),

  saveTextFile: (destPath: string, content: string) =>
    ipcRenderer.invoke('file:save-text', destPath, content),

  // ── Recipe Manager ────────────────────────────────────────────────────────
  recipeReadCells: (filePath: string, cells: string[]) =>
    ipcRenderer.invoke('recipe:readCells', filePath, cells),

  recipeWriteCells: (filePath: string, changes: { cell: string; value: string | number | boolean | null }[]) =>
    ipcRenderer.invoke('recipe:writeCells', filePath, changes),

  recipeGenerateFromTemplate: (templatePath: string, outputPath: string, recipeData: unknown) =>
    ipcRenderer.invoke('recipe:generateFromTemplate', templatePath, outputPath, recipeData),

  recipeRenameFile: (oldPath: string, newPath: string) =>
    ipcRenderer.invoke('recipe:renameFile', oldPath, newPath),

  recipeIsFileOpen: (filePath: string) =>
    ipcRenderer.invoke('recipe:isFileOpen', filePath),

  recipeCreateFolder: (folderPath: string) =>
    ipcRenderer.invoke('recipe:createFolder', folderPath),

  recipeScanProject: (rootPath: string) =>
    ipcRenderer.invoke('recipe:scanProject', rootPath),

  recipeOpenInExcel: (filePath: string) =>
    ipcRenderer.invoke('recipe:openInExcel', filePath),

  recipeListFolder: (folderPath: string) =>
    ipcRenderer.invoke('recipe:listFolder', folderPath),

  recipeDeleteItem: (itemPath: string) =>
    ipcRenderer.invoke('recipe:deleteItem', itemPath),

  recipeRenameItem: (oldPath: string, newPath: string) =>
    ipcRenderer.invoke('recipe:renameItem', oldPath, newPath),

  recipeCreateFileFromTemplate: (templatePath: string, destFolder: string, fileName: string) =>
    ipcRenderer.invoke('recipe:createFileFromTemplate', templatePath, destFolder, fileName),

  recipePathExists: (folderPath: string) =>
    ipcRenderer.invoke('recipe:pathExists', folderPath),

  recipeCreateImportTemplate: (destPath: string) =>
    ipcRenderer.invoke('recipe:createImportTemplate', destPath),

  recipeParseImportExcel: (filePath: string) =>
    ipcRenderer.invoke('recipe:parseImportExcel', filePath),

  recipeBatchWriteCells: (batch: Array<{ filePath: string; updates: Array<{ sheet: string; cell: string; value: string }> }>) =>
    ipcRenderer.invoke('recipe:batchWriteCells', batch),

  recipeValidateProjectFolder: (folderPath: string) =>
    ipcRenderer.invoke('recipe:validateProjectFolder', folderPath),

  // ── Camera / Photo Capture ────────────────────────────────────────────────
  startCameraTethering: (outputDir: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('camera:start-tethering', outputDir),

  stopCameraTethering: (): Promise<void> =>
    ipcRenderer.invoke('camera:stop-tethering'),

  isTetheringActive: (): Promise<boolean> =>
    ipcRenderer.invoke('camera:is-tethering'),

  checkCameraConnection: (): Promise<{ connected: boolean; model: string | null }> =>
    ipcRenderer.invoke('camera:check-connection'),

  onCameraStatusChanged: (cb: (data: { connected: boolean; model: string | null }) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: { connected: boolean; model: string | null }) => cb(data)
    ipcRenderer.on('camera:status-changed', listener)
    return () => ipcRenderer.removeListener('camera:status-changed', listener)
  },

  onCameraPhotoReceived: (cb: (data: { tempPath: string; filename: string }) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: { tempPath: string; filename: string }) => cb(data)
    ipcRenderer.on('camera:photo-received', listener)
    return () => ipcRenderer.removeListener('camera:photo-received', listener)
  },

  onCameraLog: (cb: (msg: string) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, msg: string) => cb(msg)
    ipcRenderer.on('camera:log', listener)
    return () => ipcRenderer.removeListener('camera:log', listener)
  },

  onCameraTetheringError: (cb: (msg: string) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, msg: string) => cb(msg)
    ipcRenderer.on('camera:tethering-error', listener)
    return () => ipcRenderer.removeListener('camera:tethering-error', listener)
  },

  cameraCopyFile: (sourcePath: string, destPath: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('camera:copy-file', sourcePath, destPath),

  startFolderWatch: (watchPath: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('camera:start-folder-watch', watchPath),

  stopFolderWatch: (): Promise<void> =>
    ipcRenderer.invoke('camera:stop-folder-watch'),

  recipeRenameWithPhotos: (input: unknown): Promise<unknown> =>
    ipcRenderer.invoke('recipe:rename-with-photos', input),

  recipeWriteIndex: (indexPath: string, content: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('recipe:write-index', indexPath, content),

  recipeWriteUid: (filePath: string, uid: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('recipe:write-uid', filePath, uid),

  recipeGenerateUid: (): Promise<string> =>
    ipcRenderer.invoke('recipe:generate-uid'),

  recipeFindProjectFolder: (args: { projectId: string; projectsRoot: string }): Promise<{ found: string | null; error?: string }> =>
    ipcRenderer.invoke('recipe:find-project-folder', args),

  recipeWriteProjectJson: (args: { folderPath: string; projectId: string }): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('recipe:write-project-json', args),

  // ── Photo manifest (per-recipe JSON at _project/photos/{recipeUid}.json) ────
  photoManifestRead: (args: { projectRoot: string; recipeUid: string }) =>
    ipcRenderer.invoke('photo-manifest:read', args),

  photoManifestReadAll: (args: { projectRoot: string }) =>
    ipcRenderer.invoke('photo-manifest:read-all', args),

  photoManifestWrite: (args: { projectRoot: string; manifest: unknown }) =>
    ipcRenderer.invoke('photo-manifest:write', args),

  photoManifestDelete: (args: { projectRoot: string; recipeUid: string }) =>
    ipcRenderer.invoke('photo-manifest:delete', args),

  photoManifestScanDisk: (args: { projectRoot: string }) =>
    ipcRenderer.invoke('photo-manifest:scan-disk', args),

  copyToSelected: (args: { sourcePath: string; destPath: string }): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('photo:copy-to-selected', args),

  deleteFromSelected: (args: { filePath: string }): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('photo:delete-from-selected', args),

  convertPngToJpg: (args: { sourcePng: string; destJpg: string; quality?: number }): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('photo:convert-png-to-jpg', args),

  // ── Convert Pictures (PNG → JPG, white bg, resize) ────────────────────────────
  convertScanFolder: (rootPath: string): Promise<ConvertScanResult> =>
    ipcRenderer.invoke('convert:scan-folder', rootPath),

  convertStatPaths: (paths: string[]): Promise<PathStat[]> =>
    ipcRenderer.invoke('convert:stat-paths', paths),

  convertSelectFiles: (): Promise<string[]> =>
    ipcRenderer.invoke('convert:select-files'),

  convertSelectDest: (): Promise<string | null> =>
    ipcRenderer.invoke('convert:select-dest'),

  convertRunBatch: (job: ConvertBatchJob): Promise<ConvertBatchResult> =>
    ipcRenderer.invoke('convert:run-batch', job),

  convertEstimate: (sources: string[], opts: ConvertEstimateOptions): Promise<ConvertEstimate> =>
    ipcRenderer.invoke('convert:estimate', sources, opts),

  onConvertProgress: (cb: (p: ConvertProgress) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, p: ConvertProgress) => cb(p)
    ipcRenderer.on('convert:progress', listener)
    return () => ipcRenderer.removeListener('convert:progress', listener)
  },

  // ── Background removal (Mac-only) ─────────────────────────────────────────────
  bgRemovalInstallState: (): Promise<import('../shared/bgRemoval').BgInstallState> =>
    ipcRenderer.invoke('bgremoval:install-state'),
  bgRemovalInstall: (): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('bgremoval:install'),
  bgRemovalInstallCancel: (): Promise<void> =>
    ipcRenderer.invoke('bgremoval:install-cancel'),
  onBgRemovalInstallProgress: (cb: (p: import('../shared/bgRemoval').BgInstallProgress) => void): (() => void) => {
    const listener = (_e: unknown, p: import('../shared/bgRemoval').BgInstallProgress): void => cb(p)
    ipcRenderer.on('bgremoval:install-progress', listener)
    return () => ipcRenderer.removeListener('bgremoval:install-progress', listener)
  },
  bgRemovalDefaultToolDir: (): Promise<string> =>
    ipcRenderer.invoke('bgremoval:default-tool-dir'),
  // Single-photo cut-out (Photo Manager auto-clean)
  bgRemovalCleanPhoto: (job: { input: string; output: string; toolDir?: string }): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('bgremoval:clean-photo', job),
  bgRemovalCleanCancelAll: (): Promise<void> =>
    ipcRenderer.invoke('bgremoval:clean-cancel-all'),
  // Photoshop round-trip edit
  photoshopOpen: (filePath: string, app?: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('photoshop:open', { filePath, app }),
  photoshopSaveReturn: (filePath: string, close?: boolean, app?: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('photoshop:save-return', { filePath, close, app }),
  photoshopSelectSubject: (input: string, output: string, opts?: { canvas?: number; margin?: number; app?: string }): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('photoshop:select-subject', { input, output, ...opts }),
  bgRemovalMakeJpg: (pngPath: string, jpgPath: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('bgremoval:make-jpg', pngPath, jpgPath),
  bgRemovalResolveRecut: (args: { keepSubject: boolean; enginePng: string; subjectPng: string }): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('bgremoval:resolve-recut', args),
  bgRemovalSelectFiles: (): Promise<string[]> =>
    ipcRenderer.invoke('bgremoval:select-files'),
  bgRemovalCheckSetup: (toolDir: string): Promise<BgRemovalSetup> =>
    ipcRenderer.invoke('bgremoval:check-setup', toolDir),
  bgRemovalRun: (job: BgRemovalJob): Promise<BgRemovalResult> =>
    ipcRenderer.invoke('bgremoval:run', job),
  bgRemovalCancel: (): Promise<void> =>
    ipcRenderer.invoke('bgremoval:cancel'),
  bgRemovalOpenOutput: (dir: string): Promise<void> =>
    ipcRenderer.invoke('bgremoval:open-output', dir),
  bgRemovalThumb: (absPath: string, size?: number): Promise<string | null> =>
    ipcRenderer.invoke('bgremoval:thumb', absPath, size),
  bgRemovalReadFull: (absPath: string): Promise<string | null> =>
    ipcRenderer.invoke('bgremoval:read-full', absPath),
  bgRemovalReadThumb: (absPath: string): Promise<string | null> =>
    ipcRenderer.invoke('bgremoval:read-thumb', absPath),
  onBgRemovalProgress: (cb: (s: BgRemovalStatus) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, s: BgRemovalStatus) => cb(s)
    ipcRenderer.on('bgremoval:progress', listener)
    return () => ipcRenderer.removeListener('bgremoval:progress', listener)
  },

  // ── Photo Studio (Mac-only standalone session manager) ──────────────────────
  photoStudioListSessions: (catalogDir: string): Promise<{ ok: boolean; sessions: import('../shared/photoStudio').StudioSession[]; error?: string }> =>
    ipcRenderer.invoke('photostudio:list-sessions', catalogDir),
  photoStudioCreateSession: (catalogDir: string, name: string): Promise<{ ok: boolean; id?: string; sessionDir?: string; error?: string }> =>
    ipcRenderer.invoke('photostudio:create-session', { catalogDir, name }),
  photoStudioDeleteSession: (sessionDir: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('photostudio:delete-session', sessionDir),
  photoStudioListPhotos: (sessionDir: string): Promise<{ ok: boolean; photos: import('../shared/photoStudio').StudioPhoto[]; error?: string }> =>
    ipcRenderer.invoke('photostudio:list-photos', sessionDir),
  photoStudioImportPhotos: (sessionDir: string, srcPaths: string[]): Promise<{ ok: boolean; errors: string[] }> =>
    ipcRenderer.invoke('photostudio:import-photos', { sessionDir, srcPaths }),
  photoStudioSelectImport: (sessionDir: string): Promise<{ ok: boolean; imported: number; errors: string[] }> =>
    ipcRenderer.invoke('photostudio:select-import', sessionDir),
  photoStudioUpdatePhotoState: (args: { sessionDir: string; photoId: string; state: import('../shared/photoStudio').StudioPhoto['state']; cleanedPath?: string | null; jpgPath?: string | null }): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('photostudio:update-photo-state', args),
  photoStudioRemovePhoto: (args: { sessionDir: string; photoId: string; filename: string }): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('photostudio:remove-photo', args),
  photoStudioPickCatalog: (): Promise<string | null> =>
    ipcRenderer.invoke('photostudio:pick-catalog'),
  photoStudioOpenInFinder: (dir: string): Promise<void> =>
    ipcRenderer.invoke('photostudio:open-in-finder', dir),
  photoStudioRenameSession: (sessionDir: string, newName: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('photostudio:rename-session', { sessionDir, newName }),

  // ── Excel / Python ──────────────────────────────────────────────────────────
  excelCheckDependencies: (): Promise<{ available: boolean; error?: string }> =>
    ipcRenderer.invoke('excel:check-dependencies'),

  insertPhotoInExcel: (args: { excelPath: string; jpgPath: string }): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('excel:insert-photo', args),

  photoSaveAs: (entries: { srcPath: string; archivePath: string }[], destFolder: string): Promise<{ success: boolean; errors: string[] }> =>
    ipcRenderer.invoke('photo:save-as', entries, destFolder),

  photoShowSaveDialog: (defaultFilename: string): Promise<string | null> =>
    ipcRenderer.invoke('photo:show-save-dialog', defaultFilename),

  photoExportZip: (entries: { srcPath: string; archivePath: string }[], destZipPath: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('photo:export-zip', entries, destZipPath),

  // ── Email attachments (.msg) ──────────────────────────────────────────────
  fileExists: (filePath: string): Promise<boolean> =>
    ipcRenderer.invoke('file:exists', filePath),

  showInFolder: (filePath: string): void => {
    ipcRenderer.invoke('file:show-in-folder', filePath)
  },

  printFile: (filePath: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('file:print', filePath),

  readMsgFile: (filePath: string): Promise<{
    success: boolean
    subject?: string
    from?: string
    to?: string
    date?: string | null
    bodyHtml?: string | null
    bodyText?: string
    error?: string
  }> =>
    ipcRenderer.invoke('email:read-msg', filePath),

  parseAndAttachEmail: (req: {
    msgFilePath: string
    sharePointRoot: string
    year: string
    clientName: string
    taskTitle: string
  }) => ipcRenderer.invoke('email:parse-and-attach', req),

  parseAndAttachEml: (req: {
    emlFilePath: string
    sharePointRoot: string
    year: string
    clientName: string
    taskTitle: string
  }) => ipcRenderer.invoke('email:parse-and-attach-eml', req),

  readEmlFile: (filePath: string): Promise<{
    success: boolean
    subject?: string
    from?: string
    to?: string
    date?: string | null
    bodyHtml?: string | null
    bodyText?: string
    error?: string
  }> => ipcRenderer.invoke('email:read-eml', filePath),

  selectEmailFile: (): Promise<string | null> =>
    ipcRenderer.invoke('email:select-file'),

  // ── Task Report ───────────────────────────────────────────────────────────
  onReportProgress: (cb: (p: { percent: number; step: string; message: string; current: number; total: number }) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, p: { percent: number; step: string; message: string; current: number; total: number }) => cb(p)
    ipcRenderer.on('task:report-progress', listener)
    return () => ipcRenderer.removeListener('task:report-progress', listener)
  },

  generateTaskReport: (req: {
    summaryHtml: string
    includeAttachments: boolean
    attachments: Array<{ name: string; absPath: string; group?: string }>
    emailAttachments: Array<{ name: string; absPath: string; group?: string }>
    outputPdfPath: string
  }): Promise<{ success: boolean; pdfPath?: string; error?: string }> =>
    ipcRenderer.invoke('task:generate-report', req),

  createReportZip: (req: {
    pdfPath: string
    attachments: Array<{ name: string; absPath: string }>
    emailAttachments: Array<{ name: string; absPath: string }>
    destZipPath: string
  }): Promise<{ success: boolean; zipPath?: string; error?: string }> =>
    ipcRenderer.invoke('task:create-report-zip', req),

  saveReportDialog: (opts: { defaultName: string; type: 'pdf' | 'zip' }): Promise<string | null> =>
    ipcRenderer.invoke('task:save-report-dialog', opts),

  openReport: (filePath: string): Promise<void> =>
    ipcRenderer.invoke('task:open-report', filePath),

  // ── App utilities ─────────────────────────────────────────────────────────
  getUserDataPath: (): Promise<string> =>
    ipcRenderer.invoke('app:get-user-data-path'),

  clearFirebaseCache: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('app:clear-firebase-cache'),

  getDefaultTemplatePath: (): Promise<string> =>
    ipcRenderer.invoke('app:get-default-template-path'),

  readFileAsDataUrl: (filePath: string): Promise<string> =>
    ipcRenderer.invoke('app:read-file-as-dataurl', filePath),

  readPhotoThumbnail: (filePath: string, maxDim?: number): Promise<string | null> =>
    ipcRenderer.invoke('photo:read-thumbnail', { filePath, maxDim }),

  testWriteAccess: (dirPath: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('storage:test-write-access', dirPath),

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
