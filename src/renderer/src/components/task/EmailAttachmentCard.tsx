// src/renderer/src/components/task/EmailAttachmentCard.tsx
// Collapsible card showing an Outlook .msg attachment and its inner files

import { useState, useEffect, useRef } from 'react'
import { Mail, ChevronDown, Trash2, ExternalLink, Paperclip, Loader2, X, Eye, FolderOpen, Printer } from 'lucide-react'
import type { EmailAttachment, EmailInnerAttachment } from '../../types'
import EmailViewerModal from './EmailViewerModal'
import FilePreviewModal from './FilePreviewModal'

interface Props {
  attachment: EmailAttachment
  sharePointRoot: string | null
  onRemove: (id: string) => void
  onRemoveInner: (innerId: string) => void
}

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp']

function innerFileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf') return '📄'
  if (['xlsx', 'xls', 'csv'].includes(ext)) return '📊'
  if (['doc', 'docx'].includes(ext)) return '📝'
  return '📎'
}

function isImage(name: string): boolean {
  return IMAGE_EXTS.includes(name.split('.').pop()?.toLowerCase() ?? '')
}

// ── Format date ───────────────────────────────────────────────────────────────
function formatDate(ts: EmailAttachment['date']): string {
  if (!ts) return ''
  try {
    const d = new Date(ts.seconds * 1000)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return ''
  }
}

// ── Inner attachment row ──────────────────────────────────────────────────────
function InnerAttRow({
  att,
  sharePointRoot,
  onRemove,
}: {
  att: EmailInnerAttachment
  sharePointRoot: string | null
  onRemove: (id: string) => void
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const img = isImage(att.name)
  const canPreview = !img && ['pdf', 'xlsx', 'xls', 'csv', 'doc', 'docx'].includes(
    att.name.split('.').pop()?.toLowerCase() ?? ''
  )

  useEffect(() => {
    if (!img || !sharePointRoot) return
    const absPath = `${sharePointRoot}/${att.sharePointRelativePath}`
    window.electronAPI.readFileAsDataUrl(absPath)
      .then(url => setDataUrl(url))
      .catch(() => setDataUrl(null))
  }, [img, sharePointRoot, att.sharePointRelativePath])

  const absPath = sharePointRoot ? `${sharePointRoot}/${att.sharePointRelativePath}` : ''

  function handleOpen() {
    if (!absPath) return
    window.electronAPI.openFile(absPath)
  }

  function handleShowInFolder() {
    if (!absPath) return
    window.electronAPI.showInFolder(absPath)
  }

  function handlePrint() {
    if (!absPath) return
    window.electronAPI.printFile(absPath)
  }

  if (img) {
    return (
      <>
        <div className="group px-4 py-2">
          {/* Name + actions row — above the image */}
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-gray-400 truncate">{att.name}</span>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <button onClick={handleOpen} title="Open"
                className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30">
                <ExternalLink size={9} /> Open
              </button>
              <button onClick={handleShowInFolder} title={`Show in ${window.process?.platform === 'win32' ? 'Explorer' : 'Finder'}`}
                className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
                <FolderOpen size={9} /> {window.process?.platform === 'win32' ? 'Explorer' : 'Finder'}
              </button>
              <button onClick={handlePrint} title="Print"
                className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
                <Printer size={9} /> Print
              </button>
              <button onClick={() => onRemove(att.id)} title="Remove"
                className="rounded p-0.5 text-gray-400 hover:text-red-500">
                <X size={12} />
              </button>
            </div>
          </div>
          {dataUrl ? (
            <button
              onClick={() => setLightbox(true)}
              className="block w-full rounded-lg overflow-hidden border border-blue-100 dark:border-blue-800/40 hover:border-blue-400 transition-colors"
              title="Click to enlarge"
            >
              <img
                src={dataUrl}
                alt={att.name}
                className="w-full max-h-48 object-contain bg-gray-50 dark:bg-gray-800"
              />
            </button>
          ) : (
            <div className="flex items-center gap-2 py-1">
              <Loader2 size={12} className="animate-spin text-gray-400" />
              <span className="text-xs text-gray-400">{att.name}</span>
            </div>
          )}
        </div>

        {lightbox && dataUrl && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
            onClick={() => setLightbox(false)}
          >
            <div className="relative" onClick={e => e.stopPropagation()}>
              {/* Action bar */}
              <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-3 py-2 bg-black/60 rounded-t-lg z-10">
                <span className="text-xs text-white/80 truncate max-w-xs">{att.name}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={handleOpen} title="Open"
                    className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-white/80 hover:bg-white/20">
                    <ExternalLink size={11} /> Open
                  </button>
                  <button onClick={handleShowInFolder} title={`Show in ${window.process?.platform === 'win32' ? 'Explorer' : 'Finder'}`}
                    className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-white/80 hover:bg-white/20">
                    <FolderOpen size={11} /> {window.process?.platform === 'win32' ? 'Explorer' : 'Finder'}
                  </button>
                  <button onClick={handlePrint} title="Print"
                    className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-white/80 hover:bg-white/20">
                    <Printer size={11} /> Print
                  </button>
                  <button onClick={() => setLightbox(false)} title="Close"
                    className="rounded p-1 text-white/60 hover:text-white hover:bg-white/20 ml-1">
                    <X size={14} />
                  </button>
                </div>
              </div>
              <img
                src={dataUrl}
                alt={att.name}
                className="max-w-[90vw] max-h-[90vh] rounded-lg shadow-2xl object-contain pt-10"
              />
            </div>
          </div>
        )}
      </>
    )
  }

  // isFinderLabel: Mac shows "Finder", Windows shows "Explorer"
  const finderLabel = window.process?.platform === 'win32' ? 'Explorer' : 'Finder'

  return (
    <>
      <div className="group flex items-center gap-2 pl-4 pr-2 py-1.5 hover:bg-blue-50/60 dark:hover:bg-blue-900/10 rounded">
        <span className="text-sm shrink-0">{innerFileIcon(att.name)}</span>
        <span className="flex-1 min-w-0 truncate text-xs text-gray-700 dark:text-gray-300">
          {att.name}
        </span>
        <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {canPreview && sharePointRoot && (
            <button
              onClick={() => setPreviewOpen(true)}
              title="Preview"
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30"
            >
              <Eye size={10} />
              Preview
            </button>
          )}
          <button
            onClick={handleOpen}
            title="Open with default app"
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/30"
          >
            <ExternalLink size={10} />
            Open
          </button>
          <button
            onClick={handleShowInFolder}
            title={`Show in ${finderLabel}`}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <FolderOpen size={10} />
            {finderLabel}
          </button>
          <button
            onClick={handlePrint}
            title="Print"
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <Printer size={10} />
            Print
          </button>
          <button
            onClick={() => onRemove(att.id)}
            title="Remove"
            className="rounded p-0.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {previewOpen && absPath && (
        <FilePreviewModal name={att.name} absPath={absPath} onClose={() => setPreviewOpen(false)} />
      )}
    </>
  )
}

// ── Main card ─────────────────────────────────────────────────────────────────
export default function EmailAttachmentCard({ attachment, sharePointRoot, onRemove, onRemoveInner }: Props) {
  const [expanded, setExpanded] = useState(attachment.innerAttachments.length > 0)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [available, setAvailable] = useState<boolean | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const dateStr = formatDate(attachment.date)
  const hasInner = attachment.innerAttachments.length > 0

  const msgAbsPath = sharePointRoot && attachment.msgRelativePath
    ? `${sharePointRoot}/${attachment.msgRelativePath}`
    : null

  useEffect(() => {
    if (!msgAbsPath) { setAvailable(true); return }
    if (!window.electronAPI?.fileExists) { setAvailable(true); return }
    async function check() {
      try {
        const exists = await window.electronAPI.fileExists(msgAbsPath!)
        setAvailable(exists)
        if (exists && intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
      } catch {
        setAvailable(true) // on error, assume available
      }
    }
    check()
    intervalRef.current = setInterval(check, 30_000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [msgAbsPath])

  const isUnavailable = available === false
  const isChecking = available === null

  function handleOpenEmail() {
    if (!msgAbsPath || isUnavailable) return
    setViewerOpen(true)
  }

  return (
    <>
    <div className={`rounded-lg border border-blue-200 dark:border-blue-800/50 border-l-4 border-l-blue-400 bg-blue-50/40 dark:bg-blue-900/10 overflow-hidden transition-opacity ${isUnavailable ? 'opacity-60' : ''}`}>
      {/* Header */}
      <div className="flex items-start gap-2 px-3 py-2.5">
        <button
          onClick={handleOpenEmail}
          title={isUnavailable ? 'Waiting for SharePoint sync…' : 'Open email'}
          disabled={!sharePointRoot || isUnavailable}
          className="shrink-0 mt-0.5 text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 disabled:opacity-40 disabled:cursor-default transition-colors"
        >
          {isChecking ? <Loader2 size={15} className="animate-spin text-gray-400" /> : <Mail size={15} />}
        </button>

        <div className="flex-1 min-w-0">
          {/* Subject — clickable to open email viewer */}
          <button
            onClick={handleOpenEmail}
            disabled={!sharePointRoot || isUnavailable}
            className="w-full text-left text-sm font-semibold text-gray-800 dark:text-gray-100 truncate leading-tight hover:text-blue-600 dark:hover:text-blue-300 disabled:opacity-40 disabled:cursor-default transition-colors"
          >
            {attachment.subject}
          </button>
          {/* From + date */}
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
            {attachment.from}
            {dateStr && <span className="ml-1 text-gray-400">· {dateStr}</span>}
          </p>
          {/* Body snippet */}
          {attachment.bodySnippet && (
            <p className="text-xs text-gray-400 dark:text-gray-500 italic truncate mt-0.5">
              "{attachment.bodySnippet}"
            </p>
          )}
          {/* Sync state + uploader */}
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {isUnavailable && (
              <span className="flex items-center gap-1 text-[10px] text-gray-400">
                <Loader2 size={9} className="animate-spin" />
                Waiting for SharePoint sync…
              </span>
            )}
            {attachment.uploadedByName && (
              <span className="text-[10px] text-gray-400 dark:text-gray-500">
                {attachment.uploadedByName}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="shrink-0 flex items-center gap-1 ml-1">
          {hasInner && (
            <button
              onClick={() => setExpanded(!expanded)}
              title={expanded ? 'Collapse' : 'Expand'}
              className="rounded p-1 text-gray-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 hover:text-blue-500"
            >
              <ChevronDown
                size={14}
                className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
              />
            </button>
          )}
          <button
            onClick={() => setConfirmDelete(true)}
            title="Remove"
            className="rounded p-1 text-gray-400 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-500"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Inner attachments */}
      {expanded && (
        <div className="border-t border-blue-100 dark:border-blue-800/30 pb-1">
          {hasInner ? (
            attachment.innerAttachments.map((inner) => (
              <InnerAttRow key={inner.id} att={inner} sharePointRoot={sharePointRoot} onRemove={onRemoveInner} />
            ))
          ) : (
            <p className="px-4 py-2 text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
              <Paperclip size={11} />
              No attachments in this email
            </p>
          )}
        </div>
      )}

      {/* Inline confirm delete */}
      {confirmDelete && (
        <div className="border-t border-blue-100 dark:border-blue-800/30 bg-red-50 dark:bg-red-900/10 px-3 py-2 flex items-center gap-2">
          <p className="flex-1 text-xs text-red-700 dark:text-red-400">
            Remove this email from the task? Files in SharePoint will not be deleted.
          </p>
          <button
            onClick={() => setConfirmDelete(false)}
            className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={() => { onRemove(attachment.id); setConfirmDelete(false) }}
            className="text-xs px-2 py-1 rounded bg-red-500 text-white hover:bg-red-600"
          >
            Remove
          </button>
        </div>
      )}
    </div>

    {viewerOpen && msgAbsPath && (
      <EmailViewerModal
        msgAbsPath={msgAbsPath}
        subject={attachment.subject}
        onClose={() => setViewerOpen(false)}
      />
    )}
    </>
  )
}
