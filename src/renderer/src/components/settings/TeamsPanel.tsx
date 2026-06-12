// src/renderer/src/components/settings/TeamsPanel.tsx
// Admin/Owner panel for the multi-team platform: create teams (one per
// account/client), manage memberships with per-team roles. Teams are
// isolated from each other — this panel is the only cross-team view.

import { useEffect, useMemo, useState } from 'react'
import {
  Plus, X, Loader2, Trash2, ChevronDown, ChevronRight, Users2, Building2, UserPlus,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useTeamStore } from '../../store/teamStore'
import { useTaskStore } from '../../store/taskStore'
import { useClients } from '../../hooks/useClients'
import { subscribeToUsers } from '../../lib/firestore'
import {
  createTeam, updateTeam, deleteTeam,
  addTeamMember, updateTeamMemberRole, removeTeamMember,
} from '../../lib/teamsFirestore'
import { canManageTeams } from '../../lib/permissions'
import { getInitials, getInitialsColor } from '../../utils/colorUtils'
import { TEAM_ROLE_LABELS } from '../../types'
import type { AppUser, Team, TeamMember, TeamRole } from '../../types'

const TEAM_ROLE_OPTIONS = Object.entries(TEAM_ROLE_LABELS) as [TeamRole, string][]

export default function TeamsPanel() {
  const { user: currentUser } = useAuthStore()
  const { teams, members, initAdmin } = useTeamStore()
  const { setToast } = useTaskStore()
  const { clients } = useClients()
  const [users, setUsers] = useState<AppUser[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Team | null>(null)

  useEffect(() => initAdmin(), [initAdmin])
  useEffect(() => subscribeToUsers(setUsers), [])

  const membersByTeam = useMemo(() => {
    const map = new Map<string, TeamMember[]>()
    for (const m of members) {
      const list = map.get(m.teamId) ?? []
      list.push(m)
      map.set(m.teamId, list)
    }
    return map
  }, [members])

  if (!currentUser || !canManageTeams(currentUser)) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Only admins can manage teams.
      </p>
    )
  }

  async function handleDeleteTeam(team: Team) {
    try {
      await deleteTeam(team.id)
      setToast({ id: `team-del-${team.id}`, message: `Team "${team.name}" deleted`, type: 'success', duration: 4000 })
    } catch (err) {
      setToast({ id: `team-del-err-${team.id}`, message: err instanceof Error ? err.message : String(err), type: 'error', duration: 5000 })
    } finally {
      setConfirmDelete(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Each team belongs to one account. Members get a role per team — the same
          person can be Sales in one team and Account Manager in another.
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex shrink-0 items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors"
        >
          <Plus size={16} />
          New Team
        </button>
      </div>

      {showCreate && (
        <CreateTeamModal
          clients={clients.filter((c) => c.active)}
          onClose={() => setShowCreate(false)}
          onCreate={async (name, clientId) => {
            await createTeam(name, clientId, currentUser.uid)
            setShowCreate(false)
            setToast({ id: `team-new-${Date.now()}`, message: `Team "${name}" created`, type: 'success', duration: 4000 })
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDeleteModal
          team={confirmDelete}
          memberCount={(membersByTeam.get(confirmDelete.id) ?? []).length}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => handleDeleteTeam(confirmDelete)}
        />
      )}

      {/* Teams list */}
      {teams.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 py-12 text-center dark:border-gray-600">
          <Users2 className="mx-auto mb-2 text-gray-300 dark:text-gray-600" size={32} />
          <p className="text-sm text-gray-400 dark:text-gray-500">
            No teams yet. Create the first one — e.g. “Publix Team”.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {teams.map((team) => (
            <TeamRow
              key={team.id}
              team={team}
              clientName={clients.find((c) => c.id === team.clientId)?.name ?? null}
              teamMembers={membersByTeam.get(team.id) ?? []}
              users={users}
              currentUser={currentUser}
              expanded={expanded === team.id}
              onToggle={() => setExpanded(expanded === team.id ? null : team.id)}
              onDelete={() => setConfirmDelete(team)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Team row with collapsible member management ────────────────────────────

function TeamRow({
  team, clientName, teamMembers, users, currentUser, expanded, onToggle, onDelete,
}: {
  team: Team
  clientName: string | null
  teamMembers: TeamMember[]
  users: AppUser[]
  currentUser: AppUser
  expanded: boolean
  onToggle: () => void
  onDelete: () => void
}) {
  const { setToast } = useTaskStore()
  const [addUid, setAddUid] = useState('')
  const [addRole, setAddRole] = useState<TeamRole>('sales')
  const [busy, setBusy] = useState(false)

  const memberUids = new Set(teamMembers.map((m) => m.uid))
  const candidates = users.filter((u) => u.status === 'active' && !memberUids.has(u.uid))

  async function handleAdd() {
    if (!addUid) return
    setBusy(true)
    try {
      await addTeamMember(team.id, addUid, addRole, currentUser.uid)
      setAddUid('')
    } catch (err) {
      setToast({ id: `tm-add-err-${Date.now()}`, message: err instanceof Error ? err.message : String(err), type: 'error', duration: 5000 })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      {/* Row header */}
      <div className="flex items-center justify-between px-4 py-3">
        <button onClick={onToggle} className="flex flex-1 items-center gap-3 text-left">
          {expanded ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">{team.name}</p>
            <p className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
              <Building2 size={11} />
              {clientName ?? 'No client linked'}
              <span className="mx-1">·</span>
              {teamMembers.length} {teamMembers.length === 1 ? 'member' : 'members'}
            </p>
          </div>
        </button>
        <div className="flex items-center gap-2">
          {!team.active && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-400">
              inactive
            </span>
          )}
          <button
            onClick={() => updateTeam(team.id, { active: !team.active })}
            className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700 transition-colors"
          >
            {team.active ? 'Deactivate' : 'Activate'}
          </button>
          <button
            onClick={onDelete}
            title="Delete team"
            className="rounded-lg border border-red-200 p-1.5 text-red-500 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Members */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3 dark:border-gray-700/60">
          {teamMembers.length === 0 && (
            <p className="mb-3 text-xs text-gray-400 dark:text-gray-500">No members in this team yet.</p>
          )}
          <div className="space-y-1.5">
            {teamMembers.map((m) => {
              const u = users.find((uu) => uu.uid === m.uid)
              return (
                <div key={m.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-700/40">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                      style={{ backgroundColor: getInitialsColor(u?.name ?? m.uid) }}
                    >
                      {getInitials(u?.name ?? '?')}
                    </div>
                    <div>
                      <p className="text-sm text-gray-800 dark:text-gray-200">{u?.name ?? m.uid}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">{u?.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={m.teamRole}
                      onChange={(e) => updateTeamMemberRole(team.id, m.uid, e.target.value as TeamRole)}
                      className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    >
                      {TEAM_ROLE_OPTIONS.map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => removeTeamMember(team.id, m.uid)}
                      title="Remove from team"
                      className="rounded-lg p-1 text-gray-400 hover:bg-gray-200 hover:text-red-500 dark:hover:bg-gray-600 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Add member */}
          <div className="mt-3 flex items-center gap-2">
            <select
              value={addUid}
              onChange={(e) => setAddUid(e.target.value)}
              className="flex-1 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            >
              <option value="">Select a user…</option>
              {candidates.map((u) => (
                <option key={u.uid} value={u.uid}>{u.name} ({u.email})</option>
              ))}
            </select>
            <select
              value={addRole}
              onChange={(e) => setAddRole(e.target.value as TeamRole)}
              className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            >
              {TEAM_ROLE_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <button
              onClick={handleAdd}
              disabled={!addUid || busy}
              className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />}
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Create team modal ───────────────────────────────────────────────────────

function CreateTeamModal({
  clients, onClose, onCreate,
}: {
  clients: { id: string; name: string }[]
  onClose: () => void
  onCreate: (name: string, clientId: string | null) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [clientId, setClientId] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Team name is required')
      return
    }
    setIsLoading(true)
    try {
      await onCreate(name.trim(), clientId || null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">New Team</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Team name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setError('') }}
              placeholder="Publix Team"
              autoFocus
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
            {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Linked account (client)
            </label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-green-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            >
              <option value="">— None yet —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Sample requests from this team will land under this client in the Planner.
            </p>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 size={16} className="animate-spin" />
                  Creating…
                </span>
              ) : 'Create Team'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Delete confirmation ─────────────────────────────────────────────────────

function ConfirmDeleteModal({
  team, memberCount, onCancel, onConfirm,
}: {
  team: Team
  memberCount: number
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-700 dark:bg-gray-800">
        <h2 className="mb-2 text-lg font-bold text-gray-900 dark:text-white">Delete “{team.name}”?</h2>
        <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">
          This removes the team and its {memberCount} {memberCount === 1 ? 'membership' : 'memberships'}.
          This cannot be undone.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 transition-colors"
          >
            Delete Team
          </button>
        </div>
      </div>
    </div>
  )
}
