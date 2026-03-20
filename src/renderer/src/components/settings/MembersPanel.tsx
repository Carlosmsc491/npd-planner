// src/renderer/src/components/settings/MembersPanel.tsx
// Admin/Owner panel to manage team members: approve, reject, change role, suspend

import { useEffect, useState } from 'react'
import { Plus, Eye, EyeOff, Loader2, X } from 'lucide-react'
import { 
  subscribeToUsers, 
  updateUserStatus, 
  updateUserRole
} from '../../lib/firestore'
import { getInitials, getInitialsColor } from '../../utils/colorUtils'
import { useAuthStore } from '../../store/authStore'
import { useTaskStore } from '../../store/taskStore'
import type { AppUser, UserStatus, UserRole } from '../../types'
import type { Timestamp } from 'firebase/firestore'
import { 
  createUserWithEmailAndPassword,
  signOut
} from 'firebase/auth'
import { auth } from '../../lib/firebase'

export default function MembersPanel() {
  const { user: currentUser } = useAuthStore()
  const { setToast } = useTaskStore()
  const [users, setUsers] = useState<AppUser[]>([])
  const [showAddModal, setShowAddModal] = useState(false)

  useEffect(() => {
    const unsub = subscribeToUsers(setUsers)
    return unsub
  }, [])

  const awaiting = users.filter((u) => u.status === 'awaiting')
  const active = users.filter((u) => u.status === 'active')
  const suspended = users.filter((u) => u.status === 'suspended')

  const isOwner = currentUser?.role === 'owner'

  async function approve(uid: string) {
    await updateUserStatus(uid, 'active' as UserStatus)
  }

  async function reject(uid: string) {
    await updateUserStatus(uid, 'suspended' as UserStatus)
  }

  async function suspend(uid: string) {
    await updateUserRole(uid, 'member' as UserRole)
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
      {/* Header with Add Member button (Owner only) */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Manage team members, approve new registrations, and assign roles.
        </div>
        {isOwner && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors"
          >
            <Plus size={16} />
            Add Member
          </button>
        )}
      </div>

      {/* Add Member Modal */}
      {showAddModal && (
        <AddMemberModal 
          onClose={() => setShowAddModal(false)} 
          onSuccess={() => {
            setShowAddModal(false)
            setToast({ message: 'Member added successfully', type: 'success', id: Date.now().toString() })
          }}
        />
      )}

      {/* Awaiting Approval */}
      {awaiting.length > 0 && (
        <section>
          <SectionHeader title="Awaiting Approval" count={awaiting.length} highlight />
          <div className="space-y-2 mt-3">
            {awaiting.map((u) => (
              <MemberRow key={u.uid} user={u} isSelf={u.uid === currentUser?.uid}>
                {u.uid !== currentUser?.uid && (
                  <>
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
                  </>
                )}
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
          {active.map((u) => {
            const isSelf = u.uid === currentUser?.uid
            // Can act on this user?
            // - Owner can act on anyone except themselves (for role/suspend)
            // - Admin can only act on members (not owners, not other admins)
            const canAct = !isSelf && (
              isOwner
                ? u.role !== 'owner'           // owner can manage admins + members
                : u.role === 'member'           // admin can only manage members
            )
            return (
              <MemberRow key={u.uid} user={u} isSelf={isSelf}>
                {canAct && (
                  <RoleDropdown
                    user={u}
                    isOwner={isOwner}
                    onRoleChange={setRole}
                    onSuspend={suspend}
                  />
                )}
              </MemberRow>
            )
          })}
        </div>
      </section>

      {/* Suspended */}
      {suspended.length > 0 && (
        <section>
          <SectionHeader title="Suspended" count={suspended.length} />
          <div className="space-y-2 mt-3">
            {suspended.map((u) => (
              <MemberRow key={u.uid} user={u} isSelf={u.uid === currentUser?.uid}>
                {u.uid !== currentUser?.uid && (
                  <button
                    onClick={() => reactivate(u.uid)}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700 transition-colors"
                  >
                    Reactivate
                  </button>
                )}
              </MemberRow>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

// ─── Add Member Modal ───────────────────────────────────────────

interface AddMemberModalProps {
  onClose: () => void
  onSuccess: () => void
}

function AddMemberModal({ onClose, onSuccess }: AddMemberModalProps) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('member')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const { setToast } = useTaskStore()

  const ALLOWED_DOMAIN = import.meta.env.VITE_ALLOWED_DOMAIN || 'eliteflower.com'

  function validate(): boolean {
    const errs: Record<string, string> = {}

    if (!firstName.trim()) {
      errs.firstName = 'First name is required'
    }

    if (!email.trim()) {
      errs.email = 'Email is required'
    } else if (!email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`)) {
      errs.email = `Only @${ALLOWED_DOMAIN} emails are allowed`
    }

    if (!password) {
      errs.password = 'Password is required'
    } else if (password.length < 6) {
      errs.password = 'Password must be at least 6 characters'
    }

    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    setIsLoading(true)

    try {
      // Note: After creating a user, Firebase Auth signs in as that user automatically
      // We need to sign out and have the owner sign back in

      // Create new user with Firebase Auth
      const credential = await createUserWithEmailAndPassword(auth, email.toLowerCase(), password)
      const { user: firebaseUser } = credential

      // Create user profile in Firestore
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim()
      const { serverTimestamp } = await import('firebase/firestore')
      
      const { createUser } = await import('../../lib/firestore')
      await createUser(firebaseUser.uid, {
        email: email.toLowerCase(),
        name: fullName,
        role,
        status: 'active', // Owner-created users are active immediately
        preferences: {
          theme: 'system',
          dndEnabled: false,
          dndStart: '22:00',
          dndEnd: '08:00',
          shortcuts: {},
          sharePointPath: '',
          calendarView: 'week',
          defaultBoardView: 'cards',
          trashRetentionDays: 30,
        },
        createdAt: serverTimestamp() as unknown as Timestamp,
        lastSeen: serverTimestamp() as unknown as Timestamp,
      })

      // Sign out the new user
      await signOut(auth)

      // Sign back in as the original owner (we need to re-authenticate)
      // Since we don't have the owner's password, show a message to sign in again
      setToast({ 
        message: 'Member created successfully. Please sign in again.', 
        type: 'success',
        duration: 5000,
        id: Date.now().toString()
      })
      
      // Redirect to login after a moment
      setTimeout(() => {
        window.location.href = '/login'
      }, 2000)

      onSuccess()
    } catch (err: any) {
      console.error('Add member error:', err)
      if (err.code === 'auth/email-already-in-use') {
        setErrors({ email: 'An account with this email already exists' })
      } else if (err.code === 'auth/invalid-email') {
        setErrors({ email: 'Invalid email address' })
      } else if (err.code === 'auth/weak-password') {
        setErrors({ password: 'Password is too weak' })
      } else {
        setToast({ message: err.message || 'Failed to create member', type: 'error', id: Date.now().toString() })
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-700 dark:bg-gray-800">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Add New Member</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                First Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="John"
                className={`w-full rounded-lg border px-3 py-2.5 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-green-500/20 dark:bg-gray-700 dark:text-white ${
                  errors.firstName
                    ? 'border-red-300 focus:border-red-500 dark:border-red-700'
                    : 'border-gray-300 focus:border-green-500 dark:border-gray-600'
                }`}
              />
              {errors.firstName && (
                <p className="mt-1 text-xs text-red-500">{errors.firstName}</p>
              )}
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Last Name
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Doe"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm transition-colors focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={`user@${ALLOWED_DOMAIN}`}
              className={`w-full rounded-lg border px-3 py-2.5 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-green-500/20 dark:bg-gray-700 dark:text-white ${
                errors.email
                  ? 'border-red-300 focus:border-red-500 dark:border-red-700'
                  : 'border-gray-300 focus:border-green-500 dark:border-gray-600'
              }`}
            />
            {errors.email && (
              <p className="mt-1 text-xs text-red-500">{errors.email}</p>
            )}
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Only @{ALLOWED_DOMAIN} emails are allowed
            </p>
          </div>

          {/* Password */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Password <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Set a password"
                className={`w-full rounded-lg border px-3 py-2.5 pr-10 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-green-500/20 dark:bg-gray-700 dark:text-white ${
                  errors.password
                    ? 'border-red-300 focus:border-red-500 dark:border-red-700'
                    : 'border-gray-300 focus:border-green-500 dark:border-gray-600'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {errors.password && (
              <p className="mt-1 text-xs text-red-500">{errors.password}</p>
            )}
          </div>

          {/* Role */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Role <span className="text-red-500">*</span>
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm transition-colors focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Members can view and edit tasks. Admins can also manage boards, clients, and labels.
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 size={16} className="animate-spin" />
                  Creating...
                </span>
              ) : (
                'Add Member'
              )}
            </button>
          </div>
        </form>
      </div>
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
  isSelf,
  children,
}: {
  user: AppUser
  isSelf: boolean
  children: React.ReactNode
}) {
  return (
    <div className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
      isSelf
        ? 'border-green-200 bg-green-50/50 dark:border-green-800/40 dark:bg-green-900/10'
        : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
    }`}>
      <div className="flex items-center gap-3">
        <div
          className="h-9 w-9 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0"
          style={{ backgroundColor: getInitialsColor(user.name) }}
        >
          {getInitials(user.name)}
        </div>
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {user.name}
            {isSelf && (
              <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">(you)</span>
            )}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500">{user.email}</p>
        </div>
        <RoleBadge role={user.role} />
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}

function RoleBadge({ role }: { role: UserRole }) {
  const styles =
    role === 'owner'
      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
      : role === 'admin'
      ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
      : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles}`}>
      {role}
    </span>
  )
}

function RoleDropdown({
  user,
  isOwner,
  onRoleChange,
  onSuspend,
}: {
  user: AppUser
  isOwner: boolean
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
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-44 rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
            {/* Owner can promote/demote admin; admin cannot */}
            {isOwner && user.role !== 'admin' && (
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
