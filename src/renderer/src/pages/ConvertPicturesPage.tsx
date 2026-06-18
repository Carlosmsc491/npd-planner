// src/renderer/src/pages/ConvertPicturesPage.tsx
// Convert Pictures — two tools, chosen up front:
//   • PNG → JPG  : flatten onto white, keep original size (quality preset).
//   • Resize     : shrink inside a max edge, keep the original format.
// Flow: pick tool → pick size → drop/select photos → see a size preview
//       (count + current total + sampled JPG estimate) → convert → result
//       shows the real output size and how much was saved.
// All image work runs in the main process via sharp (see convertHandlers.ts).

import { useEffect, useState, useCallback } from 'react'
import {
  Images, Upload, Folder, FolderOpen, FileImage, Loader2, CheckCircle2,
  AlertTriangle, FolderTree, ArrowRight, RotateCcw, Scaling, Zap, Check,
} from 'lucide-react'
import type {
  ConvertScanResult, ConvertBatchJob, ConvertBatchResult, ConvertProgress,
  ConvertEstimate, ConvertTool,
} from '../../../shared/convert'
import AppLayout from '../components/ui/AppLayout'

type Phase = 'idle' | 'scanning' | 'loaded' | 'converting' | 'done'
type LoadedKind = 'flat' | 'files' | 'nested'
type ConvertSize = 'small' | 'medium' | 'large' | 'original'
type ElectronFile = File & { path: string }

const SIZE_QUALITY: Record<ConvertSize, number> = { small: 75, medium: 88, large: 96, original: 100 }
const SIZE_EDGE: Record<ConvertSize, number> = { small: 1080, medium: 1920, large: 2560, original: 2560 }
const SIZE_LABEL: Record<ConvertSize, string> = { small: 'Small', medium: 'Medium', large: 'Large', original: 'Original' }

function fmtBytes(b: number): string {
  if (!b || b <= 0) return '—'
  const mb = b / (1024 * 1024)
  if (mb < 1) return `${Math.max(1, Math.round(b / 1024))} KB`
  if (mb < 1000) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`
  return `${(mb / 1024).toFixed(1)} GB`
}

function countJob(job: ConvertBatchJob): number {
  if (job.mode === 'files') return job.files?.length ?? 0
  if (job.mode === 'flat') return job.rootImages?.length ?? 0
  return (job.rootImages?.length ?? 0) + (job.groups?.reduce((n, g) => n + g.images.length, 0) ?? 0)
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl px-3.5 py-3 ${accent ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-gray-50 dark:bg-gray-800'}`}>
      <p className={`text-xs mb-1 ${accent ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}`}>
        {accent && <Zap size={11} className="inline -mt-0.5 mr-1" />}{label}
      </p>
      <p className={`text-xl font-semibold ${accent ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-white'}`}>{value}</p>
    </div>
  )
}

export default function ConvertPicturesPage() {
  const [tool, setTool] = useState<ConvertTool>(() => (localStorage.getItem('npd:convert-tool') as ConvertTool) || 'convert')
  const [size, setSize] = useState<ConvertSize>(() => (localStorage.getItem('npd:convert-size') as ConvertSize) || 'medium')

  const [phase, setPhase] = useState<Phase>('idle')
  const [dragOver, setDragOver] = useState(false)
  const [scan, setScan] = useState<ConvertScanResult | null>(null)
  const [rootPath, setRootPath] = useState('')
  const [files, setFiles] = useState<string[]>([])
  const [loadedKind, setLoadedKind] = useState<LoadedKind>('flat')
  const [sources, setSources] = useState<string[]>([])
  const [loadedLabel, setLoadedLabel] = useState('')
  const [estimate, setEstimate] = useState<ConvertEstimate | null>(null)
  const [progress, setProgress] = useState<ConvertProgress | null>(null)
  const [result, setResult] = useState<ConvertBatchResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const quality = SIZE_QUALITY[size]
  const maxLongEdge = SIZE_EDGE[size]
  const busy = phase === 'scanning' || phase === 'converting'
  const outName = tool === 'convert' ? 'JPG' : 'RESIZED'
  const sizeKeys: ConvertSize[] = tool === 'convert' ? ['small', 'medium', 'large', 'original'] : ['small', 'medium', 'large']

  useEffect(() => { localStorage.setItem('npd:convert-tool', tool) }, [tool])
  useEffect(() => { localStorage.setItem('npd:convert-size', size) }, [size])
  // "Original" is a quality-only option; keep Resize on a real pixel size.
  useEffect(() => { if (tool === 'resize' && size === 'original') setSize('large') }, [tool, size])

  // Live progress from the main process.
  useEffect(() => {
    const off = window.electronAPI.onConvertProgress((p) => setProgress(p))
    return off
  }, [])

  // Recompute the size preview whenever the loaded set or the chosen size changes.
  useEffect(() => {
    if (phase !== 'loaded' || sources.length === 0) return
    let cancelled = false
    setEstimate(null)
    window.electronAPI
      .convertEstimate(sources, { tool, quality, maxLongEdge })
      .then((est) => { if (!cancelled) setEstimate(est) })
      .catch(() => { if (!cancelled) setEstimate({ count: sources.length, sourceBytes: 0, estBytes: 0, sampled: 0 }) })
    return () => { cancelled = true }
  }, [phase, sources, tool, quality, maxLongEdge])

  const switchTool = useCallback((t: ConvertTool) => {
    if (busy) return
    setTool(t)
    if (t === 'resize' && size === 'original') setSize('large') // "Original" is quality-only
  }, [busy, size])

  const runBatch = useCallback(async (partial: Omit<ConvertBatchJob, 'tool'>) => {
    const job: ConvertBatchJob = { ...partial, tool }
    setError(null)
    setResult(null)
    setProgress({ done: 0, total: countJob(job), currentName: '' })
    setPhase('converting')
    try {
      const res = await window.electronAPI.convertRunBatch(job)
      setResult(res)
      setPhase('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('idle')
    }
  }, [tool])

  const loadScan = useCallback(async (folder: string) => {
    setError(null)
    setPhase('scanning')
    try {
      const res = await window.electronAPI.convertScanFolder(folder)
      const all = [...res.rootImages, ...res.groups.flatMap((g) => g.images)]
      if (all.length === 0) {
        setError('No images were found in that folder.')
        setPhase('idle')
        return
      }
      setScan(res)
      setRootPath(folder)
      setSources(all)
      setLoadedKind(res.groups.length > 0 ? 'nested' : 'flat')
      setLoadedLabel(folder.split(/[\\/]/).filter(Boolean).pop() || folder)
      setPhase('loaded')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('idle')
    }
  }, [])

  const loadFiles = useCallback((list: string[]) => {
    setError(null)
    setScan(null)
    setRootPath('')
    setFiles(list)
    setSources(list)
    setLoadedKind('files')
    setLoadedLabel(`${list.length} file${list.length === 1 ? '' : 's'}`)
    setPhase('loaded')
  }, [])

  const handleSelectFolder = useCallback(async () => {
    const folder = await window.electronAPI.selectFolder()
    if (folder) await loadScan(folder)
  }, [loadScan])

  const handleSelectFiles = useCallback(async () => {
    const picked = await window.electronAPI.convertSelectFiles()
    if (picked.length > 0) loadFiles(picked)
  }, [loadFiles])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const dropped = Array.from(e.dataTransfer.files) as ElectronFile[]
    const paths = dropped.map((f) => f.path).filter(Boolean)
    if (paths.length === 0) return
    const stats = await window.electronAPI.convertStatPaths(paths)
    const dir = stats.find((s) => s.isDir)
    if (dir) { await loadScan(dir.path); return }
    const images = stats.filter((s) => s.isImage).map((s) => s.path)
    if (images.length > 0) loadFiles(images)
    else setError('Drop image files or a folder.')
  }, [loadScan, loadFiles])

  const startFlatOrFiles = useCallback(() => {
    if (loadedKind === 'flat' && scan) runBatch({ mode: 'flat', rootPath, rootImages: scan.rootImages, maxLongEdge, quality })
    else if (loadedKind === 'files') runBatch({ mode: 'files', files, maxLongEdge, quality })
  }, [loadedKind, scan, rootPath, files, maxLongEdge, quality, runBatch])

  const runMirror = useCallback(() => {
    if (!scan) return
    runBatch({ mode: 'mirror', rootPath, rootImages: scan.rootImages, groups: scan.groups, maxLongEdge, quality })
  }, [scan, rootPath, maxLongEdge, quality, runBatch])

  const runCustom = useCallback(async () => {
    if (!scan) return
    const dest = await window.electronAPI.convertSelectDest()
    if (!dest) return
    runBatch({ mode: 'custom', destRoot: dest, rootImages: scan.rootImages, groups: scan.groups, maxLongEdge, quality })
  }, [scan, maxLongEdge, quality, runBatch])

  const reset = useCallback(() => {
    setPhase('idle'); setScan(null); setRootPath(''); setFiles([]); setSources([])
    setLoadedLabel(''); setEstimate(null); setProgress(null); setResult(null); setError(null)
  }, [])

  const sizeHint = (s: ConvertSize): string => {
    if (tool === 'resize') return s === 'original' ? '' : `${SIZE_EDGE[s]} px`
    return { small: 'smaller file', medium: 'balanced', large: 'best quality', original: 'max quality' }[s]
  }

  const groupNames = scan?.groups.map((g) => g.name) ?? []
  const exampleNames = groupNames.slice(0, 2)
  if (exampleNames.length === 1) exampleNames.push('…')

  const savedPct = result && result.sourceBytes > 0 ? Math.round((1 - result.outputBytes / result.sourceBytes) * 100) : null
  const verb = tool === 'convert' ? 'Convert' : 'Resize'

  return (
    <AppLayout>
      <div className="h-full overflow-auto">
      <div className="max-w-3xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-1">
          <Images size={22} className="text-blue-600 dark:text-blue-400" />
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Convert Pictures</h1>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
          {tool === 'convert'
            ? 'Turn PNG/PSD into JPG on a white background — smaller files, same size.'
            : 'Make images smaller while keeping their original format.'}
        </p>

        {/* Step 1 — choose a tool */}
        <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400 mb-2">1 · Choose a tool</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
          {([
            ['convert', FileImage, 'PNG → JPG', 'White background, smaller file. Keeps original size.'],
            ['resize', Scaling, 'Resize', 'Make images smaller. Keeps PNG / JPG format.'],
          ] as const).map(([key, Icon, title, desc]) => {
            const selected = tool === key
            return (
              <button
                key={key} onClick={() => switchTool(key)} disabled={busy}
                className={`text-left rounded-xl border-2 p-4 transition-colors disabled:opacity-60 ${
                  selected
                    ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/60'
                }`}
              >
                <div className="flex items-center gap-2.5 mb-1.5">
                  <Icon size={20} className={selected ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'} />
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">{title}</span>
                  {selected && (
                    <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400">
                      <Check size={12} /> selected
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{desc}</p>
              </button>
            )
          })}
        </div>

        {/* Step 2 — pick a size */}
        <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400 mb-2">
          2 · {tool === 'convert' ? 'Quality' : 'Size'}
        </p>
        <div className="grid gap-2 mb-5" style={{ gridTemplateColumns: `repeat(${sizeKeys.length}, minmax(0,1fr))` }}>
          {sizeKeys.map((s) => {
            const selected = size === s
            return (
              <button
                key={s} onClick={() => !busy && setSize(s)} disabled={busy}
                className={`rounded-lg border-2 px-2 py-2 text-center transition-colors disabled:opacity-60 ${
                  selected
                    ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/60'
                }`}
              >
                <div className={`text-sm font-medium ${selected ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-white'}`}>{SIZE_LABEL[s]}</div>
                <div className={`text-[11px] ${selected ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400'}`}>{sizeHint(s)}</div>
              </button>
            )
          })}
        </div>

        {/* Step 3 — photos */}
        <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400 mb-2">3 · Add photos</p>

        {/* Idle — drop zone */}
        {phase === 'idle' && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
              dragOver
                ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50'
            }`}
          >
            <Upload size={30} className="mx-auto text-gray-400" />
            <p className="text-sm text-gray-700 dark:text-gray-200 mt-3">Drag &amp; drop images or a folder here</p>
            <div className="flex gap-3 justify-center mt-4">
              <button
                onClick={handleSelectFiles}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <FileImage size={16} /> Select files
              </button>
              <button
                onClick={handleSelectFolder}
                className="inline-flex items-center gap-2 rounded-lg bg-[#1D9E75] px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors"
              >
                <Folder size={16} /> Select folder
              </button>
            </div>
          </div>
        )}

        {/* Scanning */}
        {phase === 'scanning' && (
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 p-10 text-center">
            <Loader2 size={28} className="mx-auto text-blue-500 animate-spin" />
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-3">Scanning folder…</p>
          </div>
        )}

        {/* Loaded — size preview + convert */}
        {phase === 'loaded' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <Folder size={20} className="text-blue-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{loadedLabel}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{sources.length} photo{sources.length === 1 ? '' : 's'} ready</p>
                </div>
              </div>
              <button onClick={reset} className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 shrink-0">Change</button>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Kpi label="Photos" value={String(sources.length)} />
              <Kpi label="Now" value={estimate ? fmtBytes(estimate.sourceBytes) : '…'} />
              <Kpi label={tool === 'convert' ? 'JPG (est.)' : 'After (est.)'} value={estimate ? `≈ ${fmtBytes(estimate.estBytes)}` : '…'} accent />
            </div>
            {estimate && estimate.sampled > 0 && (
              <p className="text-[11px] text-gray-400 -mt-1">Estimate from a {estimate.sampled}-photo sample — the final size may vary a little.</p>
            )}

            {loadedKind === 'nested' && scan ? (
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-2 flex items-center gap-2">
                  <FolderTree size={16} /> That folder has {scan.groups.length} sub-folder{scan.groups.length === 1 ? '' : 's'} with photos — choose how to save:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <button
                    onClick={runMirror}
                    className="text-left rounded-xl border-2 border-blue-500 p-4 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                  >
                    <div className="text-sm font-semibold text-gray-900 dark:text-white mb-2">1 · Keep same structure</div>
                    <pre className="font-mono text-[11px] leading-relaxed text-gray-500 dark:text-gray-400 whitespace-pre-wrap">
{`📁 ${exampleNames[0]}
   📁 PNG
   📁 ${outName}  ← new
📁 ${exampleNames[1]}
   📁 PNG
   📁 ${outName}  ← new`}
                    </pre>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">A {outName} folder is created next to each set.</p>
                  </button>
                  <button
                    onClick={runCustom}
                    className="text-left rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <div className="text-sm font-semibold text-gray-900 dark:text-white mb-2">2 · Choose a destination</div>
                    <pre className="font-mono text-[11px] leading-relaxed text-gray-500 dark:text-gray-400 whitespace-pre-wrap">
{`📂 My chosen folder
   📁 ${exampleNames[0]}
      🖼 …
   📁 ${exampleNames[1]}
      🖼 …`}
                    </pre>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Pick a folder; sub-folder names are kept.</p>
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={startFlatOrFiles}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#1D9E75] px-5 py-2.5 text-sm font-medium text-white hover:bg-green-700 transition-colors"
                >
                  {verb} {sources.length} photo{sources.length === 1 ? '' : 's'}
                </button>
                <span className="text-xs text-gray-400">Creates a <span className="font-mono">{outName}</span> folder next to the originals</span>
              </div>
            )}
          </div>
        )}

        {/* Converting */}
        {phase === 'converting' && progress && (
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 mb-3">
              <Loader2 size={16} className="text-blue-500 animate-spin" />
              {verb === 'Convert' ? 'Converting' : 'Resizing'} {progress.done} of {progress.total}…
            </div>
            <div className="w-full h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
              <div
                className="h-full bg-[#1D9E75] transition-all"
                style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
              />
            </div>
            {progress.currentName && (
              <p className="text-xs text-gray-400 mt-2 truncate">{progress.currentName}</p>
            )}
          </div>
        )}

        {/* Done */}
        {phase === 'done' && result && (
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center gap-2 mb-2">
              {result.failed === 0
                ? <CheckCircle2 size={20} className="text-green-500" />
                : <AlertTriangle size={20} className="text-amber-500" />}
              <span className="text-base font-semibold text-gray-900 dark:text-white">
                {result.converted} {verb === 'Convert' ? 'converted' : 'resized'}{result.failed > 0 ? `, ${result.failed} failed` : ''}
              </span>
            </div>
            {result.outputBytes > 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                {fmtBytes(result.outputBytes)}
                {result.sourceBytes > 0 && <> · was {fmtBytes(result.sourceBytes)}</>}
                {savedPct !== null && savedPct > 0 && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 px-2 py-0.5 text-xs font-medium">
                    {savedPct}% smaller
                  </span>
                )}
              </p>
            )}
            {result.errors.length > 0 && (
              <div className="max-h-32 overflow-auto rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 mb-3">
                {result.errors.map((err, i) => (
                  <p key={i} className="text-xs text-amber-800 dark:text-amber-300">{err}</p>
                ))}
              </div>
            )}
            <div className="flex gap-3">
              {result.outputFolder && (
                <button
                  onClick={() => result.outputFolder && window.electronAPI.showInFolder(result.outputFolder)}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <FolderOpen size={16} /> Open output folder
                </button>
              )}
              <button
                onClick={reset}
                className="inline-flex items-center gap-2 rounded-lg bg-[#1D9E75] px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors"
              >
                <RotateCcw size={16} /> {verb} more
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-start gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" /> <span>{error}</span>
          </div>
        )}

        {/* Hint */}
        {phase === 'idle' && (
          <p className="text-xs text-gray-400 mt-4 flex items-center gap-1.5">
            <ArrowRight size={12} /> A folder of only photos creates a <span className="font-mono">{outName}</span> folder inside it. A folder with sub-folders lets you choose.
          </p>
        )}
      </div>
      </div>
    </AppLayout>
  )
}
