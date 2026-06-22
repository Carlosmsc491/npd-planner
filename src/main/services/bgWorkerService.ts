// src/main/services/bgWorkerService.ts
// Persistent bg-removal worker for Photo Studio.
// Spawns studio_worker.py once, keeps it alive, and feeds it one job at a time
// via stdin/stdout. Eliminates the 2-3s model cold-start on every photo.

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

function pythonExe(toolDir: string): string {
  return path.join(toolDir, '.venv', 'bin', 'python')
}

function workerScript(toolDir: string): string {
  return path.join(toolDir, 'train', 'studio_worker.py')
}

function processNext(): void {
  if (!workerReady || !worker || jobQueue.length === 0 || pendingJobs.size > 0) return
  const job = jobQueue.shift()!
  pendingJobs.set(job.id, job)
  emit({ sessionDir: job.sessionDir, photoId: job.photoId, status: 'processing' })
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
    emit({ sessionDir: job.sessionDir, photoId: job.photoId, status: 'done', output: msg.output as string })
  } else {
    emit({ sessionDir: job.sessionDir, photoId: job.photoId, status: 'error', error: msg.error as string })
  }
  processNext()
}

function startWorker(toolDir: string): void {
  if (workerStarting || workerReady) return
  const py = pythonExe(toolDir)
  const script = workerScript(toolDir)
  if (!fs.existsSync(py) || !fs.existsSync(script)) {
    console.warn('[bg-worker] engine not found at', toolDir)
    return
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
    for (const job of pendingJobs.values()) {
      emit({ sessionDir: job.sessionDir, photoId: job.photoId, status: 'error', error: 'Worker exited unexpectedly' })
    }
    pendingJobs.clear()
  })
}

export function enqueueBgRemoval(args: {
  sessionDir: string
  photoId: string
  input: string
  output: string
  toolDir: string
}): void {
  if (process.platform !== 'darwin') return
  const { toolDir, ...rest } = args
  const id = `${rest.photoId}-${Date.now()}`
  jobQueue.push({ id, ...rest })
  emit({ sessionDir: rest.sessionDir, photoId: rest.photoId, status: 'queued' })

  if (!workerReady && !workerStarting) {
    emit({ sessionDir: rest.sessionDir, photoId: rest.photoId, status: 'loading-model' })
    startWorker(toolDir)
  } else {
    processNext()
  }
}

export function killBgWorker(): void {
  try { worker?.kill() } catch { /* */ }
  worker = null
  workerReady = false
  workerStarting = false
  jobQueue.length = 0
  pendingJobs.clear()
}
