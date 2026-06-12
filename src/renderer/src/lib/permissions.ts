// src/renderer/src/lib/permissions.ts
// Centralized permission helpers — no component should check role directly.
// Flat AreaPermissions key pattern:
//   boards  → 'board_{boardId}'
//   areas   → 'projects' | 'recipes' | 'analytics' | 'settings'

import type { AppUser, AreaPermission, TeamMember, TeamRole } from '../types'

export function isPrivileged(user: AppUser): boolean {
  return user.role === 'owner' || user.role === 'admin'
}

// ─── Board permissions ────────────────────────────────────────────────────────

export function canViewBoard(user: AppUser, boardId: string): boolean {
  if (isPrivileged(user)) return true
  const access: AreaPermission = user.areaPermissions?.[`board_${boardId}`] ?? 'none'
  return access === 'view' || access === 'edit'
}

export function canEditBoard(user: AppUser, boardId: string): boolean {
  if (isPrivileged(user)) return true
  return (user.areaPermissions?.[`board_${boardId}`] ?? 'none') === 'edit'
}

// ─── Area permissions ─────────────────────────────────────────────────────────
// Canonical keys match useAreaPermission ('npd_projects', 'analytics') with the
// same legacy aliases — the old parallel key space ('projects'/'recipes') is
// resolved here so there is ONE permission vocabulary across the app.

type AreaKey = 'npd_projects' | 'analytics'

const AREA_LEGACY_ALIASES: Record<string, string[]> = {
  npd_projects: ['elitequote', 'recipes'],
}

function resolveAreaPermission(user: AppUser, area: AreaKey): AreaPermission {
  const perms = user.areaPermissions ?? {}
  if (perms[area] !== undefined) return perms[area]
  for (const alias of AREA_LEGACY_ALIASES[area] ?? []) {
    if (perms[alias] !== undefined) return perms[alias]
  }
  return 'none'
}

export function canViewArea(user: AppUser, area: AreaKey): boolean {
  if (isPrivileged(user)) return true
  if ((user.role === 'photographer' || user.isPhotographer) && area === 'npd_projects') return true
  const access = resolveAreaPermission(user, area)
  return access === 'view' || access === 'edit'
}

export function canEditArea(user: AppUser, area: AreaKey): boolean {
  if (isPrivileged(user)) return true
  // Photographer role or isPhotographer add-on always has edit access to recipes
  if ((user.role === 'photographer' || user.isPhotographer) && area === 'npd_projects') return true
  return resolveAreaPermission(user, area) === 'edit'
}

// ─── Photo capture permissions ────────────────────────────────────────────────

/** Can access the camera, start tethering, and take/select/delete photos. */
export function canTakePhotos(user: AppUser): boolean {
  return user.role === 'owner' ||
         user.role === 'photographer' ||
         user.isPhotographer === true
}

/** Can view photos in Photo Manager (read-only for everyone else). */
export function canViewPhotos(_user: AppUser): boolean {
  return true  // all authenticated users with recipe access can view
}

// ─── Platform governance (Founder model) ─────────────────────────────────────
// Exactly ONE founder exists (settings/platform.founderUid). The founder is
// the only user who can mint/demote owners and the only one who can transfer
// founder status ("legacy"). Enforced server-side by firestore.rules.

export function isFounder(user: AppUser, founderUid: string | null): boolean {
  return !!founderUid && user.uid === founderUid && user.role === 'owner'
}

/** Only the current founder can hand over the platform ("legacy" transfer). */
export function canTransferFounder(actor: AppUser, founderUid: string | null): boolean {
  return isFounder(actor, founderUid)
}

// ─── User management permissions ─────────────────────────────────────────────

export function canApproveUsers(user: AppUser): boolean {
  return isPrivileged(user)
}

// Hierarchy: founder > owner > admin > everyone else.
// Founder manages owners; owners manage admins/members; admins manage members.
// Enforced server-side by the users update rule.
export function canChangeRole(
  actor: AppUser,
  target: AppUser,
  founderUid: string | null = null
): boolean {
  if (actor.uid === target.uid) return false          // nobody can change their own role
  if (isFounder(actor, founderUid)) return true       // founder manages everyone, owners included
  if (actor.role === 'owner') return target.role !== 'owner'
  if (actor.role === 'admin') return target.role === 'member'
  return false
}

/** Whether the actor may assign a specific role — only the founder mints owners */
export function canAssignRole(
  actor: AppUser,
  newRole: AppUser['role'],
  founderUid: string | null = null
): boolean {
  if (newRole === 'owner') return isFounder(actor, founderUid)
  if (newRole === 'admin') return actor.role === 'owner'
  return isPrivileged(actor)
}

export function canDeleteUser(actor: AppUser): boolean {
  return actor.role === 'owner'
}

export function canSuspendUser(
  actor: AppUser,
  target: AppUser,
  founderUid: string | null = null
): boolean {
  if (actor.uid === target.uid) return false
  if (target.uid === founderUid) return false        // nobody suspends the founder
  if (isFounder(actor, founderUid)) return true
  if (actor.role === 'owner') return target.role !== 'owner'  // managing owners is founder-only
  if (actor.role === 'admin') return target.role === 'member'
  return false
}

export function canEditAreaPermissions(actor: AppUser, target: AppUser): boolean {
  if (target.role === 'owner' || target.role === 'admin') return false  // privileged users have full access
  if (actor.role === 'owner') return true
  if (actor.role === 'admin') return target.role === 'member'
  return false
}

// ─── Team permissions (multi-team platform) ───────────────────────────────────
// Teams are isolated from each other: a team only sees its own data. NPD
// admins/owners see across all teams. Resolution cascade:
//   1. NPD admin/owner → full access everywhere
//   2. team membership → access per teamRole
//   3. (Fase 2) direct assignment on a request → access to that request only

/** Only NPD admins/owners create teams and manage memberships. */
export function canManageTeams(user: AppUser): boolean {
  return isPrivileged(user)
}

/** The user's role inside a team, or null if not a member. */
export function getTeamRole(
  user: AppUser,
  teamId: string,
  memberships: TeamMember[]
): TeamRole | null {
  const m = memberships.find((mm) => mm.teamId === teamId && mm.uid === user.uid)
  return m ? m.teamRole : null
}

/** Team isolation: members of the team + NPD admins/owners. Nobody else. */
export function canViewTeam(
  user: AppUser,
  teamId: string,
  memberships: TeamMember[]
): boolean {
  if (isPrivileged(user)) return true
  return getTeamRole(user, teamId, memberships) !== null
}
