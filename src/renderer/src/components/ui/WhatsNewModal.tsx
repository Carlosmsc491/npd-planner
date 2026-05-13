import { useState, useEffect } from 'react'
import {
  X, Wrench,
  Image, Lock, Eye, ArrowDownToLine,
  type LucideIcon,
} from 'lucide-react'

const CURRENT_VERSION = '1.7.0'
const LS_KEY = `npd:whats_new_seen_${CURRENT_VERSION}`

interface Fix {
  icon: LucideIcon
  color: string
  title: string
  description: string
}

const FIXES: Fix[] = [
  {
    icon: Wrench,
    color: '#1D9E75',
    title: 'Capture no longer gets stuck',
    description:
      'The "Saving photo…" spinner used to freeze when Firestore quota was hit or the file was large. ' +
      'File copy and Firestore writes are now non-blocking — the shutter is always ready for the next shot.',
  },
  {
    icon: Image,
    color: '#F59E0B',
    title: 'READY tab: white background JPG',
    description:
      'Dropping a transparent PNG into the READY tab now produces a JPG with a white background. ' +
      'Previously the transparent areas were filled with black.',
  },
  {
    icon: Image,
    color: '#1D9E75',
    title: 'Photos are now portable',
    description:
      'Each project folder now contains a manifest per recipe under _project/photos/. ' +
      'No more path mismatches: any team member on any machine sees the photos as long as the project folder syncs via OneDrive — ' +
      'no SharePoint setup or manual re-linking needed.',
  },
  {
    icon: ArrowDownToLine,
    color: '#378ADD',
    title: 'Auto-migration of existing projects',
    description:
      'The first time you open the Photo Manager for an existing project, the app copies your captured-photo metadata ' +
      'from Firestore into the new manifest format. One-time, automatic, and idempotent — nothing for you to do.',
  },
  {
    icon: Eye,
    color: '#F59E0B',
    title: 'Read-only access for non-photographers',
    description:
      'Only owners and photographers can capture, mark candidates, drop cleaned PNGs and promote to READY. ' +
      'Other team members see CAMERA / SELECTED / CLEANED tabs read-only and use READY to download, ZIP or insert into Excel.',
  },
  {
    icon: Lock,
    color: '#8B5CF6',
    title: 'Excel insert lock',
    description:
      'Inserting the JPG into an Excel workbook now acquires a cross-machine lock. ' +
      'If a teammate is already running the insert on that recipe, you see "In progress (their name)" and the button stays disabled ' +
      'so two users can no longer corrupt the same file at the same time.',
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
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg">
            <Wrench size={26} className="text-white" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            What&apos;s New in {CURRENT_VERSION}
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Portable photos, role-based access & cross-machine insert lock
          </p>
        </div>

        {/* Fix list */}
        <div className="flex-1 overflow-y-auto px-8 pb-2">
          <div className="space-y-4">
            {FIXES.map((f, i) => {
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
            className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:from-blue-700 hover:to-indigo-700 transition-all"
          >
            Got it, let&apos;s go!
          </button>
        </div>
      </div>
    </div>
  )
}
