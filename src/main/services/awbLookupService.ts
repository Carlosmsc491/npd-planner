/**
 * AWB Lookup Service — Main Process
 * ==================================
 * File path: src/main/services/awbLookupService.ts
 *
 * Reads downloaded Traze CSV files and provides lookup functions.
 * Retains CSVs for 7 days so that AWBs that drop off newer exports
 * still have their flight data available from older files.
 *
 * This runs in the Electron main process.
 * The renderer requests data via IPC (awbIpcHandlers.ts).
 */

import * as fs   from 'fs';
import * as path from 'path';
import { app }   from 'electron';

const CSV_OUTPUT_DIR = path.join(app.getPath('userData'), 'traze-exports');

/** How many days to keep CSV files before cleanup */
const RETENTION_DAYS = 7;

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
 * Reads ALL retained CSV files and merges their content.
 * Returns a single CSV string where rows from newer files take priority.
 * AWBs that only exist in older files are preserved.
 *
 * This ensures that AWBs that dropped off the latest Traze export
 * (because they already arrived) still have their tracking data.
 */
export function readMergedCsvs(): string | null {
  const files = getCsvFiles();
  if (files.length === 0) return null;

  // Track seen AWBs to avoid duplicates (newest wins)
  const seenAwbs = new Set<string>();
  let headerLine = '';
  const dataLines: string[] = [];

  for (const file of files) {
    try {
      const content = fs.readFileSync(file.filePath, 'utf-8');
      const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      if (lines.length < 2) continue;

      // Use header from the first (newest) file
      if (!headerLine) {
        headerLine = lines[0];
      }

      // Find the AWB column index
      const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim().toLowerCase());
      const awbColIdx = headers.findIndex(h => h === 'full awb/bol');

      for (let i = 1; i < lines.length; i++) {
        // Extract AWB number to check for duplicates
        const cells = parseCsvLineSimple(lines[i]);
        const awbRaw = awbColIdx >= 0 ? (cells[awbColIdx] ?? '').replace(/\D/g, '') : '';

        if (awbRaw && seenAwbs.has(awbRaw)) continue; // newer file already has this AWB
        if (awbRaw) seenAwbs.add(awbRaw);

        dataLines.push(lines[i]);
      }
    } catch (err) {
      console.error(`[AwbLookup] Failed to read ${file.name}:`, err);
    }
  }

  if (!headerLine || dataLines.length === 0) return null;

  return headerLine + '\n' + dataLines.join('\n');
}

/**
 * Simple CSV line parser for AWB extraction (not full parser — just splits on commas).
 */
function parseCsvLineSimple(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim().replace(/^"|"$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim().replace(/^"|"$/g, ''));
  return result;
}

/**
 * Retención por 7 días:
 *   - Guarda TODOS los CSVs de los últimos 7 días.
 *   - Elimina cualquier CSV con más de 7 días de antigüedad.
 *
 * Formato de nombre esperado: traze_export_YYYY-MM-DD_HH-mm-ss.csv
 */
export function cleanupOldCsvFiles(): void {
  const files = getCsvFiles();
  if (files.length === 0) return;

  const cutoffMs = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;

  const oldFiles = files.filter(f => f.mtime < cutoffMs);

  oldFiles.forEach(file => {
    try {
      fs.unlinkSync(file.filePath);
      console.log(`[AwbLookup] CSV anterior eliminado (>7 días): ${file.name}`);
    } catch (err) {
      console.error(`[AwbLookup] No se pudo eliminar ${file.name}:`, err);
    }
  });

  if (oldFiles.length > 0) {
    console.log(`[AwbLookup] Cleanup: ${oldFiles.length} old CSVs removed, ${files.length - oldFiles.length} retained`);
  }
}

/**
 * Returns metadata about the latest CSV file (for status display in UI).
 */
export interface CsvStatus {
  exists: boolean
  filePath: string | null
  downloadedAt: string | null  // ISO timestamp from file mtime
  sizeKb: number | null
  totalFiles: number           // how many CSVs are retained
}

export function getLatestCsvStatus(): CsvStatus {
  const files = getCsvFiles();
  if (files.length === 0) {
    return { exists: false, filePath: null, downloadedAt: null, sizeKb: null, totalFiles: 0 };
  }

  const latest = files[0];
  const stats  = fs.statSync(latest.filePath);

  return {
    exists:       true,
    filePath:     latest.filePath,
    downloadedAt: new Date(latest.mtime).toISOString(),
    sizeKb:       parseFloat((stats.size / 1024).toFixed(1)),
    totalFiles:   files.length,
  };
}
