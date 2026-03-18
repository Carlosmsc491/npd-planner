/**
 * Traze Integration Service — Main Process
 * ==========================================
 * File path: src/main/services/trazeIntegrationService.ts
 *
 * Scheduler para descargar el CSV de Traze cada 1 hora, de 7 AM a 6 PM.
 * También descarga inmediatamente al abrir el app (si está dentro del horario).
 */

import { BrowserWindow } from 'electron';
import * as fs   from 'fs';
import * as path from 'path';
import { app }   from 'electron';
import { downloadTrazeCSV }    from './trazePlaywrightService';
import { cleanupOldCsvFiles }  from './awbLookupService';

const CSV_OUTPUT_DIR = path.join(app.getPath('userData'), 'traze-exports');
const LAST_RUN_FILE  = path.join(CSV_OUTPUT_DIR, '.last_run');

const SCHEDULE_START_HOUR = 7;   // 7:00 AM
const SCHEDULE_END_HOUR   = 18;  // 6:00 PM
const INTERVAL_HOURS      = 1;
const CHECK_EVERY_MS      = 5 * 60 * 1000; // revisar cada 5 min

let schedulerInterval: ReturnType<typeof setInterval> | null = null;
let npdWindow:  BrowserWindow | null = null;
let isDownloading = false;

// ─── Last-run persistence ─────────────────────────────────────────────────────

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
  if (isDownloading) {
    console.log('[TrazeIntegration] Descarga en progreso, se omite');
    return;
  }

  isDownloading = true;
  console.log('[TrazeIntegration] Iniciando descarga CSV...');

  try {
    const filePath = await downloadTrazeCSV();

    const content  = fs.readFileSync(filePath, 'utf-8');
    const rowCount = content.split('\n').filter(Boolean).length - 1;
    const sizeKb   = parseFloat((content.length / 1024).toFixed(1));

    saveLastRun();
    cleanupOldCsvFiles();

    console.log(`[TrazeIntegration] ✅ Descarga completa: ${rowCount} filas, ${sizeKb} KB`);

    npdWindow?.webContents.send('traze:csv-downloaded', {
      filePath,
      rowCount,
      sizeKb,
      downloadedAt: new Date().toISOString(),
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[TrazeIntegration] Error en descarga:', message);
    npdWindow?.webContents.send('traze:csv-error', { message });
  } finally {
    isDownloading = false;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Inicia el servicio de integración con Traze.
 * Descarga inmediatamente si está dentro del horario,
 * luego programa descargas cada hora.
 */
export function startTrazeIntegration(mainWindow: BrowserWindow): void {
  npdWindow = mainWindow;

  if (schedulerInterval) stopTrazeIntegration();

  console.log('[TrazeIntegration] Iniciado. Horario: 7 AM–6 PM, cada 1 hora.');

  // Descargar inmediatamente al abrir el app (si está en horario)
  if (isWithinSchedule()) {
    console.log('[TrazeIntegration] Dentro de horario — descargando al abrir app');
    downloadCsv();
  } else {
    console.log('[TrazeIntegration] Fuera de horario — esperando próxima ventana');
  }

  schedulerInterval = setInterval(() => {
    if (shouldRunNow()) {
      console.log('[TrazeIntegration] ⏰ 1h pasó → descargando');
      downloadCsv();
    }
  }, CHECK_EVERY_MS);
}

/**
 * Descarga forzada (botón manual en el UI).
 */
export async function forceTrazeDownload(): Promise<void> {
  console.log('[TrazeIntegration] Descarga manual activada');
  await downloadCsv();
}

/**
 * Detiene el scheduler. Llamar en app.on('before-quit').
 */
export function stopTrazeIntegration(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('[TrazeIntegration] Detenido.');
  }
}
