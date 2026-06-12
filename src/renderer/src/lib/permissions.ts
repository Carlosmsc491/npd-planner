// src/renderer/src/lib/permissions.ts
// Centralized permission helpers — no component should check role directly.
// Flat AreaPermissions key pattern:
//   boards  → 'board_{boardId}'
//   areas   → 'projects' | 'recipes' | 'analytics' | 'settings'

import type { AppUser, AreaPermission } from '../types'

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

// ─── User management permissions ─────────────────────────────────────────────

export function canApproveUsers(user: AppUser): boolean {
  return isPrivileged(user)
}

// Azure AD model: admins manage members (suspend, permissions, member ↔
// photographer) but only the OWNER assigns or removes the admin role.
// Enforced server-side by the users update rule.
export function canChangeRole(actor: AppUser, target: AppUser): boolean {
  if (actor.uid === target.uid) return false          // nobody can change their own role
  if (actor.role === 'owner') return target.role !== 'owner'
  if (actor.role === 'admin') return target.role === 'member'
  return false
}

/** Whether the actor may assign a specific role — admins can never mint admins */
export function canAssignRole(actor: AppUser, newRole: AppUser['role']): boolean {
  if (newRole === 'owner') return false               // owner is never assigned from the UI
  if (newRole === 'admin') return actor.role === 'owner'
  return isPrivileged(actor)
}

export function canDeleteUser(actor: AppUser): boolean {
  return actor.role === 'owner'
}

export function canSuspendUser(actor: AppUser, target: AppUser): boolean {
  if (actor.uid === target.uid) return false
  if (actor.role === 'owner') return true
  if (actor.role === 'admin') return target.role === 'member'
  return false
}

export function canEditAreaPermissions(actor: AppUser, target: AppUser): boolean {
  if (target.role === 'owner' || target.role === 'admin') return false  // privileged users have full access
  if (actor.role === 'owner') return true
  if (actor.role === 'admin') return target.role === 'member'
  return false
}
