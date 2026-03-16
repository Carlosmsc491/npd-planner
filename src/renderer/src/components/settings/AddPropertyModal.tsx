import { useState } from 'react'
import { X } from 'lucide-react'
import { DynamicIcon, PROPERTY_TYPE_LABELS, DEFAULT_ICONS, OPTION_COLORS } from '../../utils/propertyUtils'
import IconPickerPopover from './IconPickerPopover'
import type { PropertyType, BoardProperty, SelectOption } from '../../types'

const PROPERTY_TYPES: PropertyType[] = [
  'text', 'number', 'select', 'multiselect', 'date', 'daterange',
  'person', 'checkbox', 'url', 'attachment', 'tags', 'email', 'phone',
]
const NEEDS_OPTIONS: PropertyType[] = ['select', 'multiselect', 'tags']

interface Props {
  onAdd: (property: Omit<BoardProperty, 'id' | 'order'>) => void
  onClose: () => void
}

export default function AddPropertyModal({ onAdd, onClose }: Props) {
  const [name, setName]             = useState('')
  const [type, setType]             = useState<PropertyType>('text')
  const [icon, setIcon]             = useState(DEFAULT_ICONS.text)
  const [options, setOptions]       = useState<SelectOption[]>([])
  const [newOption, setNewOption]   = useState('')
  const [iconOpen, setIconOpen]     = useState(false)

  function handleTypeChange(t: PropertyType) {
    setType(t)
    setIcon(DEFAULT_ICONS[t])
  }

  function addOption() {
    if (!newOption.trim()) return
    const color = OPTION_COLORS[options.length % OPTION_COLORS.length]
    setOptions([...options, { id: crypto.randomUUID(), label: newOption.trim(), color }])
    setNewOption('')
  }

  function handleSubmit() {
    if (!name.trim()) return
    onAdd({
      name: name.trim(),
      type,
      icon,
      options: NEEDS_OPTIONS.includes(type) ? options : undefined,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl dark:bg-gray-800 p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold text-gray-900 dark:text-white">Add Property</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          {/* Name + Icon */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Property Name *
            </label>
            <div className="flex items-center gap-2">
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setIconOpen((v) => !v)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600 transition-colors"
                >
                  <DynamicIcon name={icon} size={16} />
                </button>
                {iconOpen && (
                  <IconPickerPopover
                    onSelect={(n) => { setIcon(n); setIconOpen(false) }}
                    onClose={() => setIconOpen(false)}
                  />
                )}
              </div>
              <input
                autoFocus
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
                placeholder="e.g. Farm Name, Flight #, Hotel…"
                className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-green-500"
              />
            </div>
          </div>

          {/* Type */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
            <select
              value={type}
              onChange={(e) => handleTypeChange(e.target.value as PropertyType)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-green-500"
            >
              {PROPERTY_TYPES.map((t) => (
                <option key={t} value={t}>{PROPERTY_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>

          {/* Options for select/multiselect/tags */}
          {NEEDS_OPTIONS.includes(type) && (
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Options</label>
              <div className="space-y-1.5 mb-2 max-h-36 overflow-y-auto">
                {options.map((opt) => (
                  <div key={opt.id} className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: opt.color }} />
                    <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">{opt.label}</span>
                    <button
                      type="button"
                      onClick={() => setOptions(options.filter((o) => o.id !== opt.id))}
                      className="text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newOption}
                  onChange={(e) => setNewOption(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOption() } }}
                  placeholder="Add option…"
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-green-500"
                />
                <button
                  type="button"
                  onClick={addOption}
                  className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Add
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-200 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!name.trim()}
            className="flex-1 rounded-lg bg-green-500 py-2 text-sm font-semibold text-white hover:bg-green-600 disabled:opacity-50 transition-colors"
          >
            Add Property
          </button>
        </div>
      </div>
    </div>
  )
}
