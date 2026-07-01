// lib/toast.ts — the single place the whole app talks to for transient toasts.
//
// Wraps `sileo` so the rest of the codebase never imports it directly: if we ever
// want to swap the toast library (e.g. to sonner), only THIS file changes. The
// app's legacy `taskStore.setToast(ToastData)` call sites are bridged here too via
// showToastData(), so nothing had to be rewritten to get global, animated toasts.
//
// Icons reflect MEANING, not just the raw type: success → check, error → X,
// warning → triangle, info → i, and a delete/"moved to trash" → a trash glyph with
// a neutral tone (a green "success" check reads wrong for a destructive action).

import { createElement, type ReactNode } from 'react'
import { sileo } from 'sileo'
import { CheckCircle2, XCircle, AlertTriangle, Info, Trash2 } from 'lucide-react'
import type { ToastData } from '../types'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastOptions {
  description?: string
  /** Milliseconds before auto-dismiss. Omit for sileo's default; null = sticky. */
  duration?: number | null
  /** Override the default per-type icon. */
  icon?: ReactNode
  /** A single action button (e.g. Undo). */
  action?: ToastAction
}

type ToastType = 'success' | 'error' | 'info' | 'warning'

const TYPE_ICON: Record<ToastType, () => ReactNode> = {
  success: () => createElement(CheckCircle2, { size: 18 }),
  error:   () => createElement(XCircle, { size: 18 }),
  warning: () => createElement(AlertTriangle, { size: 18 }),
  info:    () => createElement(Info, { size: 18 }),
}

function btn(action?: ToastAction) {
  return action ? { title: action.label, onClick: action.onClick } : undefined
}

function build(type: ToastType, message: string, opts?: ToastOptions) {
  return {
    title: message,
    description: opts?.description,
    duration: opts?.duration,
    icon: opts?.icon ?? TYPE_ICON[type](),
    button: btn(opts?.action),
  }
}

export const toast = {
  success: (message: string, opts?: ToastOptions) => sileo.success(build('success', message, opts)),
  error:   (message: string, opts?: ToastOptions) => sileo.error(build('error', message, opts)),
  info:    (message: string, opts?: ToastOptions) => sileo.info(build('info', message, opts)),
  warning: (message: string, opts?: ToastOptions) => sileo.warning(build('warning', message, opts)),
  /** A "deleted / moved to trash" result — trash glyph + neutral (info) tone, NOT a
   *  celebratory green check. Optional Undo action. */
  deleted: (message: string, opts?: ToastOptions) =>
    sileo.info({
      title: message,
      duration: opts?.duration ?? 5000,
      icon: createElement(Trash2, { size: 18 }),
      button: btn(opts?.action),
    }),
  promise: sileo.promise,
  dismiss: sileo.dismiss,
  clear: sileo.clear,
}

// A delete reads better as a trash glyph + neutral tone than a green "success".
// English-only app, so a message match is safe. Word-boundaried so "Failed to
// delete…" / "Delete failed" (which never completed) stay as errors.
const DELETION_RE = /moved to trash|\b(deleted|removed)\b/i

/** Bridge for the legacy `taskStore.setToast(ToastData | null)` call sites. */
export function showToastData(data: ToastData | null): void {
  if (!data) return
  const action: ToastAction | undefined = data.undoAction
    ? { label: 'Undo', onClick: data.undoAction }
    : undefined
  const opts: ToastOptions = { duration: data.duration, action }
  if (DELETION_RE.test(data.message)) {
    toast.deleted(data.message, opts)
    return
  }
  toast[data.type](data.message, opts)
}
