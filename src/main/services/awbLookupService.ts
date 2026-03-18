/**
 * AWB Lookup Service — Main Process
 * ==================================
 * File path: src/main/services/awbLookupService.ts
 *
 * Reads the latest downloaded Traze CSV and provides lookup functions.
 * Also handles cleanup of old CSV files (keep only the latest).
 *
 * This runs in the Electron main process.
 * The renderer requests data via IPC (awbIpcHandlers.ts).
 */

import * as fs   from 'fs';
import * as path from 'path';
import { app }   from 'electron';

const CSV_OUTPUT_DIR = path.join(app.getPath('userData'), 'traze-exports');

// ─── File Management ──────────────────────────────────────────────────────────

interface CsvFileInfo {
  name: string
  filePath: string
  mtime: number
}

function getCsvFiles(): CsvFileInfo[] {
  try {
    if (!fs.existsSync(CSV_OUTPUT_DIR)) return [];

    return fs.readdirSync(CSV_OUTPUT_DIR)
      .filter(f => f.endsWith('.csv'))
      .map(f => {
        const filePath = path.join(CSV_OUTPUT_DIR, f);
        return {
          name: f,
          filePath,
          mtime: fs.statSync(filePath).mtime.getTime(),
        };
      })
      .sort((a, b) => b.mtime - a.mtime); // newest first
  } catch {
    return [];
  }
}

/**
 * Returns the path to the most recent CSV file.
 * Returns null if no CSV exists.
 */
export function getLatestCsvPath(): string | null {
  const files = getCsvFiles();
  return files.length > 0 ? files[0].filePath : null;
}

/**
 * Reads and returns the content of the most recent CSV file.
 * Returns null if no CSV exists or read fails.
 */
export function readLatestCsv(): string | null {
  const csvPath = getLatestCsvPath();
  if (!csvPath) return null;

  try {
    return fs.readFileSync(csvPath, 'utf-8');
  } catch (err) {
    console.error('[AwbLookup] Failed to read CSV:', err);
    return null;
  }
}

/**
 * Deletes all CSV files in the output dir except the most recent one.
 * Called after each successful download to avoid accumulating files.
 */
export function cleanupOldCsvFiles(): void {
  const files = getCsvFiles();
  if (files.length <= 1) return; // nothing to clean

  files.slice(1).forEach(file => {
    try {
      fs.unlinkSync(file.filePath);
      console.log(`[AwbLookup] Deleted old CSV: ${file.name}`);
    } catch (err) {
      console.error(`[AwbLookup] Failed to delete ${file.name}:`, err);
    }
  });
}

/**
 * Returns metadata about the latest CSV file (for status display in UI).
 */
export interface CsvStatus {
  exists: boolean
  filePath: string | null
  downloadedAt: string | null  // ISO timestamp from file mtime
  sizeKb: number | null
}

export function getLatestCsvStatus(): CsvStatus {
  const files = getCsvFiles();
  if (files.length === 0) {
    return { exists: false, filePath: null, downloadedAt: null, sizeKb: null };
  }

  const latest = files[0];
  const stats  = fs.statSync(latest.filePath);

  return {
    exists:       true,
    filePath:     latest.filePath,
    downloadedAt: new Date(latest.mtime).toISOString(),
    sizeKb:       parseFloat((stats.size / 1024).toFixed(1)),
  };
}
