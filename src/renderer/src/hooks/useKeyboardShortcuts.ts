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
