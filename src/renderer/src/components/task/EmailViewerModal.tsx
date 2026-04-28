// src/renderer/src/components/task/EmailViewerModal.tsx
// In-app email viewer — renders .msg as a threaded conversation

import { useState, useEffect, useRef } from 'react'
import { X, Mail, Loader2, AlertTriangle, ChevronDown, ChevronUp, Maximize2, Reply, Forward } from 'lucide-react'
import { splitEmailThread, type ThreadSegment } from '../../utils/emailThread'

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

function formatDate(raw: string | null | undefined): string {
  if (!raw) return ''
  try {
    return new Date(raw).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    })
  } catch { return raw }
}

function wrapHtml(body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
             font-size: 13px; color: #1e293b; margin: 14px 16px; line-height: 1.6; }
      img  { max-width: 100%; height: auto; }
      a    { color: #3b82f6; }
      blockquote { border-left: 3px solid #cbd5e1; margin: 6px 0;
                   padding-left: 10px; color: #64748b; }
      p { margin: 4px 0; }
    </style></head><body>${body}</body></html>`
}

// ── Single message bubble ────────────────────────────────────────────────────

interface BubbleProps {
  segment: ThreadSegment
  index: number
  total: number
  defaultExpanded: boolean
}

function MessageBubble({ segment, index, total, defaultExpanded }: BubbleProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [iframeHeight, setIframeHeight] = useState(200)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const isNewest = index === 0
  const fromShort = segment.from.replace(/<[^>]+>/, '').trim() || 'Unknown'
  const bodyHtml = segment.bodyHtml ? wrapHtml(segment.bodyHtml) : null

  function handleIframeLoad() {
    const doc = iframeRef.current?.contentDocument
    if (doc?.body) {
      const h = doc.documentElement.scrollHeight || doc.body.scrollHeight
      setIframeHeight(Math.max(80, h))
    }
  }

  return (
    <div className={`rounded-lg border overflow-hidden transition-all
      ${isNewest
        ? 'border-blue-200 dark:border-blue-800/60'
        : 'border-gray-200 dark:border-gray-700/60'
      }`}
    >
      {/* Header — always visible, click to toggle */}
      <button
        onClick={() => setExpanded(v => !v)}
        className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors
          ${isNewest
            ? 'bg-blue-50/60 dark:bg-blue-900/15 hover:bg-blue-100/60 dark:hover:bg-blue-900/25'
            : 'bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-700/50'
          }`}
      >
        <div className={`shrink-0 rounded-full w-6 h-6 flex items-center justify-center text-[10px] font-bold
          ${isNewest ? 'bg-blue-500 text-white' : 'bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200'}`}
        >
          {fromShort.charAt(0).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className={`text-xs font-semibold truncate
              ${isNewest ? 'text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'}`}
            >
              {fromShort}
            </span>
            {segment.date && (
              <span className="text-[10px] text-gray-400 shrink-0">{segment.date}</span>
            )}
            {!expanded && (
              <span className="text-[10px] text-gray-400 italic truncate hidden sm:block">
                {(segment.bodyText || '').replace(/\s+/g, ' ').trim().slice(0, 60)}
              </span>
            )}
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-1">
          <span className="text-[10px] text-gray-400">{total - index} of {total}</span>
          {expanded
            ? <ChevronUp size={12} className="text-gray-400" />
            : <ChevronDown size={12} className="text-gray-400" />
          }
        </div>
      </button>

      {/* Body */}
      {expanded && (
        <div className="bg-white dark:bg-gray-900">
          {bodyHtml ? (
            <iframe
              ref={iframeRef}
              srcDoc={bodyHtml}
              sandbox="allow-same-origin"
              onLoad={handleIframeLoad}
              style={{ width: '100%', height: iframeHeight, border: 'none', display: 'block', overflow: 'hidden' }}
              title={`Message ${index + 1}`}
            />
          ) : (
            <div className="px-4 py-3">
              <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">
                {segment.bodyText || '(No message body)'}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main modal ───────────────────────────────────────────────────────────────

export default function EmailViewerModal({ msgAbsPath, subject, onClose }: Props) {
  const [content, setContent] = useState<EmailContent | null>(null)
  const [segments, setSegments] = useState<ThreadSegment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    window.electronAPI.readMsgFile(msgAbsPath).then(res => {
      if (!res.success) {
        setError(res.error ?? 'Could not read email file.')
        setLoading(false)
        return
      }
      const c: EmailContent = {
        subject: res.subject ?? subject,
        from: res.from ?? '',
        to: res.to ?? '',
        date: res.date ?? null,
        bodyHtml: res.bodyHtml ?? null,
        bodyText: res.bodyText ?? '',
      }
      setContent(c)
      const dateStr = formatDate(c.date)
      const segs = splitEmailThread(c.bodyHtml, c.bodyText, c.from, dateStr, c.to)
      setSegments(segs)
      setLoading(false)
    }).catch(err => {
      setError(String(err))
      setLoading(false)
    })
  }, [msgAbsPath, subject])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function handleExpandWindow() {
    if (!content) return
    const combinedHtml = segments.map((seg, i) => {
      const isNewest = i === 0
      const fromShort = seg.from.replace(/<[^>]+>/, '').trim() || 'Unknown'
      const body = seg.bodyHtml ?? `<pre style="white-space:pre-wrap;font-family:sans-serif">${seg.bodyText}</pre>`
      const headerBg = isNewest ? '#eff6ff' : '#f8fafc'
      const headerColor = isNewest ? '#1d4ed8' : '#374151'
      return `
        <div style="border:1px solid ${isNewest ? '#bfdbfe' : '#e2e8f0'};border-radius:8px;margin-bottom:12px;overflow:hidden">
          <div style="background:${headerBg};padding:8px 12px;border-bottom:1px solid ${isNewest ? '#bfdbfe' : '#e2e8f0'}">
            <span style="font-weight:600;color:${headerColor};font-size:13px">${fromShort}</span>
            ${seg.date ? `<span style="color:#94a3b8;font-size:11px;margin-left:8px">${seg.date}</span>` : ''}
          </div>
          <div style="padding:12px 16px">${body}</div>
        </div>`
    }).join('')

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>${content.subject}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
               font-size: 13px; color: #1e293b; margin: 20px; line-height: 1.6; background: #f1f5f9; }
        h2 { font-size: 16px; margin: 0 0 16px; color: #0f172a; }
        img { max-width: 100%; } a { color: #3b82f6; }
        blockquote { border-left: 3px solid #cbd5e1; margin: 6px 0; padding-left: 10px; color: #64748b; }
      </style></head><body>
      <h2>${content.subject}</h2>
      ${combinedHtml}
    </body></html>`

    const win = window.open('', '_blank', 'width=820,height=700,scrollbars=yes')
    win?.document.write(html)
    win?.document.close()
  }

  function handleReply() {
    if (!content) return
    const replyTo = content.from.match(/<([^>]+)>/)?.[1] ?? content.from
    const mailto = `mailto:${encodeURIComponent(replyTo)}?subject=${encodeURIComponent('Re: ' + content.subject)}`
    window.location.href = mailto
  }

  function handleForward() {
    if (!content) return
    const bodySnippet = (content.bodyText ?? '').slice(0, 500)
    const fwdBody = `\n\n-------- Forwarded Message --------\nFrom: ${content.from}\nDate: ${formatDate(content.date)}\nSubject: ${content.subject}\n\n${bodySnippet}`
    const mailto = `mailto:?subject=${encodeURIComponent('Fwd: ' + content.subject)}&body=${encodeURIComponent(fwdBody)}`
    window.location.href = mailto
  }

  const isThread = segments.length > 1

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative flex flex-col bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-[800px] max-w-[95vw] h-[85vh] overflow-hidden border border-gray-200 dark:border-gray-700">

        {/* Title bar */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0 bg-gray-50 dark:bg-gray-800/60">
          <Mail size={14} className="text-blue-500 shrink-0" />
          <span className="flex-1 text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">
            {content?.subject ?? subject}
          </span>
          {isThread && (
            <span className="shrink-0 text-[10px] font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 px-2 py-0.5 rounded-full">
              {segments.length} messages
            </span>
          )}
          {content && (
            <button
              onClick={handleExpandWindow}
              title="Open in separate window"
              className="shrink-0 rounded p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              <Maximize2 size={13} />
            </button>
          )}
          <button
            onClick={onClose}
            className="shrink-0 rounded p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center gap-2 text-gray-400 h-full">
              <Loader2 size={18} className="animate-spin" />
              <span className="text-sm">Loading email…</span>
            </div>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center justify-center gap-3 text-red-500 h-full px-6">
              <AlertTriangle size={24} />
              <p className="text-sm text-center">{error}</p>
              <button onClick={onClose} className="mt-2 px-4 py-1.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm">
                Close
              </button>
            </div>
          )}

          {!loading && !error && segments.length > 0 && (
            <div className="p-4 space-y-2">
              {segments.map((seg, i) => (
                <MessageBubble
                  key={i}
                  segment={seg}
                  index={i}
                  total={segments.length}
                  defaultExpanded={i === 0}
                />
              ))}
            </div>
          )}
        </div>

        {/* Action bar — Reply / Forward */}
        {content && !loading && !error && (
          <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60">
            <button
              onClick={handleReply}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              <Reply size={12} />
              Reply
            </button>
            <button
              onClick={handleForward}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              <Forward size={12} />
              Forward
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
