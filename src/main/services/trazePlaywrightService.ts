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
 *   Saved to {userData}/traze-exports/traze_export_YYYY-MM-DD_HH-mm-ss.csv
 */

import { chromium } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';

const CSV_OUTPUT_DIR    = path.join(app.getPath('userData'), 'traze-exports');
const CREDENTIALS_FILE  = path.join(app.getPath('userData'), 'traze-credentials.json');

interface TrazeCredentials {
  email:    string;
  password: string;
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
  const creds = loadCredentials();

  fs.mkdirSync(CSV_OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: false });
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

    // ── PASO 4: Export CSV ───────────────────────────────────────────────────
    await page.waitForSelector('button:has-text("Export")', { state: 'visible', timeout: 15000 });

    const now     = new Date();
    const dateTag = now.toISOString().slice(0, 10);
    const timeTag = now.toTimeString().slice(0, 8).replace(/:/g, '-');
    const savePath = path.join(CSV_OUTPUT_DIR, `traze_export_${dateTag}_${timeTag}.csv`);

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
