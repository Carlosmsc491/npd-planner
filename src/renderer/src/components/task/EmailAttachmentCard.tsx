// src/renderer/src/components/task/EmailAttachmentCard.tsx
// Collapsible card showing an Outlook .msg attachment and its inner files

import { useState, useEffect, useRef } from 'react'
import { Mail, ChevronDown, Trash2, ExternalLink, Paperclip, Loader2 } from 'lucide-react'
import type { EmailAttachment, EmailInnerAttachment } from '../../types'
import EmailViewerModal from './EmailViewerModal'

interface Props {
  attachment: EmailAttachment
  sharePointRoot: string | null
  onRemove: (id: string) => void
}

// ── File icon by extension ────────────────────────────────────────────────────
function innerFileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return '🖼'
  if (ext === 'pdf') return '📄'
  if (['xlsx', 'xls', 'csv'].includes(ext)) return '📊'
  if (['doc', 'docx'].includes(ext)) return '📝'
  return '📎'
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
}: {
  att: EmailInnerAttachment
  sharePointRoot: string | null
}) {
  function handleOpen() {
    if (!sharePointRoot) return
    const absPath = `${sharePointRoot}/${att.sharePointRelativePath}`
    window.electronAPI.openFile(absPath)
  }

  return (
    <div className="group flex items-center gap-2 pl-4 pr-2 py-1.5 hover:bg-blue-50/60 dark:hover:bg-blue-900/10 rounded">
      <span className="text-sm shrink-0">{innerFileIcon(att.name)}</span>
      <span className="flex-1 min-w-0 truncate text-xs text-gray-700 dark:text-gray-300">
        {att.name}
      </span>
      <button
        onClick={handleOpen}
        title="Open file"
        className="shrink-0 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/30 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <ExternalLink size={10} />
        Open
      </button>
    </div>
  )
}

// ── Main card ─────────────────────────────────────────────────────────────────
export default function EmailAttachmentCard({ attachment, sharePointRoot, onRemove }: Props) {
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
    if (!msgAbsPath || !window.electronAPI?.fileExists) return
    async function check() {
      const exists = await window.electronAPI.fileExists(msgAbsPath!)
      setAvailable(exists)
      if (exists && intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
    check()
    intervalRef.current = setInterval(check, 30_000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [msgAbsPath])

  const isUnavailable = available === false
  const isChecking = available === null

  function handleOpenEmail() {
    if (!msgAbsPath || isUnavailable || isChecking) return
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
          disabled={!sharePointRoot || isUnavailable || isChecking}
          className="shrink-0 mt-0.5 text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 disabled:opacity-40 disabled:cursor-default transition-colors"
        >
          {isChecking ? <Loader2 size={15} className="animate-spin text-gray-400" /> : <Mail size={15} />}
        </button>

        <div className="flex-1 min-w-0">
          {/* Subject — clickable to open email viewer */}
          <button
            onClick={handleOpenEmail}
            disabled={!sharePointRoot || isUnavailable || isChecking}
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
              <InnerAttRow key={inner.id} att={inner} sharePointRoot={sharePointRoot} />
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
