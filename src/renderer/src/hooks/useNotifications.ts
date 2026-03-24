// src/renderer/src/hooks/useNotifications.ts
// Subscribes to Firestore notifications for the current user.
// Triggers Electron desktop notifications for Planner tasks, respecting DND.

import { useEffect, useRef } from 'react'
import { subscribeToNotifications } from '../lib/firestore'
import { useAuthStore } from '../store/authStore'
import { useNotificationStore } from '../store/notificationStore'

const isElectron = typeof window !== 'undefined' && !!window.electronAPI

export function useNotifications(): void {
  const { user } = useAuthStore()
  const { setNotifications } = useNotificationStore()

  const notifiedIds = useRef<Set<string>>(new Set())
  const isFirstSnapshot = useRef(true)

  useEffect(() => {
    if (!user) return

    isFirstSnapshot.current = true
    notifiedIds.current.clear()

    const unsub = subscribeToNotifications(user.uid, (incoming) => {
      setNotifications(incoming)

      // On first snapshot: register all existing IDs but skip desktop notifications
      if (isFirstSnapshot.current) {
        isFirstSnapshot.current = false
        for (const notif of incoming) {
          notifiedIds.current.add(notif.id)
        }
        return
      }

      if (!isElectron) return

      const prefs = user.preferences
      const dndActive =
        prefs?.dndStart && prefs?.dndEnd
          ? isDNDActive(prefs.dndStart, prefs.dndEnd)
          : false

      for (const notif of incoming) {
        if (notifiedIds.current.has(notif.id)) continue
        notifiedIds.current.add(notif.id)

        if (notif.read) continue
        if (notif.type === 'new_user_pending') continue
        if (!notif.boardType || notif.boardType !== 'planner') continue
        if (!notif.taskId || !notif.taskTitle) continue

        window.electronAPI.sendNotification(
          notif.message,
          notif.taskTitle,
          notif.taskId,
          notif.boardType,
          dndActive
        )
      }
    })

    return unsub
  }, [user, setNotifications])

  useEffect(() => {
    notifiedIds.current.clear()
    isFirstSnapshot.current = true
  }, [user?.uid])
}

// ─── DND check (mirrors the one in main/ipc/notificationHandlers.ts) ─────────

function isDNDActive(dndStart: string, dndEnd: string): boolean {
  if (!dndStart || !dndEnd) return false
  const now = new Date()
  const current = now.getHours() * 60 + now.getMinutes()
  const [sh, sm] = dndStart.split(':').map(Number)
  const [eh, em] = dndEnd.split(':').map(Number)
  const start = sh * 60 + sm
  const end = eh * 60 + em
  if (start > end) return current >= start || current < end
  return current >= start && current < end
}
