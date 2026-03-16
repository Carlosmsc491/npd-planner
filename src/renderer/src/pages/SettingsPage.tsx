import { useState } from 'react'
import AppLayout from '../components/ui/AppLayout'
import MembersPanel from '../components/settings/MembersPanel'
import { useAuthStore } from '../store/authStore'
import { updateUserName } from '../lib/firestore'

type SettingsTab = 'profile' | 'members' | 'appearance' | 'notifications'

const TABS: { id: SettingsTab; label: string; adminOnly?: boolean }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'members', label: 'Members', adminOnly: true },
  { id: 'appearance', label: 'Appearance' },
  { id: 'notifications', label: 'Notifications' },
]

export default function SettingsPage() {
  const { user, setUser } = useAuthStore()
  const isAdmin = user?.role === 'admin' || user?.role === 'owner'
  const [activeTab, setActiveTab] = useState<SettingsTab>(isAdmin ? 'members' : 'profile')

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
        {activeTab === 'profile' && user && (
          <ProfilePanel
            user={user}
            onNameChange={(name) => {
              if (user) setUser({ ...user, name })
            }}
          />
        )}

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

// ─── Profile Panel ────────────────────────────────────────────

import type { AppUser } from '../types'

function ProfilePanel({
  user,
  onNameChange,
}: {
  user: AppUser
  onNameChange: (name: string) => void
}) {
  const parts = user.name.split(' ')
  const [firstName, setFirstName] = useState(parts[0] ?? '')
  const [lastName, setLastName] = useState(parts.slice(1).join(' '))
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const trimFirst = firstName.trim()
    const trimLast = lastName.trim()
    if (!trimFirst) {
      setError('First name is required.')
      return
    }
    setError('')
    const fullName = trimLast ? `${trimFirst} ${trimLast}` : trimFirst
    setIsSaving(true)
    try {
      await updateUserName(user.uid, fullName)
      onNameChange(fullName)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      setError('Failed to save. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="max-w-sm">
      <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Display Name</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        This name is shown to your teammates across the app.
      </p>

      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            First Name
          </label>
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Last Name
          </label>
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
        </div>

        <div className="pt-1 border-t border-gray-100 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            <span className="font-medium text-gray-700 dark:text-gray-300">Email:</span>{' '}
            {user.email}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            <span className="font-medium text-gray-700 dark:text-gray-300">Role:</span>{' '}
            <span className={
              user.role === 'owner'
                ? 'text-amber-600 dark:text-amber-400'
                : user.role === 'admin'
                ? 'text-purple-600 dark:text-purple-400'
                : ''
            }>
              {user.role}
            </span>
          </p>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 dark:bg-red-900/30">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {saved && (
          <div className="rounded-lg bg-green-50 px-3 py-2 dark:bg-green-900/30">
            <p className="text-sm text-green-600 dark:text-green-400">Name updated successfully.</p>
          </div>
        )}

        <button
          type="submit"
          disabled={isSaving}
          className="rounded-lg bg-green-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </form>
    </div>
  )
}
