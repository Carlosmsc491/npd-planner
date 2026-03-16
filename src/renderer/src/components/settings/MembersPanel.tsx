// src/renderer/src/components/settings/MembersPanel.tsx
// Admin-only panel to manage team members: approve, reject, change role, suspend

import { useEffect, useState } from 'react'
import { subscribeToUsers, updateUserStatus, updateUserRole } from '../../lib/firestore'
import { getInitials, getInitialsColor } from '../../utils/colorUtils'
import type { AppUser, UserStatus, UserRole } from '../../types'

export default function MembersPanel() {
  const [users, setUsers] = useState<AppUser[]>([])

  useEffect(() => {
    const unsub = subscribeToUsers(setUsers)
    return unsub
  }, [])

  const awaiting = users.filter((u) => u.status === 'awaiting')
  const active = users.filter((u) => u.status === 'active')
  const suspended = users.filter((u) => u.status === 'suspended')

  async function approve(uid: string) {
    await updateUserStatus(uid, 'active' as UserStatus)
  }

  async function reject(uid: string) {
    await updateUserStatus(uid, 'suspended' as UserStatus)
  }

  async function suspend(uid: string) {
    await updateUserStatus(uid, 'suspended' as UserStatus)
  }

  async function reactivate(uid: string) {
    await updateUserStatus(uid, 'active' as UserStatus)
  }

  async function setRole(uid: string, role: UserRole) {
    await updateUserRole(uid, role)
  }

  return (
    <div className="space-y-8">
      {/* Awaiting Approval */}
      {awaiting.length > 0 && (
        <section>
          <SectionHeader title="Awaiting Approval" count={awaiting.length} highlight />
          <div className="space-y-2 mt-3">
            {awaiting.map((u) => (
              <MemberRow key={u.uid} user={u}>
                <button
                  onClick={() => approve(u.uid)}
                  className="rounded-lg bg-green-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-600 transition-colors"
                >
                  Approve
                </button>
                <button
                  onClick={() => reject(u.uid)}
                  className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20 transition-colors"
                >
                  Reject
                </button>
              </MemberRow>
            ))}
          </div>
        </section>
      )}

      {/* Active Members */}
      <section>
        <SectionHeader title="Active Members" count={active.length} />
        <div className="space-y-2 mt-3">
          {active.length === 0 && (
            <p className="text-sm text-gray-400 dark:text-gray-500 px-1">No active members.</p>
          )}
          {active.map((u) => (
            <MemberRow key={u.uid} user={u}>
              <RoleDropdown user={u} onRoleChange={setRole} onSuspend={suspend} />
            </MemberRow>
          ))}
        </div>
      </section>

      {/* Suspended */}
      {suspended.length > 0 && (
        <section>
          <SectionHeader title="Suspended" count={suspended.length} />
          <div className="space-y-2 mt-3">
            {suspended.map((u) => (
              <MemberRow key={u.uid} user={u}>
                <button
                  onClick={() => reactivate(u.uid)}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700 transition-colors"
                >
                  Reactivate
                </button>
              </MemberRow>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────

function SectionHeader({
  title,
  count,
  highlight = false,
}: {
  title: string
  count: number
  highlight?: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <h3
        className={`text-sm font-semibold uppercase tracking-wider ${
          highlight ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'
        }`}
      >
        {title}
      </h3>
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
          highlight
            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
            : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
        }`}
      >
        {count}
      </span>
    </div>
  )
}

function MemberRow({
  user,
  children,
}: {
  user: AppUser
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center gap-3">
        <div
          className="h-9 w-9 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0"
          style={{ backgroundColor: getInitialsColor(user.name) }}
        >
          {getInitials(user.name)}
        </div>
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-white">{user.name}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500">{user.email}</p>
        </div>
        <RoleBadge role={user.role} />
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}

function RoleBadge({ role }: { role: UserRole }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        role === 'admin'
          ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
          : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
      }`}
    >
      {role}
    </span>
  )
}

function RoleDropdown({
  user,
  onRoleChange,
  onSuspend,
}: {
  user: AppUser
  onRoleChange: (uid: string, role: UserRole) => void
  onSuspend: (uid: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700 transition-colors"
      >
        ···
      </button>
      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-40 rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
            {user.role !== 'admin' && (
              <DropdownItem
                label="Make Admin"
                onClick={() => { onRoleChange(user.uid, 'admin'); setOpen(false) }}
              />
            )}
            {user.role !== 'member' && (
              <DropdownItem
                label="Make Member"
                onClick={() => { onRoleChange(user.uid, 'member'); setOpen(false) }}
              />
            )}
            <DropdownItem
              label="Suspend"
              danger
              onClick={() => { onSuspend(user.uid); setOpen(false) }}
            />
          </div>
        </>
      )}
    </div>
  )
}

function DropdownItem({
  label,
  danger = false,
  onClick,
}: {
  label: string
  danger?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full px-3 py-2 text-left text-sm transition-colors first:rounded-t-xl last:rounded-b-xl ${
        danger
          ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20'
          : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700'
      }`}
    >
      {label}
    </button>
  )
}
