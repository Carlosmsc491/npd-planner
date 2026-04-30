import { useState, useEffect } from 'react'
import {
  X, Sparkles, CalendarDays, Filter, EyeOff, Flag, Sun,
  type LucideIcon,
} from 'lucide-react'

const CURRENT_VERSION = '1.5.0'
const LS_KEY = `npd:whats_new_seen_${CURRENT_VERSION}`

interface Feature {
  icon: LucideIcon
  color: string
  title: string
  description: string
}

const FEATURES: Feature[] = [
  {
    icon: CalendarDays,
    color: '#1D9E75',
    title: 'Event Dates as Calendar Bars',
    description:
      'Task dates (Preparation, Ship, Set Up, Show Day) now appear as independent colored bars ' +
      'in the calendar — grouped directly below their parent task bar. Each bar shows the date type ' +
      'icon, label, and parent task name. Drag the parent task to reschedule; event date bars follow automatically.',
  },
  {
    icon: Filter,
    color: '#378ADD',
    title: 'Bucket & Task Filters on Calendars',
    description:
      'Both the Master Calendar and each board calendar now have filter dropdowns. ' +
      'Filter by Bucket to focus on a specific group, or search and select individual tasks. ' +
      'Active filters show a count badge and a Clear button. Filters are independent per calendar.',
  },
  {
    icon: EyeOff,
    color: '#F59E0B',
    title: 'Hide Event Dates Toggle',
    description:
      'Use the "Hide Event Dates" button on any calendar to collapse all date-type sub-bars ' +
      'and show only the main task bars. Toggle back on with "Show Event Dates". ' +
      'Useful when you want a cleaner view without the detailed breakdown.',
  },
  {
    icon: Flag,
    color: '#EF4444',
    title: 'US Holidays on Calendars',
    description:
      'Enable the "US Holidays" button to display all US federal and cultural holidays ' +
      'as red-bordered bars on every calendar view. Includes New Year\'s, MLK Day, Memorial Day, ' +
      'Independence Day, Thanksgiving, Christmas, Valentine\'s Day, Mother\'s Day, and more.',
  },
  {
    icon: Sun,
    color: '#8B5CF6',
    title: 'Weekend & Holiday Cell Highlighting',
    description:
      'Saturday and Sunday cells are now slightly darker than weekdays, making the work week ' +
      'easier to scan at a glance. Holiday dates also get a subtle red tint when holidays are enabled. ' +
      'Both styles work in light and dark mode.',
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
