/**
 * AWB IPC Handlers — Main Process
 * =================================
 * File path: src/main/ipc/awbIpcHandlers.ts
 *
 * Handles IPC communication for:
 *   - Reading the latest Traze CSV content
 *   - Triggering manual downloads
 *   - Getting CSV status
 *
 * IPC Channels:
 *
 *   RENDERER → MAIN (invoke):
 *     'awb:get-latest-csv'    → returns { content, exists, downloadedAt, sizeKb }
 *     'traze:download-now'    → forces immediate download, returns { success }
 *     'traze:get-status'      → returns { lastRun, exists, sizeKb }
 *
 *   MAIN → RENDERER (send):
 *     'traze:csv-downloaded'  → download complete: { filePath, rowCount, downloadedAt }
 *     'traze:csv-error'       → download error: { message }
 *     'traze:needs-login'     → user needs to log in to Traze
 *     'traze:login-success'   → user just logged in to Traze
 */

import { ipcMain } from 'electron';
import { readLatestCsv, getLatestCsvStatus } from '../services/awbLookupService';
import { forceTrazeDownload } from '../services/trazeIntegrationService';

export function registerAwbIpcHandlers(): void {

  // ── Renderer requests latest CSV content for AWB lookup ──────────────────
  ipcMain.handle('awb:get-latest-csv', async () => {
    const content = readLatestCsv();
    const status  = getLatestCsvStatus();

    return {
      content,
      exists:       status.exists,
      downloadedAt: status.downloadedAt,
      sizeKb:       status.sizeKb,
    };
  });

  // ── Renderer requests manual download ─────────────────────────────────────
  ipcMain.handle('traze:download-now', async () => {
    try {
      await forceTrazeDownload();
      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  // ── Renderer checks CSV status ────────────────────────────────────────────
  ipcMain.handle('traze:get-status', async () => {
    return getLatestCsvStatus();
  });
}
