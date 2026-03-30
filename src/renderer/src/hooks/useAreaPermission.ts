import { useAuthStore } from '../store/authStore'
import type { AreaPermission } from '../types'

/**
 * Returns the effective permission level for a given area.
 * owner/admin always get 'edit'; members check areaPermissions (default: 'none').
 */
export function useAreaPermission(areaId: string): AreaPermission {
  const user = useAuthStore((s) => s.user)
  if (!user) return 'none'
  if (user.role === 'owner' || user.role === 'admin') return 'edit'
  return user.areaPermissions?.[areaId] ?? 'none'
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
  return user.areaPermissions?.[areaId] ?? 'none'
}
