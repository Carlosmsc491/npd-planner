// src/main/ipc/fileHandlers.ts
// Electron IPC handlers for file system operations
// These run in the MAIN process and have full Node.js access

import { IpcMain, dialog, app, shell, BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { IPC } from '../../shared/constants'
import type {
  IpcFileRequest,
  IpcFileResponse,
  IpcSharePointVerifyRequest,
  IpcSharePointVerifyResponse,
} from '../../renderer/src/types'

/**
 * Safely joins path segments and verifies the result stays within `root`.
 * Prevents path-traversal attacks (e.g. segments containing "../../etc/passwd").
 * Returns the resolved path, or throws if the result would escape `root`.
 */
function safeJoin(root: string, segments: string[]): string {
  const resolved = path.resolve(path.join(root, ...segments))
  const normalRoot = path.resolve(root)
  if (!resolved.startsWith(normalRoot + path.sep) && resolved !== normalRoot) {
    throw new Error(`Path traversal detected: "${resolved}" is outside "${normalRoot}"`)
  }
  return resolved
}

/**
 * Finds a unique folder name inside parentDir.
 * Returns `name` if the folder doesn't exist, else `name (1)`, `name (2)`, etc.
 * If the folder exists but is empty, it's considered available (reuse it).
 */
function resolveUniqueDir(parentDir: string, name: string): string {
  const base = path.join(parentDir, name)
  if (!fs.existsSync(base)) return name
  // Folder exists — if it's empty, reuse it
  try {
    if (fs.readdirSync(base).length === 0) return name
  } catch { /* ignore — treat as non-empty */ }
  // Find next available (n) suffix
  let n = 1
  while (fs.existsSync(path.join(parentDir, `${name} (${n})`))) n++
  return `${name} (${n})`
}

export function registerFileHandlers(ipcMain: IpcMain): void {

  // Copy file to SharePoint local folder.
  // destPath is ||| delimited where the FIRST segment is the SharePoint root.
  // All subsequent segments are joined and validated to stay inside that root.
  ipcMain.handle(IPC.FILE_COPY, async (_event, req: IpcFileRequest): Promise<IpcFileResponse> => {
    try {
      const segments = req.destPath.split('|||')
      if (segments.length < 2) {
        return { success: false, error: 'Invalid destination path format.' }
      }
      const root = segments[0]
      const relParts = segments.slice(1)  // e.g. ['2026', 'Client', 'Task A', 'file.pdf']

      // Resolve unique folder name for the task-level segment (second-to-last).
      // Skip dedup when the caller already has a pre-resolved folder name.
      let resolvedFolderName: string | undefined
      if (relParts.length >= 2) {
        const taskSegIdx = relParts.length - 2
        if (req.resolvedFolder) {
          relParts[taskSegIdx] = req.resolvedFolder
          resolvedFolderName = req.resolvedFolder
        } else {
          const parentDir = safeJoin(root, relParts.slice(0, taskSegIdx))
          resolvedFolderName = resolveUniqueDir(parentDir, relParts[taskSegIdx])
          relParts[taskSegIdx] = resolvedFolderName
        }
      }

      const destPath = safeJoin(root, relParts)

      if (req.createDirs) {
        fs.mkdirSync(path.dirname(destPath), { recursive: true })
      }

      fs.copyFileSync(req.sourcePath, destPath)
      return { success: true, resolvedFolderName }
    } catch (err) {
      console.error('file:copy failed:', err)
      return { success: false, error: String(err) }
    }
  })

  // Verify SharePoint folder contains the verification subfolder
  ipcMain.handle(
    IPC.SHAREPOINT_VERIFY,
    async (_event, req: IpcSharePointVerifyRequest): Promise<IpcSharePointVerifyResponse> => {
      try {
        const verificationPath = path.join(req.folderPath, req.verificationSubfolder)
        const exists = fs.existsSync(verificationPath)

        if (!exists) {
          return {
            valid: false,
            error: `Could not find "${req.verificationSubfolder}" inside the selected folder.`,
          }
        }

        const stats = fs.statSync(verificationPath)
        if (!stats.isDirectory()) {
          return {
            valid: false,
            error: `"${req.verificationSubfolder}" exists but is not a folder.`,
          }
        }

        return { valid: true }
      } catch (err) {
        return { valid: false, error: String(err) }
      }
    }
  )

  // Open native folder picker dialog
  ipcMain.handle(IPC.FILE_SELECT_FOLDER, async (event): Promise<string | null> => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null

    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      title: 'Select your SharePoint sync folder',
      buttonLabel: 'Select Folder',
    })

    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // Get current app version
  ipcMain.handle(IPC.APP_VERSION, (): string => {
    return app.getVersion()
  })

  // Check if a file exists
  ipcMain.handle('file:exists', async (_event, filePath: string): Promise<boolean> => {
    try {
      return fs.existsSync(filePath)
    } catch {
      return false
    }
  })

  // Resolve full path from SharePoint root + relative path
  // Uses safeJoin() to prevent path-traversal (e.g. relativePath = "../../etc/passwd")
  ipcMain.handle(
    IPC.SHAREPOINT_RESOLVE_PATH,
    async (_event, sharePointRoot: string, relativePath: string): Promise<string> => {
      try {
        // relativePath is always a stored sub-path (e.g. "2026/Publix/spec.xlsx"), never an
        // absolute or UNC path. Normalizing backslashes here is safe — sharePointRoot is passed
        // directly to safeJoin without modification, so UNC roots like \\server\share are preserved.
        const segments = relativePath.replace(/\\/g, '/').split('/').filter(Boolean)
        return safeJoin(sharePointRoot, segments)
      } catch (err) {
        throw new Error(`Invalid path: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  )

  // Open file with default system app
  ipcMain.handle(IPC.FILE_OPEN, async (_event, filePath: string): Promise<void> => {
    await shell.openPath(filePath)
  })

  // Reveal file in Finder (Mac) or Explorer (Windows)
  ipcMain.handle('file:show-in-folder', (_event, filePath: string): void => {
    shell.showItemInFolder(filePath)
  })

  // Print a file — opens it in the default app which handles printing.
  // For PDFs and images the OS print dialog appears automatically.
  ipcMain.handle('file:print', async (_event, filePath: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const result = await shell.openPath(filePath)
      if (result) return { success: false, error: result }
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // Open native folder picker — returns selected folder path or null
  ipcMain.handle('dialog:open-folder', async (event): Promise<string | null> => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Watch Folder',
      buttonLabel: 'Watch This Folder',
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // Open native file picker — returns selected file path or null
  ipcMain.handle(IPC.FILE_SELECT, async (event): Promise<string | null> => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null

    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      title: 'Select a file to attach',
      buttonLabel: 'Attach',
    })

    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // Open file picker filtered to email files (.eml, .msg)
  ipcMain.handle('email:select-file', async (event): Promise<string | null> => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      title: 'Select an email file to attach',
      buttonLabel: 'Attach Email',
      filters: [
        { name: 'Email files', extensions: ['eml', 'msg'] },
        { name: 'All files', extensions: ['*'] },
      ],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // Read a file and return its contents as a base64 string (for inline preview)
  ipcMain.handle(IPC.FILE_READ_BASE64, async (_event, filePath: string): Promise<string | null> => {
    try {
      const buffer = fs.readFileSync(filePath)
      return buffer.toString('base64')
    } catch {
      return null
    }
  })

  // Open URL in external browser — only https:// and http:// are allowed.
  // Blocks file://, javascript:, data: and any other scheme that could be used
  // to execute code or access the local filesystem.
  ipcMain.handle(IPC.OPEN_EXTERNAL, async (_event, url: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const parsed = new URL(url)
      const allowed = ['https:', 'http:', 'mailto:']
      if (!allowed.includes(parsed.protocol)) {
        console.warn(`[openExternal] Blocked non-http(s) scheme: ${parsed.protocol}`)
        return { success: false, error: 'Only http(s) and mailto URLs are allowed.' }
      }
      await shell.openExternal(url)
      return { success: true }
    } catch (err) {
      console.error('shell:openExternal failed:', err)
      return { success: false, error: String(err) }
    }
  })

  // Save text content to file (used for Trip/Vacation HTML templates)
  // destPath uses ||| delimiter — first segment is the root, rest are sub-paths.
  ipcMain.handle('file:save-text', async (_event, destPath: string, content: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const segments = destPath.split('|||')
      if (segments.length < 2) {
        return { success: false, error: 'Invalid destination path format.' }
      }
      const root = segments[0]
      const relParts = segments.slice(1)
      if (relParts.length >= 2) {
        const taskSegIdx = relParts.length - 2
        const parentDir = safeJoin(root, relParts.slice(0, taskSegIdx))
        relParts[taskSegIdx] = resolveUniqueDir(parentDir, relParts[taskSegIdx])
      }
      const fullPath = safeJoin(root, relParts)
      fs.mkdirSync(path.dirname(fullPath), { recursive: true })
      fs.writeFileSync(fullPath, content, 'utf-8')
      return { success: true }
    } catch (err) {
      console.error('file:save-text failed:', err)
      return { success: false, error: String(err) }
    }
  })

  // Render an HTML string to a PDF file using a hidden BrowserWindow.
  // destPath uses ||| delimiter — same convention as file:save-text.
  ipcMain.handle('file:html-to-pdf', async (_event, destPath: string, htmlContent: string): Promise<{ success: boolean; error?: string }> => {
    let tmpHtmlPath: string | null = null
    let win: BrowserWindow | null = null
    try {
      const segments = destPath.split('|||')
      if (segments.length < 2) {
        return { success: false, error: 'Invalid destination path format.' }
      }
      const root = segments[0]
      const relParts = segments.slice(1)

      // Write HTML to a temp file (avoids data-URL length limits for large reports)
      tmpHtmlPath = path.join(os.tmpdir(), `npd-report-${Date.now()}.html`)
      fs.writeFileSync(tmpHtmlPath, htmlContent, 'utf-8')

      // Resolve unique task folder (second-to-last segment)
      if (relParts.length >= 2) {
        const taskSegIdx = relParts.length - 2
        const parentDir = safeJoin(root, relParts.slice(0, taskSegIdx))
        relParts[taskSegIdx] = resolveUniqueDir(parentDir, relParts[taskSegIdx])
      }
      const fullPath = safeJoin(root, relParts)

      win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
      await win.loadFile(tmpHtmlPath)

      const pdfBuffer = await win.webContents.printToPDF({
        pageSize: 'Letter',
        printBackground: true,
        margins: { top: 0.4, bottom: 0.4, left: 0.5, right: 0.5 },
      })

      fs.mkdirSync(path.dirname(fullPath), { recursive: true })
      fs.writeFileSync(fullPath, pdfBuffer)
      return { success: true }
    } catch (err) {
      console.error('file:html-to-pdf failed:', err)
      return { success: false, error: String(err) }
    } finally {
      if (win && !win.isDestroyed()) win.destroy()
      if (tmpHtmlPath) try { fs.unlinkSync(tmpHtmlPath) } catch { /* best-effort */ }
    }
  })
}
