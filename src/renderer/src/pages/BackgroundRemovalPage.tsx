// src/renderer/src/pages/BackgroundRemovalPage.tsx
// Background Removal (Mac-only). Thin GUI over tools/bg-removal/train/batch_run.py:
// pick photos → thumbnails → run the local model → live per-photo progress +
// result thumbnails + lightbox → optional Photoshop RETOUCH. All heavy work runs
// in the Python tool via bgRemovalHandlers; thumbnails are downscaled in main
// (sharp) so big batches never freeze the renderer.

import { useEffect, useState, useRef, useCallback, memo, CSSProperties } from 'react'
import {
  Scissors, Upload, FolderOpen, Loader2, CheckCircle2, AlertTriangle,
  X, Play, Wand2, Download, FileImage, ChevronLeft, ChevronRight,
} from 'lucide-react'
import type {
  BgRemovalStatus, BgRemovalResult, BgInstallState, BgInstallProgress, BgRemovalItem,
} from '../../../shared/bgRemoval'
import { BG_IMAGE_EXTS } from '../../../shared/bgRemoval'
import AppLayout from '../components/ui/AppLayout'
import CutoutCompareModal from '../components/ui/CutoutCompareModal'

type Phase = 'idle' | 'processing' | 'done'
type ElectronFile = File & { path: string }

const RETOUCH_KEY = 'npd:bgremoval_retouch'
const DEST_KEY = 'npd:bgremoval_dest'
const ACCENT = '#1D9E75'

// Stable style reference — declaring inline `style={{ color: ACCENT }}` creates a new
// object on EVERY render. React sees a changed prop reference, applies a DOM style
// mutation, and Chromium resets the CSS animation. Hoisting to module-level prevents this.
const ACCENT_STYLE: CSSProperties = { color: ACCENT }

// Memoized spinner — keeps the SVG DOM element untouched across parent re-renders so
// the `animate-spin` CSS animation never gets interrupted by status-tick re-renders.
const ProcessingSpinner = memo(function ProcessingSpinner({ size = 16 }: { size?: number }) {
  return (
    <Loader2
      size={size}
      // will-change-transform promotes the element to the GPU compositor layer so
      // the rotation runs independent of the JS/layout thread.
      className="animate-spin will-change-transform shrink-0"
      style={ACCENT_STYLE}
    />
  )
})

const slash = (p: string): string => p.replace(/\\/g, '/')

/** Longest common parent dir of the selected files (to mirror subfolders). */
function commonBaseDir(files: string[]): string {
  if (!files.length) return ''
  const dirs = files.map((f) => slash(f).split('/').slice(0, -1))
  let base = dirs[0]
  for (const d of dirs.slice(1)) {
    let i = 0
    while (i < base.length && i < d.length && base[i] === d[i]) i++
    base = base.slice(0, i)
  }
  return base.join('/')
}

/** Output paths for a source file: {dest}/PNG|JPG/{mirrored-subdir}/{name}.ext */
function outFor(f: string, destDir: string, base: string): { png: string; jpg: string; subject: string } {
  const sf = slash(f)
  const dir = sf.split('/').slice(0, -1).join('/')
  const stem = (sf.split('/').pop() || '').replace(/\.[^.]+$/, '')
  const relDir = base && dir.length > base.length ? dir.slice(base.length).replace(/^\/+/, '') : ''
  const d = slash(destDir).replace(/\/$/, '')
  const sub = relDir ? `/${relDir}` : ''
  return { png: `${d}/PNG${sub}/${stem}.png`, jpg: `${d}/JPG${sub}/${stem}.jpg`, subject: `${d}/PNG${sub}/${stem}.subject.png` }
}

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

const baseName = (p: string): string => p.split(/[\\/]/).pop() ?? p
const stemOf = (name: string): string => name.replace(/\.[^.]+$/, '')

// checkerboard so transparent PNGs read clearly in the grid + lightbox
const CHECKER = {
  backgroundImage:
    'linear-gradient(45deg,#d9d9d9 25%,transparent 25%),linear-gradient(-45deg,#d9d9d9 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#d9d9d9 75%),linear-gradient(-45deg,transparent 75%,#d9d9d9 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0,0 8px,8px -8px,-8px 0',
  backgroundColor: '#f0f0f0',
}

type TileKind = 'idle' | 'queued' | 'current' | 'done' | 'error'

// Memoized so a 700ms status tick only re-renders the tile(s) that actually
// changed — keeps the live grid smooth with big batches.
const PhotoTile = memo(function PhotoTile({
  index, label, url, kind, seconds, showRecut, recutting, onOpen, onRecut,
}: {
  index: number; label: string; url?: string; kind: TileKind
  seconds?: number; showRecut: boolean; recutting: boolean
  onOpen: (i: number) => void; onRecut: (i: number) => void
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(index)}
      className="group relative cursor-pointer overflow-hidden rounded-lg border border-gray-200 text-left dark:border-gray-700"
    >
      <div className="aspect-square" style={CHECKER}>
        {url
          ? <img src={url} alt={label} loading="lazy" className="h-full w-full object-cover" />
          : <div className="flex h-full items-center justify-center"><Loader2 size={18} className="animate-spin will-change-transform text-gray-400" /></div>}
      </div>

      {kind === 'done' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/15">
          <CheckCircle2 size={42} className="drop-shadow-lg" style={{ color: '#fff', fill: ACCENT }} />
        </div>
      )}
      {kind === 'current' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          <Loader2 size={34} className="animate-spin will-change-transform text-white drop-shadow" />
        </div>
      )}
      {kind === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <AlertTriangle size={34} className="text-red-400 drop-shadow" />
        </div>
      )}

      {showRecut && (
        <button
          onClick={(e) => { e.stopPropagation(); onRecut(index) }}
          disabled={recutting}
          title="Re-cut with Photoshop Select Subject"
          className="absolute bottom-9 right-1.5 inline-flex items-center gap-1 rounded-md bg-black/55 px-2 py-1 text-[10px] font-medium text-white opacity-0 transition-opacity hover:bg-black/75 group-hover:opacity-100 disabled:opacity-100"
        >
          {recutting ? <Loader2 size={11} className="animate-spin will-change-transform" /> : <Wand2 size={11} />}
          Select Subject
        </button>
      )}

      <div className="flex items-center justify-between gap-2 px-2.5 py-1.5">
        <span className="truncate text-xs text-gray-500 dark:text-gray-400">{label}</span>
        {kind === 'error'
          ? <span className="flex items-center gap-0.5 text-xs text-red-500"><AlertTriangle size={11} /> error</span>
          : kind === 'done'
            ? <span className="text-xs font-medium" style={{ color: ACCENT }}>{seconds}s</span>
            : kind === 'current'
              ? <span className="text-xs text-gray-400">cleaning…</span>
              : kind === 'queued' ? <span className="text-xs text-gray-300 dark:text-gray-600">queued</span> : null}
      </div>
    </div>
  )
})

export default function BackgroundRemovalPage() {
  const [install, setInstall] = useState<BgInstallState | null>(null)
  const [installing, setInstalling] = useState(false)
  const [iProg, setIProg] = useState<BgInstallProgress | null>(null)
  const [files, setFiles] = useState<string[]>([])
  const [retouch, setRetouch] = useState(() => localStorage.getItem(RETOUCH_KEY) !== '0')
  const [destDir, setDestDir] = useState(() => localStorage.getItem(DEST_KEY) || '')
  const [phase, setPhase] = useState<Phase>('idle')
  const [status, setStatus] = useState<BgRemovalStatus | null>(null)
  const [result, setResult] = useState<BgRemovalResult | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [inputThumbs, setInputThumbs] = useState<Record<string, string>>({})   // path → dataURL
  const [resultThumbs, setResultThumbs] = useState<Record<string, string>>({}) // basename → dataURL
  const fetched = useRef<Set<string>>(new Set())
  const loadingThumbs = useRef<Set<string>>(new Set())

  // Lightbox
  const [lightbox, setLightbox] = useState<number | null>(null)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  const toolDir = install?.toolDir ?? ''
  const ready = !!install?.installed

  useEffect(() => { localStorage.setItem(RETOUCH_KEY, retouch ? '1' : '0') }, [retouch])
  useEffect(() => { if (destDir) localStorage.setItem(DEST_KEY, destDir) }, [destDir])

  const base = commonBaseDir(files)
  const pickDest = async () => {
    const d = await window.electronAPI.selectFolder()
    if (d) setDestDir(d)
  }

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

  // Input thumbnails — load sequentially (downscaled in main) so 30+ photos
  // never block the renderer.
  useEffect(() => {
    let cancelled = false
    const pending = files.filter((f) => !inputThumbs[f] && !loadingThumbs.current.has(f))
    if (!pending.length) return
    ;(async () => {
      for (const f of pending) {
        if (cancelled) break
        loadingThumbs.current.add(f)
        const d = await window.electronAPI.bgRemovalThumb(f, 320)
        if (cancelled) break
        if (d) setInputThumbs((m) => ({ ...m, [f]: d }))
      }
    })()
    return () => { cancelled = true }
  }, [files]) // eslint-disable-line react-hooks/exhaustive-deps

  // Result preview thumbnails (checkerboard-composited by the tool) as they finish.
  useEffect(() => {
    if (!status?.items) return
    for (const it of status.items) {
      if (it.thumb && !fetched.current.has(it.name)) {
        fetched.current.add(it.name)
        window.electronAPI.bgRemovalReadThumb(it.thumb).then((d) => {
          if (d) setResultThumbs((m) => ({ ...m, [it.name]: d }))
        })
      }
    }
  }, [status])

  // Lightbox: load the large image on demand (full input, or result PNG if done).
  useEffect(() => {
    if (lightbox === null) { setLightboxUrl(null); return }
    const f = files[lightbox]
    if (!f) return
    let cancelled = false
    setLightboxUrl(null)
    const bn = baseName(f)
    const item = status?.items?.find((it) => it.name === bn)
    const useResult = phase === 'done' && !!destDir && !!item && !item.error
    const src = useResult ? outFor(f, destDir, base).png : f
    window.electronAPI.bgRemovalReadFull(src).then((d) => { if (!cancelled) setLightboxUrl(d) })
    return () => { cancelled = true }
  }, [lightbox]) // eslint-disable-line react-hooks/exhaustive-deps

  // Lightbox keyboard nav
  useEffect(() => {
    if (lightbox === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null)
      else if (e.key === 'ArrowRight') setLightbox((i) => (i === null ? i : Math.min(files.length - 1, i + 1)))
      else if (e.key === 'ArrowLeft') setLightbox((i) => (i === null ? i : Math.max(0, i - 1)))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox, files.length])

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
    if (!files.length || !ready || !destDir) return
    setPhase('processing'); setStatus(null); setResult(null); setResultThumbs({}); fetched.current = new Set()
    const res = await window.electronAPI.bgRemovalRun({ files, toolDir, destDir, retouch })
    setResult(res); setPhase('done')
  }
  // Re-cut a single result with Photoshop Select Subject → compare engine vs
  // Photoshop side by side, keep one, regenerate the JPG from the chosen PNG.
  const [recutting, setRecutting] = useState<string | null>(null)
  const [compare, setCompare] = useState<{
    index: number; bn: string; enginePng: string; subjectPng: string; jpg: string
    engineUrl: string | null; subjectUrl: string | null
  } | null>(null)
  const [compareBusy, setCompareBusy] = useState(false)

  const recut = async (i: number) => {
    const f = files[i]
    if (!f || !destDir) return
    const bn = baseName(f)
    const { png, jpg, subject } = outFor(f, destDir, base)
    setRecutting(bn)
    const r = await window.electronAPI.photoshopSelectSubject(f, subject)
    setRecutting(null)
    if (!r.ok) { alert(r.error || 'Photoshop Select Subject failed.'); return }
    const [eu, su] = await Promise.all([
      window.electronAPI.bgRemovalReadFull(png),
      window.electronAPI.bgRemovalReadFull(subject),
    ])
    setCompare({ index: i, bn, enginePng: png, subjectPng: subject, jpg, engineUrl: eu, subjectUrl: su })
  }

  const chooseRecut = async (keepSubject: boolean) => {
    if (!compare) return
    setCompareBusy(true)
    const { bn, enginePng, subjectPng, jpg, index } = compare
    await window.electronAPI.bgRemovalResolveRecut({ keepSubject, enginePng, subjectPng })
    // Regenerate the JPG from the chosen PNG so PNG + JPG stay in sync.
    await window.electronAPI.bgRemovalMakeJpg(enginePng, jpg)
    const fresh = await window.electronAPI.bgRemovalReadFull(enginePng)
    if (fresh) {
      setResultThumbs((m) => ({ ...m, [bn]: fresh }))
      if (lightbox === index) setLightboxUrl(fresh)
    }
    setCompareBusy(false)
    setCompare(null)
  }
  // Stable callbacks so memoized tiles don't re-render every status tick.
  const recutRef = useRef(recut); recutRef.current = recut
  const onOpenTile = useCallback((i: number) => setLightbox(i), [])
  const onRecutTile = useCallback((i: number) => { void recutRef.current(i) }, [])

  const cancel = async () => { await window.electronAPI.bgRemovalCancel(); setPhase('idle'); setStatus(null) }
  const reset = () => {
    setFiles([]); setStatus(null); setResult(null); setResultThumbs({}); setInputThumbs({})
    fetched.current = new Set(); loadingThumbs.current = new Set(); setPhase('idle')
  }

  const pct = status && status.total ? Math.round((100 * status.done) / status.total) : 0
  const retouchPhase = status?.phase === 'retouch'
  const itemByName = new Map<string, BgRemovalItem>((status?.items ?? []).map((it) => [it.name, it]))
  const currentName = status?.current?.name

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
            <Loader2 size={16} className="animate-spin will-change-transform" /> Checking engine…
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
                  This module needs a one-time download of the AI engine (~800 MB). It installs automatically — no setup required. You only do this once.
                </p>
                <button
                  onClick={startInstall}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-white"
                  style={{ background: ACCENT }}
                >
                  <Download size={16} /> Download engine (~800 MB)
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
                  <ProcessingSpinner />
                  <span className="truncate">{iProg?.message || 'Working…'}</span>
                </div>
                <button onClick={cancelInstall} className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800">
                  <X size={15} /> Cancel
                </button>
              </>
            )}
          </div>
        )}

        {/* IDLE controls */}
        {ready && phase === 'idle' && (
          <>
            {/* Destination — where PNG/ and JPG/ folders are written */}
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800/50">
              <FolderOpen size={18} className="shrink-0 text-gray-400" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Save results to</p>
                {destDir
                  ? <p className="truncate text-sm text-gray-800 dark:text-gray-200">{destDir}<span className="text-gray-400"> /PNG · /JPG</span></p>
                  : <p className="text-sm text-amber-600 dark:text-amber-400">Choose a folder before processing.</p>}
              </div>
              <button onClick={pickDest} className="shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800">
                {destDir ? 'Change' : 'Choose folder'}
              </button>
            </div>

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
              <span className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">Output: PNG + JPG · 3600 · 300 dpi</span>
            </div>

            <div className="mt-5 flex gap-3">
              <button
                onClick={start}
                disabled={!files.length || !ready || !destDir}
                className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-white disabled:opacity-40"
                style={{ background: ACCENT }}
              >
                <Play size={16} /> Process {files.length || ''} photo{files.length !== 1 ? 's' : ''}
              </button>
              {files.length > 0 && (
                <button onClick={() => { setFiles([]); setInputThumbs({}); loadingThumbs.current = new Set() }} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2.5 text-sm hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800">
                  <X size={15} /> Clear
                </button>
              )}
            </div>
          </>
        )}

        {/* PROCESSING / DONE progress card */}
        {ready && (phase === 'processing' || phase === 'done') && (
          <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800/50">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="font-medium text-gray-900 dark:text-white">
                {phase === 'done' ? 'Done' : retouchPhase ? 'Retouching in Photoshop' : 'Processing batch'}
              </span>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {status?.done ?? 0} / {status?.total ?? files.length} photos · {phase === 'done' ? 100 : pct}%
              </span>
            </div>
            {/* Bar animated with transform (scaleX) + a sliding sheen — both run on
                the compositor thread, so they keep moving smoothly even while the
                model saturates CPU/GPU and the main JS thread janks. `width`
                transitions (the old approach) force layout every frame and froze. */}
            <style>{'@keyframes bgr-sheen{0%{transform:translateX(-130%)}100%{transform:translateX(360%)}}'}</style>
            <div className="relative h-3 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                className="absolute inset-0 origin-left"
                style={{ background: ACCENT, transform: `scaleX(${phase === 'done' ? 1 : Math.max(0.02, pct / 100)})`, transition: 'transform .7s linear', willChange: 'transform' }}
              />
              {phase === 'processing' && (
                <div
                  className="absolute inset-y-0 left-0 w-1/3"
                  style={{ background: 'linear-gradient(90deg,transparent,rgba(255,255,255,.5),transparent)', animation: 'bgr-sheen 1.2s linear infinite', willChange: 'transform' }}
                />
              )}
            </div>
            <div className="mt-3 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              {phase === 'done'
                ? <><CheckCircle2 size={16} style={ACCENT_STYLE} /> {result?.success ? 'Completed.' : (result?.error || 'Finished with errors.')}</>
                : <><ProcessingSpinner /> {status?.current?.step || 'Preparing…'}</>}
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
        )}

        {/* Photo grid — shown whenever there are files (idle preview + live + done) */}
        {ready && files.length > 0 && (
          <>
            <p className="mb-2 mt-6 text-sm text-gray-500 dark:text-gray-400">
              {phase === 'idle' ? 'Selected photos — click to preview' : 'Photos — click to view large'}
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {files.map((f, i) => {
                const bn = baseName(f)
                const item = itemByName.get(bn)
                const kind: TileKind = item?.error ? 'error'
                  : item ? 'done'
                  : phase === 'processing' && currentName === bn ? 'current'
                  : phase !== 'idle' ? 'queued' : 'idle'
                return (
                  <PhotoTile
                    key={f}
                    index={i}
                    label={stemOf(bn)}
                    url={resultThumbs[bn] || inputThumbs[f]}
                    kind={kind}
                    seconds={item?.seconds}
                    showRecut={phase === 'done' && (kind === 'done' || kind === 'error') && !!destDir}
                    recutting={recutting === bn}
                    onOpen={onOpenTile}
                    onRecut={onRecutTile}
                  />
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Lightbox */}
      {lightbox !== null && files[lightbox] && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          onClick={() => setLightbox(null)}
        >
          {/* prev */}
          <button
            onClick={(e) => { e.stopPropagation(); setLightbox((i) => (i === null ? i : Math.max(0, i - 1))) }}
            disabled={lightbox === 0}
            className="absolute left-4 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/30 disabled:opacity-30"
          >
            <ChevronLeft size={26} />
          </button>

          <div className="flex max-h-full max-w-4xl flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <div className="relative flex max-h-[78vh] items-center justify-center overflow-hidden rounded-lg" style={CHECKER}>
              {lightboxUrl
                ? <img src={lightboxUrl} alt={baseName(files[lightbox])} className="max-h-[78vh] max-w-full object-contain" />
                : <div className="flex h-72 w-72 items-center justify-center"><Loader2 size={28} className="animate-spin text-gray-500" /></div>}
            </div>
            <div className="mt-3 flex items-center gap-3 text-sm text-white/80">
              <span className="truncate max-w-xs">{stemOf(baseName(files[lightbox]))}</span>
              <span className="text-white/50">{lightbox + 1} / {files.length}</span>
              {phase === 'done' && destDir && (
                <button
                  onClick={() => recut(lightbox)}
                  disabled={recutting === baseName(files[lightbox])}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/30 disabled:opacity-50"
                  title="Re-cut this photo with Photoshop Select Subject"
                >
                  {recutting === baseName(files[lightbox])
                    ? <Loader2 size={13} className="animate-spin will-change-transform" />
                    : <Wand2 size={13} />}
                  Select Subject (Photoshop)
                </button>
              )}
            </div>
          </div>

          {/* next */}
          <button
            onClick={(e) => { e.stopPropagation(); setLightbox((i) => (i === null ? i : Math.min(files.length - 1, i + 1))) }}
            disabled={lightbox === files.length - 1}
            className="absolute right-4 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/30 disabled:opacity-30"
          >
            <ChevronRight size={26} />
          </button>

          {/* close */}
          <button
            onClick={() => setLightbox(null)}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/30"
          >
            <X size={20} />
          </button>
        </div>
      )}

      {/* Select Subject comparison — keep engine vs Photoshop */}
      {compare && (
        <CutoutCompareModal
          title={`Which cut-out do you want to keep? · ${stemOf(compare.bn)}`}
          engineUrl={compare.engineUrl}
          subjectUrl={compare.subjectUrl}
          busy={compareBusy}
          onChoose={chooseRecut}
          onCancel={() => { if (!compareBusy) { void window.electronAPI.bgRemovalResolveRecut({ keepSubject: false, enginePng: compare.enginePng, subjectPng: compare.subjectPng }); setCompare(null) } }}
        />
      )}
    </AppLayout>
  )
}
