// src/renderer/src/components/notifications/NotificationCenter.tsx
// Dropdown panel showing the user's notifications with mark-read actions

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, X } from 'lucide-react'
import { useNotificationStore } from '../../store/notificationStore'
import { useAuthStore } from '../../store/authStore'
import { markNotificationRead, markAllNotificationsRead } from '../../lib/firestore'
import { formatRelativeTime } from '../../utils/dateUtils'
import type { AppNotification } from '../../types'

interface Props {
  onClose: () => void
}

function notifIcon(type: AppNotification['type']): string {
  switch (type) {
    case 'assigned':         return '👤'
    case 'completed':        return '✅'
    case 'comment':          return '💬'
    case 'mentioned':        return '@'
    case 'reopened':         return '↩'
    case 'new_user_pending': return '👋'
    default:                 return '🔔'
  }
}

export default function NotificationCenter({ onClose }: Props) {
  const { notifications } = useNotificationStore()
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  // Close on Escape
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [onClose])

  // Auto mark-as-read after 2 seconds
  useEffect(() => {
    if (!user) return
    const hasUnread = notifications.some(n => !n.read)
    if (!hasUnread) return
    const timer = setTimeout(async () => {
      await markAllNotificationsRead(user.uid)
    }, 2000)
    return () => clearTimeout(timer)
  }, [user, notifications])

  async function handleClick(notif: AppNotification) {
    if (!notif.read) await markNotificationRead(notif.id)
    onClose()
    if (notif.taskId) {
      navigate(`/task/${notif.taskId}`)
    } else if (notif.type === 'new_user_pending') {
      navigate('/settings?tab=members')
    }
  }

  async function handleMarkAllRead() {
    if (!user) return
    await markAllNotificationsRead(user.uid)
  }

  return createPortal(
    <div
      ref={ref}
      className="fixed bottom-16 left-[232px] z-50 w-[420px] max-h-[520px] rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <span className="text-sm font-semibold text-gray-900 dark:text-white">Notifications</span>
        <div className="flex items-center gap-2">
          {notifications.some((n) => !n.read) && (
            <button
              onClick={handleMarkAllRead}
              title="Mark all as read"
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
            >
              <CheckCheck size={12} />
              All read
            </button>
          )}
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* List */}
      <div className="max-h-[440px] overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-gray-400 dark:text-gray-500">
            <Bell size={20} className="opacity-40" />
            <p className="text-xs">No notifications yet</p>
          </div>
        ) : (
          notifications.map((notif) => (
            <button
              key={notif.id}
              onClick={() => handleClick(notif)}
              className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/60 ${
                !notif.read ? 'bg-green-50/60 dark:bg-green-900/10' : ''
              }`}
            >
              <span className="text-base leading-none mt-0.5">{notifIcon(notif.type)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-800 dark:text-gray-200 leading-snug">
                  {notif.message}
                </p>
                {notif.taskTitle && (
                  <p className="mt-0.5 truncate text-[11px] text-green-600 dark:text-green-400 font-medium">
                    {notif.taskTitle}
                  </p>
                )}
                <p className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500">
                  {formatRelativeTime(notif.createdAt)}
                </p>
              </div>
              {!notif.read && (
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-green-500" />
              )}
            </button>
          ))
        )}
      </div>
    </div>,
    document.body
  )
}
