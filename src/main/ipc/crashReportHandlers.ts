// src/main/ipc/crashReportHandlers.ts
// Saves crash reports to the user's local disk.
// Reports are stored as JSON files in {userData}/crash-reports/
// They are meant to be shared with the developer when investigating a crash.

import { ipcMain, app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

export interface CrashReportPayload {
  id: string
  message: string
  stack: string
  route: string
  version: string
  platform: string
  userId: string | null
  userName: string | null
  timestamp: string   // ISO string
}

export function registerCrashReportHandlers(): void {
  /**
   * crash:save-local
   * Writes the crash report JSON to {userData}/crash-reports/{date}_{id}.json
   * Returns the absolute path of the saved file so the UI can display it.
   */
  ipcMain.handle(
    'crash:save-local',
    async (_event, report: CrashReportPayload): Promise<{ success: boolean; filePath?: string; error?: string }> => {
      try {
        const dir = path.join(app.getPath('userData'), 'crash-reports')
        fs.mkdirSync(dir, { recursive: true })

        // File name: 2026-04-24_18-30-00_abc123.json
        const date = new Date(report.timestamp)
        const dateStr = date.toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-')
        const shortId = report.id.slice(-6)
        const fileName = `${dateStr}_${shortId}.json`
        const filePath = path.join(dir, fileName)

        fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf8')
        return { success: true, filePath }
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  /**
   * crash:get-reports-dir
   * Returns the absolute path to the crash-reports folder.
   * Used so the UI can tell the user exactly where their reports are stored.
   */
  ipcMain.handle('crash:get-reports-dir', (): string => {
    return path.join(app.getPath('userData'), 'crash-reports')
  })
}
