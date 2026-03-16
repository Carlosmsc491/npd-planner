// src/renderer/src/components/ui/ProfileSetupModal.tsx
// Shown once after first registration — collects first + last name

import { useState } from 'react'
import { updateUserName } from '../../lib/firestore'
import { useAuthStore } from '../../store/authStore'

interface ProfileSetupModalProps {
  uid: string
  onComplete: () => void
}

export default function ProfileSetupModal({ uid, onComplete }: ProfileSetupModalProps) {
  const { user, setUser } = useAuthStore()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimFirst = firstName.trim()
    const trimLast = lastName.trim()
    if (!trimFirst) {
      setError('First name is required.')
      return
    }

    const fullName = trimLast ? `${trimFirst} ${trimLast}` : trimFirst
    setIsSaving(true)
    try {
      await updateUserName(uid, fullName)
      if (user) setUser({ ...user, name: fullName })
      onComplete()
    } catch {
      setError('Failed to save your name. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl dark:bg-gray-800">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-green-500 shadow-md">
            <span className="text-xl font-bold text-white">N</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Welcome to NPD Planner</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            What should we call you?
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              First Name
            </label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              autoFocus
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              placeholder="Carlos"
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
              placeholder="Salazar"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 dark:bg-red-900/30">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isSaving}
            className="w-full rounded-lg bg-green-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSaving ? 'Saving...' : 'Get Started'}
          </button>
        </form>
      </div>
    </div>
  )
}
