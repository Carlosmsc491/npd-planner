import { useState } from 'react'
import { useBoardStore } from '../../store/boardStore'
import type { GroupByField } from '../../types'

const OPTIONS: { value: GroupByField; label: string }[] = [
  { value: 'bucket',   label: 'Bucket' },
  { value: 'client',   label: 'Client' },
  { value: 'assignee', label: 'Assigned To' },
  { value: 'date',     label: 'Date' },
  { value: 'status',   label: 'Status' },
  { value: 'priority', label: 'Priority' },
]

export default function GroupBySelector() {
  const { groupBy, setGroupBy } = useBoardStore()
  const [open, setOpen] = useState(false)
  const current = OPTIONS.find((o) => o.value === groupBy)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 transition-colors"
      >
        <span className="text-gray-400">Group:</span>
        <span>{current?.label}</span>
        <svg className="h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-20 mt-1 w-40 rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
            {OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { setGroupBy(opt.value); setOpen(false) }}
                className={`w-full px-3 py-2 text-left text-sm transition-colors first:rounded-t-xl last:rounded-b-xl ${
                  opt.value === groupBy
                    ? 'bg-green-50 text-green-700 font-medium dark:bg-green-900/20 dark:text-green-400'
                    : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
