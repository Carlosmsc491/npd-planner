import { useState, useEffect } from 'react'
import {
  X, Wrench, FolderSymlink, MapPin, ShieldCheck, MonitorCheck,
  type LucideIcon,
} from 'lucide-react'

const CURRENT_VERSION = '1.6.1'
const LS_KEY = `npd:whats_new_seen_${CURRENT_VERSION}`

interface Fix {
  icon: LucideIcon
  color: string
  title: string
  description: string
}

const FIXES: Fix[] = [
  {
    icon: FolderSymlink,
    color: '#1D9E75',
    title: 'Portable Project Folders',
    description:
      'Project folders are now stored as library-relative paths instead of absolute machine paths. ' +
      'Opening a project created on another computer — or on a different OS — resolves correctly ' +
      'to each user\'s local OneDrive folder without any manual adjustments.',
  },
  {
    icon: MapPin,
    color: '#378ADD',
    title: 'Friendly Location Display',
    description:
      'The Location column in the project list now shows a readable breadcrumb ' +
      '(e.g. "NPD-SECURE / IFPA 2026") instead of a raw file-system path. ' +
      'Works for both new and legacy projects created on any machine.',
  },
  {
    icon: ShieldCheck,
    color: '#8B5CF6',
    title: 'Cross-Platform Path Resolution',
    description:
      'Fixed a bug where the SharePoint path saved on one operating system ' +
      '(Mac or Windows) was being applied on the other, causing projects to appear ' +
      'missing. Each machine now uses its own locally-stored path.',
  },
  {
    icon: MonitorCheck,
    color: '#F59E0B',
    title: 'Smarter Folder Not Found Message',
    description:
      'When a project folder cannot be located on the current machine, the app now ' +
      'shows a clear, non-alarming message with the expected location path and a quick ' +
      'link to update the folder — instead of an abrupt error.',
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
            Improvements in {CURRENT_VERSION}
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Bug fixes and reliability improvements
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
            Got it, let's go!
          </button>
        </div>
      </div>
    </div>
  )
}
