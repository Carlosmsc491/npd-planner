import { Navigate } from 'react-router-dom'
import AppLayout from '../components/ui/AppLayout'
import { useAuthStore } from '../store/authStore'

export default function AnalyticsPage() {
  const { user } = useAuthStore()

  if (user?.role !== 'admin') {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <AppLayout>
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Analytics</h1>
      </div>
    </AppLayout>
  )
}
