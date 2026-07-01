// src/main/services/bgWorkerService.ts
// Persistent bg-removal worker — the single warm engine shared by Photo Studio
// AND the recipe Photo Manager auto-clean. Spawns studio_worker.py once, keeps it
// alive, and feeds it one job at a time via stdin/stdout. Eliminates the 2-3s
// model cold-start that the per-photo `infer.py` spawn paid on every photo.
//
// Two ways to submit a job:
//   • enqueueBgRemoval(...)  — fire-and-forget, reports via 'photostudio:bg-event'
//                              window messages (Photo Studio UI).
//   • runBgRemoval(...)      — returns a Promise that resolves when THAT job is
//                              done (Photo Manager useCleanQueue).
// Both feed the same queue and the same worker process, so the engine is identical.

import { spawn, type ChildProcess } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { BrowserWindow } from 'electron'

export interface BgWorkerEvent {
  sessionDir: string
  photoId: string
  status: 'queued' | 'loading-model' | 'processing' | 'done' | 'error'
  output?: string
  error?: string
}

interface QueueJob {
  id: string
  sessionDir: string
  photoId: string
  input: string
  output: string
  /** Emit 'photostudio:bg-event' window messages (Photo Studio). */
  emitEvents: boolean
  /** Promise resolvers (Photo Manager) — optional. */
  resolve?: (output: string) => void
  reject?: (err: Error) => void
}

let worker: ChildProcess | null = null
let workerReady = false
let workerStarting = false
const jobQueue: QueueJob[] = []
const pendingJobs = new Map<string, QueueJob>()
let lineBuffer = ''

function getWin(): BrowserWindow | null {
  return BrowserWindow.getAllWindows()[0] ?? null
}

function emit(data: BgWorkerEvent): void {
  try { getWin()?.webContents.send('photostudio:bg-event', data) } catch { /* window gone */ }
}

/** Notify a job's listeners (window event and/or promise) of a terminal result. */
function settle(job: QueueJob, result: { ok: true; output: string } | { ok: false; error: string }): void {
  if (result.ok) {
    if (job.emitEvents) emit({ sessionDir: job.sessionDir, photoId: job.photoId, status: 'done', output: result.output })
    job.resolve?.(result.output)
  } else {
    if (job.emitEvents) emit({ sessionDir: job.sessionDir, photoId: job.photoId, status: 'error', error: result.error })
    job.reject?.(new Error(result.error))
  }
}

function pythonExe(toolDir: string): string {
  return path.join(toolDir, '.venv', 'bin', 'python')
}

function workerScript(toolDir: string): string {
  return path.join(toolDir, 'train', 'studio_worker.py')
}

/** True when this toolDir can run the warm worker (script + venv present). */
export function bgWorkerAvailable(toolDir: string): boolean {
  return !!toolDir && fs.existsSync(pythonExe(toolDir)) && fs.existsSync(workerScript(toolDir))
}

function processNext(): void {
  if (!workerReady || !worker || jobQueue.length === 0 || pendingJobs.size > 0) return
  const job = jobQueue.shift()!
  pendingJobs.set(job.id, job)
  if (job.emitEvents) emit({ sessionDir: job.sessionDir, photoId: job.photoId, status: 'processing' })
  worker.stdin?.write(JSON.stringify({ id: job.id, input: job.input, output: job.output }) + '\n')
}

function handleLine(line: string): void {
  if (!line.trim()) return
  let msg: Record<string, unknown>
  try { msg = JSON.parse(line) } catch { return }

  if (msg.ready) {
    workerReady = true
    workerStarting = false
    processNext()
    return
  }

  const id = msg.id as string | undefined
  if (!id) return
  const job = pendingJobs.get(id)
  if (!job) return
  pendingJobs.delete(id)

  if (msg.ok) {
    settle(job, { ok: true, output: (msg.output as string) ?? job.output })
  } else {
    settle(job, { ok: false, error: (msg.error as string) || 'Cut-out failed.' })
  }
  processNext()
}

/** Spawn the worker process. Returns false when the engine isn't available. */
function startWorker(toolDir: string): boolean {
  if (workerStarting || workerReady) return true
  const py = pythonExe(toolDir)
  const script = workerScript(toolDir)
  if (!fs.existsSync(py) || !fs.existsSync(script)) {
    console.warn('[bg-worker] engine not found at', toolDir)
    return false
  }

  workerStarting = true
  lineBuffer = ''

  const modelsDir = path.join(toolDir, 'models')
  const modelEnv: Record<string, string> = {}
  if (fs.existsSync(modelsDir)) {
    modelEnv.HF_HOME = path.join(modelsDir, 'hf')
    modelEnv.U2NET_HOME = path.join(modelsDir, 'u2net')
  }

  const child = spawn(py, ['-u', script], {
    cwd: toolDir,
    env: { ...process.env, PYTORCH_ENABLE_MPS_FALLBACK: '1', ...modelEnv },
  })
  worker = child

  // Run the cut-out worker at low CPU priority so its heavy pre/post-processing
  // doesn't starve the UI while capturing/reviewing. Best-effort; ignore failures.
  if (child.pid) {
    try { os.setPriority(child.pid, 10) } catch { /* not permitted on some setups */ }
  }

  child.stdout?.on('data', (data: Buffer) => {
    lineBuffer += data.toString()
    const lines = lineBuffer.split('\n')
    lineBuffer = lines.pop() ?? ''
    for (const line of lines) handleLine(line)
  })

  child.stderr?.on('data', (d: Buffer) => {
    // Python model loading logs to stderr — not errors
    console.log('[bg-worker]', d.toString().trimEnd().slice(0, 200))
  })

  child.on('exit', () => {
    worker = null
    workerReady = false
    workerStarting = false
    // Reject/notify everything in flight AND everything still queued so no
    // promise hangs forever and Photo Studio sees the failure.
    const orphans = [...pendingJobs.values(), ...jobQueue]
    pendingJobs.clear()
    jobQueue.length = 0
    for (const job of orphans) settle(job, { ok: false, error: 'Worker exited unexpectedly' })
  })

  return true
}

/** Shared enqueue. Starts the worker on demand; rejects/notifies if it can't start. */
function submit(job: QueueJob, toolDir: string): void {
  if (process.platform !== 'darwin') {
    settle(job, { ok: false, error: 'Mac only.' })
    return
  }
  jobQueue.push(job)
  if (job.emitEvents) emit({ sessionDir: job.sessionDir, photoId: job.photoId, status: 'queued' })

  if (!workerReady && !workerStarting) {
    if (job.emitEvents) emit({ sessionDir: job.sessionDir, photoId: job.photoId, status: 'loading-model' })
    const started = startWorker(toolDir)
    if (!started) {
      const idx = jobQueue.indexOf(job)
      if (idx >= 0) jobQueue.splice(idx, 1)
      settle(job, { ok: false, error: 'Background-removal engine not available (studio_worker.py missing).' })
    }
  } else {
    processNext()
  }
}

/** Fire-and-forget enqueue used by Photo Studio (reports via window events). */
export function enqueueBgRemoval(args: {
  sessionDir: string
  photoId: string
  input: string
  output: string
  toolDir: string
}): void {
  const { toolDir, ...rest } = args
  submit({ id: `${rest.photoId}-${Date.now()}`, ...rest, emitEvents: true }, toolDir)
}

/** Promise-based enqueue used by the recipe Photo Manager auto-clean. */
export function runBgRemoval(args: {
  input: string
  output: string
  toolDir: string
}): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    submit({
      id: `pm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sessionDir: '',
      photoId: '',
      input: args.input,
      output: args.output,
      emitEvents: false,
      resolve,
      reject,
    }, args.toolDir)
  })
}

/** Drop queued (not-yet-started) jobs and reject them — used by clean-cancel-all.
 *  The in-flight job is left to finish (a single inference can't be cleanly cut). */
export function cancelQueuedBgRemoval(): void {
  const dropped = jobQueue.splice(0, jobQueue.length)
  for (const job of dropped) settle(job, { ok: false, error: 'cancelled' })
}

export function killBgWorker(): void {
  try { worker?.kill() } catch { /* */ }
  worker = null
  workerReady = false
  workerStarting = false
  const orphans = [...pendingJobs.values(), ...jobQueue]
  jobQueue.length = 0
  pendingJobs.clear()
  for (const job of orphans) settle(job, { ok: false, error: 'cancelled' })
}
