import { useAuthStore } from '../store/authStore'
import type { AreaPermission, AreaPermissions } from '../types'

// Core features every member gets by default (no explicit grant needed)
const MEMBER_DEFAULTS: Record<string, AreaPermission> = {
  dashboard: 'view',
  my_tasks:  'view',
  my_space:  'view',
  calendar:  'view',
}

// Legacy key aliases — maps current key → old Firestore keys to check as fallback
const LEGACY_ALIASES: Record<string, string[]> = {
  npd_projects: ['elitequote', 'recipes'],
}

function resolvePermission(perms: AreaPermissions | undefined, areaId: string): AreaPermission {
  if (perms?.[areaId] !== undefined) return perms[areaId] as AreaPermission
  // Check legacy keys for backward compat with existing Firestore data
  const aliases = LEGACY_ALIASES[areaId]
  if (aliases) {
    for (const alias of aliases) {
      if (perms?.[alias] !== undefined) return perms[alias] as AreaPermission
    }
  }
  return MEMBER_DEFAULTS[areaId] ?? 'none'
}

/**
 * Returns the effective permission level for a given area.
 * owner/admin always get 'edit'; members check areaPermissions.
 * Core areas (dashboard, my_tasks, my_space, calendar) default to 'view' for all members.
 */
export function useAreaPermission(areaId: string): AreaPermission {
  const user = useAuthStore((s) => s.user)
  if (!user) return 'none'
  if (user.role === 'owner' || user.role === 'admin') return 'edit'
  return resolvePermission(user.areaPermissions, areaId)
}

/**
 * Shorthand for board-specific permission: `board_{boardId}`
 */
export function useBoardPermission(boardId: string): AreaPermission {
  return useAreaPermission(`board_${boardId}`)
}

/**
 * Non-hook helper for use inside callbacks or non-component code.
 * Reads directly from the store snapshot.
 */
export function getAreaPermission(areaId: string): AreaPermission {
  const user = useAuthStore.getState().user
  if (!user) return 'none'
  if (user.role === 'owner' || user.role === 'admin') return 'edit'
  return resolvePermission(user.areaPermissions, areaId)
}
