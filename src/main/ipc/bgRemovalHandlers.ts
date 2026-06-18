// src/main/ipc/bgRemovalHandlers.ts
// IPC for the Background Removal module (Mac-only). The heavy work lives in the
// Python tool at tools/bg-removal; here we just launch its batch_run.py, stream
// its live _status.json to the renderer, and (optionally) let it run the
// Photoshop RETOUCH action afterwards. Nothing here runs on Windows.

import { ipcMain, dialog, shell, BrowserWindow, app, net } from 'electron'
import { spawn, type ChildProcess } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as crypto from 'crypto'
import type {
  BgRemovalJob, BgRemovalStatus, BgRemovalResult, BgRemovalSetup,
  BgInstallState, BgInstallProgress,
} from '../../shared/bgRemoval'
import { BG_RUNTIME_VERSION, BG_RUNTIME_ASSET, BG_RUNTIME_REPO } from '../../shared/bgRemoval'

const IS_MAC = process.platform === 'darwin'
const IS_ARM = process.arch === 'arm64'
let activeChild: ChildProcess | null = null
let installAbort: AbortController | null = null
// Per-photo cut-out children (Photo Manager auto-clean queue) — for cancel-all.
const cleanChildren = new Set<ChildProcess>()

/** Where the downloaded engine is installed (writable, survives app updates). */
function runtimeDir(): string {
  return path.join(app.getPath('userData'), 'bg-removal-runtime')
}
function readyMarker(dir: string): string {
  return path.join(dir, '.ready.json')
}

/** Python for a given tool dir: the on-machine venv (installed or dev). */
function pythonPath(toolDir: string): string {
  return path.join(toolDir, '.venv', 'bin', 'python')
}

function hasValidSetup(toolDir: string): boolean {
  return fs.existsSync(pythonPath(toolDir)) &&
    fs.existsSync(path.join(toolDir, 'checkpoints', 'refiner_best.pt'))
}

/** Read the installed runtime's version, or null if not installed/ready. */
function installedVersion(): string | null {
  try {
    const marker = readyMarker(runtimeDir())
    if (!fs.existsSync(marker)) return null
    if (!hasValidSetup(runtimeDir())) return null
    const data = JSON.parse(fs.readFileSync(marker, 'utf8')) as { version?: string }
    return data.version ?? null
  } catch {
    return null
  }
}

/** Dev fallback: the repo's tools/bg-removal (so the module works in dev). */
function devToolDir(): string {
  const base = app.getAppPath()
  for (const c of [
    path.join(base, 'tools', 'bg-removal'),
    path.join(base, '..', 'tools', 'bg-removal'),
    path.join(base, '..', '..', 'tools', 'bg-removal'),
  ]) {
    if (hasValidSetup(c)) return path.resolve(c)
  }
  return ''
}

/** Resolve the tool dir to run from: installed runtime first, else dev repo. */
function defaultToolDir(): string {
  if (!IS_MAC) return ''
  if (installedVersion()) return runtimeDir()
  return devToolDir()
}

function installState(): BgInstallState {
  const dev = IS_MAC ? devToolDir() : ''
  const version = installedVersion()
  // In dev the repo tool counts as "installed" so the module is usable without
  // downloading the 2 GB package while developing on this machine.
  const installed = !!version || !!dev
  return {
    installed,
    version: version ?? (dev ? 'dev' : null),
    toolDir: defaultToolDir(),
    needsUpdate: !!version && version !== BG_RUNTIME_VERSION,
    supported: IS_MAC && IS_ARM,
  }
}

function readStatus(file: string): BgRemovalStatus | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as BgRemovalStatus
  } catch {
    return null
  }
}

/** Symlink (fallback: copy) the picked files into a temp input dir, unique names. */
function stageInputs(files: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'npd-bg-'))
  const used = new Set<string>()
  for (const src of files) {
    let name = path.basename(src)
    if (used.has(name)) {
      const ext = path.extname(name)
      name = `${path.basename(name, ext)}_${used.size}${ext}`
    }
    used.add(name)
    const dest = path.join(dir, name)
    try {
      fs.symlinkSync(src, dest)
    } catch {
      fs.copyFileSync(src, dest)
    }
  }
  return dir
}

// ── Engine install (download prebuilt runtime → venv from bundled wheels) ────────

const RUNTIME_TAG = `bg-runtime-${BG_RUNTIME_VERSION}`
const RUNTIME_BASE = `https://github.com/${BG_RUNTIME_REPO}/releases/download/${RUNTIME_TAG}`
const RUNTIME_URL = `${RUNTIME_BASE}/${BG_RUNTIME_ASSET}`
const RUNTIME_SHA_URL = `${RUNTIME_URL}.sha256`

function emitInstall(win: BrowserWindow | null, p: BgInstallProgress): void {
  try { win?.webContents.send('bgremoval:install-progress', p) } catch { /* gone */ }
}

/** HTTP GET (follows redirects, proxy-aware) → text. */
function fetchText(url: string, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = net.request(url)
    signal.addEventListener('abort', () => { try { req.abort() } catch { /* */ } reject(new Error('cancelled')) })
    req.on('response', (res) => {
      let body = ''
      res.on('data', (c) => { body += c.toString() })
      res.on('end', () => resolve(body))
    })
    req.on('error', reject)
    req.end()
  })
}

/** Download `url` → `dest`, reporting byte progress. Uses Electron net (redirects). */
function downloadFile(
  url: string,
  dest: string,
  signal: AbortSignal,
  onProgress: (done: number, total: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = net.request(url)
    const out = fs.createWriteStream(dest)
    let done = 0
    let total = 0
    const onAbort = (): void => { try { req.abort() } catch { /* */ } out.close(); reject(new Error('cancelled')) }
    signal.addEventListener('abort', onAbort)
    req.on('response', (res) => {
      if ((res.statusCode ?? 0) >= 400) { reject(new Error(`HTTP ${res.statusCode}`)); return }
      total = parseInt(String(res.headers['content-length'] ?? '0'), 10) || 0
      res.on('data', (chunk) => { done += chunk.length; out.write(chunk); onProgress(done, total) })
      res.on('end', () => { out.end(() => resolve()) })
      res.on('error', reject)
    })
    req.on('error', reject)
    req.end()
  })
}

function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256')
    const s = fs.createReadStream(file)
    s.on('data', (d) => h.update(d))
    s.on('end', () => resolve(h.digest('hex')))
    s.on('error', reject)
  })
}

/** Run a child process, streaming stdout/stderr lines, resolving on exit 0. */
function runProc(
  cmd: string, args: string[], cwd: string, signal: AbortSignal, onLine: (line: string) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd })
    const onAbort = (): void => { try { child.kill() } catch { /* */ } reject(new Error('cancelled')) }
    signal.addEventListener('abort', onAbort)
    const pipe = (buf: Buffer): void => buf.toString().split('\n').forEach((l) => l.trim() && onLine(l.trim()))
    child.stdout.on('data', pipe)
    child.stderr.on('data', pipe)
    child.on('error', reject)
    child.on('exit', (code) => {
      signal.removeEventListener('abort', onAbort)
      code === 0 ? resolve() : reject(new Error(`${path.basename(cmd)} exited with code ${code}`))
    })
  })
}

/** Full install: download → verify → extract → venv(pip from wheels) → ready. */
async function installRuntime(win: BrowserWindow | null, signal: AbortSignal): Promise<void> {
  const dir = runtimeDir()
  const tmpTar = path.join(os.tmpdir(), `${BG_RUNTIME_ASSET}.part`)

  // 1) Download (0..55%)
  emitInstall(win, { phase: 'download', pct: 0, message: 'Downloading engine…' })
  await downloadFile(RUNTIME_URL, tmpTar, signal, (d, t) => {
    const frac = t ? d / t : 0
    emitInstall(win, {
      phase: 'download', pct: Math.round(frac * 55),
      message: `Downloading engine… ${(d / 1e9).toFixed(2)} GB${t ? ` / ${(t / 1e9).toFixed(2)} GB` : ''}`,
      bytesDone: d, bytesTotal: t,
    })
  })

  // 2) Verify checksum against the release sidecar (.sha256)
  emitInstall(win, { phase: 'verify', pct: 56, message: 'Verifying download…' })
  try {
    const expected = (await fetchText(RUNTIME_SHA_URL, signal)).trim().split(/\s+/)[0].toLowerCase()
    const actual = (await sha256File(tmpTar)).toLowerCase()
    if (expected && expected !== actual) throw new Error('Checksum mismatch — download corrupted. Please retry.')
  } catch (e) {
    if ((e as Error).message.includes('Checksum')) throw e
    // No sidecar published → skip (HTTPS already protects transport integrity).
  }

  // 3) Extract into a clean runtime dir (58..70%)
  emitInstall(win, { phase: 'extract', pct: 58, message: 'Extracting…' })
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  await runProc('/usr/bin/tar', ['-xzf', tmpTar, '-C', dir], dir, signal, () => {})
  fs.rmSync(tmpTar, { force: true })
  emitInstall(win, { phase: 'extract', pct: 70, message: 'Extracted.' })

  // 4) Build the venv from bundled wheels — offline, no compiler needed (70..95%)
  emitInstall(win, { phase: 'deps', pct: 72, message: 'Setting up Python environment…' })
  const basePython = path.join(dir, 'python', 'bin', 'python3')
  await runProc(basePython, ['-m', 'venv', path.join(dir, '.venv')], dir, signal, () => {})
  const venvPip = path.join(dir, '.venv', 'bin', 'pip')
  await runProc(
    venvPip,
    ['install', '--no-index', '--find-links', path.join(dir, 'wheels'), '-r', path.join(dir, 'requirements-runtime.txt')],
    dir, signal,
    (line) => emitInstall(win, { phase: 'deps', pct: 85, message: line.slice(0, 120) }),
  )
  // Reclaim ~1.3 GB — the wheels are now installed into the venv.
  fs.rmSync(path.join(dir, 'wheels'), { recursive: true, force: true })

  // 5) Models are bundled in the package (models/) — nothing to download (95..99%)
  emitInstall(win, { phase: 'models', pct: 97, message: 'Finalizing models…' })

  // 6) Mark ready
  fs.writeFileSync(readyMarker(dir), JSON.stringify({
    version: BG_RUNTIME_VERSION, installedAt: new Date().toISOString(), arch: process.arch,
  }, null, 2))
  emitInstall(win, { phase: 'done', pct: 100, message: 'Engine installed.' })
}

export function registerBgRemovalHandlers(): void {
  ipcMain.handle('bgremoval:install-state', async (): Promise<BgInstallState> => installState())

  ipcMain.handle('bgremoval:install', async (event): Promise<{ ok: boolean; error?: string }> => {
    if (!IS_MAC || !IS_ARM) return { ok: false, error: 'Background Removal requires an Apple Silicon Mac.' }
    if (installAbort) return { ok: false, error: 'An install is already running.' }
    const win = BrowserWindow.fromWebContents(event.sender)
    installAbort = new AbortController()
    try {
      await installRuntime(win, installAbort.signal)
      return { ok: true }
    } catch (e) {
      const msg = (e as Error).message || 'Install failed.'
      if (msg !== 'cancelled') emitInstall(win, { phase: 'error', pct: 0, message: msg, error: msg })
      return { ok: false, error: msg }
    } finally {
      installAbort = null
    }
  })

  ipcMain.handle('bgremoval:install-cancel', async (): Promise<void> => {
    try { installAbort?.abort() } catch { /* */ }
    installAbort = null
  })

  ipcMain.handle('bgremoval:default-tool-dir', async (): Promise<string> => defaultToolDir())

  ipcMain.handle('bgremoval:select-files', async (event): Promise<string[]> => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return []
    const res = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tif', 'tiff'] }],
      title: 'Select photos to cut out',
    })
    return res.canceled ? [] : res.filePaths
  })

  ipcMain.handle('bgremoval:check-setup', async (_e, toolDir: string): Promise<BgRemovalSetup> => {
    if (!IS_MAC) return { ok: false, pythonOk: false, checkpointOk: false, message: 'Only available on Mac.' }
    const pythonOk = fs.existsSync(pythonPath(toolDir))
    const checkpointOk = fs.existsSync(path.join(toolDir, 'checkpoints', 'refiner_best.pt'))
    const ok = pythonOk && checkpointOk
    const message = ok
      ? 'Ready.'
      : !pythonOk
        ? 'Python environment (.venv) not found in that folder.'
        : 'Trained model not found (checkpoints/refiner_best.pt).'
    return { ok, pythonOk, checkpointOk, message }
  })

  ipcMain.handle('bgremoval:open-output', async (_e, dir: string): Promise<void> => {
    if (dir) await shell.openPath(dir)
  })

  ipcMain.handle('bgremoval:read-thumb', async (_e, absPath: string): Promise<string | null> => {
    try {
      const buf = await fs.promises.readFile(absPath)
      return `data:image/jpeg;base64,${buf.toString('base64')}`
    } catch {
      return null
    }
  })

  ipcMain.handle('bgremoval:cancel', async (): Promise<void> => {
    if (activeChild) {
      try {
        activeChild.kill()
      } catch {
        /* ignore */
      }
      activeChild = null
    }
  })

  ipcMain.handle('bgremoval:run', async (event, job: BgRemovalJob): Promise<BgRemovalResult> => {
    if (!IS_MAC) return { success: false, outDir: '', cutDir: '', retouchedDir: null, error: 'Mac only.' }
    const py = pythonPath(job.toolDir)
    if (!fs.existsSync(py)) {
      return { success: false, outDir: '', cutDir: '', retouchedDir: null, error: 'Python environment not found.' }
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const runDir = path.join(job.toolDir, 'app_runs', stamp)
    const cutDir = path.join(runDir, 'cutouts')
    const retouchedDir = path.join(runDir, 'retouched')
    fs.mkdirSync(cutDir, { recursive: true })
    const inputDir = stageInputs(job.files)
    const statusFile = path.join(cutDir, '_status.json')

    const args = ['-u', path.join('train', 'batch_run.py'), '--in', inputDir, '--out', cutDir]
    if (job.retouch) {
      args.push('--retouch', '--rt-out', retouchedDir,
        '--rt-action', job.retouchAction || 'RETOUCH ACTION',
        '--rt-set', job.retouchSet || 'Default Actions',
        '--rt-app', job.photoshopApp || 'Adobe Photoshop (Beta)')
    }

    // Point model caches at the bundled models/ when present (installed runtime),
    // so first cutout needs no network. Falls back to default caches in dev.
    const modelsDir = path.join(job.toolDir, 'models')
    const modelEnv: Record<string, string> = {}
    if (fs.existsSync(modelsDir)) {
      modelEnv.HF_HOME = path.join(modelsDir, 'hf')
      modelEnv.U2NET_HOME = path.join(modelsDir, 'u2net')
    }

    return new Promise<BgRemovalResult>((resolve) => {
      const child = spawn(py, args, {
        cwd: job.toolDir,
        env: { ...process.env, PYTORCH_ENABLE_MPS_FALLBACK: '1', ...modelEnv },
      })
      activeChild = child

      const emit = () => {
        const st = readStatus(statusFile)
        if (!st) return
        // Cutout done but the process is still alive => Photoshop retouch phase.
        if (st.finished && job.retouch && activeChild) {
          st.phase = 'retouch'
          st.current = { step: 'Retouching in Photoshop…' }
          st.finished = false
        } else {
          st.phase = st.finished ? 'done' : 'cutout'
        }
        try {
          event.sender.send('bgremoval:progress', st)
        } catch {
          /* window gone */
        }
      }
      const poll = setInterval(emit, 700)

      child.on('error', (err) => {
        clearInterval(poll)
        activeChild = null
        resolve({ success: false, outDir: '', cutDir, retouchedDir: null, error: err.message })
      })
      child.on('exit', (code) => {
        clearInterval(poll)
        activeChild = null
        const st = readStatus(statusFile)
        if (st) {
          st.finished = true
          st.phase = 'done'
          try {
            event.sender.send('bgremoval:progress', st)
          } catch {
            /* ignore */
          }
        }
        try {
          fs.rmSync(inputDir, { recursive: true, force: true })
        } catch {
          /* ignore */
        }
        const didRetouch = job.retouch && fs.existsSync(retouchedDir)
        resolve({
          success: code === 0,
          outDir: didRetouch ? retouchedDir : cutDir,
          cutDir,
          retouchedDir: didRetouch ? retouchedDir : null,
          error: code === 0 ? undefined : `The process exited with code ${code}.`,
        })
      })
    })
  })

  // Single-photo cut-out (Photo Manager auto-clean). Runs infer.py to write the
  // transparent PNG straight to `output`. Independent of the batch `run` above so
  // it can be queued per selected photo.
  ipcMain.handle(
    'bgremoval:clean-photo',
    async (_e, job: { input: string; output: string; toolDir?: string }): Promise<{ ok: boolean; error?: string }> => {
      if (!IS_MAC) return { ok: false, error: 'Mac only.' }
      const toolDir = job.toolDir || defaultToolDir()
      const py = pythonPath(toolDir)
      if (!toolDir || !fs.existsSync(py)) return { ok: false, error: 'Engine not installed.' }
      if (!fs.existsSync(job.input)) return { ok: false, error: 'Source photo not found.' }
      fs.mkdirSync(path.dirname(job.output), { recursive: true })

      const modelsDir = path.join(toolDir, 'models')
      const modelEnv: Record<string, string> = {}
      if (fs.existsSync(modelsDir)) {
        modelEnv.HF_HOME = path.join(modelsDir, 'hf')
        modelEnv.U2NET_HOME = path.join(modelsDir, 'u2net')
      }

      return new Promise((resolve) => {
        const child = spawn(py, ['-u', path.join('train', 'infer.py'), job.input, job.output], {
          cwd: toolDir,
          env: { ...process.env, PYTORCH_ENABLE_MPS_FALLBACK: '1', ...modelEnv },
        })
        cleanChildren.add(child)
        let stderr = ''
        child.stderr.on('data', (d) => { stderr += d.toString() })
        child.on('error', (err) => { cleanChildren.delete(child); resolve({ ok: false, error: err.message }) })
        child.on('exit', (code) => {
          cleanChildren.delete(child)
          if (code === 0 && fs.existsSync(job.output)) resolve({ ok: true })
          else resolve({ ok: false, error: stderr.trim().split('\n').pop() || `infer.py exited with code ${code}.` })
        })
      })
    },
  )

  ipcMain.handle('bgremoval:clean-cancel-all', async (): Promise<void> => {
    for (const c of cleanChildren) { try { c.kill() } catch { /* */ } }
    cleanChildren.clear()
  })
}
