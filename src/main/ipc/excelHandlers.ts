/**
 * excelHandlers.ts
 * IPC handlers for Excel manipulation — currently: inserting a photo into
 * the "Spec Sheet" PHOTO area (G8:M35) using the Python script insert_photo.py.
 */

import { ipcMain, app } from 'electron'
import { execFile } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'

/** Returns the path to insert_photo.py: dev uses repo root, production uses resourcesPath. */
function getScriptPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'scripts', 'insert_photo.py')
  }
  // In dev, __dirname = out/main — walk up two levels to repo root
  return path.join(__dirname, '../../resources/scripts/insert_photo.py')
}

export function registerExcelHandlers(): void {
  /**
   * excel:check-dependencies
   * Returns whether python3 + openpyxl + Pillow are available.
   */
  ipcMain.handle(
    'excel:check-dependencies',
    async (): Promise<{ available: boolean; error?: string }> => {
      return new Promise(resolve => {
        execFile(
          'python3',
          ['-c', 'import openpyxl, PIL; print("OK")'],
          { timeout: 10_000 },
          (error, stdout) => {
            if (error || stdout.trim() !== 'OK') {
              resolve({
                available: false,
                error: 'openpyxl or Pillow not installed. Run: pip3 install openpyxl pillow',
              })
            } else {
              resolve({ available: true })
            }
          }
        )
      })
    }
  )

  /**
   * excel:insert-photo
   * Inserts a JPG into G8:M35 of the "Spec Sheet" worksheet.
   * Returns { success: true } or { success: false, error: string }.
   */
  ipcMain.handle(
    'excel:insert-photo',
    async (
      _event,
      { excelPath, jpgPath }: { excelPath: string; jpgPath: string }
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        if (!fs.existsSync(excelPath)) {
          return { success: false, error: `Excel file not found: ${excelPath}` }
        }
        if (!fs.existsSync(jpgPath)) {
          return { success: false, error: `Image file not found: ${jpgPath}` }
        }

        const scriptPath = getScriptPath()
        if (!fs.existsSync(scriptPath)) {
          return { success: false, error: `Script not found: ${scriptPath}` }
        }

        return new Promise(resolve => {
          execFile(
            'python3',
            [scriptPath, excelPath, jpgPath],
            { timeout: 30_000 },
            (error, _stdout, stderr) => {
              if (error) {
                const msg = (stderr || error.message).trim()
                // Strip leading "ERROR: " prefix added by the Python script
                const clean = msg.replace(/^ERROR:\s*/i, '')
                resolve({ success: false, error: clean })
              } else {
                resolve({ success: true })
              }
            }
          )
        })
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )
}
