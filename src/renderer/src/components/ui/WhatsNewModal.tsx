import { useState, useEffect } from 'react'
import {
  X, Calendar, Sparkles, Zap, Shield, GripVertical,
  type LucideIcon,
} from 'lucide-react'

const CURRENT_VERSION = '1.2.9'
const LS_KEY = `npd:whats_new_seen_${CURRENT_VERSION}`

interface Feature {
  icon: LucideIcon
  color: string
  title: string
  description: string
}

const FEATURES: Feature[] = [
  {
    icon: Calendar,
    color: '#378ADD',
    title: 'Event Date Tags',
    description:
      'Tasks now support typed date tags — Preparation, Ship, Set Up, and Show Day. ' +
      'Add them from the task panel under "Event Dates". Each tag has its own color and icon, ' +
      'with date pickers bounded to the task\'s start/end range. ' +
      'Out-of-range dates show a warning badge.',
  },
  {
    icon: Sparkles,
    color: '#8B5CF6',
    title: 'Calendar Marker View',
    description:
      'The Board Calendar and Master Calendar now display a single bar per task. ' +
      'Event date tags appear as colored marker dots positioned along the bar, ' +
      'showing exactly where each milestone falls within the task\'s timeline. ' +
      'Hover over any marker to see its type and date.',
  },
  {
    icon: Zap,
    color: '#F59E0B',
    title: 'Instant Updates',
    description:
      'All task changes now apply instantly — status, dates, assignees, properties, and event dates. ' +
      'The UI updates immediately while syncing to the server in the background, ' +
      'so the app feels fast and responsive even with slow connections.',
  },
  {
    icon: GripVertical,
    color: '#1D9E75',
    title: 'Board Properties Sync',
    description:
      'Custom properties added or removed in Board Settings now reflect immediately ' +
      'across the entire app — in task panels, board views, and the planner. ' +
      'No more needing to refresh to see changes.',
  },
  {
    icon: Shield,
    color: '#EF4444',
    title: 'Stability & Reliability',
    description:
      'Upgraded to Firebase 12 for better real-time sync stability. ' +
      'Fixed calendar date accuracy (end dates now display correctly). ' +
      'Resolved crashes when switching between pages.',
  },
]

export default function WhatsNewModal() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    try {
      if (!localStorage.getItem(LS_KEY)) {
        setOpen(true)
      }
    } catch { /* private browsing */ }
  }, [])

  function dismiss() {
    setOpen(false)
    try { localStorage.setItem(LS_KEY, '1') } catch { /* ignore */ }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-[520px] max-h-[85vh] overflow-hidden rounded-2xl bg-white dark:bg-gray-900 shadow-2xl flex flex-col animate-in fade-in zoom-in-95">
        {/* Close button */}
        <button
          onClick={dismiss}
          className="absolute top-4 right-4 z-10 h-8 w-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
        >
          <X size={16} />
        </button>

        {/* Header */}
        <div className="px-8 pt-8 pb-4 text-center shrink-0">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 shadow-lg">
            <Sparkles size={28} className="text-white" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            What's New in {CURRENT_VERSION}
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            NPD Planner just got a major update
          </p>
        </div>

        {/* Feature list */}
        <div className="flex-1 overflow-y-auto px-8 pb-2">
          <div className="space-y-4">
            {FEATURES.map((f, i) => {
              const Icon = f.icon
              return (
                <div
                  key={i}
                  className="flex gap-3.5 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-4"
                >
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: f.color + '20', color: f.color }}
                  >
                    <Icon size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {f.title}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
                      {f.description}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 px-8 py-5">
          <button
            onClick={dismiss}
            className="w-full rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:from-green-700 hover:to-emerald-700 transition-all"
          >
            Got it, let's go!
          </button>
        </div>
      </div>
    </div>
  )
}
