// src/renderer/src/components/task/EmailViewerModal.tsx
// In-app email viewer — renders .msg as a threaded conversation

import { useState, useEffect, useRef } from 'react'
import { X, Mail, Loader2, AlertTriangle, ChevronDown, ChevronUp, Maximize2, Reply, Forward, ExternalLink, FolderOpen, Printer } from 'lucide-react'
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
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Calibri, Arial, sans-serif;
             font-size: 13px; color: #1e293b; margin: 14px 16px; line-height: 1.6; }
      img  { max-width: 100%; height: auto; }
      a    { color: #3b82f6; }
      blockquote { border-left: 3px solid #cbd5e1; margin: 6px 0;
                   padding-left: 10px; color: #64748b; }
      p    { margin: 4px 0; }
      /* ── Table support — Outlook emails use <table> for layout and data ── */
      table { border-collapse: collapse; width: auto; max-width: 100%;
              margin: 8px 0; font-size: 13px; }
      th    { background: #1e293b; color: #fff; font-weight: 600;
              padding: 6px 12px; text-align: left; white-space: nowrap; }
      td    { padding: 5px 12px; border-bottom: 1px solid #e2e8f0;
              vertical-align: top; }
      tr:nth-child(even) td { background: #f8fafc; }
      tr:hover td           { background: #eff6ff; }
      /* Preserve Outlook's inline table borders */
      table[border] td, table[border] th { border: 1px solid #cbd5e1; }
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
            // No HTML body — render plain text as structured HTML so headers and
            // content are readable instead of a raw monospace block.
            <iframe
              sandbox="allow-same-origin"
              srcDoc={wrapHtml(plainTextToHtml(segment.bodyText || '(No message body)'))}
              onLoad={(e) => {
                const doc = (e.target as HTMLIFrameElement).contentDocument
                if (doc?.body) {
                  const h = doc.documentElement.scrollHeight || doc.body.scrollHeight
                  setIframeHeight(Math.max(80, h))
                }
              }}
              style={{ width: '100%', height: iframeHeight, border: 'none', display: 'block', overflow: 'hidden' }}
              title={`Message ${index + 1}`}
            />
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Last-resort: convert plain text to readable HTML.
 * Preserves Outlook-style headers (From/Sent/To/Subject) and renders
 * tab-separated or fixed-width columns as a simple <table>.
 */
function plainTextToHtml(text: string): string {
  const lines = text.split(/\r?\n/)
  const htmlLines: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) { htmlLines.push('<br>'); continue }

    // Outlook header lines: "From:", "Sent:", "To:", "Cc:", "Subject:"
    const headerMatch = trimmed.match(/^(From|Sent|To|Cc|Subject|Date):\s*(.*)$/i)
    if (headerMatch) {
      htmlLines.push(
        `<div style="margin:1px 0"><span style="font-weight:600;color:#374151">${headerMatch[1]}:</span> ` +
        `<span style="color:#1e293b">${headerMatch[2]}</span></div>`
      )
      continue
    }

    htmlLines.push(`<div style="margin:1px 0">${trimmed}</div>`)
  }

  return htmlLines.join('\n')
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
    const reader = msgAbsPath.toLowerCase().endsWith('.eml')
      ? window.electronAPI.readEmlFile(msgAbsPath)
      : window.electronAPI.readMsgFile(msgAbsPath)
    reader.then(res => {
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

    // Extract bare email address from "Name <email>" or plain "email" format
    const fromRaw = content.from.trim()
    const replyTo = fromRaw.match(/<([^>]+)>/)?.[1] ?? fromRaw

    // Don't add Re: if subject already starts with it (case-insensitive)
    const reSubject = /^re:/i.test(content.subject)
      ? content.subject
      : `Re: ${content.subject}`

    // Build quoted body: attribution line + original plain text
    const dateStr = formatDate(content.date)
    const quotedBody = [
      '',
      '',
      `On ${dateStr}, ${content.from} wrote:`,
      '',
      // Indent each line of the original with >
      ...(content.bodyText ?? '')
        .split('\n')
        .map(line => `> ${line}`),
    ].join('\n')

    const mailto = `mailto:${encodeURIComponent(replyTo)}?subject=${encodeURIComponent(reSubject)}&body=${encodeURIComponent(quotedBody)}`
    window.electronAPI.openExternal(mailto)
  }

  function handleForward() {
    if (!content) return

    // Don't add Fwd: if already present
    const fwdSubject = /^fwd?:/i.test(content.subject)
      ? content.subject
      : `Fwd: ${content.subject}`

    // Reconstruct the To: line for the forwarded header
    const toLine = content.to ? `To: ${content.to}\n` : ''

    const fwdBody = [
      '',
      '',
      '-------- Forwarded Message --------',
      `From: ${content.from}`,
      `Date: ${formatDate(content.date)}`,
      `Subject: ${content.subject}`,
      toLine.trimEnd(),
      '',
      content.bodyText ?? '',
    ].join('\n')

    const mailto = `mailto:?subject=${encodeURIComponent(fwdSubject)}&body=${encodeURIComponent(fwdBody)}`
    window.electronAPI.openExternal(mailto)
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
          {/* Open / Finder / Print for the .msg/.eml file itself */}
          <div className="flex items-center gap-0.5 shrink-0">
            <button onClick={() => window.electronAPI.openFile(msgAbsPath)} title="Open file"
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors">
              <ExternalLink size={11} /> Open
            </button>
            <button onClick={() => window.electronAPI.showInFolder(msgAbsPath)} title={`Show in ${window.process?.platform === 'win32' ? 'Explorer' : 'Finder'}`}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
              <FolderOpen size={11} /> {window.process?.platform === 'win32' ? 'Explorer' : 'Finder'}
            </button>
            <button onClick={() => window.electronAPI.printFile(msgAbsPath)} title="Print"
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
              <Printer size={11} /> Print
            </button>
          </div>
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
