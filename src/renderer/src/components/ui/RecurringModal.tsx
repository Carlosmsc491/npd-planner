import { useState } from 'react'
import type { Task, RecurringConfig, RecurringFrequency } from '../../types'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const FREQ_OPTIONS: { value: RecurringFrequency; label: string }[] = [
  { value: 'daily',   label: 'Every day' },
  { value: 'weekly',  label: 'Every week' },
  { value: 'monthly', label: 'Every month' },
  { value: 'yearly',  label: 'Every year' },
  { value: 'custom',  label: 'Custom (select days)' },
]

interface Props {
  task: Task
  onSave: (config: RecurringConfig) => void
  onClose: () => void
}

export default function RecurringModal({ task, onSave, onClose }: Props) {
  const existing = task.recurring
  const [freq, setFreq] = useState<RecurringFrequency>(existing?.frequency ?? 'weekly')
  const [customDays, setCustomDays] = useState<number[]>(existing?.customDays ?? [1])

  function toggleDay(day: number) {
    setCustomDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    )
  }

  function handleSave() {
    onSave({
      enabled: true,
      frequency: freq,
      customDays: freq === 'custom' ? customDays : null,
      nextDate: task.dateEnd ?? task.dateStart,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl dark:bg-gray-800 p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold text-gray-900 dark:text-white">Make Recurring</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-2 mb-4">
          {FREQ_OPTIONS.map((opt) => (
            <label key={opt.value} className="flex items-center gap-3 cursor-pointer rounded-xl p-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              <input
                type="radio"
                name="freq"
                value={opt.value}
                checked={freq === opt.value}
                onChange={() => setFreq(opt.value)}
                className="accent-green-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">{opt.label}</span>
            </label>
          ))}
        </div>

        {freq === 'custom' && (
          <div className="mb-4 flex gap-1.5 flex-wrap">
            {DAYS.map((d, i) => (
              <button
                key={i}
                onClick={() => toggleDay(i)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  customDays.includes(i)
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} className="rounded-lg bg-green-500 px-4 py-2 text-sm font-semibold text-white hover:bg-green-600 transition-colors">
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
