// CaptureWarningModal.tsx — shown before navigating to CapturePage when recipe has active notes

import { AlertTriangle } from 'lucide-react'
import type { RecipeNote } from '../../types'

interface Props {
  recipeName: string
  activeNotes: RecipeNote[]
  onFixLater: () => void          // navigate anyway, keep notes active
  onFixNow: () => Promise<void>   // resolve all notes, then navigate
}

export default function CaptureWarningModal({ recipeName, activeNotes, onFixLater, onFixNow }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
    >
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
          <AlertTriangle size={18} className="text-amber-500 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              Active Notes — {recipeName}
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
              Review before shooting
            </p>
          </div>
        </div>

        {/* Notes list */}
        <div className="px-5 py-4 space-y-2 max-h-56 overflow-y-auto">
          {activeNotes.map((note) => (
            <div
              key={note.id}
              className="rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/10 px-3 py-2"
            >
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-0.5">
                {note.authorName}
              </p>
              <p className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-snug">
                {note.text}
              </p>
            </div>
          ))}
        </div>

        {/* Footer — Fix Later is the visually prominent (blue) button */}
        <div className="px-5 pb-5 flex flex-col gap-2">
          <button
            onClick={onFixLater}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            I'll Fix Later — Continue Shooting
          </button>
          <button
            onClick={onFixNow}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            Fix Now — Mark All Notes Resolved
          </button>
        </div>
      </div>
    </div>
  )
}
