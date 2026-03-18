/**
 * Traze Window Manager — Main Process
 * =====================================
 * File path: src/main/services/trazeWindowManager.ts
 *
 * Manages a hidden BrowserWindow that loads onesitegroup.trazeapp.com.
 * This window handles Traze authentication so the main NPD Planner
 * window doesn't need to know about Traze login.
 *
 * WHY A SEPARATE WINDOW?
 *   The NPD Planner uses Firebase Auth (eliteflower.com accounts).
 *   Traze uses its own JWT stored in localStorage of trazeapp.com.
 *   We need a separate window to hold the Traze session.
 *
 * FLOW:
 *   1. App starts → create hidden trazeWindow
 *   2. Try to get tokens from localStorage
 *   3. If no tokens → emit 'traze:needs-login' to renderer
 *   4. Renderer shows "Connect Traze" button
 *   5. User clicks → show the Traze window → logs in
 *   6. Tokens now available → start scheduler
 */

import { BrowserWindow, app, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

const TRAZE_URL      = 'https://onesitegroup.trazeapp.com';
const CSV_OUTPUT_DIR = path.join(app.getPath('userData'), 'traze-exports');

let trazeWindow: BrowserWindow | null = null;
let npdMainWindow: BrowserWindow | null = null;
let isQuitting = false;
let onLoginCallback: (() => void) | null = null;

type CsvDownloadedCb = (filePath: string, rowCount: number, sizeKb: number) => void;
let onCsvDownloadedCallback: CsvDownloadedCb | null = null;

/**
 * Registers a callback that fires when the user manually exports a CSV
 * from the Traze browser window (via will-download interception).
 */
export function setTrazeCsvDownloadCallback(cb: CsvDownloadedCb): void {
  onCsvDownloadedCallback = cb;
}

/** Called by trazeIntegrationService so it can trigger a download right after login */
export function setTrazeLoginCallback(cb: () => void): void {
  onLoginCallback = cb;
}

// Set this flag before the app quits so we actually destroy the window
app.on('before-quit', () => { isQuitting = true; });

/**
 * Initialize the manager with a reference to the NPD Planner main window.
 * Call this once from main.ts after creating the main window.
 */
export function initTrazeWindowManager(mainWindow: BrowserWindow): void {
  npdMainWindow = mainWindow;
}

/**
 * Gets or creates the Traze BrowserWindow.
 * The window is hidden by default (show = false).
 */
export function getOrCreateTrazeWindow(show = false): BrowserWindow {
  if (trazeWindow && !trazeWindow.isDestroyed()) {
    if (show) {
      trazeWindow.show();
      trazeWindow.focus();
    }
    return trazeWindow;
  }

  trazeWindow = new BrowserWindow({
    width:  1280,
    height: 900,
    show:   true,   // TEMP: visible for debugging — change back to `show` when done
    title:  'Traze — NPD Planner',
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
      webSecurity:      false,  // allows fetch to trazeapi.com from this window
    },
  });

  trazeWindow.loadURL(TRAZE_URL);

  // ── Intercept CSV downloads from the Traze browser window ──────────────────
  // When the user clicks the Export button in the Traze UI, this captures the
  // file before it reaches the OS Downloads folder and saves it to our
  // CSV_OUTPUT_DIR instead — then notifies the NPD Planner via callback.
  trazeWindow.webContents.session.on('will-download', (_event, item) => {
    const filename = item.getFilename();
    if (!filename.toLowerCase().endsWith('.csv')) return;

    fs.mkdirSync(CSV_OUTPUT_DIR, { recursive: true });
    const dateTag  = new Date().toISOString().slice(0, 10);
    const savePath = path.join(CSV_OUTPUT_DIR, `shipments_inbound_${dateTag}.csv`);

    item.setSavePath(savePath);
    console.log(`[TrazeWindow] Intercepting CSV download → ${savePath}`);

    item.on('done', (_evt, state) => {
      if (state !== 'completed') {
        console.warn(`[TrazeWindow] CSV download failed/cancelled: ${state}`);
        return;
      }
      try {
        const content  = fs.readFileSync(savePath, 'utf-8');
        const rowCount = content.split('\n').filter(Boolean).length - 1;
        const sizeKb   = parseFloat((content.length / 1024).toFixed(1));
        console.log(`[TrazeWindow] ✅ CSV saved: ${savePath} (${rowCount} rows, ${sizeKb} KB)`);
        onCsvDownloadedCallback?.(savePath, rowCount, sizeKb);
      } catch (err) {
        console.error('[TrazeWindow] Failed to read intercepted CSV:', err);
      }
    });
  });

  // Notify renderer when the user logs in.
  // Traze is an Angular SPA — login is client-side navigation, so
  // did-navigate does NOT fire. Use did-navigate-in-page instead.
  let loginDetected = false;
  const onNavChange = (_event: Electron.Event, url: string): void => {
    if (loginDetected) return;
    if (url.includes('/main/core') || url.includes('/dashboard')) {
      loginDetected = true;
      console.log('[TrazeWindow] User logged in to Traze — navigating to shipments');
      npdMainWindow?.webContents.send('traze:login-success');

      // Navigate to the Inbound Master Shipments page
      const shipmentsUrl = 'https://onesitegroup.trazeapp.com/main/core/transportation/shipments/shipments?type=order&direction=inbound';
      trazeWindow?.loadURL(shipmentsUrl);

      // Trigger CSV download after a short delay for page to settle
      setTimeout(() => { onLoginCallback?.(); }, 3000);
    }
  };

  trazeWindow.webContents.on('did-navigate', (_event, url) => onNavChange(_event, url));
  trazeWindow.webContents.on('did-navigate-in-page', (_event, url) => onNavChange(_event, url));

  // Poll for login by checking BOTH URL changes AND token presence in localStorage.
  // Angular SPAs sometimes don't change the URL in ways Electron can detect,
  // but the JWT token appearing in localStorage is a reliable login signal.
  const loginPoll = setInterval(async () => {
    if (loginDetected || !trazeWindow || trazeWindow.isDestroyed()) {
      clearInterval(loginPoll);
      return;
    }

    // Check 1: URL-based detection
    const url = trazeWindow.webContents.getURL();
    if (url.includes('/main/core') || url.includes('/dashboard')) {
      onNavChange({ preventDefault: () => {} } as Electron.Event, url);
      clearInterval(loginPoll);
      return;
    }

    // Check 2: Token-based detection — if token exists, user is logged in
    try {
      const raw: string = await trazeWindow.webContents.executeJavaScript(
        `localStorage.getItem('token') || ''`
      );
      if (raw && raw.length > 20) {
        console.log('[TrazeWindow] Token detected in localStorage — user is logged in');
        loginDetected = true;
        clearInterval(loginPoll);
        npdMainWindow?.webContents.send('traze:login-success');

        // Navigate to shipments and trigger download
        const shipmentsUrl = 'https://onesitegroup.trazeapp.com/main/core/transportation/shipments/shipments?type=order&direction=inbound';
        trazeWindow?.loadURL(shipmentsUrl);
        setTimeout(() => { onLoginCallback?.(); }, 3000);
      }
    } catch {
      // Window might be navigating — ignore
    }
  }, 2000);

  // Hide instead of close when user clicks X
  trazeWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      trazeWindow?.hide();
    }
  });

  trazeWindow.on('closed', () => {
    trazeWindow = null;
  });

  return trazeWindow;
}

/**
 * Retrieves JWT tokens from the Traze window's localStorage.
 * Returns null if the user is not authenticated.
 *
 * IMPORTANT: Always reads fresh on every call — tokens expire between sessions.
 * Ensures the window is on trazeapp.com before reading localStorage; if it's
 * pointing at another domain (e.g. localhost during dev), the localStorage
 * would be empty and we'd incorrectly report the user as logged out.
 */
export async function getTrazeTokens(): Promise<{ token: string; tokenCsrf: string } | null> {
  const win = getOrCreateTrazeWindow(false);

  const currentUrl = win.webContents.getURL();
  const onTraze    = currentUrl.includes('trazeapp.com');

  if (!onTraze) {
    // Window exists but is not on the Traze domain — navigate it there so we
    // read localStorage from the correct origin.
    console.log(`[TrazeWindow] Not on trazeapp.com (at: ${currentUrl}) — navigating`);
    win.loadURL(TRAZE_URL);
    await new Promise<void>(resolve => win.webContents.once('did-finish-load', resolve));
  } else if (win.webContents.isLoading()) {
    await new Promise<void>(resolve => win.webContents.once('did-finish-load', resolve));
  }

  try {
    const raw: string = await win.webContents.executeJavaScript(`
      JSON.stringify({
        token:     localStorage.getItem('token')     || null,
        tokenCsrf: localStorage.getItem('tokenCsrf') || null
      })
    `);

    const tokens = JSON.parse(raw) as { token: string | null; tokenCsrf: string | null };

    if (!tokens.token) {
      console.log('[TrazeWindow] No token in localStorage — user not logged in');
      return null;
    }
    return tokens as { token: string; tokenCsrf: string };
  } catch (err) {
    console.error('[TrazeWindow] Failed to read tokens:', err);
    return null;
  }
}

/**
 * Downloads the shipments CSV using synchronous XHR inside the Traze window.
 *
 * WHY XHR instead of fetch/net.fetch/etc?
 *   - Traze uses Angular → Zone.js patches Promise → executeJavaScript can't
 *     return fetch() results (gets __zone_symbol__ objects)
 *   - net.fetch from main process: Step 2 returns 0 bytes
 *   - session.fetch: Step 2 returns 0 bytes
 *   - downloadURL: returns 0 bytes
 *   - DOM click automation: Angular intercepts events, doesn't trigger export
 *
 *   Synchronous XHR inside the Traze renderer context:
 *   ✅ No Promises → no Zone.js interference
 *   ✅ Runs in browser context → has session cookies
 *   ✅ Both steps in one executeJavaScript call → result is a plain string
 *
 * FLOW:
 *   1. Read JWT tokens from localStorage (sync)
 *   2. POST /api/core/exportData via sync XHR → get filename
 *   3. GET /file/export/true/{filename}?token=JWT via sync XHR → get CSV
 *   4. Return CSV content as a string
 */
export async function downloadCsvViaTrazeWindow(from: string, to: string): Promise<string> {
  const win = getOrCreateTrazeWindow(false);

  const debugLog = (msg: string): void => {
    const line = `${new Date().toISOString()} ${msg}\n`;
    try { fs.appendFileSync(path.join(CSV_OUTPUT_DIR, '.traze_debug.log'), line); } catch { /* ignore */ }
    console.log('[TrazeWindow]', msg);
  };

  // Ensure the window is on trazeapp.com
  const currentUrl = win.webContents.getURL();
  if (!currentUrl.includes('trazeapp.com')) {
    debugLog('not on trazeapp.com, navigating...');
    win.loadURL(TRAZE_URL);
    await new Promise<void>(resolve => win.webContents.once('did-finish-load', resolve));
    await new Promise(r => setTimeout(r, 3000));
  } else if (win.webContents.isLoading()) {
    await new Promise<void>(resolve => win.webContents.once('did-finish-load', resolve));
  }

  debugLog(`starting XHR download: ${from} → ${to}`);

  // Execute the entire 2-step download inside the Traze renderer via sync XHR.
  // This runs in the browser context with full cookie/session access.
  // Sync XHR blocks the renderer briefly but avoids Zone.js Promise issues.
  const result: string = await win.webContents.executeJavaScript(`
    (function() {
      try {
        // Read tokens from localStorage
        var token     = localStorage.getItem('token');
        var tokenCsrf = localStorage.getItem('tokenCsrf');
        if (!token) return JSON.stringify({ error: 'No token — user not logged in' });

        // ── STEP 1: POST exportData ──────────────────────────────────────
        var xhr1 = new XMLHttpRequest();
        xhr1.open('POST', 'https://www.trazeapi.com/api/core/exportData', false);
        xhr1.setRequestHeader('Content-Type', 'application/json');
        xhr1.setRequestHeader('token', token);
        xhr1.setRequestHeader('tokenCsrf', tokenCsrf || '');
        xhr1.setRequestHeader('Accept', 'application/json, text/plain, */*');

        var body = JSON.stringify({
          templateId: null,
          fileType: 'csv',
          separator: null,
          documentTemplateId: null,
          download: true,
          language: 'en',
          culture: 'en',
          dateFormat: 'MM/DD/YYYY',
          dateTimeFormat: 'MM/DD/YYYY HH:mm',
          timezone: 'US/Eastern',
          currency: 'USD',
          query: {
            tableName: 'vw_transportation_shipments',
            options: {
              order: [['waybillNumber', 'asc']],
              where: {
                direction:            { $in: ['inbound', 'transfer'] },
                type:                 { $eq: ['order'] },
                shipmentDate:         { between: [${JSON.stringify(from)}, ${JSON.stringify(to)}] },
                estimatedArrivalDate: { between: [${JSON.stringify(from)}, ${JSON.stringify(to)}] }
              }
            }
          }
        });

        xhr1.send(body);

        if (xhr1.status !== 200) {
          return JSON.stringify({ error: 'Step 1 failed: HTTP ' + xhr1.status + ' — ' + xhr1.responseText.substring(0, 200) });
        }

        var step1 = JSON.parse(xhr1.responseText);
        var filename = step1.file;
        if (!filename) {
          return JSON.stringify({ error: 'Step 1: no file in response — ' + xhr1.responseText.substring(0, 200) });
        }

        // ── STEP 2: GET the generated CSV file ──────────────────────────
        var downloadUrl = 'https://www.trazeapi.com/file/export/true/' + filename + '?token=' + encodeURIComponent(token);

        var xhr2 = new XMLHttpRequest();
        xhr2.open('GET', downloadUrl, false);
        xhr2.send();

        if (xhr2.status !== 200) {
          return JSON.stringify({ error: 'Step 2 failed: HTTP ' + xhr2.status + ' — ' + xhr2.responseText.substring(0, 200) });
        }

        var csv = xhr2.responseText;
        if (!csv || csv.length < 10) {
          return JSON.stringify({ error: 'Step 2: empty response (' + csv.length + ' bytes). Filename: ' + filename });
        }

        return JSON.stringify({ csv: csv, filename: filename });
      } catch (e) {
        return JSON.stringify({ error: 'XHR exception: ' + (e.message || String(e)) });
      }
    })()
  `);

  debugLog('XHR result length: ' + result.length);

  let parsed: { csv?: string; filename?: string; error?: string };
  try {
    parsed = JSON.parse(result);
  } catch {
    debugLog('failed to parse result: ' + result.substring(0, 500));
    throw new Error('Failed to parse XHR result');
  }

  if (parsed.error) {
    debugLog('XHR error: ' + parsed.error);
    throw new Error(parsed.error);
  }

  if (!parsed.csv) {
    throw new Error('No CSV content in response');
  }

  debugLog(`XHR success — file: ${parsed.filename}, CSV length: ${parsed.csv.length}`);

  // Save to disk
  fs.mkdirSync(CSV_OUTPUT_DIR, { recursive: true });
  const dateTag  = new Date().toISOString().slice(0, 10);
  const filePath = path.join(CSV_OUTPUT_DIR, `shipments_inbound_${dateTag}.csv`);
  fs.writeFileSync(filePath, parsed.csv, 'utf-8');

  const rowCount = parsed.csv.split('\n').filter(Boolean).length - 1;
  const sizeKb   = parseFloat((parsed.csv.length / 1024).toFixed(1));
  debugLog(`CSV saved: ${filePath} (${rowCount} rows, ${sizeKb} KB)`);

  return parsed.csv;
}

/**
 * Programmatically fills the Traze login form and submits it.
 * Used for automated testing. Remove credentials after confirming download works.
 */
export async function autoLoginToTraze(email: string, password: string): Promise<void> {
  console.log('[TrazeWindow] Auto-login starting...');
  const win = getOrCreateTrazeWindow(false);

  // Navigate to login page (not /main/core — we need the login form)
  const currentUrl = win.webContents.getURL();
  if (!currentUrl.includes('trazeapp.com') || currentUrl.includes('/main/core')) {
    win.loadURL(TRAZE_URL);
  }

  await new Promise<void>(resolve =>
    win.webContents.isLoading()
      ? win.webContents.once('did-finish-load', resolve)
      : resolve()
  );

  // Give the SPA time to render the login form
  await new Promise(r => setTimeout(r, 2500));

  console.log('[TrazeWindow] Filling login form at:', win.webContents.getURL());

  const fillResult = await win.webContents.executeJavaScript(`
    (function() {
      var emailInput = document.querySelector('input[type="email"]')
                    || document.querySelector('input[name="email"]')
                    || document.querySelector('input[name="username"]')
                    || document.querySelector('input[placeholder]');
      var passInput  = document.querySelector('input[type="password"]');
      var submitBtn  = document.querySelector('button[type="submit"]')
                    || document.querySelector('button.btn-primary')
                    || Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Sign In');

      if (!emailInput) return 'ERROR: no email input found';
      if (!passInput)  return 'ERROR: no password input found';
      if (!submitBtn)  return 'ERROR: no submit button found';

      function setNativeValue(el, val) {
        var nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeInputValueSetter.call(el, val);
        el.dispatchEvent(new Event('input',  { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }

      setNativeValue(emailInput, ${JSON.stringify(email)});
      setNativeValue(passInput,  ${JSON.stringify(password)});

      setTimeout(function() { submitBtn.click(); }, 600);
      return 'OK: form filled, submit scheduled';
    })()
  `) as string;

  console.log('[TrazeWindow] Form fill result:', fillResult);

  if (fillResult.startsWith('ERROR')) {
    throw new Error(`Auto-login failed: ${fillResult}`);
  }

  // Wait for successful navigation to /main/core (triggered by login)
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Auto-login timeout (15s)')), 15000);
    const onNav = (_: unknown, url: string) => {
      if (url.includes('/main/core') || url.includes('/dashboard')) {
        clearTimeout(timer);
        win.webContents.removeListener('did-navigate', onNav);
        resolve();
      }
    };
    win.webContents.on('did-navigate', onNav);
  });

  console.log('[TrazeWindow] ✅ Auto-login successful');
}

/**
 * Returns the current URL of the Traze window, or 'destroyed' if it doesn't exist.
 * Used for status logging.
 */
export function getTrazeWindowStatus(): string {
  if (!trazeWindow || trazeWindow.isDestroyed()) return 'destroyed';
  return trazeWindow.webContents.getURL();
}

/**
 * Shows the Traze login window.
 * Called when the user clicks "Connect Traze" in the NPD Planner UI.
 */
export function showTrazeLoginWindow(): void {
  getOrCreateTrazeWindow(true);
}

/**
 * Destroys the Traze window. Call this in app.on('before-quit').
 */
export function destroyTrazeWindow(): void {
  if (trazeWindow && !trazeWindow.isDestroyed()) {
    trazeWindow.destroy();
    trazeWindow = null;
  }
}

/**
 * Registers IPC handlers for Traze window control.
 * Call this once from main.ts.
 */
export function registerTrazeWindowIpcHandlers(): void {
  // Renderer asks to show Traze login window
  ipcMain.on('traze:show-login-window', () => {
    showTrazeLoginWindow();
  });

  // Renderer checks if Traze is authenticated
  ipcMain.handle('traze:check-auth', async () => {
    const tokens = await getTrazeTokens();
    return { authenticated: tokens !== null };
  });
}
