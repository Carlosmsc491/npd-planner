// src/renderer/src/components/settings/DateTypeManager.tsx
// Admin panel to manage date types: create, edit, delete with icon/color picker

import { useState } from 'react'
import {
  createDateType,
  updateDateType,
  deleteDateType,
} from '../../lib/firestore'
import { Plus, Edit2, Check, X, Trash2, AlertTriangle, Hammer, Truck, Wrench, Star, Calendar, Package, MapPin, Flag, Clock, Zap } from 'lucide-react'
import { useDateTypeStore } from '../../store/dateTypeStore'
import type { DateType } from '../../types'

// Available icons for date types
const AVAILABLE_ICONS = [
  { name: 'Hammer',   label: 'Hammer',   Icon: Hammer },
  { name: 'Truck',    label: 'Truck',    Icon: Truck },
  { name: 'Wrench',   label: 'Wrench',   Icon: Wrench },
  { name: 'Star',     label: 'Star',     Icon: Star },
  { name: 'Calendar', label: 'Calendar', Icon: Calendar },
  { name: 'Package',  label: 'Package',  Icon: Package },
  { name: 'MapPin',   label: 'Map Pin',  Icon: MapPin },
  { name: 'Flag',     label: 'Flag',     Icon: Flag },
  { name: 'Clock',    label: 'Clock',    Icon: Clock },
  { name: 'Zap',      label: 'Zap',      Icon: Zap },
]

// Preset colors for the color picker
const PRESET_COLORS = [
  '#639922', // Green (Preparation)
  '#185FA5', // Blue (Ship)
  '#534AB7', // Purple (Set up)
  '#BA7517', // Amber (Show day)
  '#EF4444', // Red
  '#F97316', // Orange
  '#F59E0B', // Amber
  '#84CC16', // Lime
  '#22C55E', // Green
  '#10B981', // Emerald
  '#14B8A6', // Teal
  '#06B6D4', // Cyan
  '#0EA5E9', // Sky
  '#3B82F6', // Blue
  '#6366F1', // Indigo
  '#8B5CF6', // Violet
  '#A855F7', // Purple
  '#D946EF', // Fuchsia
  '#EC4899', // Pink
  '#F43F5E', // Rose
  '#6B7280', // Gray
]

// Validate hex color
function isValidHex(color: string): boolean {
  return /^#([A-Fa-f0-9]{6})$/.test(color)
}

export default function DateTypeManager() {
  const { dateTypes } = useDateTypeStore()
  const [error, setError] = useState('')

  // New date type form state
  const [isCreating, setIsCreating] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newKey, setNewKey] = useState('')
  const [newColor, setNewColor] = useState(PRESET_COLORS[0])
  const [newIcon, setNewIcon] = useState('Calendar')
  const [customColor, setCustomColor] = useState('')

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editColor, setEditColor] = useState('')
  const [editIcon, setEditIcon] = useState('')

  // Delete confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  // Sort date types by order
  const sortedDateTypes = [...dateTypes].sort((a, b) => a.order - b.order)

  function startCreating() {
    setIsCreating(true)
    setNewLabel('')
    setNewKey('')
    setNewColor(PRESET_COLORS[0])
    setNewIcon('Calendar')
    setCustomColor('')
    setError('')
  }

  function cancelCreating() {
    setIsCreating(false)
    setNewLabel('')
    setNewKey('')
    setNewColor(PRESET_COLORS[0])
    setNewIcon('Calendar')
    setCustomColor('')
    setError('')
  }

  function generateKey(label: string): string {
    return label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .substring(0, 20)
  }

  async function handleCreate() {
    const trimmedLabel = newLabel.trim()
    if (!trimmedLabel) {
      setError('Label is required')
      return
    }

    const key = newKey.trim() || generateKey(trimmedLabel)
    
    if (!key) {
      setError('Key is required')
      return
    }

    // Check for duplicate keys
    if (dateTypes.some((dt) => dt.key === key)) {
      setError('A date type with this key already exists')
      return
    }

    const color = customColor && isValidHex(customColor) ? customColor : newColor

    setError('')
    try {
      await createDateType({
        key,
        label: trimmedLabel,
        color,
        icon: newIcon,
        order: dateTypes.length,
      })
      setIsCreating(false)
      setNewLabel('')
      setNewKey('')
      setNewColor(PRESET_COLORS[0])
      setNewIcon('Calendar')
      setCustomColor('')
    } catch (err) {
      setError('Failed to create date type')
      console.error(err)
    }
  }

  function startEditing(dt: DateType) {
    setEditingId(dt.id)
    setEditLabel(dt.label)
    setEditColor(dt.color)
    setEditIcon(dt.icon)
    setError('')
  }

  function cancelEditing() {
    setEditingId(null)
    setEditLabel('')
    setEditColor('')
    setEditIcon('')
    setError('')
  }

  async function saveEdit(dtId: string) {
    const trimmed = editLabel.trim()
    if (!trimmed) {
      setError('Label cannot be empty')
      return
    }

    setError('')
    try {
      await updateDateType(dtId, {
        label: trimmed,
        color: editColor,
        icon: editIcon,
      })
      setEditingId(null)
      setEditLabel('')
      setEditColor('')
      setEditIcon('')
    } catch (err) {
      setError('Failed to update date type')
      console.error(err)
    }
  }

  async function handleDelete(dtId: string) {
    setError('')
    try {
      await deleteDateType(dtId)
      setDeleteConfirmId(null)
    } catch (err) {
      setError('Failed to delete date type')
      console.error(err)
    }
  }

  const SelectedIcon = AVAILABLE_ICONS.find(i => i.name === (isCreating ? newIcon : editIcon))?.Icon || Calendar

  return (
    <div className="space-y-4">
      {/* Header with count */}
      <div className="flex items-center justify-between">
        <div className="text-sm">
          <span className="font-medium text-gray-900 dark:text-white">{dateTypes.length}</span>
          <span className="text-gray-500 dark:text-gray-400"> date types</span>
        </div>
        {!isCreating && (
          <button
            onClick={startCreating}
            className="flex items-center gap-1.5 rounded-lg bg-green-500 px-3 py-1.5 text-sm font-medium 
                       text-white hover:bg-green-600 transition-colors"
          >
            <Plus size={16} />
            New Date Type
          </button>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Create new date type form */}
      {isCreating && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/60">
          <h4 className="mb-3 text-sm font-medium text-gray-900 dark:text-white">Create New Date Type</h4>
          
          {/* Label input */}
          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
              Label
            </label>
            <input
              type="text"
              value={newLabel}
              onChange={(e) => {
                setNewLabel(e.target.value)
                if (!newKey) setNewKey(generateKey(e.target.value))
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate()
                if (e.key === 'Escape') cancelCreating()
              }}
              placeholder="e.g. Ship date"
              autoFocus
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm 
                         focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500
                         dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>

          {/* Key input */}
          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
              Key <span className="text-gray-400">(auto-generated)</span>
            </label>
            <input
              type="text"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="e.g. ship_date"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm 
                         focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500
                         dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>

          {/* Icon selector */}
          <div className="mb-3">
            <label className="mb-2 block text-xs font-medium text-gray-700 dark:text-gray-300">
              Icon
            </label>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_ICONS.map(({ name, Icon }) => (
                <button
                  key={name}
                  onClick={() => setNewIcon(name)}
                  className={`flex items-center justify-center h-8 w-8 rounded-lg border transition-colors ${
                    newIcon === name
                      ? 'border-green-500 bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400'
                      : 'border-gray-300 hover:border-gray-400 dark:border-gray-600 dark:hover:border-gray-500'
                  }`}
                  title={name}
                >
                  <Icon size={16} />
                </button>
              ))}
            </div>
          </div>

          {/* Color picker */}
          <div className="mb-4">
            <label className="mb-2 block text-xs font-medium text-gray-700 dark:text-gray-300">
              Color
            </label>
            
            {/* Preset colors */}
            <div className="mb-3 grid grid-cols-9 gap-1.5">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => {
                    setNewColor(color)
                    setCustomColor('')
                  }}
                  className={`h-6 w-6 rounded-md transition-transform hover:scale-110 ${
                    newColor === color && !customColor ? 'ring-2 ring-offset-1 ring-green-500' : ''
                  }`}
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>

            {/* Custom color input */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-400">Custom:</span>
              <input
                type="text"
                value={customColor}
                onChange={(e) => {
                  let value = e.target.value
                  if (value && !value.startsWith('#')) {
                    value = '#' + value
                  }
                  setCustomColor(value)
                  if (isValidHex(value)) {
                    setNewColor(value)
                  }
                }}
                placeholder="#RRGGBB"
                className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-sm font-mono uppercase
                           focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500
                           dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
              {customColor && (
                <div
                  className="h-6 w-6 rounded-md border border-gray-200 dark:border-gray-600"
                  style={{ backgroundColor: isValidHex(customColor) ? customColor : 'transparent' }}
                />
              )}
            </div>
          </div>

          {/* Preview */}
          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
              Preview
            </label>
            <div className="flex items-center gap-2">
              <div
                className="flex h-7 w-7 items-center justify-center rounded-md"
                style={{ 
                  backgroundColor: (customColor && isValidHex(customColor) ? customColor : newColor) + '20', 
                  color: customColor && isValidHex(customColor) ? customColor : newColor 
                }}
              >
                <SelectedIcon size={14} />
              </div>
              <span className="text-sm text-gray-700 dark:text-gray-300">
                {newLabel || 'Date Type Preview'}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <button
              onClick={cancelCreating}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 
                         hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!newLabel.trim()}
              className="rounded-lg bg-green-500 px-3 py-1.5 text-sm font-medium text-white 
                         hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create
            </button>
          </div>
        </div>
      )}

      {/* Date type list */}
      <div className="space-y-2">
        {sortedDateTypes.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-gray-50 py-12 text-center dark:border-gray-700 dark:bg-gray-800/50">
            <p className="text-sm text-gray-500 dark:text-gray-400">No date types yet</p>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              Create date types to tag tasks with special dates
            </p>
          </div>
        ) : (
          sortedDateTypes.map((dt) => {
            const IconComponent = AVAILABLE_ICONS.find(i => i.name === dt.icon)?.Icon || Calendar
            return (
              <div
                key={dt.id}
                className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 
                           hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
              >
                {/* Icon preview */}
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
                  style={{ backgroundColor: dt.color + '20', color: dt.color }}
                >
                  <IconComponent size={16} />
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  {editingId === dt.id ? (
                    <div className="space-y-3">
                      {/* Edit label */}
                      <input
                        type="text"
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEdit(dt.id)
                          if (e.key === 'Escape') cancelEditing()
                        }}
                        autoFocus
                        className="w-full rounded-lg border border-gray-300 px-2 py-1 text-sm 
                                   focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500
                                   dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                      />
                      
                      {/* Edit icon */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 dark:text-gray-400">Icon:</span>
                        <div className="flex flex-wrap gap-1">
                          {AVAILABLE_ICONS.map(({ name, Icon }) => (
                            <button
                              key={name}
                              onClick={() => setEditIcon(name)}
                              className={`flex items-center justify-center h-6 w-6 rounded ${
                                editIcon === name ? 'ring-2 ring-offset-1 ring-green-500' : ''
                              }`}
                              style={{ 
                                backgroundColor: editIcon === name ? editColor + '20' : 'transparent',
                                color: editIcon === name ? editColor : '#6B7280'
                              }}
                            >
                              <Icon size={14} />
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Edit color */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 dark:text-gray-400">Color:</span>
                        <div className="flex flex-wrap gap-1">
                          {PRESET_COLORS.slice(0, 12).map((color) => (
                            <button
                              key={color}
                              onClick={() => setEditColor(color)}
                              className={`h-5 w-5 rounded ${
                                editColor === color ? 'ring-2 ring-offset-1 ring-green-500' : ''
                              }`}
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                        <input
                          type="text"
                          value={editColor}
                          onChange={(e) => setEditColor(e.target.value)}
                          className="w-20 rounded border border-gray-300 px-1.5 py-0.5 text-xs font-mono uppercase
                                     focus:border-green-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                        />
                      </div>

                      {/* Edit actions */}
                      <div className="flex gap-1">
                        <button
                          onClick={() => saveEdit(dt.id)}
                          className="rounded p-1 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"
                        >
                          <Check size={16} />
                        </button>
                        <button
                          onClick={cancelEditing}
                          className="rounded p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-600"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {dt.label}
                      </span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        ({dt.key})
                      </span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                {editingId !== dt.id && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => startEditing(dt)}
                      className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 
                                 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                      title="Edit"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(dt.id)}
                      className="rounded p-1.5 text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Delete confirmation modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-gray-800">
            <div className="mb-4 flex items-center gap-3 text-red-600 dark:text-red-400">
              <AlertTriangle size={24} />
              <h3 className="text-lg font-semibold">Delete Date Type?</h3>
            </div>
            <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">
              This action cannot be undone. The date type will be permanently deleted.
            </p>
            <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
              Tasks using this date type will lose those date entries.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 
                           hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirmId)}
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white 
                           hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
