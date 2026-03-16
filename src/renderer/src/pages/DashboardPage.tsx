import AppLayout from '../components/ui/AppLayout'
import { useAuthStore } from '../store/authStore'

export default function DashboardPage() {
  const { user } = useAuthStore()

  return (
    <AppLayout>
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Welcome, {user?.name?.split(' ')[0] ?? 'there'}
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          NPD Planner — Elite Flower Operations Hub
        </p>
      </div>
    </AppLayout>
  )
}
