// src/renderer/src/components/auth/ApprovalModal.tsx
// Approval modal shown to admins/owners when new users register.
// Driven by usePendingApprovals — auto-opens and auto-dismisses via real-time updates.

import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { getInitials, getInitialsColor } from '../../utils/colorUtils'
import { approveUser, rejectUser, setReviewingBy } from '../../lib/firestore'
import { DEFAULT_AREA_PERMISSIONS } from '../../types'
import type { AppUser, Board, PendingApproval, AreaPermissions, AreaPermission } from '../../types'

interface ApprovalModalProps {
  pending: PendingApproval[]
  currentUser: AppUser
  boards: Board[]
  onClose: () => void
}

type RoleChoice = 'member' | 'admin'

const ACCESS_LEVELS: AreaPermission[] = ['none', 'view', 'edit']

const LEVEL_STYLES: Record<AreaPermission, string> = {
  none: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  view: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  edit: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
}

const LEVEL_ACTIVE: Record<AreaPermission, string> = {
  none: 'ring-2 ring-gray-400 dark:ring-gray-400',
  view: 'ring-2 ring-blue-500 dark:ring-blue-400',
  edit: 'ring-2 ring-green-500 dark:ring-green-400',
}

function formatTimeAgo(ts: PendingApproval['registeredAt']): string {
  if (!ts?.toMillis) return 'Just now'
  const diffMs = Date.now() - ts.toMillis()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins} minute${mins !== 1 ? 's' : ''} ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hour${hrs !== 1 ? 's' : ''} ago`
  const days = Math.floor(hrs / 24)
  return `${days} day${days !== 1 ? 's' : ''} ago`
}

function buildDefaultPerms(boards: Board[]): AreaPermissions {
  const perms: AreaPermissions = { ...DEFAULT_AREA_PERMISSIONS }
  boards.forEach((b) => {
    perms[`board_${b.id}`] = 'none'
  })
  return perms
}

export function ApprovalModal({ pending, currentUser, boards, onClose }: ApprovalModalProps) {
  const [index, setIndex] = useState(0)
  const [role, setRole] = useState<RoleChoice>('member')
  const [perms, setPerms] = useState<AreaPermissions>(() => buildDefaultPerms(boards))
  const [confirmReject, setConfirmReject] = useState(false)
  const [busy, setBusy] = useState(false)

  const current = pending[Math.min(index, pending.length - 1)]

  // Reset form when the current item changes
  useEffect(() => {
    setRole('member')
    setPerms(buildDefaultPerms(boards))
    setConfirmReject(false)
  }, [current?.uid, boards])

  // Adjust index when queue shrinks
  useEffect(() => {
    if (index >= pending.length && pending.length > 0) {
      setIndex(pending.length - 1)
    }
  }, [pending.length, index])

  // Set reviewingBy lock when viewing a user
  useEffect(() => {
    if (!current) return
    setReviewingBy(current.uid, currentUser.uid).catch(() => {})
    return () => {
      setReviewingBy(current.uid, null).catch(() => {})
    }
  }, [current?.uid, currentUser.uid])

  if (!current || pending.length === 0) return null

  function setLevel(key: string, level: AreaPermission) {
    setPerms((prev) => ({ ...prev, [key]: level }))
  }

  async function handleApprove() {
    if (busy) return
    setBusy(true)
    try {
      const finalPerms = role === 'admin' ? {} : perms
      await approveUser(current.uid, role, finalPerms)
    } finally {
      setBusy(false)
    }
  }

  async function handleReject() {
    if (busy) return
    setBusy(true)
    try {
      await rejectUser(current.uid)
      setConfirmReject(false)
    } finally {
      setBusy(false)
    }
  }

  const areaRows: { label: string; key: string }[] = [
    ...boards.map((b) => ({ label: b.name, key: `board_${b.id}` })),
    { label: 'NPD Projects', key: 'projects' },
    { label: 'Recipe Manager', key: 'recipes' },
    { label: 'Analytics', key: 'analytics' },
  ]

  return (
    // Overlay: pointer-events none so it doesn't block background UI
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      {/* Backdrop — click to close, pointer-events restored */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm pointer-events-auto"
        onClick={onClose}
      />

      {/* Modal panel */}
      <div
        className="relative z-10 w-[480px] max-h-[85vh] flex flex-col rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900 pointer-events-auto overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">New user request</h2>
            {pending.length > 1 && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {index + 1} of {pending.length} pending
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Queue navigation */}
            {pending.length > 1 && (
              <div className="flex items-center gap-1">
                <button
                  disabled={index === 0}
                  onClick={() => setIndex((i) => i - 1)}
                  className="p-1 rounded-md text-gray-400 hover:text-gray-700 disabled:opacity-30 dark:hover:text-gray-200"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  disabled={index === pending.length - 1}
                  onClick={() => setIndex((i) => i + 1)}
                  className="p-1 rounded-md text-gray-400 hover:text-gray-700 disabled:opacity-30 dark:hover:text-gray-200"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
            <button
              onClick={onClose}
              className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* User identity */}
          <div className="flex items-center gap-3">
            <div
              className="h-12 w-12 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0"
              style={{ backgroundColor: getInitialsColor(current.displayName) }}
            >
              {getInitials(current.displayName)}
            </div>
            <div>
              <p className="font-semibold text-gray-900 dark:text-white">{current.displayName}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{current.email}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                Registered {formatTimeAgo(current.registeredAt)}
              </p>
            </div>
            {current.reviewingBy && current.reviewingBy !== currentUser.uid && (
              <span className="ml-auto text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                Being reviewed
              </span>
            )}
          </div>

          {/* Role selector */}
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Role</p>
            <div className="flex gap-2">
              {(['member', 'admin'] as RoleChoice[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    role === r
                      ? r === 'admin'
                        ? 'bg-green-50 border-green-500 text-green-700 dark:bg-green-900/30 dark:border-green-500 dark:text-green-300'
                        : 'bg-gray-100 border-gray-400 text-gray-800 dark:bg-gray-700 dark:border-gray-500 dark:text-gray-200'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300 dark:border-gray-700 dark:text-gray-400'
                  }`}
                >
                  {r === 'admin' ? 'Admin' : 'Member'}
                </button>
              ))}
            </div>
            {role === 'admin' && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                Admins have full access to all areas — no per-area restrictions needed.
              </p>
            )}
          </div>

          {/* Area permissions (member only) */}
          {role === 'member' && (
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                Area permissions
              </p>
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden">
                {areaRows.map(({ label, key }) => {
                  const current_level: AreaPermission = (perms[key] as AreaPermission) ?? 'none'
                  return (
                    <div key={key} className="flex items-center justify-between px-3 py-2.5 bg-white dark:bg-gray-800">
                      <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
                      <div className="flex gap-1">
                        {ACCESS_LEVELS.map((lvl) => (
                          <button
                            key={lvl}
                            onClick={() => setLevel(key, lvl)}
                            className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-all ${LEVEL_STYLES[lvl]} ${current_level === lvl ? LEVEL_ACTIVE[lvl] : 'opacity-50 hover:opacity-80'}`}
                          >
                            {lvl}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700">
          {confirmReject ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-gray-700 dark:text-gray-300">Reject this user?</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmReject(false)}
                  className="px-3 py-1.5 rounded-lg text-sm border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReject}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-lg text-sm bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
                >
                  {busy ? 'Rejecting…' : 'Yes, reject'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <button
                onClick={() => setConfirmReject(true)}
                disabled={busy}
                className="px-4 py-2 rounded-lg text-sm border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20 disabled:opacity-50"
              >
                Reject
              </button>
              <button
                onClick={handleApprove}
                disabled={busy}
                className="px-5 py-2 rounded-lg text-sm font-semibold bg-[#1D9E75] text-white hover:bg-[#178a65] disabled:opacity-50 flex items-center gap-2"
              >
                {busy ? 'Approving…' : 'Approve →'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
