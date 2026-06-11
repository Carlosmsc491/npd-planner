import { useState, useEffect } from 'react'
import {
  X, Mail, FileText, Table2, FolderOpen, Printer, Wrench, Sparkles,
  type LucideIcon,
} from 'lucide-react'

const CURRENT_VERSION = '1.8.0'
const LS_KEY = `npd:whats_new_seen_${CURRENT_VERSION}`

interface Feature {
  icon: LucideIcon
  color: string
  title: string
  description: string
}

const FEATURES: Feature[] = [
  {
    icon: Mail,
    color: '#378ADD',
    title: 'Emails Render Clean — RTF Parser Rebuilt',
    description:
      'Outlook emails stored as RTF now convert to proper HTML: no more \\par tokens, ' +
      'no font lists ("Arial; Courier New;...") at the top, and smart quotes/apostrophes ' +
      'display correctly. Email card previews are clean text too.',
  },
  {
    icon: FileText,
    color: '#1D9E75',
    title: 'Task Fields Never Lose Your Text',
    description:
      'PO, AWB and Description now save reliably — closing the task right after typing ' +
      'flushes your changes instead of discarding them, and live updates from teammates ' +
      'no longer wipe what you are typing. Placeholders disappear as soon as you write.',
  },
  {
    icon: FolderOpen,
    color: '#F59E0B',
    title: 'No More Duplicate Attachments',
    description:
      'Files and emails attach exactly once: drops are guarded against double-firing, ' +
      're-attaching the same email is detected, and dropping a file now attaches that ' +
      'file directly instead of opening a file picker.',
  },
  {
    icon: Wrench,
    color: '#8B5CF6',
    title: 'Quieter, Smarter Updates',
    description:
      'Temporary network hiccups no longer show a red "Update check failed" banner — ' +
      'the app retries on its own. On Mac, the update banner now offers a Download ' +
      'button that takes you to the new version. Windows installs are deferred during ' +
      'system shutdown so an interrupted update can never break the app.',
  },
  {
    icon: Mail,
    color: '#8B5CF6',
    title: 'Reply & Forward — Choose Your Email App',
    description:
      'Reply and Forward now ask which Outlook you use: New Outlook, Classic Outlook, or ' +
      'default email app. Your choice is remembered. You can change it anytime from the ' +
      'bottom bar of any email. Body is trimmed to avoid Windows URL length limits.',
  },
  {
    icon: Table2,
    color: '#1D9E75',
    title: 'Tables in Task Description',
    description:
      'The description editor now supports tables. Click the table icon in the toolbar ' +
      'to insert a 3×3 table, then add/remove rows and columns from the inline menu. ' +
      'Pasting HTML tables from emails also works.',
  },
  {
    icon: FolderOpen,
    color: '#F59E0B',
    title: 'Open / Finder / Print on Every Attachment',
    description:
      'All file attachments — PDFs, images, Excel, Word — now show three action buttons: ' +
      'Open (default app), Finder/Explorer (reveal in folder), and Print. ' +
      'Buttons also appear inside the image lightbox, PDF preview, and email viewer.',
  },
  {
    icon: Mail,
    color: '#8B5CF6',
    title: 'Reply & Forward with Full Context',
    description:
      'Reply now opens your email client with the correct To: address and the full quoted ' +
      'original below your cursor. Forward includes a complete header block (From/Date/Subject/To) ' +
      'with the entire message — no more 500-character truncation.',
  },
  {
    icon: FileText,
    color: '#EF4444',
    title: 'Mac Compatibility Fixes',
    description:
      'Fixed a startup crash caused by the Outlook Add-in certificate generator on Mac. ' +
      'Fixed "process is not defined" error in SharePoint path handling. ' +
      'Auto-updater now works correctly on Mac (.dmg flow).',
  },
  {
    icon: Printer,
    color: '#1D9E75',
    title: 'Print Support',
    description:
      'Print any attached file directly from the task — PDFs, images, and Office documents ' +
      'open in their native print dialog with a single click.',
  },
  {
    icon: Wrench,
    color: '#6B7280',
    title: 'Bug Fixes',
    description:
      'Fixed app crash on first Mac launch (Outlook Add-in removed — was Windows-only). ' +
      'Fixed tasks not loading after app restart on Mac. ' +
      'Fixed SharePoint path sync overwriting Mac paths from Windows machines.',
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
