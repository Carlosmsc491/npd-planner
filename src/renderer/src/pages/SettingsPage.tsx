import { useState } from 'react'
import AppLayout from '../components/ui/AppLayout'
import MembersPanel from '../components/settings/MembersPanel'
import { useAuthStore } from '../store/authStore'

type SettingsTab = 'members' | 'appearance' | 'notifications'

const TABS: { id: SettingsTab; label: string; adminOnly?: boolean }[] = [
  { id: 'members', label: 'Members', adminOnly: true },
  { id: 'appearance', label: 'Appearance' },
  { id: 'notifications', label: 'Notifications' },
]

export default function SettingsPage() {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'
  const [activeTab, setActiveTab] = useState<SettingsTab>(isAdmin ? 'members' : 'appearance')

  const visibleTabs = TABS.filter((t) => !t.adminOnly || isAdmin)

  return (
    <AppLayout>
      <div className="p-6 max-w-4xl">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Settings</h1>

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 mb-6">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab.id
                  ? 'border-green-500 text-green-600 dark:text-green-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'members' && isAdmin && <MembersPanel />}

        {activeTab === 'appearance' && (
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Appearance settings — coming in Phase 7.
          </div>
        )}

        {activeTab === 'notifications' && (
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Notification settings — coming in Phase 7.
          </div>
        )}
      </div>
    </AppLayout>
  )
}
