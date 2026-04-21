// src/renderer/src/components/recipes/RecipeDetailPanel.tsx
// Right-side panel showing file details and action buttons with full Mark Done flow

import { useState, useCallback } from 'react'
import { Loader2, Lock, Check, RotateCcw, ExternalLink, MousePointerClick, UserPlus, ChevronDown } from 'lucide-react'
import { Timestamp } from 'firebase/firestore'
import { useTaskStore } from '../../store/taskStore'
import { useAuthStore } from '../../store/authStore'
import { validateRecipeFile } from '../../utils/recipeValidation'
import { writeExcelCells, isExcelFileOpen } from '../../lib/recipeExcel'
import RecipeValidationDialog from './RecipeValidationDialog'
import type { RecipeFile, RecipeProject, RecipeSettings, ValidationChange, AppUser } from '../../types'
import { nanoid } from 'nanoid'

interface Props {
  file: RecipeFile | null
  project: RecipeProject
  settings: RecipeSettings | null
  currentUserName: string
  currentLockToken: string | null
  users: AppUser[]                                              // for assign dropdown
  canEdit: boolean                                              // false → read-only member
  onClaim: () => Promise<void>
  onUnclaim: () => Promise<void>
  onMarkDone: () => Promise<void>
  onReopen: () => Promise<void>
  onOpenInExcel: () => Promise<void>
  onAssign: (uid: string | null, name: string | null) => Promise<void>
  onForceUnlock?: () => Promise<void>
}

type ActionState =
  | 'idle'
  | 'claiming'
  | 'unclaiming'
  | 'reopening'
  | 'opening'
  | 'assigning'
  | 'checking'
  | 'validating'
  | 'applying'
  | 'finalizing'

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
  users,
  canEdit,
  onClaim,
  onUnclaim,
  onMarkDone,
  onReopen,
  onOpenInExcel,
  onAssign,
  onForceUnlock,
}: Props) {
  const setToast = useTaskStore((s) => s.setToast)
  const currentUser = useAuthStore((s) => s.user)

  const [actionState, setActionState] = useState<ActionState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [confirmReopen, setConfirmReopen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)

  // Validation dialog state
  const [validationChanges, setValidationChanges] = useState<ValidationChange[]>([])
  const [requiresManualUpdate, setRequiresManualUpdate] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)

  const busy = actionState !== 'idle'

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

    setActionState('validating')
    let changes: ValidationChange[]
    let needsManual: boolean
    try {
      const result = await validateRecipeFile(
        fullPath,
        project.config,
        settings,
        currentUserName,
        file
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
      setDialogOpen(true)
      setActionState('idle')
    } else {
      await applyAndFinalize(fullPath, [], file)
    }
  }, [file, project, settings, currentUserName]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDialogApply = useCallback(async (acceptedChanges: ValidationChange[]) => {
    if (!file) return
    setDialogOpen(false)
    const fullPath = buildFullPath(project.rootPath, file.relativePath)
    await applyAndFinalize(fullPath, acceptedChanges, file)
  }, [file, project]) // eslint-disable-line react-hooks/exhaustive-deps

  async function applyAndFinalize(
    fullPath: string,
    acceptedChanges: ValidationChange[],
    currentFile: RecipeFile
  ) {
    setError(null)

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

    setActionState('finalizing')
    try {
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

  // ── Assign handler ────────────────────────────────────────────────────────

  async function handleAssign(uid: string | null, name: string | null) {
    setAssignOpen(false)
    await runAction('assigning', () => onAssign(uid, name))
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

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'owner'

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
            {/* Assigned to */}
            <div className="flex items-center gap-2">
              <dt className="text-gray-400 dark:text-gray-500 w-20 shrink-0">Assigned</dt>
              <dd className="flex items-center gap-1.5 flex-1 min-w-0">
                {file.assignedToName ? (
                  <span className="text-gray-700 dark:text-gray-300 font-medium truncate">
                    {file.assignedToName}
                  </span>
                ) : (
                  <span className="text-gray-400 dark:text-gray-500 italic">Unassigned</span>
                )}
                {/* Assign button — admin/owner only */}
                {isAdmin && (
                  <div className="relative ml-auto">
                    <button
                      onClick={() => setAssignOpen((v) => !v)}
                      disabled={busy}
                      title="Assign recipe"
                      className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-gray-500 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors"
                    >
                      <UserPlus size={10} />
                      {actionState === 'assigning' ? <Loader2 size={10} className="animate-spin" /> : <ChevronDown size={10} />}
                    </button>
                    {assignOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setAssignOpen(false)} />
                        <div className="absolute right-0 z-20 mt-1 w-44 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg overflow-hidden">
                          {file.assignedTo && (
                            <button
                              onClick={() => handleAssign(null, null)}
                              className="w-full px-3 py-2 text-left text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                            >
                              Remove assignment
                            </button>
                          )}
                          <div className="border-t border-gray-100 dark:border-gray-700" />
                          {users.filter(u => u.status === 'active').map(u => (
                            <button
                              key={u.uid}
                              onClick={() => handleAssign(u.uid, u.name)}
                              className={`w-full px-3 py-2 text-left text-xs transition-colors ${
                                file.assignedTo === u.uid
                                  ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                              }`}
                            >
                              {u.name}
                              {file.assignedTo === u.uid && ' ✓'}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </dd>
            </div>
          </dl>

          {/* Distribution (read-only) */}
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700/50">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5">
              Distribution
            </p>
            <DistributionDisplay dist={file.distributionOverride} />
          </div>
        </div>

        {/* Read-only banner */}
        {!canEdit && (
          <div className="mx-4 mt-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            You have view-only access to this project.
          </div>
        )}

        {/* Action area */}
        <div className="p-4 space-y-2">
          {error && (
            <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-xs text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {/* PENDING → Claim */}
          {file.status === 'pending' && canEdit && (
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
          {isOwnLock && canEdit && (
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

          {/* Open in Excel always available (even read-only) when in-progress own lock */}
          {isOwnLock && !canEdit && (
            <button
              disabled={busy}
              onClick={() => runAction('opening', onOpenInExcel)}
              className="w-full flex items-center justify-center gap-2 rounded-lg border border-gray-200 dark:border-gray-600 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              <ExternalLink size={14} />
              Open in Excel
            </button>
          )}

          {/* IN PROGRESS — other user's lock */}
          {file.status === 'in_progress' && !isOwnLock && (
            <div className="flex flex-col gap-1 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Lock size={14} className="text-red-500 shrink-0" />
                <span className="text-sm text-red-600 dark:text-red-400 font-medium">
                  Locked by {file.lockedBy}
                </span>
              </div>
              {isAdmin && (
                <button
                  onClick={async () => {
                    if (!onForceUnlock) return
                    const confirmed = window.confirm(
                      `Force unlock "${file.displayName}"?\n` +
                      `This will release the lock held by ${file.lockedBy}.`
                    )
                    if (!confirmed) return
                    try {
                      await onForceUnlock()
                    } catch (err) {
                      console.error('Force unlock failed:', err)
                    }
                  }}
                  disabled={busy}
                  className="text-xs text-red-600 dark:text-red-400 underline mt-1 hover:text-red-800 dark:hover:text-red-300 disabled:opacity-50 text-left"
                >
                  Force unlock
                </button>
              )}
            </div>
          )}

          {/* LOCK EXPIRED → Reclaim */}
          {file.status === 'lock_expired' && canEdit && (
            <button
              disabled={busy}
              onClick={() => runAction('claiming', onClaim)}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
            >
              {actionState === 'claiming' && <Loader2 size={14} className="animate-spin" />}
              Reclaim
            </button>
          )}

          {/* DONE → Reopen (with confirmation) */}
          {file.status === 'done' && (
            <>
              <div className="rounded-lg bg-green-50 dark:bg-green-900/20 px-3 py-2 text-xs text-green-700 dark:text-green-400">
                <p className="font-medium">Completed by {file.doneBy}</p>
                {file.doneAt && (
                  <p className="opacity-70 mt-0.5">{formatTimestamp(file.doneAt)}</p>
                )}
              </div>
              {canEdit && !confirmReopen && (
                <button
                  disabled={busy}
                  onClick={() => setConfirmReopen(true)}
                  className="w-full flex items-center justify-center gap-2 rounded-lg border border-gray-200 dark:border-gray-600 px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
                >
                  <RotateCcw size={14} />
                  Reopen
                </button>
              )}
              {canEdit && confirmReopen && (
                <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 space-y-2">
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Reopen this recipe? It will return to Pending state.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirmReopen(false)}
                      className="flex-1 rounded-lg border border-gray-200 dark:border-gray-600 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      Cancel
                    </button>
                    <button
                      disabled={busy}
                      onClick={async () => {
                        setConfirmReopen(false)
                        await runAction('reopening', onReopen)
                      }}
                      className="flex-1 rounded-lg bg-amber-500 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
                    >
                      {actionState === 'reopening'
                        ? <Loader2 size={12} className="animate-spin mx-auto" />
                        : 'Yes, reopen'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

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
