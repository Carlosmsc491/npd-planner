// src/renderer/src/hooks/useKeyboardShortcuts.ts
// Global keyboard shortcut listener — registered once at app root

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { DEFAULT_SHORTCUTS } from '../types'

export function useKeyboardShortcuts(onOpenSearch: () => void): void {
  const navigate = useNavigate()
  const { user } = useAuthStore()

  useEffect(() => {
    const shortcuts = { ...DEFAULT_SHORTCUTS, ...(user?.preferences?.shortcuts ?? {}) }

    function matchesShortcut(e: KeyboardEvent, binding: string): boolean {
      const parts = binding.toLowerCase().split('+')
      const key = parts[parts.length - 1]
      const needsCtrl = parts.includes('ctrl')
      const needsShift = parts.includes('shift')
      const needsAlt = parts.includes('alt')
      const needsMeta = parts.includes('meta') || parts.includes('cmd')

      // Ctrl or Cmd (Mac) both map to ctrlKey or metaKey
      const ctrlOrMeta = e.ctrlKey || e.metaKey

      return (
        e.key.toLowerCase() === key &&
        (!needsCtrl || ctrlOrMeta) &&
        (!needsMeta || ctrlOrMeta) &&
        (!needsShift || e.shiftKey) &&
        (!needsAlt || e.altKey)
      )
    }

    function handler(e: KeyboardEvent) {
      // Don't fire shortcuts when typing in inputs/textareas
      const target = e.target as HTMLElement
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable

      if (matchesShortcut(e, shortcuts.globalSearch)) {
        e.preventDefault()
        onOpenSearch()
        return
      }

      // Navigation shortcuts are ok even in non-input contexts
      if (!isInput) {
        if (matchesShortcut(e, shortcuts.goToDashboard)) { e.preventDefault(); navigate('/dashboard') }
        else if (matchesShortcut(e, shortcuts.goToCalendar)) { e.preventDefault(); navigate('/calendar') }
        else if (matchesShortcut(e, shortcuts.goToSettings)) { e.preventDefault(); navigate('/settings') }
        else if (matchesShortcut(e, shortcuts.toggleDarkMode)) {
          e.preventDefault()
          document.documentElement.classList.toggle('dark')
        }
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [navigate, onOpenSearch, user?.preferences?.shortcuts])
}

// ─── Shortcut state for App root ──────────────────────────────────────────────
export function useGlobalSearchState(): { open: boolean; openSearch: () => void; closeSearch: () => void } {
  const [open, setOpen] = useState(false)
  return {
    open,
    openSearch: () => setOpen(true),
    closeSearch: () => setOpen(false),
  }
}

// ─── Do Not Disturb helper ───────────────────────────────────────────────────

/**
 * Check if the current time is within Do Not Disturb hours.
 * Supports overnight ranges (e.g., 22:00 → 08:00).
 * 
 * @param dndStart - Start time in "HH:MM" format (24h)
 * @param dndEnd - End time in "HH:MM" format (24h)
 * @param dndEnabled - Whether DND is enabled (defaults to true)
 * @returns true if currently within DND hours
 */
export function isWithinDNDHours(
  dndStart: string = '22:00',
  dndEnd: string = '08:00',
  dndEnabled: boolean = true
): boolean {
  if (!dndEnabled) return false

  const now = new Date()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()

  const [startHours, startMins] = dndStart.split(':').map(Number)
  const [endHours, endMins] = dndEnd.split(':').map(Number)
  const startMinutes = startHours * 60 + startMins
  const endMinutes = endHours * 60 + endMins

  if (startMinutes <= endMinutes) {
    // Same day range (e.g., 09:00 → 17:00)
    return currentMinutes >= startMinutes && currentMinutes < endMinutes
  } else {
    // Overnight range (e.g., 22:00 → 08:00)
    return currentMinutes >= startMinutes || currentMinutes < endMinutes
  }
}

/**
 * Check if notifications should be suppressed for a user
 * 
 * @param preferences - User preferences object
 * @returns true if notifications should be suppressed
 */
export function shouldSuppressNotifications(
  preferences?: { dndEnabled?: boolean; dndStart?: string; dndEnd?: string }
): boolean {
  if (!preferences) return false
  return isWithinDNDHours(
    preferences.dndStart,
    preferences.dndEnd,
    preferences.dndEnabled ?? true
  )
}
