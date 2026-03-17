// src/renderer/src/components/notifications/NotificationBell.tsx
// Bell icon with unread badge — sits in the sidebar footer

import { useState } from 'react'
import { Bell } from 'lucide-react'
import { useNotificationStore } from '../../store/notificationStore'
import NotificationCenter from './NotificationCenter'

export default function NotificationBell() {
  const { unreadCount } = useNotificationStore()
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Notifications"
        className="flex items-center gap-2 w-full rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700/50 dark:hover:text-gray-200 transition-colors"
      >
        <div className="relative">
          <Bell size={15} />
          {unreadCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-green-500 text-[9px] font-bold text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </div>
        <span>Notifications</span>
        {unreadCount > 0 && (
          <span className="ml-auto rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700 dark:bg-green-900/40 dark:text-green-400">
            {unreadCount}
          </span>
        )}
      </button>

      {open && <NotificationCenter onClose={() => setOpen(false)} />}
    </div>
  )
}
