import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from 'firebase/auth'
import { Timestamp } from 'firebase/firestore'
import { auth } from '../lib/firebase'
import { getUser, createUser, hasAnyAdmin } from '../lib/firestore'
import { useAuthStore } from '../store/authStore'

const ALLOWED_DOMAIN = import.meta.env.VITE_ALLOWED_DOMAIN || 'eliteflower.com'

export default function LoginPage() {
  const navigate = useNavigate()
  const { setUser } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
      setError(`Only @${ALLOWED_DOMAIN} accounts are allowed`)
      return
    }

    setIsLoading(true)
    try {
      let credential
      try {
        credential = await signInWithEmailAndPassword(auth, email, password)
      } catch (signInErr: unknown) {
        const err = signInErr as { code?: string }
        if (err.code === 'auth/user-not-found') {
          // Account doesn't exist yet — create it
          credential = await createUserWithEmailAndPassword(auth, email, password)
          const name = email
            .split('@')[0]
            .replace(/\./g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase())

          const firstAdmin = !(await hasAnyAdmin())
          await createUser(credential.user.uid, {
            email,
            name,
            role: firstAdmin ? 'admin' : 'member',
            status: firstAdmin ? 'active' : 'awaiting',
            createdAt: Timestamp.now(),
            lastSeen: Timestamp.now(),
            preferences: {
              theme: 'system',
              dndStart: '22:00',
              dndEnd: '08:00',
              shortcuts: {},
              sharePointPath: '',
              calendarView: 'month',
              defaultBoardView: 'cards',
            },
          })
        } else {
          throw signInErr
        }
      }

      const appUser = await getUser(credential.user.uid)
      if (!appUser) throw new Error('Failed to load user profile')

      setUser(appUser)

      if (appUser.status === 'awaiting') {
        navigate('/awaiting-approval')
      } else if (appUser.status === 'suspended') {
        setError('Your access has been revoked. Contact your administrator for assistance.')
        await auth.signOut()
        setUser(null)
      } else {
        navigate('/dashboard')
      }
    } catch (err: unknown) {
      const code = (err as { code?: string }).code
      const message =
        code === 'auth/wrong-password' || code === 'auth/invalid-credential'
          ? 'Incorrect password. Try again.'
          : code === 'auth/too-many-requests'
          ? 'Too many failed attempts. Try again later.'
          : code === 'auth/network-request-failed'
          ? 'Network error. Check your connection.'
          : err instanceof Error
          ? err.message
          : 'Authentication failed'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg dark:bg-gray-800">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-green-500 shadow-md">
            <span className="text-xl font-bold text-white">N</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">NPD Planner</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Elite Flower Operations Hub</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
              placeholder={`you@${ALLOWED_DOMAIN}`}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              placeholder="Password"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 dark:bg-red-900/30">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-lg bg-green-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>

          <p className="text-center text-xs text-gray-400 dark:text-gray-500">
            New accounts are created automatically and require admin approval.
          </p>
        </form>
      </div>
    </div>
  )
}
