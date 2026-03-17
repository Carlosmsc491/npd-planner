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

export function registerFileHandlers(ipcMain: IpcMain): void {

  // Copy file to SharePoint local folder
  ipcMain.handle(IPC.FILE_COPY, async (_event, req: IpcFileRequest): Promise<IpcFileResponse> => {
    try {
      // The destPath uses ||| as delimiter — split and use path.join for cross-OS compatibility
      const segments = req.destPath.split('|||')
      const destPath = path.join(...segments)

      if (req.createDirs) {
        const destDir = path.dirname(destPath)
        fs.mkdirSync(destDir, { recursive: true })
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
  ipcMain.handle(
    IPC.SHAREPOINT_RESOLVE_PATH,
    async (_event, sharePointRoot: string, relativePath: string): Promise<string> => {
      const segments = relativePath.split('/')
      return path.join(sharePointRoot, ...segments)
    }
  )

  // Open file with default system app
  ipcMain.handle(IPC.FILE_OPEN, async (_event, filePath: string): Promise<void> => {
    await shell.openPath(filePath)
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
}
