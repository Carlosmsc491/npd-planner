import { useState } from 'react'
import { verifyEmergencyKey, subscribeToUsers, updateUserRole } from '../lib/firestore'
import type { AppUser } from '../types'

export default function EmergencyPage() {
  const [key, setKey] = useState('')
  const [verified, setVerified] = useState(false)
  const [error, setError] = useState('')
  const [users, setUsers] = useState<AppUser[]>([])
  const [isLoading, setIsLoading] = useState(false)

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    setIsLoading(true)
    const valid = await verifyEmergencyKey(key)
    setIsLoading(false)
    if (valid) {
      setVerified(true)
      setError('')
      subscribeToUsers(setUsers)
    } else {
      setError('Incorrect key')
    }
  }

  async function handleSetRole(uid: string, role: 'owner' | 'admin') {
    try {
      await updateUserRole(uid, role)
      setUsers(prev => prev.map(u => u.uid === uid ? { ...u, role } : u))
    } catch (err) {
      setError(`Role update failed: ${err}`)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-900 p-6">
      {!verified ? (
        <div className="w-full max-w-sm rounded-xl bg-gray-800 p-6 shadow-2xl">
          <div className="mb-4 flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-red-600 flex items-center justify-center">
              <span className="text-sm font-bold text-white">!</span>
            </div>
            <h1 className="text-lg font-bold text-white">Emergency Access</h1>
          </div>
          <form onSubmit={handleVerify} className="space-y-3">
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Emergency master key"
              className="w-full rounded-lg bg-gray-700 px-3 py-2 text-sm text-white border border-gray-600 focus:outline-none focus:border-red-500 placeholder-gray-400"
            />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {isLoading ? 'Verifying...' : 'Verify'}
            </button>
          </form>
        </div>
      ) : (
        <div className="w-full max-w-lg rounded-xl bg-gray-800 p-6 shadow-2xl">
          <h1 className="text-lg font-bold text-white mb-4">Emergency Admin Access — All Users</h1>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {users.map((u) => (
              <div key={u.uid} className="flex items-center justify-between rounded-lg bg-gray-700 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-white">{u.name}</p>
                  <p className="text-xs text-gray-400">{u.email} — {u.role} — {u.status}</p>
                </div>
                <div className="flex items-center gap-2">
                  {u.role === 'owner' ? (
                    <span className="rounded bg-purple-700/50 px-3 py-1 text-xs text-purple-300">Owner</span>
                  ) : (
                    <button
                      onClick={() => handleSetRole(u.uid, 'owner')}
                      className="rounded bg-purple-600 px-3 py-1 text-xs text-white hover:bg-purple-700 transition-colors"
                    >
                      Make Owner
                    </button>
                  )}
                  {u.role === 'admin' ? (
                    <span className="rounded bg-green-700/50 px-3 py-1 text-xs text-green-300">Admin</span>
                  ) : (
                    <button
                      onClick={() => handleSetRole(u.uid, 'admin')}
                      className="rounded bg-red-600 px-3 py-1 text-xs text-white hover:bg-red-700 transition-colors"
                    >
                      Make Admin
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
