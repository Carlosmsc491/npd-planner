// src/renderer/src/components/ui/WhatYouMissedModal.tsx
// Session-once modal shown on app open: unread notifs, upcoming tasks, AWB arrivals.

import { useMemo, useCallback } from 'react'
import { Bell, CalendarDays, AlertTriangle, Plane, X, CheckCircle2 } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useTaskStore } from '../../store/taskStore'
import { useNotificationStore } from '../../store/notificationStore'
import { updateLastSeen } from '../../lib/firestore'
import type { Task, AppNotification, AwbEntry } from '../../types'

interface Props {
  onClose: () => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysBetween(a: Date, b: Date) {
  return Math.ceil((b.getTime() - a.getTime()) / 86_400_000)
}

function fmt(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtTime(date: Date) {
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function greetingFor(name: string) {
  const h = new Date().getHours()
  if (h < 12) return `Good morning, ${name.split(' ')[0]} 👋`
  if (h < 18) return `Good afternoon, ${name.split(' ')[0]} 👋`
  return `Good evening, ${name.split(' ')[0]} 👋`
}

// notification type → readable label
const NOTIF_TYPE_LABEL: Record<string, string> = {
  assigned:  'Assigned you to a task',
  updated:   'Updated a task',
  completed: 'Completed a task',
  comment:   'Left a comment',
  mentioned: 'Mentioned you',
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function WhatYouMissedModal({ onClose }: Props) {
  const { user } = useAuthStore()
  const { tasks } = useTaskStore()
  const { notifications } = useNotificationStore()

  const lastSeen = useMemo(() => user?.lastSeen?.toDate() ?? null, [user])
  const now = useMemo(() => new Date(), [])
  const in7Days = useMemo(() => new Date(now.getTime() + 7 * 86_400_000), [now])

  // ── Unread notifications since lastSeen ──────────────────────────────────
  const unreadNotifs = useMemo<AppNotification[]>(() => {
    return notifications
      .filter((n) => {
        if (n.read) return false
        if (!lastSeen) return true
        const createdAt = n.createdAt?.toDate?.()
        return createdAt ? createdAt > lastSeen : true
      })
      .slice(0, 8)
  }, [notifications, lastSeen])

  // ── Upcoming tasks in 7 days (assigned to me) ────────────────────────────
  const upcomingTasks = useMemo<Task[]>(() => {
    if (!user) return []
    return tasks
      .filter((t) => {
        if (t.completed) return false
        if (!t.dateEnd) return false
        if (!t.assignees.includes(user.uid)) return false
        const due = t.dateEnd.toDate()
        return due >= now && due <= in7Days
      })
      .sort((a, b) => {
        const da = a.dateEnd!.toDate().getTime()
        const db = b.dateEnd!.toDate().getTime()
        return da - db
      })
      .slice(0, 8)
  }, [tasks, user, now, in7Days])

  // ── High priority tasks (assigned to me, not completed) ──────────────────
  const urgentTasks = useMemo<Task[]>(() => {
    if (!user) return []
    return tasks
      .filter((t) => !t.completed && t.priority === 'high' && t.assignees.includes(user.uid))
      .slice(0, 5)
  }, [tasks, user])

  // ── AWB arrivals in next 7 days ──────────────────────────────────────────
  interface AwbArrival {
    taskTitle: string
    awb: AwbEntry
    etaDate: Date
    daysOut: number
    hasAta: boolean
  }
  const awbArrivals = useMemo<AwbArrival[]>(() => {
    const arrivals: AwbArrival[] = []
    tasks.forEach((t) => {
      if (t.completed || !t.awbs?.length) return
      t.awbs.forEach((awb) => {
        if (!awb.eta) return
        // parse "MM/DD/YYYY"
        const [m, d, y] = awb.eta.split('/').map(Number)
        if (!m || !d || !y) return
        const etaDate = new Date(y, m - 1, d)
        const daysOut = daysBetween(now, etaDate)
        if (daysOut >= -1 && daysOut <= 7) {
          arrivals.push({ taskTitle: t.title, awb, etaDate, daysOut, hasAta: !!awb.ata })
        }
      })
    })
    return arrivals.sort((a, b) => a.etaDate.getTime() - b.etaDate.getTime()).slice(0, 8)
  }, [tasks, now])

  const isEmpty = unreadNotifs.length === 0 && upcomingTasks.length === 0 && urgentTasks.length === 0 && awbArrivals.length === 0

  const handleClose = useCallback(() => {
    if (user) void updateLastSeen(user.uid)
    onClose()
  }, [user, onClose])

  if (!user) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-700 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{greetingFor(user.name)}</h2>
            {lastSeen && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                Here's what happened since {fmtTime(lastSeen)}
              </p>
            )}
          </div>
          <button
            onClick={handleClose}
            className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

          {isEmpty && (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-500">
              <CheckCircle2 size={40} className="mb-3 text-green-400" />
              <p className="font-medium text-gray-600 dark:text-gray-300">You're all caught up!</p>
              <p className="text-sm mt-1">No new notifications or upcoming tasks.</p>
            </div>
          )}

          {/* Unread notifications */}
          {unreadNotifs.length > 0 && (
            <Section icon={<Bell size={16} className="text-amber-500" />} title="Notifications" count={unreadNotifs.length}>
              <div className="space-y-2">
                {unreadNotifs.map((n) => (
                  <div key={n.id} className="flex items-start gap-3 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800/20 px-3 py-2.5">
                    <div className="w-2 h-2 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm text-gray-800 dark:text-gray-200 leading-snug">{n.message}</p>
                      {n.type && (
                        <p className="text-xs text-gray-400 mt-0.5">{NOTIF_TYPE_LABEL[n.type] ?? n.type}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Upcoming tasks */}
          {upcomingTasks.length > 0 && (
            <Section icon={<CalendarDays size={16} className="text-blue-500" />} title="Due in the next 7 days" count={upcomingTasks.length}>
              <div className="space-y-2">
                {upcomingTasks.map((t) => {
                  const due = t.dateEnd!.toDate()
                  const days = daysBetween(now, due)
                  const overdue = days < 0
                  return (
                    <div key={t.id} className="flex items-center gap-3 rounded-xl bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/20 px-3 py-2.5">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${overdue ? 'bg-red-400' : days === 0 ? 'bg-orange-400' : 'bg-blue-400'}`} />
                      <p className="text-sm text-gray-800 dark:text-gray-200 flex-1 min-w-0 truncate">{t.title}</p>
                      <span className={`text-xs font-medium shrink-0 ${overdue ? 'text-red-500' : days === 0 ? 'text-orange-500' : 'text-blue-500'}`}>
                        {overdue ? `${Math.abs(days)}d overdue` : days === 0 ? 'Today' : `${fmt(due)}`}
                      </span>
                    </div>
                  )
                })}
              </div>
            </Section>
          )}

          {/* Urgent tasks */}
          {urgentTasks.length > 0 && (
            <Section icon={<AlertTriangle size={16} className="text-red-500" />} title="High priority" count={urgentTasks.length}>
              <div className="space-y-2">
                {urgentTasks.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-800/20 px-3 py-2.5">
                    <div className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
                    <p className="text-sm text-gray-800 dark:text-gray-200 flex-1 min-w-0 truncate">{t.title}</p>
                    {t.dateEnd && (
                      <span className="text-xs text-gray-400 shrink-0">{fmt(t.dateEnd.toDate())}</span>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* AWB arrivals */}
          {awbArrivals.length > 0 && (
            <Section icon={<Plane size={16} className="text-green-600" />} title="Flight arrivals" count={awbArrivals.length}>
              <div className="space-y-2">
                {awbArrivals.map((a, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-xl bg-green-50 dark:bg-green-900/10 border border-green-100 dark:border-green-800/20 px-3 py-2.5">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${a.hasAta ? 'bg-green-400' : 'bg-green-500'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 dark:text-gray-200 truncate">{a.taskTitle}</p>
                      <p className="text-xs text-gray-400 mt-0.5">AWB {a.awb.number}{a.awb.carrier ? ` · ${a.awb.carrier}` : ''}</p>
                    </div>
                    <div className="text-right shrink-0">
                      {a.hasAta ? (
                        <span className="text-xs font-medium text-green-600">Arrived</span>
                      ) : (
                        <span className={`text-xs font-medium ${a.daysOut === 0 ? 'text-orange-500' : 'text-green-600'}`}>
                          {a.daysOut === 0 ? 'Today' : a.daysOut < 0 ? `${Math.abs(a.daysOut)}d late` : fmt(a.etaDate)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 shrink-0">
          <button
            onClick={handleClose}
            className="w-full rounded-xl bg-[#1D9E75] text-white font-semibold py-2.5 text-sm hover:bg-green-700 transition-colors"
          >
            Let's go
          </button>
        </div>

      </div>
    </div>
  )
}

// ─── Section wrapper ─────────────────────────────────────────────────────────

function Section({
  icon, title, count, children,
}: {
  icon: React.ReactNode
  title: string
  count: number
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{title}</span>
        <span className="ml-auto text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 rounded-full px-2 py-0.5">{count}</span>
      </div>
      {children}
    </div>
  )
}
