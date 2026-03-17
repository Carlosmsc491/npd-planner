// src/renderer/src/store/notificationStore.ts
import { create } from 'zustand'
import type { AppNotification } from '../types'

interface NotificationState {
  notifications: AppNotification[]
  unreadCount: number
  setNotifications: (notifs: AppNotification[]) => void
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  unreadCount: 0,
  setNotifications: (notifications) =>
    set({ notifications, unreadCount: notifications.filter((n) => !n.read).length }),
}))
