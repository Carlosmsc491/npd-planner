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

  // Pre-check auto-apply items whenever dialog opens or changes update
  useEffect(() => {
    if (!isOpen) return
    const auto = new Set(
      changes
        .map((_, i) => i)
        .filter((i) => changes[i].autoApply)
    )
    setChecked(auto)
  }, [isOpen, changes])

  if (!isOpen) return null

  const autoCount   = changes.filter((c) => c.autoApply).length
  const manualCount = changes.filter((c) => !c.autoApply && c.type !== 'error').length
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
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-2xl rounded-2xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              Review Changes
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 truncate max-w-sm">
              {recipeName}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              {autoCount} auto-fix{autoCount !== 1 ? 'es' : ''}
              {manualCount > 0 && ` · ${manualCount} manual`}
              {errorCount > 0 && ` · ${errorCount} error${errorCount !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors mt-0.5"
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
                  <th className="pb-2 w-6" />
                  <th className="pb-2 font-medium">Field</th>
                  <th className="pb-2 font-medium w-12">Cell</th>
                  <th className="pb-2 font-medium">Current → Suggested</th>
                  <th className="pb-2 font-medium w-20 text-right">Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {changes.map((change, i) => (
                  <ChangeRow
                    key={i}
                    change={change}
                    index={i}
                    isChecked={checked.has(i)}
                    onToggle={() => toggle(i)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 shrink-0 space-y-3">
          {requiresManualUpdate && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2">
              <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Some fields need manual attention in Excel — sleeve pricing not found for this recipe.
              </p>
            </div>
          )}

          {hasErrors && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2">
              <AlertTriangle size={14} className="text-red-500 mt-0.5 shrink-0" />
              <p className="text-xs text-red-700 dark:text-red-400">
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
                className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleApply}
                disabled={applying || hasErrors}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500 text-sm font-semibold text-white hover:bg-green-600 disabled:opacity-50 transition-colors"
              >
                {applying && <Loader2 size={13} className="animate-spin" />}
                Apply &amp; Mark Done
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
  onToggle,
}: {
  change: ValidationChange
  index: number
  isChecked: boolean
  onToggle: () => void
}) {
  const rowBg =
    change.type === 'error'
      ? 'bg-red-50 dark:bg-red-900/10'
      : change.type === 'info'
      ? 'bg-blue-50 dark:bg-blue-900/10'
      : change.autoApply
      ? 'bg-green-50 dark:bg-green-900/10'
      : 'bg-amber-50 dark:bg-amber-900/10'

  const badge =
    change.type === 'error'
      ? { label: 'Error', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' }
      : change.type === 'info'
      ? { label: 'Info', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' }
      : change.autoApply
      ? { label: 'Auto-fix', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' }
      : { label: 'Review', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' }

  const TypeIcon =
    change.type === 'error' ? AlertTriangle :
    change.type === 'info'  ? Info :
    CheckCircle2

  return (
    <tr key={index} className={`${rowBg} transition-colors`}>
      <td className="py-2 pr-2">
        {change.type !== 'error' && (
          <input
            type="checkbox"
            checked={isChecked}
            onChange={onToggle}
            className="rounded border-gray-300 dark:border-gray-600 text-green-500 focus:ring-green-500"
          />
        )}
      </td>
      <td className="py-2 pr-3 font-medium text-gray-700 dark:text-gray-300">
        {change.field}
      </td>
      <td className="py-2 pr-3 font-mono text-gray-500 dark:text-gray-400">
        {change.cell}
      </td>
      <td className="py-2 pr-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-gray-500 dark:text-gray-400 max-w-[120px] truncate" title={change.currentValue}>
            {change.currentValue || <em className="opacity-50">empty</em>}
          </span>
          <span className="text-gray-300 dark:text-gray-600">→</span>
          <span className="text-gray-800 dark:text-gray-200 font-medium max-w-[140px] truncate" title={change.suggestedValue}>
            {change.suggestedValue}
          </span>
        </div>
      </td>
      <td className="py-2 text-right">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.cls}`}>
          <TypeIcon size={9} />
          {badge.label}
        </span>
      </td>
    </tr>
  )
}
