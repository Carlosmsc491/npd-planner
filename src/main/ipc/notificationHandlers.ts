// src/main/ipc/notificationHandlers.ts
// Desktop notification handlers — Electron Notification API
// IMPORTANT: Only Planner board tasks should trigger notifications
// Respect user's Do Not Disturb schedule

import { IpcMain, Notification } from 'electron'
import { IPC } from '../../shared/constants'

interface NotificationRequest {
  title: string
  body: string
  taskId: string
  boardType: string         // 'planner' | 'trips' | 'vacations' | 'custom'
  silent?: boolean          // true during DND hours
}

export function registerNotificationHandlers(ipcMain: IpcMain): void {

  ipcMain.on(IPC.NOTIFICATION_SEND, (_event, req: NotificationRequest) => {
    // Only Planner board tasks get desktop notifications
    if (req.boardType !== 'planner') return

    if (!Notification.isSupported()) return

    const notification = new Notification({
      title: req.title,
      body: req.body,
      silent: req.silent ?? false,
      timeoutType: 'default',
    })

    notification.on('click', () => {
      // Send taskId back to renderer to open the task
      _event.sender.send(IPC.NOTIFICATION_CLICKED, req.taskId)
    })

    notification.show()
  })
}

// ─────────────────────────────────────────
// DND CHECK UTILITY
// Called from renderer before sending notification
// ─────────────────────────────────────────

export function isWithinDNDHours(dndStart: string, dndEnd: string): boolean {
  if (!dndStart || !dndEnd) return false

  const now = new Date()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()

  const [startH, startM] = dndStart.split(':').map(Number)
  const [endH, endM] = dndEnd.split(':').map(Number)

  const startMinutes = startH * 60 + startM
  const endMinutes = endH * 60 + endM

  // Handle overnight DND (e.g., 22:00 → 08:00)
  if (startMinutes > endMinutes) {
    return currentMinutes >= startMinutes || currentMinutes < endMinutes
  }

  // Same-day DND (e.g., 12:00 → 14:00)
  return currentMinutes >= startMinutes && currentMinutes < endMinutes
}
