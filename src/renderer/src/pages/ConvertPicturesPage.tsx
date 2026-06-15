// src/renderer/src/pages/ConvertPicturesPage.tsx
// Convert Pictures — PNG/images → JPG with a white background and resized smaller.
// Inputs: drag & drop (files or a folder) or the native pickers.
//   • Flat folder (only photos)        → creates {folder}/JPG/*.jpg
//   • Folder with sub-folders          → asks: mirror structure, or a chosen destination
//   • Individual files                 → each → {parentFolder}/JPG/*.jpg
// Conversion runs in the main process via sharp (white flatten + resize + JPEG).

import { useEffect, useState, useCallback } from 'react'
import {
  Images, Upload, Folder, FolderOpen, FileImage, Loader2, CheckCircle2,
  AlertTriangle, FolderTree, ArrowRight, RotateCcw,
} from 'lucide-react'
import type {
  ConvertScanResult, ConvertBatchJob, ConvertBatchResult, ConvertProgress, ConvertTool,
} from '../../../shared/convert'
import AppLayout from '../components/ui/AppLayout'

type Phase = 'idle' | 'scanning' | 'choosing' | 'converting' | 'done'
type ElectronFile = File & { path: string }

function countJob(job: ConvertBatchJob): number {
  if (job.mode === 'files') return job.files?.length ?? 0
  if (job.mode === 'flat') return job.rootImages?.length ?? 0
  return (job.rootImages?.length ?? 0) + (job.groups?.reduce((n, g) => n + g.images.length, 0) ?? 0)
}

export default function ConvertPicturesPage() {
  const [tool, setTool] = useState<ConvertTool>('convert')
  const [maxLongEdge, setMaxLongEdge] = useState(1920)
  const [quality, setQuality] = useState(92)

  const [phase, setPhase] = useState<Phase>('idle')
  const [dragOver, setDragOver] = useState(false)
  const [scan, setScan] = useState<ConvertScanResult | null>(null)
  const [rootPath, setRootPath] = useState('')
  const [progress, setProgress] = useState<ConvertProgress | null>(null)
  const [result, setResult] = useState<ConvertBatchResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Live progress from the main process.
  useEffect(() => {
    const off = window.electronAPI.onConvertProgress((p) => setProgress(p))
    return off
  }, [])

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

  const scanFolder = useCallback(async (folder: string) => {
    setError(null)
    setPhase('scanning')
    try {
      const res = await window.electronAPI.convertScanFolder(folder)
      const total = res.rootImages.length + res.groups.reduce((n, g) => n + g.images.length, 0)
      if (total === 0) {
        setError('No images were found in that folder.')
        setPhase('idle')
        return
      }
      setRootPath(folder)
      setScan(res)
      if (res.groups.length > 0) {
        setPhase('choosing')
      } else {
        await runBatch({ mode: 'flat', rootPath: folder, rootImages: res.rootImages, maxLongEdge, quality })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('idle')
    }
  }, [maxLongEdge, quality, runBatch])

  const handleSelectFolder = useCallback(async () => {
    const folder = await window.electronAPI.selectFolder()
    if (folder) await scanFolder(folder)
  }, [scanFolder])

  const handleSelectFiles = useCallback(async () => {
    const files = await window.electronAPI.convertSelectFiles()
    if (files.length > 0) await runBatch({ mode: 'files', files, maxLongEdge, quality })
  }, [maxLongEdge, quality, runBatch])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const dropped = Array.from(e.dataTransfer.files) as ElectronFile[]
    const paths = dropped.map((f) => f.path).filter(Boolean)
    if (paths.length === 0) return
    const stats = await window.electronAPI.convertStatPaths(paths)
    const dir = stats.find((s) => s.isDir)
    if (dir) { await scanFolder(dir.path); return }
    const images = stats.filter((s) => s.isImage).map((s) => s.path)
    if (images.length > 0) await runBatch({ mode: 'files', files: images, maxLongEdge, quality })
    else setError('Drop image files or a folder.')
  }, [maxLongEdge, quality, runBatch, scanFolder])

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
    setPhase('idle'); setScan(null); setRootPath(''); setProgress(null); setResult(null); setError(null)
  }, [])

  const busy = phase === 'scanning' || phase === 'converting'
  const outName = tool === 'convert' ? 'JPG' : 'RESIZED'
  const groupNames = scan?.groups.map((g) => g.name) ?? []
  const exampleNames = groupNames.slice(0, 2)
  if (exampleNames.length === 1) exampleNames.push('…')

  return (
    <AppLayout>
      <div className="h-full overflow-auto">
      <div className="max-w-3xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-1">
          <Images size={22} className="text-blue-600 dark:text-blue-400" />
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Convert Pictures</h1>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          {tool === 'convert'
            ? 'Convert PNG/PSD → JPG with a white background (keeps the original size)'
            : 'Resize images smaller (keeps the original format)'}
        </p>

        {/* Tool selector — two distinct tools */}
        <div className="inline-flex rounded-xl bg-gray-100 dark:bg-gray-800 p-1 mb-4">
          <button
            onClick={() => setTool('convert')} disabled={busy}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${
              tool === 'convert' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            PNG → JPG
          </button>
          <button
            onClick={() => setTool('resize')} disabled={busy}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${
              tool === 'resize' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            Resize
          </button>
        </div>

        {/* Options — depend on the selected tool */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
          {tool === 'convert' ? (
            <>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">JPEG quality (%)</label>
                <input
                  type="number" min={1} max={100} step={1} value={quality} disabled={busy}
                  onChange={(e) => setQuality(Math.min(100, Math.max(1, parseInt(e.target.value || '0', 10) || 92)))}
                  className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                />
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                <span className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Background</span>
                <div className="flex items-center gap-2 text-sm text-gray-900 dark:text-white py-1.5">
                  <span className="w-4 h-4 rounded border border-gray-300 dark:border-gray-600 bg-white" /> White
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Max long edge (px)</label>
                <input
                  type="number" min={100} max={10000} step={10} value={maxLongEdge} disabled={busy}
                  onChange={(e) => setMaxLongEdge(Math.min(10000, Math.max(100, parseInt(e.target.value || '0', 10) || 1920)))}
                  className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                />
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                <span className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Format</span>
                <div className="flex items-center gap-2 text-sm text-gray-900 dark:text-white py-1.5">Keeps original (PNG, JPG…)</div>
              </div>
            </>
          )}
        </div>

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

        {/* Choosing — nested folder detected */}
        {phase === 'choosing' && scan && (
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-1 flex items-center gap-2">
              <FolderTree size={16} /> That folder has {scan.groups.length} sub-folder{scan.groups.length === 1 ? '' : 's'} with photos — choose how to save:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              {/* Option 1 — mirror */}
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
              {/* Option 2 — custom destination */}
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
            <button onClick={reset} className="mt-4 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">Cancel</button>
          </div>
        )}

        {/* Converting */}
        {phase === 'converting' && progress && (
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 mb-3">
              <Loader2 size={16} className="text-blue-500 animate-spin" />
              Converting {progress.done} of {progress.total}…
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
            <div className="flex items-center gap-2 mb-3">
              {result.failed === 0
                ? <CheckCircle2 size={20} className="text-green-500" />
                : <AlertTriangle size={20} className="text-amber-500" />}
              <span className="text-base font-semibold text-gray-900 dark:text-white">
                {result.converted} converted{result.failed > 0 ? `, ${result.failed} failed` : ''}
              </span>
            </div>
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
                <RotateCcw size={16} /> Convert more
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
