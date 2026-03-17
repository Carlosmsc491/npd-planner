// src/renderer/src/components/ui/NewBoardModal.tsx
import { useState } from 'react'
import { Timestamp } from 'firebase/firestore'
import { createBoard } from '../../lib/firestore'
import { useAuthStore } from '../../store/authStore'

interface Props {
  onClose: () => void
}

const PRESET_COLORS = [
  '#1D9E75', '#378ADD', '#D4537E', '#F59E0B',
  '#8B5CF6', '#EC4899', '#14B8A6', '#F97316',
  '#EF4444', '#6B7280',
]

export default function NewBoardModal({ onClose }: Props) {
  const { user } = useAuthStore()
  const [name, setName] = useState('')
  const [color, setColor] = useState('#6B7280')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Board name is required'); return }
    if (!user) return
    setSaving(true)
    try {
      await createBoard({
        name: name.trim(),
        color,
        type: 'custom',
        order: 99,
        createdBy: user.uid,
        createdAt: Timestamp.now(),
      })
      onClose()
    } catch {
      setError('Failed to create board.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl dark:bg-gray-800 p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold text-gray-900 dark:text-white">New Board</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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
            <button type="submit" disabled={saving}
              className="flex-1 rounded-lg bg-green-500 py-2 text-sm font-semibold text-white hover:bg-green-600 disabled:opacity-50 transition-colors">
              {saving ? 'Creating…' : 'Create Board'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
