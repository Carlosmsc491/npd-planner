/**
 * excelHandlers.ts
 * IPC handlers for Excel manipulation — inserting a photo into the
 * "Spec Sheet" PHOTO area (G8:M35).
 *
 * Strategy (corruption-proof):
 *   1. PRIMARY: drive Excel itself (PowerShell COM on Windows, AppleScript on
 *      Mac). Excel performs the save, so conditional formatting, shapes and
 *      every workbook feature survive intact — same approach the cell writers
 *      in recipeIpcHandlers use.
 *   2. FALLBACK (no Excel installed): insert_photo.py with openpyxl, hardened
 *      to write atomically (temp + replace) so a kill can never truncate the
 *      original workbook.
 *
 * Both paths refuse to touch a file that is open in Excel (~$ lock file).
 */

import { ipcMain, app } from 'electron'
import { execFile, exec, spawn } from 'child_process'
import { runExclusiveExcel } from '../lib/excelQueue'
import { promisify } from 'util'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'

const execAsync = promisify(exec)

/** Returns the path to insert_photo.py: dev uses repo root, production uses resourcesPath. */
function getScriptPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'scripts', 'insert_photo.py')
  }
  // In dev, __dirname = out/main — walk up two levels to repo root
  return path.join(__dirname, '../../resources/scripts/insert_photo.py')
}

/**
 * Excel writes a hidden "~$name.xlsx" owner file while the workbook is open.
 * On Windows a stale owner file (Excel crash leftover) is detected by probing
 * the real write lock and cleaned up so inserts aren't blocked forever.
 */
function isFileLockedByExcel(filePath: string): boolean {
  const lockFile = path.join(path.dirname(filePath), `~$${path.basename(filePath)}`)
  if (!fs.existsSync(lockFile)) return false
  if (process.platform === 'win32') {
    try {
      const fd = fs.openSync(filePath, 'r+')
      fs.closeSync(fd)
      try { fs.unlinkSync(lockFile) } catch { /* ignore */ }
      return false
    } catch {
      return true
    }
  }
  return true
}

/** Whether Microsoft Excel is installed (native insert path available). */
function isExcelInstalled(): boolean {
  if (process.platform === 'darwin') {
    return fs.existsSync('/Applications/Microsoft Excel.app')
  }
  // Windows: assume yes and let the COM attempt fall back on failure
  return process.platform === 'win32'
}

/** Read image pixel dimensions via sharp (already a dependency for PNG→JPG). */
async function getImageSize(imagePath: string): Promise<{ width: number; height: number } | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sharp = require('sharp')
    const meta = await sharp(imagePath).metadata()
    if (!meta.width || !meta.height) return null
    return { width: meta.width, height: meta.height }
  } catch {
    return null
  }
}

// ── Native insert: Windows (PowerShell COM) ──────────────────────────────────

async function insertViaCOMWindows(excelPath: string, jpgPath: string, imgW: number, imgH: number): Promise<void> {
  const absExcel = path.resolve(excelPath).replace(/'/g, "''")
  const absJpg = path.resolve(jpgPath).replace(/'/g, "''")

  const script = [
    '$ErrorActionPreference = "Stop"',
    '$excel = New-Object -ComObject Excel.Application',
    'Start-Sleep -Milliseconds 500',
    '$excel.Visible = $false',
    '$excel.DisplayAlerts = $false',
    'try {',
    `  $wb = $excel.Workbooks.Open('${absExcel}', 0, $false)`,
    `  $ws = $wb.Worksheets('Spec Sheet')`,
    `  $area = $ws.Range('G8:M35')`,
    '  $aL = $area.Left; $aT = $area.Top; $aW = $area.Width; $aH = $area.Height',
    `  $imgW = ${imgW}; $imgH = ${imgH}`,
    '  $ratio = [Math]::Min($aW / $imgW, $aH / $imgH)',
    '  $newW = [Math]::Floor($imgW * $ratio); $newH = [Math]::Floor($imgH * $ratio)',
    '  $x = $aL + ($aW - $newW) / 2; $y = $aT + ($aH - $newH) / 2',
    '  # Remove only pictures overlapping the photo area (msoPicture = 13) — logos elsewhere survive',
    '  for ($i = $ws.Shapes.Count; $i -ge 1; $i--) {',
    '    $shp = $ws.Shapes.Item($i)',
    '    if ($shp.Type -eq 13) {',
    '      $sL = $shp.Left; $sT = $shp.Top; $sR = $sL + $shp.Width; $sB = $sT + $shp.Height',
    '      if ($sL -lt ($aL + $aW) -and $sR -gt $aL -and $sT -lt ($aT + $aH) -and $sB -gt $aT) { $shp.Delete() }',
    '    }',
    '  }',
    `  $ws.Shapes.AddPicture('${absJpg}', $false, $true, $x, $y, $newW, $newH) | Out-Null`,
    '  $wb.Save()',
    '  $wb.Close($false)',
    "  Write-Output 'OK'",
    '} finally {',
    '  try { $excel.Quit() } catch { }',
    '  [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null',
    '}',
  ].join('\r\n')

  const tmpFile = path.join(os.tmpdir(), `insert_photo_${Date.now()}.ps1`)
  fs.writeFileSync(tmpFile, script, 'utf8')
  try {
    const { stdout, stderr } = await execAsync(
      `powershell -NonInteractive -NoProfile -ExecutionPolicy Bypass -File "${tmpFile.replace(/\\/g, '/')}"`,
      { timeout: 120_000 }
    )
    if (!stdout.includes('OK')) {
      throw new Error(stderr?.trim() || 'COM insert did not confirm OK')
    }
  } finally {
    try { fs.unlinkSync(tmpFile) } catch { /* ignore */ }
  }
}

// ── Native insert: Mac (AppleScript) ─────────────────────────────────────────

async function insertViaAppleScript(excelPath: string, jpgPath: string, imgW: number, imgH: number): Promise<void> {
  const safeExcel = path.resolve(excelPath).replace(/"/g, '\\"')
  const safeJpg = path.resolve(jpgPath).replace(/"/g, '\\"')

  const script = [
    'tell application "Microsoft Excel"',
    '  set display alerts to false',
    `  set wb to open workbook workbook file name (POSIX file "${safeExcel}" as text)`,
    '  tell worksheet "Spec Sheet" of wb',
    '    set areaRange to range "G8:M35"',
    '    set aL to left position of areaRange',
    '    set aT to top of areaRange',
    '    set aW to width of areaRange',
    '    set aH to height of areaRange',
    `    set imgW to ${imgW}`,
    `    set imgH to ${imgH}`,
    '    set rW to aW / imgW',
    '    set rH to aH / imgH',
    '    if rW < rH then',
    '      set theRatio to rW',
    '    else',
    '      set theRatio to rH',
    '    end if',
    '    set newW to imgW * theRatio',
    '    set newH to imgH * theRatio',
    '    set newX to aL + (aW - newW) / 2',
    '    set newY to aT + (aH - newH) / 2',
    '    set shapeCount to count of shapes',
    '    repeat with i from shapeCount to 1 by -1',
    '      try',
    '        set shp to shape i',
    '        if shape type of shp is shape type picture then',
    '          set sL to left position of shp',
    '          set sT to top of shp',
    '          set sR to sL + (width of shp)',
    '          set sB to sT + (height of shp)',
    '          if (sL < aL + aW) and (sR > aL) and (sT < aT + aH) and (sB > aT) then delete shp',
    '        end if',
    '      end try',
    '    end repeat',
    `    make new picture at end with properties {file name:"${safeJpg}", left position:newX, top:newY, width:newW, height:newH}`,
    '  end tell',
    '  close wb saving yes',
    '  set display alerts to true',
    'end tell',
  ].join('\n')

  const tmpFile = path.join(os.tmpdir(), `insert_photo_${Date.now()}.applescript`)
  fs.writeFileSync(tmpFile, script, 'utf8')
  try {
    await execAsync(`osascript "${tmpFile}"`, { timeout: 120_000 })
  } catch (err) {
    const e = err as { stderr?: string; message?: string }
    throw new Error(`AppleScript insert failed: ${e.stderr?.trim() || e.message || String(err)}`)
  } finally {
    try { fs.unlinkSync(tmpFile) } catch { /* ignore */ }
  }
}

// ── Fallback: Python/openpyxl (machines without Excel) ──────────────────────

/**
 * Finds the Python executable available on this machine.
 * Windows commonly installs Python as 'python' or 'py' instead of 'python3'.
 */
function findPythonExec(): Promise<string | null> {
  const candidates = process.platform === 'win32'
    ? ['python', 'python3', 'py']
    : ['python3', 'python']

  return candidates.reduce<Promise<string | null>>(
    (acc, cmd) =>
      acc.then(found =>
        found !== null
          ? found
          : new Promise(resolve => {
              execFile(cmd, ['--version'], { timeout: 5_000 }, err => resolve(err ? null : cmd))
            })
      ),
    Promise.resolve(null)
  )
}

async function insertViaPython(excelPath: string, jpgPath: string): Promise<{ success: boolean; error?: string }> {
  const scriptPath = getScriptPath()
  if (!fs.existsSync(scriptPath)) {
    return { success: false, error: `Script not found: ${scriptPath}` }
  }
  const pyExec = await findPythonExec()
  if (!pyExec) {
    return { success: false, error: 'Microsoft Excel is not installed and Python was not found. Install one of them to insert photos.' }
  }
  return new Promise(resolve => {
    execFile(
      pyExec,
      [scriptPath, excelPath, jpgPath],
      // Generous timeout — the python script now writes atomically, so even a
      // kill cannot corrupt the original workbook.
      { timeout: 120_000 },
      (error, _stdout, stderr) => {
        if (error) {
          const msg = (stderr || error.message).trim()
          resolve({ success: false, error: msg.replace(/^ERROR:\s*/i, '') })
        } else {
          resolve({ success: true })
        }
      }
    )
  })
}

export function registerExcelHandlers(): void {
  /**
   * excel:check-dependencies
   * Insert works if Excel is installed (native path) OR python+openpyxl exists.
   */
  ipcMain.handle(
    'excel:check-dependencies',
    async (): Promise<{ available: boolean; error?: string }> => {
      if (isExcelInstalled()) return { available: true }
      const pyExec = await findPythonExec()
      if (!pyExec) {
        return {
          available: false,
          error: 'Neither Microsoft Excel nor Python 3 found. Install one of them to insert photos.',
        }
      }
      return new Promise(resolve => {
        execFile(
          pyExec,
          ['-c', 'import openpyxl, PIL; print("OK")'],
          { timeout: 10_000 },
          (error, stdout) => {
            if (error || stdout.trim() !== 'OK') {
              resolve({
                available: false,
                error: `openpyxl or Pillow not installed. Run: ${pyExec === 'py' ? 'py -m pip' : 'pip3'} install openpyxl pillow`,
              })
            } else {
              resolve({ available: true })
            }
          }
        )
      })
    }
  )

  /**
   * excel:install-deps
   * Installs the Python packages needed for the openpyxl fallback (openpyxl +
   * Pillow) so the user never has to touch a terminal. Best-effort: tries a
   * per-user pip install with the detected Python.
   */
  ipcMain.handle(
    'excel:install-deps',
    async (event): Promise<{ success: boolean; error?: string }> => {
      const pyExec = await findPythonExec()
      if (!pyExec) {
        return { success: false, error: 'Python 3 was not found on this computer. Install Python 3, then try again.' }
      }
      // Mirror everything to BOTH the renderer (progress bar) and the terminal
      // (`npm run dev` console) so a failure is visible while debugging. Split on \r
      // too — pip's download bar uses carriage returns, so the live line advances
      // mid-download instead of looking frozen.
      const send = (line: string): void => {
        console.log('[excel:install-deps]', line)
        try { event.sender.send('excel:install-progress', line.slice(0, 140)) } catch { /* window gone */ }
      }
      console.log('[excel:install-deps] using python:', pyExec)
      // Clean env: no version-check noise, unbuffered so output streams promptly.
      const pipEnv = { ...process.env, PIP_DISABLE_PIP_VERSION_CHECK: '1', PYTHONUNBUFFERED: '1' }

      /** Spawn with a HARD timeout that kills a stalled process — without this a hung
       *  step spins the button forever ("never installs"). Logs the exact command and
       *  outcome to the terminal. */
      const runPy = (args: string[], label: string, timeoutMs = 240_000): Promise<{ ok: boolean; err: string }> =>
        new Promise(resolve => {
          send(label)
          console.log('[excel:install-deps] $', pyExec, args.join(' '))
          const child = spawn(pyExec, args, { env: pipEnv })
          let err = ''
          let settled = false
          const finish = (ok: boolean, e?: string): void => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            console.log(`[excel:install-deps] → ${ok ? 'OK' : 'FAILED'}${e ? ': ' + e : ''}`)
            resolve({ ok, err: (e ?? err).trim() })
          }
          const pump = (buf: Buffer): void =>
            buf.toString().split(/[\r\n]+/).forEach(l => { const t = l.trim(); if (t) send(t) })
          child.stdout?.on('data', pump)
          child.stderr?.on('data', (buf: Buffer) => { err += buf.toString(); pump(buf) })
          child.on('error', e => finish(false, e.message))
          child.on('exit', code => finish(code === 0))
          const timer = setTimeout(() => {
            try { child.kill('SIGKILL') } catch { /* */ }
            finish(false, `Timed out after ${Math.round(timeoutMs / 1000)}s — the step stalled. Check your internet connection and try again.`)
          }, timeoutMs)
        })

      // 0) Make sure pip itself is present/usable (a broken pip is a common "stuck").
      //    Short timeout — ensurepip shouldn't take long; never let it block install.
      await runPy(['-m', 'ensurepip', '--upgrade'], 'Preparing installer…', 60_000).catch(() => {})

      // --no-cache-dir forces a FRESH download (a corrupt cached wheel was stalling
      // it); --force-reinstall overrides a half-finished/corrupt previous attempt.
      const pkgs = ['openpyxl', 'pillow']
      const common = ['-m', 'pip', 'install', '--no-cache-dir', '--force-reinstall', '--upgrade']

      // Ordered fallbacks, least-invasive first. IMPORTANT: do NOT lead with --user —
      // it errors hard inside a virtualenv ("User site-packages are not visible in
      // this virtualenv"), which is exactly what froze the installer when the detected
      // Python was a venv. Plain install works in a venv and in any writable Python;
      // the escalations cover the system Python in the packaged app (user site, then
      // PEP 668 override for Homebrew/Debian "externally managed" pythons).
      const attempts: Array<{ args: string[]; label: string }> = [
        { args: [...common, ...pkgs],                                       label: 'Downloading & installing…' },
        { args: [...common, '--user', ...pkgs],                             label: 'Retrying (user site)…' },
        { args: [...common, '--user', '--break-system-packages', ...pkgs],  label: 'Retrying (override)…' },
        { args: [...common, '--break-system-packages', ...pkgs],            label: 'Retrying (system override)…' },
      ]

      let r: { ok: boolean; err: string } = { ok: false, err: 'Install failed.' }
      for (const a of attempts) {
        r = await runPy(a.args, a.label)
        if (r.ok) break
        // Fatal — escalating won't help; stop and report.
        if (/no module named pip|executable file not found|not recognized as|no such file/i.test(r.err)) break
      }

      return r.ok
        ? { success: true }
        : { success: false, error: r.err.split('\n').filter(Boolean).pop() || 'Install failed. Try again, or install Python 3 from python.org.' }
    }
  )

  /**
   * excel:insert-photo
   * Inserts a JPG into G8:M35 of the "Spec Sheet" worksheet.
   */
  ipcMain.handle(
    'excel:insert-photo',
    async (
      _event,
      { excelPath, jpgPath }: { excelPath: string; jpgPath: string }
    ): Promise<{ success: boolean; error?: string }> => {
      // Serialized via the global Excel queue (no concurrent Excel automation).
      return runExclusiveExcel(async () => {
      try {
        if (!fs.existsSync(excelPath)) {
          return { success: false, error: `Excel file not found: ${excelPath}` }
        }
        if (!fs.existsSync(jpgPath)) {
          return { success: false, error: `Image file not found: ${jpgPath}` }
        }
        // Never write to a workbook that is open in Excel — the in-memory copy
        // would diverge from disk and Excel prompts to "recover" on close.
        if (isFileLockedByExcel(excelPath)) {
          return { success: false, error: 'This recipe is open in Excel. Close it and try again.' }
        }

        if (isExcelInstalled()) {
          const size = await getImageSize(jpgPath)
          if (size) {
            try {
              if (process.platform === 'darwin') {
                await insertViaAppleScript(excelPath, jpgPath, size.width, size.height)
              } else {
                await insertViaCOMWindows(excelPath, jpgPath, size.width, size.height)
              }
              return { success: true }
            } catch (nativeErr) {
              console.warn('[excel:insert-photo] native insert failed, falling back to python:', nativeErr)
              // fall through to python fallback
            }
          }
        }

        return await insertViaPython(excelPath, jpgPath)
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) }
      }
      })
    }
  )
}
