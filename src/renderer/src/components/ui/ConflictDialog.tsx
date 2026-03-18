// src/renderer/src/components/ui/ConflictDialog.tsx
// Shown when two users edit the same field at the same time

import type { ConflictData } from '../../types'

interface Props {
  conflict: ConflictData
  onKeepMine: () => void
  onUseTheirs: () => void
}

const FIELD_LABELS: Record<string, string> = {
  title:      'Title',
  notes:      'Notes',
  status:     'Status',
  priority:   'Priority',
  bucket:     'Bucket',
  clientId:   'Client',
  awbs:       'Air Waybills',
  poNumber:   'P.O. / Order #',
  dateStart:  'Start Date',
  dateEnd:    'End Date',
  assignees:  'Assigned To',
  labelIds:   'Labels',
}

export default function ConflictDialog({ conflict, onKeepMine, onUseTheirs }: Props) {
  const fieldLabel = FIELD_LABELS[conflict.field] ?? conflict.field

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl dark:bg-gray-800 p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30 shrink-0">
            <svg className="h-5 w-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">Editing conflict</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Someone changed <span className="font-medium">{fieldLabel}</span> while you were editing.
            </p>
          </div>
        </div>

        {/* Values comparison */}
        <div className="space-y-2 mb-5">
          <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 dark:border-green-800/40 dark:bg-green-900/10">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-green-600 dark:text-green-400 mb-0.5">
              Your version
            </p>
            <p className="text-sm text-gray-800 dark:text-gray-200 break-words">{conflict.localValue || '(empty)'}</p>
          </div>
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 dark:border-blue-800/40 dark:bg-blue-900/10">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-0.5">
              Team version
            </p>
            <p className="text-sm text-gray-800 dark:text-gray-200 break-words">{conflict.remoteValue || '(empty)'}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onUseTheirs}
            className="flex-1 rounded-lg border border-gray-200 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
          >
            Use team version
          </button>
          <button
            onClick={onKeepMine}
            className="flex-1 rounded-lg bg-green-500 py-2 text-sm font-semibold text-white hover:bg-green-600 transition-colors"
          >
            Keep mine
          </button>
        </div>
      </div>
    </div>
  )
}
