// src/renderer/src/components/ui/OneDriveTipModal.tsx
// Shown on app open until the user confirms they've pinned the planner folder
// offline. OneDrive "files-on-demand" placeholders make attachment/photo copies
// slow (or fail), so we nudge users to "Always keep on this device".

import { Cloud, FolderOpen, MousePointerClick, HardDriveDownload, CheckCircle2 } from 'lucide-react'

interface Props {
  /** User confirms they've done it — never show again on this machine. */
  onConfirm: () => void
  /** Dismiss for now — the tip returns on the next launch. */
  onLater: () => void
}

export default function OneDriveTipModal({ onConfirm, onLater }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 pt-6 pb-4">
          <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-blue-100 dark:bg-blue-900/30 shrink-0">
            <Cloud size={22} className="text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white leading-tight">
              Make NPD Planner faster
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              One quick setup for instant files
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 pb-2">
          <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-4">
            For better results and faster file access, pin the planner folder so it&apos;s
            always available offline:
          </p>

          <ol className="space-y-3">
            <li className="flex items-start gap-3">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#1D9E75] text-white text-xs font-bold shrink-0">1</span>
              <span className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed pt-0.5">
                <FolderOpen size={15} className="inline mb-0.5 mr-1 text-gray-400" />
                Open your SharePoint folder and go to{' '}
                <strong>NPD-SECURE&nbsp;›&nbsp;REPORTS</strong>
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#1D9E75] text-white text-xs font-bold shrink-0">2</span>
              <span className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed pt-0.5">
                <MousePointerClick size={15} className="inline mb-0.5 mr-1 text-gray-400" />
                Right-click the <strong>NPD PLANNER</strong> folder
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#1D9E75] text-white text-xs font-bold shrink-0">3</span>
              <span className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed pt-0.5">
                <HardDriveDownload size={15} className="inline mb-0.5 mr-1 text-gray-400" />
                Choose the OneDrive option{' '}
                <strong>
                  <Cloud size={14} className="inline mb-0.5 mr-0.5 text-blue-500" />
                  &ldquo;Always keep on this device&rdquo;
                </strong>
              </span>
            </li>
          </ol>

          <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3">
            <span className="text-base leading-none mt-0.5">💡</span>
            <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
              This keeps attachments and photos on your computer, so they open and copy
              instantly instead of downloading each time.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-6 py-5">
          <button
            onClick={onLater}
            className="flex-1 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 font-medium py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Maybe later
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-[#1D9E75] text-white font-semibold py-2.5 text-sm hover:bg-green-700 transition-colors"
          >
            <CheckCircle2 size={16} /> I already did this
          </button>
        </div>
      </div>
    </div>
  )
}
