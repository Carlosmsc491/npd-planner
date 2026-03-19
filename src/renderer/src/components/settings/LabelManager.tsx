// src/renderer/src/components/settings/LabelManager.tsx
// Admin panel to manage labels: create, edit, delete with color picker

import { useEffect, useMemo, useState } from 'react'
import {
  subscribeToLabels,
  createLabel,
  updateLabel,
  deleteLabel,
  getLabelTaskCount,
} from '../../lib/firestore'
import { Plus, Edit2, Check, X, Trash2, AlertTriangle, Palette } from 'lucide-react'
import type { Label } from '../../types'

interface LabelWithCount extends Label {
  taskCount: number
}

// Preset colors for the color picker
const PRESET_COLORS = [
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
  '#374151', // Dark gray
]

// Compute text color based on background brightness
function getTextColor(backgroundColor: string): string {
  const hex = backgroundColor.replace('#', '')
  const r = parseInt(hex.substring(0, 2), 16)
  const g = parseInt(hex.substring(2, 4), 16)
  const b = parseInt(hex.substring(4, 6), 16)
  const brightness = (r * 299 + g * 587 + b * 114) / 1000
  return brightness > 128 ? '#1F2937' : '#FFFFFF'
}

// Validate hex color
function isValidHex(color: string): boolean {
  return /^#([A-Fa-f0-9]{6})$/.test(color)
}

export default function LabelManager() {
  const [labels, setLabels] = useState<LabelWithCount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // New label form state
  const [isCreating, setIsCreating] = useState(false)
  const [newLabelName, setNewLabelName] = useState('')
  const [newLabelColor, setNewLabelColor] = useState(PRESET_COLORS[0])
  const [customColor, setCustomColor] = useState('')

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')

  // Delete confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleteWarning, setDeleteWarning] = useState('')

  // Subscribe to labels
  useEffect(() => {
    const unsub = subscribeToLabels(async (fetchedLabels) => {
      const labelsWithCounts = await Promise.all(
        fetchedLabels.map(async (label) => {
          const count = await getLabelTaskCount(label.id)
          return { ...label, taskCount: count }
        })
      )
      setLabels(labelsWithCounts)
      setLoading(false)
    })
    return unsub
  }, [])

  // Sort labels alphabetically
  const sortedLabels = useMemo(() => {
    return [...labels].sort((a, b) => a.name.localeCompare(b.name))
  }, [labels])

  function startCreating() {
    setIsCreating(true)
    setNewLabelName('')
    setNewLabelColor(PRESET_COLORS[0])
    setCustomColor('')
    setError('')
  }

  function cancelCreating() {
    setIsCreating(false)
    setNewLabelName('')
    setNewLabelColor(PRESET_COLORS[0])
    setCustomColor('')
    setError('')
  }

  async function handleCreate() {
    const trimmed = newLabelName.trim()
    if (!trimmed) {
      setError('Label name is required')
      return
    }

    // Check for duplicate names
    if (labels.some((l) => l.name.toLowerCase() === trimmed.toLowerCase())) {
      setError('A label with this name already exists')
      return
    }

    const color = customColor && isValidHex(customColor) ? customColor : newLabelColor
    const textColor = getTextColor(color)

    setError('')
    try {
      await createLabel({
        name: trimmed,
        color,
        textColor,
        boardId: null,
      })
      setIsCreating(false)
      setNewLabelName('')
      setNewLabelColor(PRESET_COLORS[0])
      setCustomColor('')
    } catch (err) {
      setError('Failed to create label')
      console.error(err)
    }
  }

  function startEditing(label: LabelWithCount) {
    setEditingId(label.id)
    setEditName(label.name)
    setEditColor(label.color)
    setError('')
  }

  function cancelEditing() {
    setEditingId(null)
    setEditName('')
    setEditColor('')
    setError('')
  }

  async function saveEdit(labelId: string) {
    const trimmed = editName.trim()
    if (!trimmed) {
      setError('Label name cannot be empty')
      return
    }

    // Check for duplicate names (excluding current label)
    if (labels.some((l) => l.id !== labelId && l.name.toLowerCase() === trimmed.toLowerCase())) {
      setError('A label with this name already exists')
      return
    }

    const textColor = getTextColor(editColor)

    setError('')
    try {
      await updateLabel(labelId, {
        name: trimmed,
        color: editColor,
        textColor,
      })
      setEditingId(null)
      setEditName('')
      setEditColor('')
    } catch (err) {
      setError('Failed to update label')
      console.error(err)
    }
  }

  async function promptDelete(label: LabelWithCount) {
    setDeleteConfirmId(label.id)
    if (label.taskCount > 0) {
      setDeleteWarning(
        `This label is used in ${label.taskCount} task${label.taskCount !== 1 ? 's' : ''}. ` +
          `Deleting it will remove the label from those tasks.`
      )
    } else {
      setDeleteWarning('')
    }
  }

  async function handleDelete(labelId: string) {
    setError('')
    try {
      await deleteLabel(labelId)
      setDeleteConfirmId(null)
      setDeleteWarning('')
    } catch (err) {
      setError('Failed to delete label')
      console.error(err)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-green-500" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header with count */}
      <div className="flex items-center justify-between">
        <div className="text-sm">
          <span className="font-medium text-gray-900 dark:text-white">{labels.length}</span>
          <span className="text-gray-500 dark:text-gray-400"> labels</span>
        </div>
        {!isCreating && (
          <button
            onClick={startCreating}
            className="flex items-center gap-1.5 rounded-lg bg-green-500 px-3 py-1.5 text-sm font-medium 
                       text-white hover:bg-green-600 transition-colors"
          >
            <Plus size={16} />
            New Label
          </button>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Create new label form */}
      {isCreating && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/60">
          <h4 className="mb-3 text-sm font-medium text-gray-900 dark:text-white">Create New Label</h4>
          
          {/* Name input */}
          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
              Name
            </label>
            <input
              type="text"
              value={newLabelName}
              onChange={(e) => setNewLabelName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate()
                if (e.key === 'Escape') cancelCreating()
              }}
              placeholder="Label name"
              autoFocus
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm 
                         focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500
                         dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
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
                    setNewLabelColor(color)
                    setCustomColor('')
                  }}
                  className={`h-6 w-6 rounded-md transition-transform hover:scale-110 ${
                    newLabelColor === color && !customColor ? 'ring-2 ring-offset-1 ring-green-500' : ''
                  }`}
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>

            {/* Custom color input */}
            <div className="flex items-center gap-2">
              <Palette size={16} className="text-gray-400" />
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
                    setNewLabelColor(value)
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
              <span
                className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                style={{
                  backgroundColor: customColor && isValidHex(customColor) ? customColor : newLabelColor,
                  color: getTextColor(customColor && isValidHex(customColor) ? customColor : newLabelColor),
                }}
              >
                {newLabelName || 'Label Preview'}
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
              disabled={!newLabelName.trim()}
              className="rounded-lg bg-green-500 px-3 py-1.5 text-sm font-medium text-white 
                         hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create
            </button>
          </div>
        </div>
      )}

      {/* Label list */}
      <div className="space-y-2">
        {sortedLabels.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-gray-50 py-12 text-center dark:border-gray-700 dark:bg-gray-800/50">
            <p className="text-sm text-gray-500 dark:text-gray-400">No labels yet</p>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              Create labels to organize your tasks
            </p>
          </div>
        ) : (
          sortedLabels.map((label) => (
            <div
              key={label.id}
              className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 
                         hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
            >
              {/* Color preview */}
              <div
                className="h-4 w-4 shrink-0 rounded-full"
                style={{ backgroundColor: label.color }}
              />

              {/* Label content */}
              <div className="min-w-0 flex-1">
                {editingId === label.id ? (
                  <div className="space-y-3">
                    {/* Edit name */}
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEdit(label.id)
                        if (e.key === 'Escape') cancelEditing()
                      }}
                      autoFocus
                      className="w-full rounded-lg border border-gray-300 px-2 py-1 text-sm 
                                 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500
                                 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    />
                    
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
                        onClick={() => saveEdit(label.id)}
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
                    <span
                      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                      style={{ backgroundColor: label.color, color: label.textColor }}
                    >
                      {label.name}
                    </span>
                  </div>
                )}
              </div>

              {/* Task count */}
              <div className="shrink-0 text-right">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {label.taskCount} task{label.taskCount !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Actions */}
              {editingId !== label.id && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => startEditing(label)}
                    className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 
                               dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                    title="Edit"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={() => promptDelete(label)}
                    className="rounded p-1.5 text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Delete confirmation modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-gray-800">
            <div className="mb-4 flex items-center gap-3 text-red-600 dark:text-red-400">
              <AlertTriangle size={24} />
              <h3 className="text-lg font-semibold">Delete Label?</h3>
            </div>
            <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">
              This action cannot be undone. The label will be permanently deleted.
            </p>
            {deleteWarning && (
              <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                {deleteWarning}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setDeleteConfirmId(null)
                  setDeleteWarning('')
                }}
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
