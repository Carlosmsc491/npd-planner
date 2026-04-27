// src/renderer/src/components/task/EmailViewerModal.tsx
// In-app email viewer — renders .msg content in a sandboxed iframe (no Outlook needed)

import { useState, useEffect } from 'react'
import { X, Mail, Loader2, AlertTriangle } from 'lucide-react'

interface Props {
  msgAbsPath: string
  subject: string
  onClose: () => void
}

interface EmailContent {
  subject: string
  from: string
  to: string
  date: string | null
  bodyHtml: string | null
  bodyText: string
}

function formatDate(raw: string | null): string {
  if (!raw) return ''
  try {
    return new Date(raw).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    })
  } catch {
    return raw
  }
}

export default function EmailViewerModal({ msgAbsPath, subject, onClose }: Props) {
  const [content, setContent] = useState<EmailContent | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    window.electronAPI.readMsgFile(msgAbsPath).then(res => {
      if (!res.success) {
        setError(res.error ?? 'Could not read email file.')
      } else {
        setContent({
          subject: res.subject ?? subject,
          from: res.from ?? '',
          to: res.to ?? '',
          date: res.date ?? null,
          bodyHtml: res.bodyHtml ?? null,
          bodyText: res.bodyText ?? '',
        })
      }
      setLoading(false)
    }).catch(err => {
      setError(String(err))
      setLoading(false)
    })
  }, [msgAbsPath, subject])

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const bodyHtml = content?.bodyHtml
    ? `<!DOCTYPE html><html><head><meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                 font-size: 14px; color: #1e293b; margin: 16px; line-height: 1.6; }
          img { max-width: 100%; height: auto; }
          a { color: #3b82f6; }
          blockquote { border-left: 3px solid #cbd5e1; margin: 8px 0; padding-left: 12px; color: #64748b; }
        </style></head><body>${content.bodyHtml}</body></html>`
    : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative flex flex-col bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-[780px] max-w-[95vw] h-[82vh] overflow-hidden border border-gray-200 dark:border-gray-700">

        {/* Title bar */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0 bg-gray-50 dark:bg-gray-800/60">
          <Mail size={15} className="text-blue-500 shrink-0" />
          <span className="flex-1 text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">
            {content?.subject ?? subject}
          </span>
          <button
            onClick={onClose}
            className="shrink-0 rounded p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {loading && (
          <div className="flex-1 flex items-center justify-center gap-2 text-gray-400">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">Loading email…</span>
          </div>
        )}

        {error && !loading && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-red-500 px-6">
            <AlertTriangle size={24} />
            <p className="text-sm text-center">{error}</p>
            <button
              onClick={onClose}
              className="mt-2 px-4 py-1.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              Close
            </button>
          </div>
        )}

        {content && !loading && (
          <>
            {/* Email metadata */}
            <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 shrink-0 space-y-1 text-xs text-gray-500 dark:text-gray-400">
              <div className="flex gap-2">
                <span className="w-8 text-right font-medium text-gray-400 shrink-0">From</span>
                <span className="text-gray-700 dark:text-gray-200">{content.from}</span>
              </div>
              {content.to && (
                <div className="flex gap-2">
                  <span className="w-8 text-right font-medium text-gray-400 shrink-0">To</span>
                  <span className="text-gray-700 dark:text-gray-200 truncate">{content.to}</span>
                </div>
              )}
              {content.date && (
                <div className="flex gap-2">
                  <span className="w-8 text-right font-medium text-gray-400 shrink-0">Date</span>
                  <span>{formatDate(content.date)}</span>
                </div>
              )}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-hidden">
              {bodyHtml ? (
                <iframe
                  srcDoc={bodyHtml}
                  sandbox="allow-same-origin"
                  className="w-full h-full border-none bg-white"
                  title="Email content"
                />
              ) : (
                <div className="h-full overflow-y-auto px-5 py-4">
                  <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">
                    {content.bodyText || '(No message body)'}
                  </pre>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
