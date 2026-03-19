/**
 * AWB IPC Handlers — Main Process
 * =================================
 * File path: src/main/ipc/awbIpcHandlers.ts
 *
 * Handles IPC communication for:
 *   - Reading the latest Traze CSV content
 *   - Triggering manual downloads
 *   - Getting CSV status
 *   - Managing Traze credentials
 *   - Tracking process status and logs
 *   - Refresh with 30-minute cache logic
 *   - Managing Traze preferences (view browser, etc.)
 *
 * IPC Channels:
 *
 *   RENDERER → MAIN (invoke):
 *     'awb:get-latest-csv'         → returns { content, exists, downloadedAt, sizeKb }
 *     'traze:download-now'         → forces immediate download, returns { success }
 *     'traze:get-status'           → returns { lastRun, exists, sizeKb }
 *     'traze:save-credentials'     → saves email/password, returns { success }
 *     'traze:load-credentials'     → returns { email } (no password for security)
 *     'traze:has-credentials'      → returns { hasCredentials: boolean }
 *     'traze:clear-credentials'    → deletes stored credentials
 *     'traze:get-logs'             → returns array of log entries
 *     'traze:clear-logs'           → clears all logs
 *     'traze:get-process-status'   → returns { status, message }
 *     'traze:refresh-csv'          → refresh with 30min cache logic
 *     'traze:get-preferences'      → returns { viewBrowser }
 *     'traze:set-view-browser'     → sets viewBrowser preference
 *
 *   MAIN → RENDERER (send):
 *     'traze:csv-downloaded'       → download complete: { filePath, rowCount, downloadedAt }
 *     'traze:csv-error'            → download error: { message }
 *     'traze:needs-login'          → user needs to log in to Traze
 *     'traze:login-success'        → user just logged in to Traze
 */

import { ipcMain } from 'electron';
import { readLatestCsv, getLatestCsvStatus } from '../services/awbLookupService';
import { forceTrazeDownload } from '../services/trazeIntegrationService';
import {
  readCredentials,
  saveCredentials,
  hasCredentials,
  clearCredentials,
} from '../services/trazeCredentialsService';
import {
  getStatus,
  getLogs,
  clearLogs,
  addLog,
  markProcessStart,
  markProcessComplete,
  markProcessValidating,
} from '../services/trazeStatusService';
import {
  readPreferences,
  updatePreference,
} from '../services/trazePreferencesService';
import * as fs from 'fs';

// Cache duration: 30 minutes in milliseconds
const CACHE_DURATION_MS = 30 * 60 * 1000;

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

  // ── Credential Management ─────────────────────────────────────────────────

  ipcMain.handle('traze:save-credentials', async (_event, { email, password }: { email: string; password: string }) => {
    try {
      if (!email.trim() || !password.trim()) {
        return { success: false, error: 'Email and password are required' };
      }
      saveCredentials(email, password);
      addLog(`Credentials saved for ${email}`, 'info');
      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      addLog(`Failed to save credentials: ${message}`, 'error');
      return { success: false, error: message };
    }
  });

  ipcMain.handle('traze:load-credentials', async () => {
    const creds = readCredentials();
    // Only return email, never return password for security
    return {
      email: creds?.email ?? null,
      hasCredentials: creds !== null,
    };
  });

  ipcMain.handle('traze:has-credentials', async () => {
    return { hasCredentials: hasCredentials() };
  });

  ipcMain.handle('traze:clear-credentials', async () => {
    try {
      clearCredentials();
      addLog('Credentials cleared', 'info');
      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  // ── Status and Logs ───────────────────────────────────────────────────────

  ipcMain.handle('traze:get-process-status', async () => {
    return getStatus();
  });

  ipcMain.handle('traze:get-logs', async () => {
    return getLogs();
  });

  ipcMain.handle('traze:clear-logs', async () => {
    clearLogs();
    return { success: true };
  });

  // ── Refresh with 30-minute Cache Logic ────────────────────────────────────

  ipcMain.handle('traze:refresh-csv', async () => {
    const csvStatus = getLatestCsvStatus();
    
    // Check if we have a recent CSV (less than 30 minutes old)
    if (csvStatus.exists && csvStatus.downloadedAt) {
      const downloadedAt = new Date(csvStatus.downloadedAt).getTime();
      const now = Date.now();
      const ageMs = now - downloadedAt;
      
      if (ageMs < CACHE_DURATION_MS) {
        const minutesAgo = Math.floor(ageMs / 60000);
        addLog(`Using cached CSV (downloaded ${minutesAgo} min ago)`, 'info');
        return {
          usedCache: true,
          message: `Using cached data (updated ${minutesAgo} min ago)`,
          csvStatus,
        };
      }
    }
    
    // Need to download fresh CSV
    addLog('Cache expired or no CSV found, starting fresh download...', 'info');
    markProcessStart();
    
    try {
      await forceTrazeDownload();
      
      // Validate the downloaded file
      markProcessValidating();
      const newStatus = getLatestCsvStatus();
      
      if (!newStatus.exists || !newStatus.filePath) {
        throw new Error('Download completed but CSV file not found');
      }
      
      // Check file size
      const stats = fs.statSync(newStatus.filePath);
      if (stats.size === 0) {
        throw new Error('Downloaded file is empty (0 bytes)');
      }
      
      // Check file has valid content
      const content = fs.readFileSync(newStatus.filePath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());
      if (lines.length < 2) {
        throw new Error('CSV has insufficient data (less than 2 lines)');
      }
      
      markProcessComplete(true, 'Downloaded fresh data successfully');
      addLog(`CSV validated: ${lines.length - 1} rows, ${newStatus.sizeKb} KB`, 'info');
      
      return {
        usedCache: false,
        message: 'Downloaded fresh data',
        csvStatus: newStatus,
      };
      
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      markProcessComplete(false, `Download failed: ${message}`);
      addLog(`Download failed: ${message}`, 'error');
      return {
        usedCache: false,
        message: `Download failed: ${message}`,
        error: true,
      };
    }
  });

  // ── Preferences ───────────────────────────────────────────────────────────

  ipcMain.handle('traze:get-preferences', async () => {
    return readPreferences();
  });

  ipcMain.handle('traze:set-view-browser', async (_event, value: boolean) => {
    try {
      updatePreference('viewBrowser', value);
      addLog(`View Browser preference set to: ${value}`, 'info');
      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });
}
