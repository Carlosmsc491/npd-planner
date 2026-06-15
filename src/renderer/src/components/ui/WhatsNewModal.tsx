import { useState, useEffect } from 'react'
import {
  X, FileText, FolderOpen, Sparkles, LayoutGrid, Table2, Bell, Layers,
  type LucideIcon,
} from 'lucide-react'

const CURRENT_VERSION = '1.9.0'
const LS_KEY = `npd:whats_new_seen_${CURRENT_VERSION}`

interface Feature {
  icon: LucideIcon
  color: string
  title: string
  description: string
}

const FEATURES: Feature[] = [
  {
    icon: LayoutGrid,
    color: '#1D9E75',
    title: 'Build Any Board From Scratch',
    description:
      'New Board now opens a blank template builder — add your own fields and sections, ' +
      'rename and drag to reorder, and shape the New Task form however your team works. ' +
      'No code, no presets you can\'t change.',
  },
  {
    icon: Table2,
    color: '#378ADD',
    title: 'Smart Fields — Columns, Calendar & Grouping',
    description:
      'Add Bucket, Status, Priority, Date, Assignees or Labels to ANY board from the ' +
      '"Smart fields" picker. Bucket powers the board columns, Date powers the calendar & ' +
      'timeline, and Group By works off all of them.',
  },
  {
    icon: Layers,
    color: '#8B5CF6',
    title: 'Sections & New Field Types',
    description:
      'Group fields under section headings (drag them anywhere). New property types: ' +
      'Rich Text, Multiple Dates and Follow-ups — add them to any board. Description, ' +
      'Event Dates, Follow-ups and Attachments are now reorderable/hideable too.',
  },
  {
    icon: FolderOpen,
    color: '#F59E0B',
    title: 'Every Board Knows Where Files Go',
    description:
      'Attachments, emails and reports from non-Planner boards now save under ' +
      '{year}/{Board}/{task} on SharePoint instead of an "Unknown" folder. Planner keeps ' +
      'its client-based layout.',
  },
  {
    icon: Bell,
    color: '#EF4444',
    title: 'Per-Board Notifications',
    description:
      'Desktop notifications are no longer Planner-only. Each board has a toggle in its ' +
      'settings to notify assignees on assignment, changes, completion and @mentions.',
  },
  {
    icon: Sparkles,
    color: '#14B8A6',
    title: 'Quick Board Settings',
    description:
      'Every board has a ⚙️ Settings button in its top bar that jumps straight to its ' +
      'template editor — add or remove buckets, fields and sections in one click.',
  },
  {
    icon: FileText,
    color: '#6B7280',
    title: 'Cleanups',
    description:
      'Files and Emails are merged into one "Attachments" section, Subtasks removed, and ' +
      'creating a task now requires a bucket so nothing lands uncategorized.',
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
