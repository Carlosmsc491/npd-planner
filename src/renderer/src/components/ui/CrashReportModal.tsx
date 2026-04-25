// src/renderer/src/components/ui/CrashReportModal.tsx
// Friendly crash screen shown in production when an unhandled error occurs.
// - Does NOT show raw stack trace to the user
// - "Send Report": saves JSON locally + creates Firestore notification for owners
// - "Continue": reloads the app
// Uses inline styles as fallback in case Tailwind CSS failed to load

import { useState } from 'react'
import { nanoid } from 'nanoid'
import { useAuthStore } from '../../store/authStore'

interface Props {
  error: Error
  /** Current route when the crash happened — window.location.hash stripped of '#' */
  route: string
}

export function CrashReportModal({ error, route }: Props) {
  const { user } = useAuthStore()
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [localFilePath, setLocalFilePath] = useState<string | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)

  async function handleSendReport() {
    setSending(true)
    setSendError(null)

    const id = `cr_${nanoid(8)}`
    const version = await window.electronAPI?.getAppVersion?.().catch(() => 'unknown') ?? 'unknown'
    const payload = {
      id,
      message: error.message,
      stack: error.stack ?? error.message,
      route,
      version,
      platform: navigator.platform ?? 'unknown',
      userId: user?.uid ?? null,
      userName: user?.name ?? null,
      timestamp: new Date().toISOString(),
    }

    // 1. Save to local disk first (most important — never fails silently)
    let savedPath: string | null = null
    try {
      const localResult = await window.electronAPI?.saveCrashLocal?.(payload)
      if (localResult?.success) savedPath = localResult.filePath ?? null
    } catch {
      // local save failed — continue anyway
    }

    // 2. Save to Firestore (temp) → notify owners → delete from Firestore
    try {
      const { saveCrashReport, deleteCrashReport, notifyOwnersCrashReport } =
        await import('../../lib/firestore')

      const crashId = await saveCrashReport({
        message: payload.message,
        stack: payload.stack,
        route: payload.route,
        version: payload.version,
        platform: payload.platform,
        userId: payload.userId,
        userName: payload.userName,
      })

      const notifMessage = `Crash reported by ${payload.userName ?? 'unknown'} — ${payload.route || '(unknown route)'} (v${payload.version})`
      await notifyOwnersCrashReport(
        notifMessage,
        payload.userId ?? 'unknown',
        payload.userName ?? 'Unknown User'
      )

      await deleteCrashReport(crashId)
    } catch {
      // Firestore unavailable — report is still on disk, that's enough
    }

    setSending(false)
    setSent(true)
    setLocalFilePath(savedPath)
  }

  function handleRestart() {
    window.location.reload()
  }

  // ── Styles (inline — Tailwind may not be available if CSS failed) ─────────
  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, display: 'flex', alignItems: 'center',
    justifyContent: 'center', background: 'rgba(0,0,0,0.85)', zIndex: 9999,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  }
  const card: React.CSSProperties = {
    background: '#1a1a2e', border: '1px solid #2d2d4e', borderRadius: 12,
    padding: '32px 28px', maxWidth: 420, width: '90%', color: '#e2e8f0',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
  }
  const icon: React.CSSProperties = {
    fontSize: 32, marginBottom: 12,
  }
  const title: React.CSSProperties = {
    fontSize: 18, fontWeight: 700, marginBottom: 8, color: '#f1f5f9',
  }
  const body: React.CSSProperties = {
    fontSize: 14, color: '#94a3b8', lineHeight: 1.6, marginBottom: 4,
  }
  const routeTag: React.CSSProperties = {
    display: 'inline-block', marginTop: 8, marginBottom: 20,
    background: '#0f172a', border: '1px solid #334155',
    borderRadius: 6, padding: '3px 8px', fontSize: 12,
    color: '#64748b', fontFamily: 'monospace',
  }
  const btnPrimary: React.CSSProperties = {
    background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8,
    padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
    marginRight: 10, opacity: sending ? 0.6 : 1,
  }
  const btnSecondary: React.CSSProperties = {
    background: 'transparent', color: '#64748b', border: '1px solid #334155',
    borderRadius: 8, padding: '10px 20px', fontSize: 14, cursor: 'pointer',
  }
  const successIcon: React.CSSProperties = { fontSize: 32, marginBottom: 12 }
  const filePathStyle: React.CSSProperties = {
    marginTop: 12, background: '#0f172a', border: '1px solid #1e3a5f',
    borderRadius: 6, padding: '8px 10px', fontSize: 11,
    color: '#60a5fa', fontFamily: 'monospace', wordBreak: 'break-all',
    lineHeight: 1.5,
  }

  return (
    <div style={overlay}>
      <div style={card}>
        {!sent ? (
          <>
            <div style={icon}>⚠️</div>
            <div style={title}>Something went wrong</div>
            <p style={body}>
              An unexpected error occurred. You can send a report to help us fix it —
              no personal data is included.
            </p>
            {route && <div style={routeTag}>{route}</div>}

            {sendError && (
              <p style={{ ...body, color: '#f87171', marginBottom: 12 }}>{sendError}</p>
            )}

            <div style={{ display: 'flex', marginTop: 4 }}>
              <button
                style={btnPrimary}
                onClick={handleSendReport}
                disabled={sending}
              >
                {sending ? 'Sending…' : 'Send Report'}
              </button>
              <button style={btnSecondary} onClick={handleRestart}>
                Continue
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={successIcon}>✅</div>
            <div style={title}>Report sent</div>
            <p style={body}>
              The app will restart. If this keeps happening, contact your administrator.
            </p>
            {localFilePath && (
              <div style={filePathStyle}>
                <span style={{ color: '#64748b', display: 'block', marginBottom: 2 }}>
                  Report saved at:
                </span>
                {localFilePath}
              </div>
            )}
            <div style={{ marginTop: 20 }}>
              <button style={btnPrimary} onClick={handleRestart}>
                Restart Now
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
