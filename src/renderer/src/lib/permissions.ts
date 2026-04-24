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

type AreaKey = 'projects' | 'recipes' | 'analytics'

export function canViewArea(user: AppUser, area: AreaKey): boolean {
  if (isPrivileged(user)) return true
  const access: AreaPermission = user.areaPermissions?.[area] ?? 'none'
  return access === 'view' || access === 'edit'
}

export function canEditArea(user: AppUser, area: AreaKey): boolean {
  if (isPrivileged(user)) return true
  // Photographer role or isPhotographer add-on always has edit access to recipes
  if ((user.role === 'photographer' || user.isPhotographer) && area === 'recipes') return true
  return (user.areaPermissions?.[area] ?? 'none') === 'edit'
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

export function canChangeRole(actor: AppUser, target: AppUser): boolean {
  if (actor.uid === target.uid) return false          // nobody can change their own role
  if (actor.role === 'owner') return target.role !== 'owner'
  if (actor.role === 'admin') return target.role === 'member'
  return false
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
