import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useAreaPermission } from '../../hooks/useAreaPermission'
import { isPrivileged } from '../../lib/permissions'

interface ProtectedRouteProps {
  areaId?: string
  requireAdmin?: boolean
}

export default function ProtectedRoute({ areaId, requireAdmin }: ProtectedRouteProps) {
  const { user, isLoading } = useAuthStore()
  const permission = useAreaPermission(areaId ?? '')

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
