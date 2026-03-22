// src/renderer/src/components/recipes/RecipeDetailPanel.tsx
// Right-side panel showing file details and action buttons

import { Loader2, Lock, Check, RotateCcw, ExternalLink, MousePointerClick } from 'lucide-react'
import type { RecipeFile, RecipeProject } from '../../types'
import { Timestamp } from 'firebase/firestore'

interface Props {
  file: RecipeFile | null
  project: RecipeProject   // reserved for future use (e.g. rootPath for links)
  currentUserName: string
  currentLockToken: string | null
  onClaim: () => Promise<void>
  onUnclaim: () => Promise<void>
  onMarkDone: () => Promise<void>
  onReopen: () => Promise<void>
  onOpenInExcel: () => Promise<void>
}

type ActionState = 'idle' | 'claiming' | 'unclaiming' | 'marking-done' | 'reopening' | 'opening'

import { useState } from 'react'

export default function RecipeDetailPanel({
  file,
  project: _project,
  currentUserName,
  currentLockToken,
  onClaim,
  onUnclaim,
  onMarkDone,
  onReopen,
  onOpenInExcel,
}: Props) {
  const [actionState, setActionState] = useState<ActionState>('idle')
  const [error, setError] = useState<string | null>(null)
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

  return (
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
          {file.price && (
            <Row label="Price">{file.price}</Row>
          )}
          {file.option && (
            <Row label="Option">{file.option}</Row>
          )}
          {file.customerOverride && (
            <Row label="Customer">{file.customerOverride}</Row>
          )}
          {file.holidayOverride && (
            <Row label="Holiday">{file.holidayOverride}</Row>
          )}
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
              {actionState === 'opening' ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
              Open in Excel
            </button>
            <button
              disabled={busy}
              onClick={() => runAction('marking-done', onMarkDone)}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-green-500 px-4 py-2 text-sm font-semibold text-white hover:bg-green-600 disabled:opacity-50 transition-colors"
            >
              {actionState === 'marking-done' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Mark Done
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
              {actionState === 'reopening' ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
              Reopen
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────

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
