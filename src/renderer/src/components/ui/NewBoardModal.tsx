// src/renderer/src/components/ui/NewBoardModal.tsx
import { useState } from 'react'
import { Timestamp } from 'firebase/firestore'
import {
  LayoutDashboard, CheckSquare, Plane, Package,
  Truck, Camera, Users, Calendar, Star, Folder, ShoppingCart,
  FileText, Zap, Globe, Briefcase, Heart, Flag, Coffee, Box, Layers,
  type LucideIcon,
} from 'lucide-react'
import { createBoard } from '../../lib/firestore'
import { useAuthStore } from '../../store/authStore'
import { getDefaultBoardProperties } from '../../lib/boardProperties'
import TemplateBuilder from '../settings/TemplateBuilder'
import type { BoardProperty, BoardView } from '../../types'

interface Props {
  onClose: () => void
}

const PRESET_COLORS = [
  '#1D9E75', '#378ADD', '#D4537E', '#F59E0B', '#8B5CF6',
  '#EC4899', '#14B8A6', '#F97316', '#EF4444', '#6B7280',
  '#0EA5E9', '#84CC16', '#F43F5E', '#A855F7', '#10B981',
]

const BOARD_ICONS: Record<string, LucideIcon> = {
  LayoutDashboard, CheckSquare, Plane, Package,
  Truck, Camera, Users, Calendar, Star, Folder, ShoppingCart,
  FileText, Zap, Globe, Briefcase, Heart, Flag, Coffee, Box, Layers,
}

const VIEW_OPTIONS: { value: BoardView; label: string }[] = [
  { value: 'cards',    label: 'Cards' },
  { value: 'list',     label: 'List' },
  { value: 'calendar', label: 'Calendar' },
  { value: 'gantt',    label: 'Timeline' },
]

export default function NewBoardModal({ onClose }: Props) {
  const { user } = useAuthStore()
  const isOwner = user?.role === 'owner'
  const [step, setStep] = useState<1 | 2>(1)
  const [name, setName] = useState('')
  const [color, setColor] = useState('#1D9E75')
  const [icon, setIcon] = useState('LayoutDashboard')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  // Full template the user can build (fields + sections), starts from the custom default
  const [properties, setProperties] = useState<BoardProperty[]>(() => getDefaultBoardProperties('custom'))
  const [defaultView, setDefaultView] = useState<BoardView>('cards')

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
      await createBoard({
        name: name.trim(),
        color,
        icon,
        type: 'custom',
        order: 99,
        createdBy: user.uid,
        createdAt: Timestamp.now(),
        customProperties: properties.map((p, i) => ({ ...p, order: i })),
        defaultView,
      })
      onClose()
    } catch {
      setError('Failed to create board.')
      setSaving(false)
    }
  }

  const PreviewIcon = BOARD_ICONS[icon] ?? LayoutDashboard

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className={`w-full rounded-2xl bg-white shadow-2xl dark:bg-gray-800 p-6 max-h-[90vh] overflow-y-auto ${step === 1 ? 'max-w-sm' : 'max-w-2xl'}`}>
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
              {step === 1 ? 'New Board' : 'Build the template'}
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
          /* ── Step 1: Name + Color + Icon ── */
          <form onSubmit={handleStep1} className="space-y-4">
            <div className="flex items-center gap-2.5 rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 px-3 py-2.5">
              <PreviewIcon size={18} style={{ color }} strokeWidth={2} />
              <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {name.trim() || 'Board name…'}
              </span>
            </div>

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

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Icon</label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(BOARD_ICONS).map(([n, Icon]) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setIcon(n)}
                    title={n}
                    className={`h-8 w-8 flex items-center justify-center rounded-lg border-2 transition-colors ${
                      icon === n
                        ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                        : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                    }`}
                  >
                    <Icon size={15} style={{ color }} strokeWidth={2} />
                  </button>
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
          /* ── Step 2: Full template builder ── */
          <div className="space-y-5">
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Add, rename, reorder and group the properties for this board. You can change all of this later in Settings.
            </p>

            <TemplateBuilder properties={properties} onChange={setProperties} isOwner={isOwner} />

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
