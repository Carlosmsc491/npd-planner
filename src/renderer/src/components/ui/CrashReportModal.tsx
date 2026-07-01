// src/renderer/src/components/ui/CrashReportModal.tsx
// The ONE crash screen for the whole app — shown for renderer errors (via the
// ErrorBoundary in main.tsx) AND for main-process errors (forwarded by
// errorReporter → App's onFatalError listener). Inline styles so it still renders
// if Tailwind/CSS failed to load during the crash.
//
// "Send Report" gathers a full diagnostic — the user's action trail (breadcrumbs),
// where it happened, machine/OS/app version, user, time — saves it locally AND to
// Firestore (kept, so an owner can review it) and pings the owners.

import { useState } from 'react'
import { nanoid } from 'nanoid'
import { useAuthStore } from '../../store/authStore'
import { getBreadcrumbs } from '../../lib/breadcrumbs'

interface Props {
  error: Error
  /** Current route when the crash happened — window.location.hash stripped of '#' */
  route: string
  /** 'renderer' (default) | 'uncaughtException' | 'unhandledRejection' */
  errorType?: string
}

export function CrashReportModal({ error, route, errorType = 'renderer' }: Props) {
  const { user } = useAuthStore()
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  async function handleSendReport() {
    setSending(true)
    setSendError(null)

    const sys = await window.electronAPI?.getSystemInfo?.().catch(() => null) ?? null
    const payload = {
      id: `cr_${nanoid(8)}`,
      message: error.message,
      stack: error.stack ?? error.message,
      route,
      errorType,
      version: sys?.appVersion ?? 'unknown',
      platform: sys?.platform ?? (navigator.platform || 'unknown'),
      hostname: sys?.hostname ?? 'unknown',
      osRelease: sys?.osRelease ?? 'unknown',
      arch: sys?.arch ?? 'unknown',
      userId: user?.uid ?? null,
      userName: user?.name ?? null,
      occurredAt: new Date().toISOString(),
      breadcrumbs: getBreadcrumbs(),
    }

    // 1. Local disk first — never lost even if Firestore is down.
    try { await window.electronAPI?.saveCrashLocal?.(payload) } catch { /* continue */ }

    // 2. Firestore — KEPT (not deleted) so an owner can open and review it later,
    //    plus a notification so owners know immediately.
    try {
      const { saveCrashReport, notifyOwnersCrashReport } = await import('../../lib/firestore')
      await saveCrashReport({
        message: payload.message, stack: payload.stack, route: payload.route,
        version: payload.version, platform: payload.platform,
        userId: payload.userId, userName: payload.userName,
        errorType: payload.errorType, hostname: payload.hostname,
        osRelease: payload.osRelease, arch: payload.arch,
        occurredAt: payload.occurredAt, breadcrumbs: payload.breadcrumbs,
        resolved: false,
      })
      await notifyOwnersCrashReport(
        `Crash reported by ${payload.userName ?? 'unknown'} on ${payload.hostname} — ${payload.route || '(unknown route)'} (v${payload.version})`,
        payload.userId ?? 'unknown',
        payload.userName ?? 'Unknown User',
      )
    } catch (e) {
      // Firestore unavailable — the local copy is enough; let the user move on.
      setSendError(e instanceof Error ? e.message : String(e))
    }

    setSending(false)
    setSent(true)
  }

  function handleReload() {
    window.location.hash = '#/dashboard'
    window.location.reload()
  }

  // ── Inline styles (Tailwind may not be available if CSS failed) ───────────
  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, display: 'flex', alignItems: 'center',
    justifyContent: 'center', background: 'rgba(15,23,42,0.92)', zIndex: 99999, padding: 20,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  }
  const card: React.CSSProperties = {
    background: '#fff', borderRadius: 16, padding: '28px 26px', maxWidth: 460, width: '100%',
    color: '#0f172a', boxShadow: '0 24px 70px rgba(0,0,0,0.45)',
  }
  const title: React.CSSProperties = { fontSize: 20, fontWeight: 800, marginBottom: 6, color: '#0f172a' }
  const body: React.CSSProperties = { fontSize: 14, color: '#475569', lineHeight: 1.55 }
  const reasonBox: React.CSSProperties = {
    marginTop: 14, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10,
    padding: '10px 12px', fontSize: 12.5, color: '#b91c1c', wordBreak: 'break-word', lineHeight: 1.5,
  }
  const meta: React.CSSProperties = { marginTop: 10, fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }
  const btnPrimary: React.CSSProperties = {
    background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 10,
    padding: '11px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: sending ? 0.6 : 1,
  }
  const btnSecondary: React.CSSProperties = {
    background: '#fff', color: '#334155', border: '1px solid #cbd5e1', borderRadius: 10,
    padding: '11px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  }

  const crumbs = getBreadcrumbs()

  return (
    <div style={overlay}>
      <div style={card}>
        {!sent ? (
          <>
            <div style={{ fontSize: 34, marginBottom: 8 }}>🙈</div>
            <div style={title}>Hang on — something went wrong</div>
            <p style={body}>
              Sorry about that. The app hit an unexpected error. Sending a quick report
              helps us fix it fast — it includes what you were doing, not your data.
            </p>

            <div style={reasonBox}>
              <strong>Reason:</strong> {error.message || 'Unknown error'}
            </div>
            <div style={meta}>
              {route ? `at ${route}` : 'unknown screen'} · {crumbs.length} recent action{crumbs.length !== 1 ? 's' : ''} captured
            </div>

            {sendError && (
              <p style={{ ...body, color: '#b45309', marginTop: 10, fontSize: 12.5 }}>
                Saved locally, but couldn’t reach the server: {sendError}
              </p>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button style={btnPrimary} onClick={handleSendReport} disabled={sending}>
                {sending ? 'Sending…' : 'Send Report'}
              </button>
              <button style={btnSecondary} onClick={handleReload}>
                Reload App
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 34, marginBottom: 8 }}>✅</div>
            <div style={title}>Report sent — thank you</div>
            <p style={body}>
              The team will take a look. Reload to keep working; if it keeps happening,
              let your administrator know.
            </p>
            <div style={{ marginTop: 20 }}>
              <button style={btnPrimary} onClick={handleReload}>Reload App</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
