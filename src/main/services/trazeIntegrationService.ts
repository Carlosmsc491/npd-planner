/**
 * Traze Integration Service — Main Process
 * ==========================================
 * File path: src/main/services/trazeIntegrationService.ts
 *
 * Connects the Traze download scheduler with the NPD Planner main window.
 * Handles periodic CSV downloads from trazeapi.com every 2 hours, 7AM–6PM.
 */

import { BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs   from 'fs';
import { app }   from 'electron';
import { setTrazeLoginCallback, setTrazeCsvDownloadCallback, showTrazeLoginWindow, downloadCsvViaTrazeWindow, getOrCreateTrazeWindow } from './trazeWindowManager';
import { cleanupOldCsvFiles } from './awbLookupService';
import { getWeekRange }      from '../utils/dateRange';

const CSV_OUTPUT_DIR = path.join(app.getPath('userData'), 'traze-exports');

const SCHEDULE_START_HOUR = 7;  // 7:00 AM
const SCHEDULE_END_HOUR   = 18;  // 6:00 PM
const INTERVAL_HOURS      = 2;
const CHECK_EVERY_MS      = 5 * 60 * 1000; // check every 5 minutes

let schedulerInterval: ReturnType<typeof setInterval> | null = null;
let npdWindow: BrowserWindow | null = null;

// ─── Last-run persistence ─────────────────────────────────────────────────────

const LAST_RUN_FILE = path.join(CSV_OUTPUT_DIR, '.last_run');

function getLastRun(): Date | null {
  try {
    const content = fs.readFileSync(LAST_RUN_FILE, 'utf-8').trim();
    return new Date(content);
  } catch {
    return null;
  }
}

function saveLastRun(): void {
  try {
    fs.mkdirSync(path.dirname(LAST_RUN_FILE), { recursive: true });
    fs.writeFileSync(LAST_RUN_FILE, new Date().toISOString(), 'utf-8');
  } catch (err) {
    console.error('[TrazeIntegration] Could not save last_run:', err);
  }
}

// ─── Schedule logic ───────────────────────────────────────────────────────────

function isWithinSchedule(): boolean {
  const hour = new Date().getHours();
  return hour >= SCHEDULE_START_HOUR && hour < SCHEDULE_END_HOUR;
}

function shouldRunNow(): boolean {
  if (!isWithinSchedule()) return false;
  const last = getLastRun();
  if (!last) return true;
  const diffHours = (Date.now() - last.getTime()) / (1000 * 60 * 60);
  return diffHours >= INTERVAL_HOURS;
}

// ─── Download logic ───────────────────────────────────────────────────────────

async function downloadCsv(): Promise<void> {
  const range = getWeekRange();
  console.log(`[TrazeIntegration] Downloading: ${range.fromDisplay} → ${range.toDisplay}`);

  try {
    // Delegate the fetch to the Traze BrowserWindow renderer.
    // Node.js fetch() in the main process lacks Electron's cookie jar, so
    // trazeapi.com rejects it with SessionNotFound. The Traze window's renderer
    // carries the correct session cookies from the user's login.
    const csvContent = await downloadCsvViaTrazeWindow(range.from, range.to);

    // Save to disk
    fs.mkdirSync(CSV_OUTPUT_DIR, { recursive: true });
    const dateTag  = new Date().toISOString().slice(0, 10);
    const filePath = path.join(CSV_OUTPUT_DIR, `shipments_inbound_${dateTag}.csv`);
    fs.writeFileSync(filePath, csvContent, 'utf-8');

    const rowCount = csvContent.split('\n').filter(Boolean).length - 1;
    const sizeKb   = parseFloat((csvContent.length / 1024).toFixed(1));

    console.log(`[TrazeIntegration] ✅ CSV saved: ${filePath} (${rowCount} rows, ${sizeKb} KB)`);

    saveLastRun();
    cleanupOldCsvFiles();

    npdWindow?.webContents.send('traze:csv-downloaded', {
      filePath,
      rowCount,
      sizeKb,
      dateFrom:     range.from,
      dateTo:       range.to,
      downloadedAt: new Date().toISOString(),
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[TrazeIntegration] Download error:', message);
    npdWindow?.webContents.send('traze:csv-error', { message });
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Starts the Traze integration service.
 * Call this from main.ts after the NPD Planner window has loaded.
 */
export function startTrazeIntegration(mainWindow: BrowserWindow): void {
  npdWindow = mainWindow;

  if (schedulerInterval) stopTrazeIntegration();

  console.log('[TrazeIntegration] Started. Schedule: 7 AM–6 PM, every 2 hours.');

  // Download immediately after user logs in to Traze (or on persistent session)
  // This also handles catch-up: if the user is already logged in, the
  // did-navigate event fires on page load and triggers this callback.
  setTrazeLoginCallback(() => {
    console.log('[TrazeIntegration] Traze login detected → downloading CSV now');
    downloadCsv();
  });

  // Capture CSV files exported manually via the Traze browser UI
  setTrazeCsvDownloadCallback((filePath, rowCount, sizeKb) => {
    console.log('[TrazeIntegration] CSV captured via browser export');
    saveLastRun();
    cleanupOldCsvFiles();
    npdWindow?.webContents.send('traze:csv-downloaded', {
      filePath,
      rowCount,
      sizeKb,
      downloadedAt: new Date().toISOString(),
    });
  });

  // Create the Traze window so the user can log in (or persistent session loads)
  getOrCreateTrazeWindow(true);

  console.log('[TrazeIntegration] Waiting for Traze login to trigger first download...');

  schedulerInterval = setInterval(() => {
    if (shouldRunNow()) {
      console.log('[TrazeIntegration] ⏰ 2h passed → downloading');
      downloadCsv();
    }
  }, CHECK_EVERY_MS);
}

/**
 * Forces an immediate download. Used by the manual "Download Now" button.
 *
 * Tries the API approach first. Also shows the Traze window so the user
 * can manually set dates and click Export if needed — any CSV downloaded
 * from the window is captured automatically via the will-download handler.
 */
export async function forceTrazeDownload(): Promise<void> {
  console.log('[TrazeIntegration] Manual download triggered');
  showTrazeLoginWindow();
  await downloadCsv();
}

/**
 * Stops the scheduler. Call in app.on('before-quit').
 */
export function stopTrazeIntegration(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('[TrazeIntegration] Stopped.');
  }
}
