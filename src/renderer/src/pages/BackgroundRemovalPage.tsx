// src/renderer/src/pages/BackgroundRemovalPage.tsx
// Background Removal (Mac-only). Thin GUI over tools/bg-removal/train/batch_run.py:
// pick photos → run the local model → live progress + previews → optional
// Photoshop RETOUCH. All heavy work runs in the Python tool via bgRemovalHandlers.

import { useEffect, useState, useRef, useCallback } from 'react'
import {
  Scissors, Upload, FolderOpen, Loader2, CheckCircle2, AlertTriangle,
  X, Play, Wand2, Download, FileImage,
} from 'lucide-react'
import type {
  BgRemovalStatus, BgRemovalResult, BgInstallState, BgInstallProgress,
} from '../../../shared/bgRemoval'
import { BG_IMAGE_EXTS } from '../../../shared/bgRemoval'
import AppLayout from '../components/ui/AppLayout'

type Phase = 'idle' | 'processing' | 'done'
type ElectronFile = File & { path: string }

const RETOUCH_KEY = 'npd:bgremoval_retouch'
const ACCENT = '#1D9E75'

function fmtTime(s: number): string {
  if (!s || s < 0) return '—'
  const m = Math.floor(s / 60)
  const x = Math.round(s % 60)
  return m ? `${m}m ${x}s` : `${x}s`
}

function isImage(name: string): boolean {
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
  return (BG_IMAGE_EXTS as readonly string[]).includes(ext)
}

export default function BackgroundRemovalPage() {
  const [install, setInstall] = useState<BgInstallState | null>(null)
  const [installing, setInstalling] = useState(false)
  const [iProg, setIProg] = useState<BgInstallProgress | null>(null)
  const [files, setFiles] = useState<string[]>([])
  const [retouch, setRetouch] = useState(() => localStorage.getItem(RETOUCH_KEY) !== '0')
  const [phase, setPhase] = useState<Phase>('idle')
  const [status, setStatus] = useState<BgRemovalStatus | null>(null)
  const [result, setResult] = useState<BgRemovalResult | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const fetched = useRef<Set<string>>(new Set())

  const toolDir = install?.toolDir ?? ''
  const ready = !!install?.installed

  useEffect(() => { localStorage.setItem(RETOUCH_KEY, retouch ? '1' : '0') }, [retouch])

  // Resolve install state — is the local engine present (installed or dev)?
  useEffect(() => {
    let alive = true
    window.electronAPI.bgRemovalInstallState().then((s) => { if (alive) setInstall(s) })
    return () => { alive = false }
  }, [])

  // Live install progress.
  useEffect(() => window.electronAPI.onBgRemovalInstallProgress((p) => {
    setIProg(p)
    if (p.phase === 'done') {
      setInstalling(false)
      window.electronAPI.bgRemovalInstallState().then(setInstall)
    } else if (p.phase === 'error') {
      setInstalling(false)
    }
  }), [])

  useEffect(() => window.electronAPI.onBgRemovalProgress(setStatus), [])

  const startInstall = async () => {
    setInstalling(true)
    setIProg({ phase: 'download', pct: 0, message: 'Starting…' })
    const res = await window.electronAPI.bgRemovalInstall()
    if (res.ok) setInstall(await window.electronAPI.bgRemovalInstallState())
    setInstalling(false)
  }
  const cancelInstall = async () => {
    await window.electronAPI.bgRemovalInstallCancel()
    setInstalling(false); setIProg(null)
  }

  // Load previews (already checkerboard-composited by the tool) as they finish.
  useEffect(() => {
    if (!status?.items) return
    for (const it of status.items) {
      if (it.thumb && !fetched.current.has(it.name)) {
        fetched.current.add(it.name)
        window.electronAPI.bgRemovalReadThumb(it.thumb).then((d) => {
          if (d) setThumbs((m) => ({ ...m, [it.name]: d }))
        })
      }
    }
  }, [status])

  const pickFiles = async () => {
    const picked = await window.electronAPI.bgRemovalSelectFiles()
    if (picked.length) setFiles((prev) => Array.from(new Set([...prev, ...picked])))
  }
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    const dropped = Array.from(e.dataTransfer.files) as ElectronFile[]
    const paths = dropped.map((f) => f.path).filter((p) => p && isImage(p))
    if (paths.length) setFiles((prev) => Array.from(new Set([...prev, ...paths])))
  }, [])

  const start = async () => {
    if (!files.length || !ready) return
    setPhase('processing'); setStatus(null); setResult(null); setThumbs({}); fetched.current = new Set()
    const res = await window.electronAPI.bgRemovalRun({ files, toolDir, retouch })
    setResult(res); setPhase('done')
  }
  const cancel = async () => { await window.electronAPI.bgRemovalCancel(); setPhase('idle'); setStatus(null) }
  const reset = () => { setFiles([]); setStatus(null); setResult(null); setPhase('idle'); setThumbs({}); fetched.current = new Set() }

  const pct = status && status.total ? Math.round((100 * status.done) / status.total) : 0
  const retouchPhase = status?.phase === 'retouch'

  return (
    <AppLayout>
      <div className="mx-auto max-w-5xl px-6 py-6">
        {/* header */}
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800" style={{ color: ACCENT }}>
            <Scissors size={22} />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Background Removal</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Remove the background from bouquet photos with AI · Mac only</p>
          </div>
        </div>

        {/* resolving install state */}
        {!install && (
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Loader2 size={16} className="animate-spin" /> Checking engine…
          </div>
        )}

        {/* unsupported hardware */}
        {install && !install.supported && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700/50 dark:bg-amber-900/20 dark:text-amber-300">
            <div className="flex items-center gap-2 font-medium"><AlertTriangle size={16} /> Apple Silicon Mac required</div>
            <p className="mt-1">Background Removal runs a local AI engine that currently supports Apple Silicon (M-series) Macs only.</p>
          </div>
        )}

        {/* install gate — engine not yet downloaded */}
        {install && install.supported && !ready && (
          <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800/50">
            {!installing && (!iProg || iProg.phase !== 'error') && (
              <>
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">Install the engine</h2>
                <p className="mt-1 max-w-xl text-sm text-gray-500 dark:text-gray-400">
                  This module needs a one-time download of the AI engine (~2 GB). It installs automatically — no setup required. You only do this once.
                </p>
                <button
                  onClick={startInstall}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-white"
                  style={{ background: ACCENT }}
                >
                  <Download size={16} /> Download engine (~2 GB)
                </button>
              </>
            )}

            {iProg && iProg.phase === 'error' && !installing && (
              <>
                <div className="flex items-center gap-2 font-medium text-red-600 dark:text-red-400">
                  <AlertTriangle size={16} /> Install failed
                </div>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{iProg.error || iProg.message}</p>
                <button
                  onClick={startInstall}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-white"
                  style={{ background: ACCENT }}
                >
                  <Download size={16} /> Retry
                </button>
              </>
            )}

            {installing && (
              <>
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="font-medium text-gray-900 dark:text-white">Installing engine</span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">{iProg?.pct ?? 0}%</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                  <div className="h-full rounded-full transition-all" style={{ width: `${iProg?.pct ?? 0}%`, background: ACCENT }} />
                </div>
                <div className="mt-3 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <Loader2 size={16} className="animate-spin" style={{ color: ACCENT }} />
                  <span className="truncate">{iProg?.message || 'Working…'}</span>
                </div>
                <button onClick={cancelInstall} className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800">
                  <X size={15} /> Cancel
                </button>
              </>
            )}
          </div>
        )}

        {/* IDLE: input + options */}
        {ready && phase === 'idle' && (
          <>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${dragOver ? 'border-[#1D9E75] bg-green-50 dark:bg-green-900/10' : 'border-gray-300 dark:border-gray-700'}`}
            >
              <Upload size={28} className="mx-auto mb-2 text-gray-400" />
              <p className="text-gray-700 dark:text-gray-300">Drag photos here, or</p>
              <button onClick={pickFiles} className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800">
                <FileImage size={15} /> Select photos
              </button>
              {files.length > 0 && (
                <p className="mt-3 text-sm font-medium" style={{ color: ACCENT }}>{files.length} photo{files.length !== 1 ? 's' : ''} ready</p>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700">
                <input type="checkbox" checked={retouch} onChange={(e) => setRetouch(e.target.checked)} className="accent-[#1D9E75]" />
                <Wand2 size={15} style={{ color: ACCENT }} /> Auto-retouch in Photoshop
              </label>
              <span className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">Output: PNG 3600 · 300 dpi</span>
            </div>

            <div className="mt-5 flex gap-3">
              <button
                onClick={start}
                disabled={!files.length || !ready}
                className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-white disabled:opacity-40"
                style={{ background: ACCENT }}
              >
                <Play size={16} /> Process {files.length || ''} photo{files.length !== 1 ? 's' : ''}
              </button>
              {files.length > 0 && (
                <button onClick={() => setFiles([])} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2.5 text-sm hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800">
                  <X size={15} /> Clear
                </button>
              )}
            </div>
          </>
        )}

        {/* PROCESSING / DONE: progress + previews */}
        {ready && (phase === 'processing' || phase === 'done') && (
          <>
            <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800/50">
              <div className="mb-2 flex items-baseline justify-between">
                <span className="font-medium text-gray-900 dark:text-white">
                  {phase === 'done' ? 'Done' : retouchPhase ? 'Retouching in Photoshop' : 'Processing batch'}
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400">{status?.done ?? 0} / {status?.total ?? files.length} photos</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                <div className="h-full rounded-full transition-all" style={{ width: `${phase === 'done' ? 100 : pct}%`, background: ACCENT }} />
              </div>
              <div className="mt-3 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                {phase === 'done'
                  ? <><CheckCircle2 size={16} style={{ color: ACCENT }} /> {result?.success ? 'Completed.' : (result?.error || 'Finished with errors.')}</>
                  : <><Loader2 size={16} className="animate-spin" style={{ color: ACCENT }} /> {status?.current?.step || 'Preparing…'}</>}
              </div>
              {phase === 'processing' && (
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <span className="rounded-md bg-gray-100 px-2.5 py-1 dark:bg-gray-700/50">Elapsed {fmtTime(status?.elapsed_s ?? 0)}</span>
                  {!retouchPhase && <span className="rounded-md bg-gray-100 px-2.5 py-1 dark:bg-gray-700/50">~{fmtTime(status?.eta_s ?? 0)} left</span>}
                  {status?.avg_s ? <span className="rounded-md bg-gray-100 px-2.5 py-1 dark:bg-gray-700/50">{status.avg_s}s/photo</span> : null}
                </div>
              )}
              <div className="mt-4 flex gap-3">
                {phase === 'processing' && (
                  <button onClick={cancel} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800">
                    <X size={15} /> Cancel
                  </button>
                )}
                {phase === 'done' && result?.outDir && (
                  <>
                    <button onClick={() => window.electronAPI.bgRemovalOpenOutput(result.outDir)} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium text-white" style={{ background: ACCENT }}>
                      <FolderOpen size={15} /> Open results
                    </button>
                    <button onClick={reset} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-1.5 text-sm hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800">
                      Process another batch
                    </button>
                  </>
                )}
              </div>
            </div>

            {status?.items && status.items.length > 0 && (
              <>
                <p className="mb-2 mt-6 text-sm text-gray-500 dark:text-gray-400">Previews</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {status.items.map((it) => (
                    <div key={it.name} className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                      <div className="aspect-square bg-gray-100 dark:bg-gray-800">
                        {thumbs[it.name]
                          ? <img src={thumbs[it.name]} alt={it.name} className="h-full w-full object-cover" />
                          : <div className="flex h-full items-center justify-center"><Loader2 size={18} className="animate-spin text-gray-400" /></div>}
                      </div>
                      <div className="flex items-center justify-between gap-2 px-2.5 py-1.5">
                        <span className="truncate text-xs text-gray-500 dark:text-gray-400">{it.name.replace(/\.[^.]+$/, '')}</span>
                        {it.error
                          ? <span className="flex items-center gap-0.5 text-xs text-red-500"><AlertTriangle size={11} /> error</span>
                          : <span className="text-xs font-medium" style={{ color: ACCENT }}>{it.seconds}s</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </AppLayout>
  )
}
