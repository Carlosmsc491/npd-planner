// src/renderer/src/components/task/AttachmentPanel.tsx
// File attachment panel inside TaskPage — handles attach, preview, open, remove

import { useState, useCallback } from 'react'
import {
  Paperclip, Upload, FileText, Image, FileSpreadsheet,
  File, Trash2, ExternalLink, AlertTriangle, RefreshCw,
  CheckCircle, Clock, X, ZoomIn,
} from 'lucide-react'
import { useSharePoint } from '../../hooks/useSharePoint'
import { useSettingsStore } from '../../store/settingsStore'
import type { Task, TaskAttachment } from '../../types'

interface Props {
  task: Task
}

// ─── File type helpers ────────────────────────────────────────────────────────
function getFileIcon(mimeType: string | null, name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const mime = mimeType ?? ''

  if (mime.startsWith('image/')) return <Image size={16} className="text-blue-400" />
  if (mime === 'application/pdf' || ext === 'pdf') return <FileText size={16} className="text-red-400" />
  if (['xlsx', 'xls', 'csv'].includes(ext) || mime.includes('spreadsheet') || mime.includes('excel'))
    return <FileSpreadsheet size={16} className="text-green-500" />
  if (['doc', 'docx'].includes(ext) || mime.includes('wordprocessingml') || mime.includes('msword'))
    return <FileText size={16} className="text-blue-500" />
  return <File size={16} className="text-gray-400" />
}

function isImage(mimeType: string | null, name: string): boolean {
  if (mimeType?.startsWith('image/')) return true
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)
}

function StatusBadge({ status }: { status: TaskAttachment['status'] }) {
  if (status === 'uploading') {
    return (
      <span className="flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400">
        <RefreshCw size={10} className="animate-spin" />
        Uploading…
      </span>
    )
  }
  if (status === 'synced') {
    return (
      <span className="flex items-center gap-1 text-[10px] font-medium text-green-600 dark:text-green-400">
        <CheckCircle size={10} />
        Synced
      </span>
    )
  }
  if (status === 'error') {
    return (
      <span className="flex items-center gap-1 text-[10px] font-medium text-red-500 dark:text-red-400">
        <AlertTriangle size={10} />
        Error — retrying
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-[10px] font-medium text-gray-400">
      <Clock size={10} />
      Pending
    </span>
  )
}

// ─── Image Preview Modal ──────────────────────────────────────────────────────
interface PreviewModalProps {
  name: string
  base64: string
  mimeType: string
  onClose: () => void
}

function ImagePreviewModal({ name, base64, mimeType, onClose }: PreviewModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700">
          <span className="truncate text-sm font-medium text-gray-700 dark:text-gray-300 max-w-xs">
            {name}
          </span>
          <button
            onClick={onClose}
            className="ml-4 shrink-0 rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X size={14} />
          </button>
        </div>
        <div className="p-2 overflow-auto max-h-[80vh]">
          <img
            src={`data:${mimeType};base64,${base64}`}
            alt={name}
            className="max-w-full rounded object-contain"
          />
        </div>
      </div>
    </div>
  )
}

// ─── Attachment Row ───────────────────────────────────────────────────────────
interface RowProps {
  attachment: TaskAttachment
  task: Task
  onRemove: (id: string) => void
  onOpen: (att: TaskAttachment) => void
  onPreview: (att: TaskAttachment) => void
}

function AttachmentRow({ attachment, onRemove, onOpen, onPreview }: RowProps) {
  const canPreview = isImage(attachment.mimeType, attachment.name)

  return (
    <div className="group flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-700/60 dark:bg-gray-800/60">
      {/* Icon */}
      <div className="shrink-0">{getFileIcon(attachment.mimeType, attachment.name)}</div>

      {/* Name + status */}
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">
          {attachment.name}
        </p>
        <StatusBadge status={attachment.status} />
      </div>

      {/* Actions — visible on hover */}
      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {canPreview && (
          <button
            onClick={() => onPreview(attachment)}
            title="Preview"
            className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
          >
            <ZoomIn size={13} />
          </button>
        )}
        <button
          onClick={() => onOpen(attachment)}
          title="Open in app"
          className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
        >
          <ExternalLink size={13} />
        </button>
        <button
          onClick={() => onRemove(attachment.id)}
          title="Remove"
          className="rounded p-1 text-gray-400 hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-900/30 dark:hover:text-red-400"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function AttachmentPanel({ task }: Props) {
  const { clients } = useSettingsStore()
  const {
    sharePointPath,
    isElectron,
    attachFile,
    removeAttachment,
    openAttachment,
    readAttachmentBase64,
    setupSharePoint,
  } = useSharePoint()

  const [attaching, setAttaching] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'error' | 'info'; message: string } | null>(null)
  const [preview, setPreview] = useState<{ name: string; base64: string; mimeType: string } | null>(null)
  const [settingUp, setSettingUp] = useState(false)

  const clientName = clients.find((c) => c.id === task.clientId)?.name ?? 'Unknown Client'

  async function handleAttach() {
    setAttaching(true)
    setFeedback(null)
    const result = await attachFile(task, clientName)
    setAttaching(false)
    if (!result.success && result.error) {
      setFeedback({ type: 'error', message: result.error })
    }
  }

  async function handleRemove(attachmentId: string) {
    await removeAttachment(task, attachmentId)
  }

  async function handleOpen(att: TaskAttachment) {
    if (!isElectron) {
      setFeedback({ type: 'info', message: 'File opening requires the desktop app.' })
      return
    }
    await openAttachment(att)
  }

  const handlePreview = useCallback(
    async (att: TaskAttachment) => {
      if (!isElectron) return
      const base64 = await readAttachmentBase64(att)
      if (!base64) {
        setFeedback({ type: 'error', message: 'Could not read file for preview.' })
        return
      }
      setPreview({ name: att.name, base64, mimeType: att.mimeType ?? 'image/png' })
    },
    [isElectron, readAttachmentBase64]
  )

  async function handleQuickSetup() {
    setSettingUp(true)
    setFeedback(null)
    const result = await setupSharePoint()
    setSettingUp(false)
    if (!result.success && result.error) {
      setFeedback({ type: 'error', message: result.error })
    }
  }

  // ── No SharePoint path configured ──────────────────────────────────────────
  if (isElectron && !sharePointPath) {
    return (
      <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-4 dark:border-amber-700/40 dark:bg-amber-900/10">
        <div className="flex items-start gap-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
              SharePoint folder not configured
            </p>
            <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
              You need to connect your local SharePoint folder before attaching files.
            </p>
            <button
              onClick={handleQuickSetup}
              disabled={settingUp}
              className="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-60"
            >
              {settingUp ? <RefreshCw size={12} className="animate-spin" /> : null}
              Set up now
            </button>
          </div>
        </div>
        {feedback && (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">{feedback.message}</p>
        )}
      </div>
    )
  }

  return (
    <>
      {/* Attachment list */}
      <div className="space-y-1.5">
        {task.attachments.length === 0 && (
          <p className="text-xs text-gray-400 dark:text-gray-500 italic">No files attached yet.</p>
        )}
        {task.attachments.map((att) => (
          <AttachmentRow
            key={att.id}
            attachment={att}
            task={task}
            onRemove={handleRemove}
            onOpen={handleOpen}
            onPreview={handlePreview}
          />
        ))}
      </div>

      {/* Feedback */}
      {feedback && (
        <div className={`mt-2 flex items-start gap-2 rounded-lg p-2 text-xs ${
          feedback.type === 'error'
            ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
            : 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
        }`}>
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <span className="flex-1">{feedback.message}</span>
          <button onClick={() => setFeedback(null)}>
            <X size={12} />
          </button>
        </div>
      )}

      {/* Attach button */}
      {isElectron && sharePointPath && (
        <button
          onClick={handleAttach}
          disabled={attaching}
          className="mt-2 flex items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs font-medium text-gray-500 transition-colors hover:border-green-400 hover:bg-green-50 hover:text-green-600 disabled:opacity-60 dark:border-gray-700 dark:text-gray-400 dark:hover:border-green-600 dark:hover:bg-green-900/20 dark:hover:text-green-400"
        >
          {attaching ? (
            <Upload size={13} className="animate-bounce" />
          ) : (
            <Paperclip size={13} />
          )}
          {attaching ? 'Attaching…' : 'Attach file'}
        </button>
      )}

      {/* Non-electron fallback attach button */}
      {!isElectron && (
        <p className="mt-2 text-xs text-gray-400 dark:text-gray-500 italic">
          File attachments available in the desktop app only.
        </p>
      )}

      {/* Image preview modal */}
      {preview && (
        <ImagePreviewModal
          name={preview.name}
          base64={preview.base64}
          mimeType={preview.mimeType}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  )
}
