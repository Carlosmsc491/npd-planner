// src/renderer/src/components/ui/NewBoardModal.tsx
import { useState } from 'react'
import { Timestamp } from 'firebase/firestore'
import { createBoard } from '../../lib/firestore'
import { useAuthStore } from '../../store/authStore'
import type { BoardProperty, BoardView } from '../../types'

interface Props {
  onClose: () => void
}

const PRESET_COLORS = [
  '#1D9E75', '#378ADD', '#D4537E', '#F59E0B',
  '#8B5CF6', '#EC4899', '#14B8A6', '#F97316',
  '#EF4444', '#6B7280',
]

interface PropertyOption {
  id: string
  name: string
  icon: string
  type: BoardProperty['type']
  required: boolean
  defaultOn: boolean
}

const PROPERTY_OPTIONS: PropertyOption[] = [
  { id: 'builtin-client',    name: 'Client',      icon: 'User',          type: 'text',      required: true,  defaultOn: true },
  { id: 'builtin-status',    name: 'Status',      icon: 'CircleDot',     type: 'select',    required: false, defaultOn: true },
  { id: 'builtin-priority',  name: 'Priority',    icon: 'Zap',           type: 'select',    required: false, defaultOn: true },
  { id: 'builtin-date',      name: 'Date',        icon: 'CalendarRange', type: 'daterange', required: false, defaultOn: true },
  { id: 'builtin-assignees', name: 'Assigned To', icon: 'Users',         type: 'person',    required: false, defaultOn: true },
  { id: 'builtin-labels',    name: 'Labels',      icon: 'Tag',           type: 'tags',      required: false, defaultOn: true },
  { id: 'builtin-bucket',    name: 'Bucket',      icon: 'Layers',        type: 'select',    required: false, defaultOn: true },
  { id: 'builtin-awb',       name: 'AWB',         icon: 'Plane',         type: 'text',      required: false, defaultOn: false },
  { id: 'builtin-po',        name: 'P.O. Number', icon: 'Hash',          type: 'text',      required: false, defaultOn: false },
  { id: 'builtin-notes',     name: 'Notes',       icon: 'StickyNote',    type: 'text',      required: false, defaultOn: false },
]

const VIEW_OPTIONS: { value: BoardView; label: string }[] = [
  { value: 'cards',    label: 'Cards' },
  { value: 'list',     label: 'List' },
  { value: 'calendar', label: 'Calendar' },
  { value: 'gantt',    label: 'Timeline' },
]

export default function NewBoardModal({ onClose }: Props) {
  const { user } = useAuthStore()
  const [step, setStep] = useState<1 | 2>(1)
  const [name, setName] = useState('')
  const [color, setColor] = useState('#6B7280')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [selectedProps, setSelectedProps] = useState<Set<string>>(
    new Set(PROPERTY_OPTIONS.filter((p) => p.defaultOn).map((p) => p.id))
  )
  const [defaultView, setDefaultView] = useState<BoardView>('cards')

  function toggleProp(id: string, required: boolean) {
    if (required) return
    setSelectedProps((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleStep1(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Board name is required'); return }
    setError('')
    setStep(2)
  }

  async function handleCreate() {
    if (!user) return
    setSaving(true)
    try {
      const customProperties: BoardProperty[] = PROPERTY_OPTIONS
        .filter((p) => selectedProps.has(p.id))
        .map((p, i) => ({ id: p.id, name: p.name, icon: p.icon, type: p.type, order: i, required: p.required }))

      await createBoard({
        name: name.trim(),
        color,
        type: 'custom',
        order: 99,
        createdBy: user.uid,
        createdAt: Timestamp.now(),
        customProperties,
        defaultView,
      })
      onClose()
    } catch {
      setError('Failed to create board.')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl dark:bg-gray-800 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            {step === 2 && (
              <button onClick={() => setStep(1)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 mr-1">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <h3 className="text-base font-bold text-gray-900 dark:text-white">
              {step === 1 ? 'New Board' : 'Choose Properties'}
            </h3>
            <span className="text-xs text-gray-400">{step}/2</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {step === 1 ? (
          /* ── Step 1: Name + Color ── */
          <form onSubmit={handleStep1} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Board Name *</label>
              <input
                autoFocus
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Q2 Projects"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-green-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Color</label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`h-7 w-7 rounded-full transition-transform ${color === c ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : 'hover:scale-105'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={onClose}
                className="flex-1 rounded-lg border border-gray-200 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors">
                Cancel
              </button>
              <button type="submit"
                className="flex-1 rounded-lg bg-green-500 py-2 text-sm font-semibold text-white hover:bg-green-600 transition-colors">
                Next →
              </button>
            </div>
          </form>
        ) : (
          /* ── Step 2: Properties + Default View ── */
          <div className="space-y-4">
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">Select which properties to include in this board</p>
              <div className="space-y-1 max-h-52 overflow-y-auto pr-1">
                {PROPERTY_OPTIONS.map((p) => {
                  const checked = selectedProps.has(p.id)
                  return (
                    <label
                      key={p.id}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                        checked ? 'bg-green-50 dark:bg-green-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={p.required}
                        onChange={() => toggleProp(p.id, p.required)}
                        className="h-4 w-4 rounded border-gray-300 text-green-500 focus:ring-green-500 disabled:opacity-50"
                      />
                      <span className={`text-sm ${checked ? 'text-gray-900 dark:text-white font-medium' : 'text-gray-600 dark:text-gray-400'}`}>
                        {p.name}
                      </span>
                      {p.required && <span className="ml-auto text-[10px] text-gray-400">required</span>}
                    </label>
                  )
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Default View</label>
              <div className="flex gap-2">
                {VIEW_OPTIONS.map((v) => (
                  <button
                    key={v.value}
                    onClick={() => setDefaultView(v.value)}
                    className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors border ${
                      defaultView === v.value
                        ? 'bg-green-500 border-green-500 text-white'
                        : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setStep(1)}
                className="flex-1 rounded-lg border border-gray-200 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors">
                Back
              </button>
              <button onClick={handleCreate} disabled={saving}
                className="flex-1 rounded-lg bg-green-500 py-2 text-sm font-semibold text-white hover:bg-green-600 disabled:opacity-50 transition-colors">
                {saving ? 'Creating…' : 'Create Board'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
