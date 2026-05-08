// FilePreviewModal.tsx — In-app preview for PDF, Excel, Word, and images
// Reads from an absolute path via electronAPI (or accepts pre-loaded base64).
// No external app required.

import { useState, useEffect } from 'react'
import { X, Loader2, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react'
import * as pdfjsLib from 'pdfjs-dist'
import * as XLSX from 'xlsx'

if (import.meta.env.DEV) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString()
} else {
  pdfjsLib.GlobalWorkerOptions.workerSrc = './pdf.worker.min.mjs'
}

type PreviewType = 'pdf' | 'excel' | 'word' | 'image' | 'unsupported'

function detectType(name: string): PreviewType {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf') return 'pdf'
  if (['xlsx', 'xls', 'csv', 'ods'].includes(ext)) return 'excel'
  if (['doc', 'docx'].includes(ext)) return 'word'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'image'
  return 'unsupported'
}

function base64ToUint8Array(b64: string): Uint8Array {
  const raw = atob(b64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  return base64ToUint8Array(b64).buffer as ArrayBuffer
}

// ── PDF viewer ────────────────────────────────────────────────────────────────
function PDFViewer({ base64 }: { base64: string }) {
  const [pages, setPages] = useState<string[]>([])
  const [current, setCurrent] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function render() {
      try {
        setLoading(true)
        const pdf = await pdfjsLib.getDocument({ data: base64ToUint8Array(base64) }).promise
        const imgs: string[] = []
        for (let i = 1; i <= Math.min(pdf.numPages, 20); i++) {
          const page = await pdf.getPage(i)
          const vp = page.getViewport({ scale: 1.5 })
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')!
          canvas.width = vp.width
          canvas.height = vp.height
          await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise
          imgs.push(canvas.toDataURL('image/png'))
        }
        if (!cancelled) { setPages(imgs); setLoading(false) }
      } catch {
        if (!cancelled) { setError('Could not render PDF.'); setLoading(false) }
      }
    }
    render()
    return () => { cancelled = true }
  }, [base64])

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 size={28} className="animate-spin text-green-500" /></div>
  if (error) return <div className="text-center py-20 text-red-500 text-sm">{error}</div>

  return (
    <div className="flex flex-col items-center gap-3 p-4 bg-gray-100 dark:bg-gray-800 overflow-auto max-h-[65vh]">
      {pages.length > 1 && (
        <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400 sticky top-0 bg-gray-100 dark:bg-gray-800 py-1 z-10">
          <button onClick={() => setCurrent(p => Math.max(1, p - 1))} disabled={current === 1} className="rounded p-1 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40">
            <ChevronLeft size={16} />
          </button>
          <span>Page {current} of {pages.length}</span>
          <button onClick={() => setCurrent(p => Math.min(pages.length, p + 1))} disabled={current === pages.length} className="rounded p-1 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40">
            <ChevronRight size={16} />
          </button>
        </div>
      )}
      <img src={pages[current - 1]} alt={`Page ${current}`} className="max-w-full rounded shadow-lg" />
    </div>
  )
}

// ── Excel viewer ──────────────────────────────────────────────────────────────
function ExcelViewer({ base64 }: { base64: string }) {
  const [sheets, setSheets] = useState<{ name: string; html: string }[]>([])
  const [activeSheet, setActiveSheet] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    try {
      const wb = XLSX.read(base64, { type: 'base64' })
      const result = wb.SheetNames.map((name) => ({
        name,
        html: XLSX.utils.sheet_to_html(wb.Sheets[name], { id: 'sheet-table', editable: false }),
      }))
      setSheets(result)
    } catch {
      setError('Could not parse spreadsheet.')
    }
  }, [base64])

  if (error) return <div className="text-center py-20 text-red-500 text-sm">{error}</div>
  if (sheets.length === 0) return <div className="flex items-center justify-center py-20"><Loader2 size={28} className="animate-spin text-green-500" /></div>

  return (
    <div className="flex flex-col" style={{ maxHeight: '65vh' }}>
      {/* Sheet tabs */}
      {sheets.length > 1 && (
        <div className="flex gap-1 px-4 pt-3 pb-0 border-b border-gray-200 dark:border-gray-700 shrink-0 overflow-x-auto">
          {sheets.map((s, i) => (
            <button
              key={i}
              onClick={() => setActiveSheet(i)}
              className={`px-3 py-1.5 text-xs rounded-t-md font-medium whitespace-nowrap transition-colors ${
                i === activeSheet
                  ? 'bg-white dark:bg-gray-900 border border-b-white dark:border-gray-700 dark:border-b-gray-900 text-green-600 dark:text-green-400'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      {/* Table */}
      <div className="flex-1 overflow-auto p-4">
        <style>{`
          #sheet-table { border-collapse: collapse; font-size: 11px; }
          #sheet-table td, #sheet-table th {
            border: 1px solid #e5e7eb; padding: 3px 8px;
            white-space: nowrap; max-width: 200px; overflow: hidden; text-overflow: ellipsis;
          }
          .dark #sheet-table td, .dark #sheet-table th { border-color: #374151; color: #d1d5db; }
          #sheet-table tr:nth-child(even) td { background: #f9fafb; }
          .dark #sheet-table tr:nth-child(even) td { background: #1f2937; }
        `}</style>
        <div
          className="text-gray-800 dark:text-gray-200"
          dangerouslySetInnerHTML={{ __html: sheets[activeSheet]?.html ?? '' }}
        />
      </div>
    </div>
  )
}

// ── Word viewer ───────────────────────────────────────────────────────────────
function WordViewer({ base64 }: { base64: string }) {
  const [html, setHtml] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function convert() {
      try {
        const mammoth = await import('mammoth')
        const buffer = base64ToArrayBuffer(base64)
        const result = await mammoth.convertToHtml({ arrayBuffer: buffer })
        if (!cancelled) { setHtml(result.value); setLoading(false) }
      } catch {
        if (!cancelled) { setError('Could not render Word document.'); setLoading(false) }
      }
    }
    convert()
    return () => { cancelled = true }
  }, [base64])

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 size={28} className="animate-spin text-green-500" /></div>
  if (error) return <div className="text-center py-20 text-red-500 text-sm">{error}</div>

  return (
    <div className="p-6 overflow-auto max-h-[65vh] prose prose-sm dark:prose-invert max-w-none text-gray-800 dark:text-gray-200 text-sm leading-relaxed"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

// ── Image viewer ──────────────────────────────────────────────────────────────
function ImageViewer({ base64, mimeType, name }: { base64: string; mimeType: string; name: string }) {
  return (
    <div className="flex items-center justify-center p-4 bg-gray-100 dark:bg-gray-800 overflow-auto max-h-[65vh]">
      <img src={`data:${mimeType};base64,${base64}`} alt={name} className="max-w-full max-h-full rounded shadow-lg object-contain" />
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────
interface Props {
  name: string
  /** Absolute path on disk — the modal reads the file itself via electronAPI */
  absPath: string
  onClose: () => void
}

export default function FilePreviewModal({ name, absPath, onClose }: Props) {
  const [base64, setBase64] = useState<string | null>(null)
  const [loadError, setLoadError] = useState('')
  const type = detectType(name)

  useEffect(() => {
    window.electronAPI.readFileAsDataUrl(absPath)
      .then((dataUrl) => {
        // Strip the data:...;base64, prefix
        const b64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl
        setBase64(b64)
      })
      .catch(() => setLoadError('Could not read file from disk.'))
  }, [absPath])

  const mimeType = (() => {
    const ext = name.split('.').pop()?.toLowerCase() ?? ''
    if (ext === 'pdf') return 'application/pdf'
    if (['png', 'jpg', 'jpeg'].includes(ext)) return `image/${ext === 'jpg' ? 'jpeg' : ext}`
    if (ext === 'gif') return 'image/gif'
    if (ext === 'webp') return 'image/webp'
    return 'application/octet-stream'
  })()

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="relative w-full max-w-4xl overflow-hidden rounded-xl bg-white dark:bg-gray-900 shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <span className="truncate text-sm font-medium text-gray-700 dark:text-gray-300 max-w-lg">{name}</span>
          <button onClick={onClose} className="ml-4 shrink-0 rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        {loadError ? (
          <div className="flex items-center gap-2 p-6 text-red-500 text-sm">
            <AlertTriangle size={16} /> {loadError}
          </div>
        ) : base64 === null ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={28} className="animate-spin text-green-500" />
          </div>
        ) : type === 'pdf' ? (
          <PDFViewer base64={base64} />
        ) : type === 'excel' ? (
          <ExcelViewer base64={base64} />
        ) : type === 'word' ? (
          <WordViewer base64={base64} />
        ) : type === 'image' ? (
          <ImageViewer base64={base64} mimeType={mimeType} name={name} />
        ) : (
          <div className="flex items-center gap-2 p-6 text-gray-500 text-sm">
            <AlertTriangle size={16} /> Preview not available for this file type.
          </div>
        )}
      </div>
    </div>
  )
}
