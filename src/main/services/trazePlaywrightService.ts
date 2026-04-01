/**
 * Traze Playwright Service — Main Process
 * ========================================
 * File path: src/main/services/trazePlaywrightService.ts
 *
 * Downloads the Inbound Master Shipments CSV from Traze using Playwright.
 * Follows the exact same navigation flow as the standalone traze.js script.
 *
 * CREDENTIALS:
 *   Stored in {userData}/traze-credentials.json
 *   Format: { "email": "...", "password": "..." }
 *
 * OUTPUT:
 *   Saved to {userData}/traze-exports/traze_export.csv
 */

import { chromium } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';
import * as os from 'os';
import { readPreferences } from './trazePreferencesService';

const CSV_OUTPUT_DIR    = path.join(app.getPath('userData'), 'traze-exports');
const CREDENTIALS_FILE  = path.join(app.getPath('userData'), 'traze-credentials.json');

interface TrazeCredentials {
  email:    string;
  password: string;
}

/**
 * Resolves the correct Chromium executable path.
 * Returns undefined immediately if Chromium is not available — never tries
 * to auto-install (npx is not available in a packaged Electron app).
 */
export function resolveChromiumPath(): string | undefined {
  const defaultPath = chromium.executablePath()

  if (app.isPackaged) {
    // Bundled Chromium is always at resources/playwright-browsers/chromium-1208
    // Windows: bundled from %LOCALAPPDATA%/ms-playwright/chromium-1208
    // Mac: bundled from ~/.cache/ms-playwright/chromium-1208
    const bundledBase = path.join(process.resourcesPath, 'playwright-browsers')
    if (fs.existsSync(bundledBase)) {
      // Playwright's executablePath points deep inside chromium-XXXX/
      // We replace the user-local ms-playwright root with our bundled root
      const localMsPlaywright =
        process.platform === 'darwin'
          ? path.join(os.homedir(), '.cache', 'ms-playwright')
          : path.join(
              process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
              'ms-playwright'
            )
      const bundledPath = defaultPath.replace(localMsPlaywright, bundledBase)
      if (fs.existsSync(bundledPath)) {
        console.log('[Traze] Using bundled Chromium:', bundledPath)
        return bundledPath
      }
      console.warn('[Traze] playwright-browsers folder exists but executable not found at:', bundledPath)
    }
  }

  // Use the user-local Playwright Chromium if present
  if (fs.existsSync(defaultPath)) {
    console.log('[Traze] Using local Chromium:', defaultPath)
    return defaultPath
  }

  console.warn('[Traze] Chromium not found — Traze integration disabled')
  return undefined
}

/** Returns true if Chromium is available and Traze can run. */
export function isChromiumAvailable(): boolean {
  return resolveChromiumPath() !== undefined
}

function loadCredentials(): TrazeCredentials {
  try {
    const raw = fs.readFileSync(CREDENTIALS_FILE, 'utf-8');
    return JSON.parse(raw) as TrazeCredentials;
  } catch {
    throw new Error(
      `Traze credentials not found. Create the file:\n${CREDENTIALS_FILE}\nWith content: {"email":"...","password":"..."}`
    );
  }
}

/**
 * Downloads the Inbound Master Shipments CSV from Traze.
 * Exactly follows the traze.js automation flow.
 * Returns the absolute path to the saved CSV file.
 */
export async function downloadTrazeCSV(): Promise<string> {
  const executablePath = resolveChromiumPath();
  if (!executablePath) {
    throw new Error(
      'Chromium no está instalado. La integración con Traze no está disponible en esta máquina. ' +
      'Contacta al administrador para configurar Playwright.'
    )
  }

  const creds = loadCredentials();

  fs.mkdirSync(CSV_OUTPUT_DIR, { recursive: true });

  // Check user preference for view browser mode
  const preferences = readPreferences();
  const browser = await chromium.launch({
    headless: !preferences.viewBrowser,
    executablePath,
  });
  const context = await browser.newContext({ acceptDownloads: true });
  const page    = await context.newPage();

  try {
    // ── PASO 1: Sign In ──────────────────────────────────────────────────────
    await page.goto('https://www.trazeapp.com/signin');
    await page.fill('input[type="text"].form-control', creds.email);
    await page.fill('input[type="password"].form-control', creds.password);
    await page.click('input.btn-primary[type="button"]');

    await page.waitForSelector('text=Select Company');
    await page.click('text=Elite >> nth=0');

    // ── PASO 2: Transport > Inbound > Master Shipments ───────────────────────
    await page.waitForSelector('text=Transport');
    await page.click('text=Transport');

    await page.waitForSelector('text=Inbound', { state: 'visible' });
    await page.click('text=Inbound');

    await page.waitForSelector('text=Master Shipments', { state: 'visible' });
    await page.click('text=Master Shipments');

    await page.waitForURL('**/shipments/shipments**');
    await page.waitForSelector('table tbody tr td', { state: 'visible', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 40000 });

    // ── PASO 3: Fechas Ship Date From / To ───────────────────────────────────
    const today = new Date();

    const fromDate = new Date(today);
    fromDate.setDate(today.getDate() - 7);

    const toDate = new Date(today);
    toDate.setDate(today.getDate() + 7);

    const format = (d: Date): string => {
      const mm   = String(d.getMonth() + 1).padStart(2, '0');
      const dd   = String(d.getDate()).padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${mm}/${dd}/${yyyy}`;
    };

    await page.waitForTimeout(2500);

    const fromInput = page.locator('input[placeholder="From"]').first();
    await fromInput.waitFor({ state: 'visible' });
    await fromInput.click({ clickCount: 3 });
    await fromInput.fill(format(fromDate));

    const toInput = page.locator('input[placeholder="To"]').first();
    await toInput.waitFor({ state: 'visible' });
    await toInput.click({ clickCount: 3 });
    await toInput.fill(format(toDate));

    // ── Refresh ──────────────────────────────────────────────────────────────
    const allButtons = await page.$$('button');
    await allButtons[3].click();

    await page.waitForLoadState('networkidle', { timeout: 30000 });
    await page.waitForSelector('table tbody tr td', { state: 'visible', timeout: 30000 });
    await page.waitForTimeout(2000);

    // ── PASO 4: Activar columnas ETA y ATA ───────────────────────────────────
    // Abrir panel de columnas
    await page.waitForSelector('button.btn-columns', { state: 'visible', timeout: 10000 });
    await page.click('button.btn-columns');
    await page.waitForTimeout(1000);

    // Activar ETA y ATA haciendo clic en su eyeIcon si están desactivados (fa-ban)
    await page.evaluate(() => {
      const items = document.querySelectorAll('li.ui-sortable-handle');
      let etaDone = false;
      let ataDone = false;

      for (const item of items) {
        const title = item.querySelector('.column-title');
        if (!title) continue;
        const titleText = title.textContent?.trim();
        const eyeIcon = item.querySelector('a.eyeIcon') as HTMLElement | null;
        const eyeSpan = eyeIcon ? eyeIcon.querySelector('span') : null;

        if (titleText === 'ETA' && !etaDone) {
          // Solo activar si está desactivado (fa-ban)
          if (eyeSpan && eyeSpan.classList.contains('fa-ban')) {
            eyeIcon?.click();
          }
          etaDone = true;
        } else if (titleText === 'ATA' && !ataDone) {
          // Solo activar si está desactivado (fa-ban)
          if (eyeSpan && eyeSpan.classList.contains('fa-ban')) {
            eyeIcon?.click();
          }
          ataDone = true;
        }
        if (etaDone && ataDone) break;
      }
    });

    await page.waitForTimeout(500);

    // Verificar que quedaron activados (fa-check)
    const columnsOk = await page.evaluate(() => {
      const items = document.querySelectorAll('li.ui-sortable-handle');
      let etaOk = false;
      let ataOk = false;
      for (const item of items) {
        const title = item.querySelector('.column-title');
        if (!title) continue;
        const titleText = title.textContent?.trim();
        const eyeSpan = item.querySelector('a.eyeIcon span');
        if (titleText === 'ETA' && !etaOk) {
          etaOk = !!(eyeSpan && eyeSpan.classList.contains('fa-check'));
        }
        if (titleText === 'ATA' && !ataOk) {
          ataOk = !!(eyeSpan && eyeSpan.classList.contains('fa-check'));
        }
        if (etaOk && ataOk) break;
      }
      return { etaOk, ataOk };
    });

    console.log(`[TrazePlaywright] ✅ Columnas activadas — ETA: ${columnsOk.etaOk}, ATA: ${columnsOk.ataOk}`);

    // Clic en Apply
    await page.waitForSelector('button.apply.btn-primary', { state: 'visible', timeout: 10000 });
    await page.click('button.apply.btn-primary');

    // Esperar que recargue la tabla
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    await page.waitForSelector('table tbody tr td', { state: 'visible', timeout: 30000 });
    await page.waitForTimeout(2000);

    // ── PASO 5: Export CSV ───────────────────────────────────────────────────
    await page.waitForSelector('button:has-text("Export")', { state: 'visible', timeout: 15000 });

    // Timestamped filename so each download is preserved (7-day retention)
    const now = new Date();
    const ts = now.toISOString().slice(0, 19).replace(/[T:]/g, '-'); // YYYY-MM-DD-HH-mm-ss
    const savePath = path.join(CSV_OUTPUT_DIR, `traze_export_${ts}.csv`);

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }),
      (async () => {
        await page.click('button:has-text("Export")');
        await page.waitForSelector('text=CSV', { state: 'visible', timeout: 10000 });
        await page.click('text=CSV');
      })(),
    ]);

    await download.saveAs(savePath);

    console.log(`[TrazePlaywright] ✅ CSV guardado en: ${savePath}`);
    return savePath;

  } finally {
    await browser.close();
  }
}
