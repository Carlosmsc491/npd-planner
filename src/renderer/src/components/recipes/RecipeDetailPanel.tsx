// src/renderer/src/components/recipes/RecipeDetailPanel.tsx
// Right-side panel showing file details and action buttons with full Mark Done flow

import { useState, useCallback } from 'react'
import { Loader2, Lock, Check, RotateCcw, ExternalLink, MousePointerClick } from 'lucide-react'
import { Timestamp } from 'firebase/firestore'
import { useTaskStore } from '../../store/taskStore'
import { validateRecipeFile } from '../../utils/recipeValidation'
import { writeExcelCells, isExcelFileOpen } from '../../lib/recipeExcel'
import RecipeValidationDialog from './RecipeValidationDialog'
import type { RecipeFile, RecipeProject, RecipeSettings, ValidationChange } from '../../types'
import { nanoid } from 'nanoid'

interface Props {
  file: RecipeFile | null
  project: RecipeProject
  settings: RecipeSettings | null
  currentUserName: string
  currentLockToken: string | null
  onClaim: () => Promise<void>
  onUnclaim: () => Promise<void>
  onMarkDone: () => Promise<void>   // handles Firestore markRecipeDone + lock release
  onReopen: () => Promise<void>
  onOpenInExcel: () => Promise<void>
}

type ActionState =
  | 'idle'
  | 'claiming'
  | 'unclaiming'
  | 'reopening'
  | 'opening'
  | 'checking'      // step 1 of mark done: isFileOpen
  | 'validating'    // step 2: running validation rules
  | 'applying'      // step 3: writing cells
  | 'finalizing'    // step 4: rename + Firestore

const MARK_DONE_LABEL: Record<string, string> = {
  checking:   'Checking file…',
  validating: 'Validating recipe…',
  applying:   'Applying changes…',
  finalizing: 'Finishing…',
}

export default function RecipeDetailPanel({
  file,
  project,
  settings,
  currentUserName,
  currentLockToken,
  onClaim,
  onUnclaim,
  onMarkDone,
  onReopen,
  onOpenInExcel,
}: Props) {
  const setToast = useTaskStore((s) => s.setToast)

  const [actionState, setActionState] = useState<ActionState>('idle')
  const [error, setError] = useState<string | null>(null)

  // Validation dialog state
  const [validationChanges, setValidationChanges] = useState<ValidationChange[]>([])
  const [requiresManualUpdate, setRequiresManualUpdate] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)

  const busy = actionState !== 'idle'

  // ── Generic action runner ────────────────────────────────────────────────

  async function runAction(state: ActionState, fn: () => Promise<void>) {
    setActionState(state)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operation failed')
    } finally {
      setActionState('idle')
    }
  }

  // ── Mark Done full flow ───────────────────────────────────────────────────

  const handleMarkDone = useCallback(async () => {
    if (!file || !settings) return

    const fullPath = buildFullPath(project.rootPath, file.relativePath)
    setError(null)

    // Step 1 — Check if file is open
    setActionState('checking')
    let fileOpen: boolean
    try {
      fileOpen = await isExcelFileOpen(fullPath)
    } catch {
      setError('Could not check file status. Is the file accessible?')
      setActionState('idle')
      return
    }
    if (fileOpen) {
      setError('Close Excel before finishing this recipe.')
      setActionState('idle')
      return
    }

    // Step 2 — Validate
    setActionState('validating')
    let changes: ValidationChange[]
    let needsManual: boolean
    try {
      const result = await validateRecipeFile(
        fullPath,
        project.config,
        settings,
        currentUserName
      )
      changes = result.changes
      needsManual = result.requiresManualUpdate

      if (!result.valid) {
        setError('Validation found errors. Review the changes and fix them in Excel.')
        setValidationChanges(changes)
        setRequiresManualUpdate(needsManual)
        setDialogOpen(true)
        setActionState('idle')
        return
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validation failed')
      setActionState('idle')
      return
    }

    setValidationChanges(changes)
    setRequiresManualUpdate(needsManual)

    if (changes.length > 0) {
      // Show dialog for user to review
      setDialogOpen(true)
      setActionState('idle')
    } else {
      // No changes — proceed directly
      await applyAndFinalize(fullPath, [], file)
    }
  }, [file, project, settings, currentUserName]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Dialog confirm handler ────────────────────────────────────────────────

  const handleDialogApply = useCallback(async (acceptedChanges: ValidationChange[]) => {
    if (!file) return
    setDialogOpen(false)

    const fullPath = buildFullPath(project.rootPath, file.relativePath)
    await applyAndFinalize(fullPath, acceptedChanges, file)
  }, [file, project]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Core apply + finalize ─────────────────────────────────────────────────

  async function applyAndFinalize(
    fullPath: string,
    acceptedChanges: ValidationChange[],
    currentFile: RecipeFile
  ) {
    setError(null)

    // Step 3 — Write cells
    const cellChanges = acceptedChanges
      .filter((c) => c.cell !== '—')
      .map((c) => ({ cell: c.cell, value: c.suggestedValue }))

    if (cellChanges.length > 0) {
      setActionState('applying')
      try {
        await writeExcelCells(fullPath, cellChanges)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not write changes to Excel file')
        setActionState('idle')
        return
      }
    }

    // Step 4 — Rename + Firestore
    setActionState('finalizing')
    try {
      // Build new file name from the R11 "Final Naming" info change, if accepted
      const namingChange = acceptedChanges.find((c) => c.field === 'Final File Name')
      if (namingChange) {
        const dir = fullPath.substring(0, fullPath.lastIndexOf('\\'))
        const newPath = `${dir}\\${namingChange.suggestedValue}`
        await window.electronAPI.recipeRenameFile(fullPath, newPath)
      }

      await onMarkDone()

      setToast({
        id:      nanoid(),
        message: `${currentFile.displayName} marked as done`,
        type:    'success',
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not finalize recipe'
      if (msg.toLowerCase().includes('rename')) {
        setError('Could not rename file — check it is not open in another app')
      } else if (msg.toLowerCase().includes('network') || msg.toLowerCase().includes('firestore')) {
        setError('Connection error — try again')
      } else {
        setError(msg)
      }
    } finally {
      setActionState('idle')
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!file) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6">
        <MousePointerClick size={28} className="text-gray-300 dark:text-gray-600 mb-2" />
        <p className="text-sm text-gray-400 dark:text-gray-500">Select a recipe to see details</p>
      </div>
    )
  }

  const isOwnLock =
    file.status === 'in_progress' &&
    file.lockedBy === currentUserName &&
    !!currentLockToken

  const isMarkingDone = ['checking', 'validating', 'applying', 'finalizing'].includes(actionState)
  const markDoneLabel = MARK_DONE_LABEL[actionState] ?? 'Mark Done'

  return (
    <>
      <div className="flex flex-col h-full overflow-hidden">
        {/* File info */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-start justify-between gap-2 mb-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white leading-tight break-words">
              {file.displayName}
            </h3>
            <StatusBadge status={file.status} />
          </div>

          <dl className="space-y-1.5 text-xs">
            {file.price && <Row label="Price">{file.price}</Row>}
            {file.option && <Row label="Option">{file.option}</Row>}
            {file.customerOverride && <Row label="Customer">{file.customerOverride}</Row>}
            {file.holidayOverride && <Row label="Holiday">{file.holidayOverride}</Row>}
            <Row label="Wet Pack">{file.wetPackOverride === 'Y' ? 'Yes' : 'No'}</Row>
          </dl>

          {/* Distribution (read-only) */}
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700/50">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5">
              Distribution
            </p>
            <DistributionDisplay dist={file.distributionOverride} />
          </div>
        </div>

        {/* Action area */}
        <div className="p-4 space-y-2">
          {error && (
            <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-xs text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {/* PENDING → Claim */}
          {file.status === 'pending' && (
            <button
              disabled={busy}
              onClick={() => runAction('claiming', onClaim)}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-green-500 px-4 py-2 text-sm font-semibold text-white hover:bg-green-600 disabled:opacity-50 transition-colors"
            >
              {actionState === 'claiming' && <Loader2 size={14} className="animate-spin" />}
              Claim Recipe
            </button>
          )}

          {/* IN PROGRESS — own lock */}
          {isOwnLock && (
            <>
              <button
                disabled={busy}
                onClick={() => runAction('opening', onOpenInExcel)}
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-gray-200 dark:border-gray-600 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                {actionState === 'opening'
                  ? <Loader2 size={14} className="animate-spin" />
                  : <ExternalLink size={14} />}
                Open in Excel
              </button>

              <button
                disabled={busy}
                onClick={handleMarkDone}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-green-500 px-4 py-2 text-sm font-semibold text-white hover:bg-green-600 disabled:opacity-50 transition-colors"
              >
                {isMarkingDone
                  ? <><Loader2 size={14} className="animate-spin" />{markDoneLabel}</>
                  : <><Check size={14} />Mark Done</>}
              </button>

              <button
                disabled={busy}
                onClick={() => runAction('unclaiming', onUnclaim)}
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-gray-200 dark:border-gray-600 px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                {actionState === 'unclaiming' && <Loader2 size={14} className="animate-spin" />}
                Unclaim
              </button>
            </>
          )}

          {/* IN PROGRESS — other user's lock */}
          {file.status === 'in_progress' && !isOwnLock && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2.5">
              <Lock size={14} className="text-red-500 shrink-0" />
              <span className="text-sm text-red-600 dark:text-red-400 font-medium">
                Locked by {file.lockedBy}
              </span>
            </div>
          )}

          {/* LOCK EXPIRED → Reclaim */}
          {file.status === 'lock_expired' && (
            <button
              disabled={busy}
              onClick={() => runAction('claiming', onClaim)}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
            >
              {actionState === 'claiming' && <Loader2 size={14} className="animate-spin" />}
              Reclaim
            </button>
          )}

          {/* DONE → Reopen */}
          {file.status === 'done' && (
            <>
              <div className="rounded-lg bg-green-50 dark:bg-green-900/20 px-3 py-2 text-xs text-green-700 dark:text-green-400">
                <p className="font-medium">Completed by {file.doneBy}</p>
                {file.doneAt && (
                  <p className="opacity-70 mt-0.5">{formatTimestamp(file.doneAt)}</p>
                )}
              </div>
              <button
                disabled={busy}
                onClick={() => runAction('reopening', onReopen)}
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-gray-200 dark:border-gray-600 px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                {actionState === 'reopening'
                  ? <Loader2 size={14} className="animate-spin" />
                  : <RotateCcw size={14} />}
                Reopen
              </button>
            </>
          )}
        </div>
      </div>

      {/* Validation dialog — rendered outside panel so it overlays the whole window */}
      <RecipeValidationDialog
        isOpen={dialogOpen}
        recipeName={file.displayName}
        changes={validationChanges}
        requiresManualUpdate={requiresManualUpdate}
        onApply={handleDialogApply}
        onCancel={() => { setDialogOpen(false); setActionState('idle') }}
      />
    </>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────

function buildFullPath(rootPath: string, relativePath: string): string {
  // Normalize to backslash (Windows) and join
  const root = rootPath.replace(/\//g, '\\').replace(/\\$/, '')
  const rel  = relativePath.replace(/\//g, '\\').replace(/^\\/, '')
  return `${root}\\${rel}`
}

// ── Sub-components ─────────────────────────────────────────────────────────

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <dt className="text-gray-400 dark:text-gray-500 w-20 shrink-0">{label}</dt>
      <dd className="text-gray-700 dark:text-gray-300 font-medium">{children}</dd>
    </div>
  )
}

function StatusBadge({ status }: { status: RecipeFile['status'] }) {
  const styles: Record<RecipeFile['status'], string> = {
    pending:      'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
    in_progress:  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    lock_expired: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    done:         'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  }
  const labels: Record<RecipeFile['status'], string> = {
    pending:      'Pending',
    in_progress:  'In Progress',
    lock_expired: 'Lock Expired',
    done:         'Done',
  }
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${styles[status]}`}>
      {labels[status]}
    </span>
  )
}

const DC_LABELS: [string, string][] = [
  ['miami',      'MIA'],
  ['newJersey',  'NJ'],
  ['california', 'CA'],
  ['chicago',    'CHI'],
  ['seattle',    'SEA'],
  ['texas',      'TX'],
]

function DistributionDisplay({ dist }: { dist: RecipeFile['distributionOverride'] }) {
  return (
    <div className="grid grid-cols-3 gap-1">
      {DC_LABELS.map(([key, abbr]) => {
        const val = dist[key as keyof typeof dist]
        return (
          <div key={key} className="flex items-center justify-between gap-1 rounded bg-gray-50 dark:bg-gray-700/50 px-1.5 py-0.5">
            <span className="text-[10px] text-gray-400">{abbr}</span>
            <span className="text-[10px] font-semibold text-gray-700 dark:text-gray-300">{val}%</span>
          </div>
        )
      })}
    </div>
  )
}

function formatTimestamp(ts: Timestamp): string {
  try {
    const d = ts instanceof Timestamp ? ts.toDate() : new Date((ts as { seconds: number }).seconds * 1000)
    return d.toLocaleString()
  } catch {
    return ''
  }
}
