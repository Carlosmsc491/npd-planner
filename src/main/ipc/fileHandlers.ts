// src/main/ipc/fileHandlers.ts
// Electron IPC handlers for file system operations
// These run in the MAIN process and have full Node.js access

import { IpcMain, dialog, app, shell, BrowserWindow } from 'electron'
import * as fs from 'fs'
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
      // segments[0] is the SharePoint root; the rest are relative sub-paths
      const root = segments[0]
      const destPath = safeJoin(root, segments.slice(1))

      if (req.createDirs) {
        fs.mkdirSync(path.dirname(destPath), { recursive: true })
      }

      fs.copyFileSync(req.sourcePath, destPath)
      return { success: true }
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
      const fullPath = safeJoin(root, segments.slice(1))

      fs.mkdirSync(path.dirname(fullPath), { recursive: true })
      fs.writeFileSync(fullPath, content, 'utf-8')
      return { success: true }
    } catch (err) {
      console.error('file:save-text failed:', err)
      return { success: false, error: String(err) }
    }
  })
}
