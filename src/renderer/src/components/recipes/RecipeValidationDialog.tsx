// src/renderer/src/components/recipes/RecipeValidationDialog.tsx
// Modal for reviewing validation changes before marking a recipe as done

import { useState, useEffect } from 'react'
import { X, AlertTriangle, CheckCircle2, Info, Loader2 } from 'lucide-react'
import type { ValidationChange } from '../../types'

interface Props {
  isOpen: boolean
  recipeName: string
  changes: ValidationChange[]
  requiresManualUpdate: boolean
  onApply: (acceptedChanges: ValidationChange[]) => Promise<void>
  onCancel: () => void
}

function displayValue(val: unknown): string {
  if (val === null || val === undefined || val === '') return ''
  if (typeof val === 'object') {
    const o = val as Record<string, unknown>
    return String(o.value ?? o.label ?? JSON.stringify(val))
  }
  return String(val)
}

export default function RecipeValidationDialog({
  isOpen,
  recipeName,
  changes,
  requiresManualUpdate,
  onApply,
  onCancel,
}: Props) {
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [applying, setApplying] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    const auto = new Set(
      changes.map((_, i) => i).filter((i) => changes[i].autoApply)
    )
    setChecked(auto)
  }, [isOpen, changes])

  if (!isOpen) return null

  const errorCount  = changes.filter((c) => c.type === 'error').length
  const checkedCount = checked.size

  function toggle(i: number) {
    setChecked((prev) => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  async function handleApply() {
    setApplying(true)
    try {
      const accepted = changes.filter((_, i) => checked.has(i))
      await onApply(accepted)
    } finally {
      setApplying(false)
    }
  }

  const hasErrors = errorCount > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-2xl rounded-2xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 py-5 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1">
              Recipe Manager
            </p>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white leading-tight">
              Review changes
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 truncate max-w-sm">
              {recipeName}
              {changes.length > 0 && (
                <span className="text-gray-400 dark:text-gray-500">
                  {' '}— {changes.length} change{changes.length !== 1 ? 's' : ''} pending
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors mt-0.5 shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Change table */}
        <div className="overflow-y-auto flex-1 px-6 py-4">
          {changes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 size={28} className="text-green-500 mb-2" />
              <p className="text-sm text-gray-600 dark:text-gray-400">
                No changes needed — recipe looks good!
              </p>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-800">
                  <th className="pb-2.5 w-6" />
                  <th className="pb-2.5 font-medium">Field</th>
                  <th className="pb-2.5 font-medium w-12">Cell</th>
                  <th className="pb-2.5 font-medium">Current → Suggested</th>
                  <th className="pb-2.5 font-medium w-20 text-right">Type</th>
                </tr>
              </thead>
              <tbody>
                {changes.map((change, i) => (
                  <ChangeRow
                    key={i}
                    change={change}
                    index={i}
                    isChecked={checked.has(i)}
                    isEven={i % 2 === 0}
                    onToggle={() => toggle(i)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/60 border-t border-gray-100 dark:border-gray-800 rounded-b-2xl shrink-0 space-y-3">
          {requiresManualUpdate && (
            <div className="flex items-start gap-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 px-3.5 py-2.5">
              <AlertTriangle size={16} className="text-amber-500 dark:text-amber-400 mt-px shrink-0" />
              <p className="text-xs text-amber-600 dark:text-amber-400 leading-relaxed">
                Some fields need manual attention in Excel — sleeve pricing not found for this recipe.
              </p>
            </div>
          )}

          {hasErrors && (
            <div className="flex items-start gap-2.5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/50 px-3.5 py-2.5">
              <AlertTriangle size={16} className="text-red-500 mt-px shrink-0" />
              <p className="text-xs text-red-600 dark:text-red-400 leading-relaxed">
                This recipe has validation errors. Fix them in Excel before marking as done.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {checkedCount} change{checkedCount !== 1 ? 's' : ''} will be applied
            </span>

            <div className="flex gap-2">
              <button
                onClick={onCancel}
                disabled={applying}
                className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleApply}
                disabled={applying || hasErrors}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-colors hover:brightness-95"
                style={{ backgroundColor: '#1D9E75' }}
              >
                {applying && <Loader2 size={13} className="animate-spin" />}
                Apply &amp; mark done
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── ChangeRow ──────────────────────────────────────────────────────────────

function ChangeRow({
  change,
  index,
  isChecked,
  isEven,
  onToggle,
}: {
  change: ValidationChange
  index: number
  isChecked: boolean
  isEven: boolean
  onToggle: () => void
}) {
  const current   = displayValue(change.currentValue)
  const suggested = displayValue(change.suggestedValue)

  const zebraClass = isEven
    ? 'bg-transparent'
    : 'bg-gray-50 dark:bg-gray-800/40'

  const badge =
    change.type === 'error'
      ? { label: 'Error',    bg: 'bg-red-50 dark:bg-red-900/20',    border: 'border-red-300 dark:border-red-700/50',    text: 'text-red-600 dark:text-red-400' }
      : change.type === 'info'
      ? { label: 'Info',     bg: 'bg-blue-50 dark:bg-blue-900/20',  border: 'border-blue-300 dark:border-blue-700/50',  text: 'text-blue-600 dark:text-blue-400' }
      : change.autoApply
      ? { label: 'Auto-fix', bg: 'bg-green-50 dark:bg-green-900/20',border: 'border-green-300 dark:border-green-700/50',text: 'text-green-600 dark:text-green-400' }
      : { label: 'Review',   bg: 'bg-amber-50 dark:bg-amber-900/20',border: 'border-amber-300 dark:border-amber-700/50',text: 'text-amber-600 dark:text-amber-400' }

  const TypeIcon =
    change.type === 'error' ? AlertTriangle :
    change.type === 'info'  ? Info :
    CheckCircle2

  return (
    <tr
      key={index}
      className={`${zebraClass} group transition-colors duration-100 hover:bg-green-50 dark:hover:bg-green-900/10`}
    >
      <td className="py-2.5 pr-2">
        {change.type !== 'error' && (
          <input
            type="checkbox"
            checked={isChecked}
            onChange={onToggle}
            className="rounded border-gray-300 dark:border-gray-600 text-green-500 focus:ring-green-500"
          />
        )}
      </td>
      <td className="py-2.5 pr-3 font-medium text-gray-700 dark:text-gray-300">
        {change.field}
      </td>
      <td className="py-2.5 pr-3 font-mono text-gray-400 dark:text-gray-500">
        {change.cell || '–'}
      </td>
      <td className="py-2.5 pr-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className="text-gray-400 dark:text-gray-500 max-w-[120px] truncate line-through"
            title={current}
          >
            {current || <em className="not-italic opacity-50">empty</em>}
          </span>
          <span className="text-gray-300 dark:text-gray-600">→</span>
          <span
            className="font-medium text-green-600 dark:text-green-400 max-w-[140px] truncate"
            style={{ color: '#1D9E75' }}
            title={suggested}
          >
            {suggested}
          </span>
        </div>
      </td>
      <td className="py-2.5 text-right">
        <span
          className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${badge.bg} ${badge.border} ${badge.text}`}
          style={{ borderWidth: '0.5px', padding: '2px 8px' }}
        >
          <TypeIcon size={9} />
          {badge.label}
        </span>
      </td>
    </tr>
  )
}
