import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useAreaPermission } from '../../hooks/useAreaPermission'
import { isPrivileged } from '../../lib/permissions'

// Routes a photographer is allowed to visit
const PHOTOGRAPHER_ALLOWED = ['/recipes', '/capture', '/emergency']

interface ProtectedRouteProps {
  areaId?: string
  requireAdmin?: boolean
}

export default function ProtectedRoute({ areaId, requireAdmin }: ProtectedRouteProps) {
  const { user, isLoading } = useAuthStore()
  const permission = useAreaPermission(areaId ?? '')
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-green-500 border-t-transparent" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (user.status === 'awaiting') return <Navigate to="/awaiting-approval" replace />
  if (user.status === 'suspended') return <Navigate to="/login" replace />

  // Standalone photographer role: restrict to recipes + capture pages only
  // Users who have isPhotographer as an add-on keep full access from their base role
  if (user.role === 'photographer' && !user.isPhotographer) {
    const allowed = PHOTOGRAPHER_ALLOWED.some((prefix) =>
      location.pathname === prefix || location.pathname.startsWith(prefix + '/')
    )
    if (!allowed) return <Navigate to="/recipes" replace />
  }

  // Admin-only gate (settings, admin-only pages)
  if (requireAdmin && !isPrivileged(user)) {
    return <Navigate to="/dashboard" replace />
  }

  // Area-level access check (only enforced when areaId is provided)
  if (areaId && permission === 'none') {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}
