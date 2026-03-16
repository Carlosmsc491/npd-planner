import { signOut } from 'firebase/auth'
import { useNavigate } from 'react-router-dom'
import { auth } from '../lib/firebase'
import { useAuthStore } from '../store/authStore'

export default function AwaitingApprovalPage() {
  const navigate = useNavigate()
  const { setUser } = useAuthStore()

  async function handleSignOut() {
    await signOut(auth)
    setUser(null)
    navigate('/login')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg text-center dark:bg-gray-800">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
          <svg className="h-8 w-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Your account is pending approval</h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          An admin will review your request. You'll be notified when approved.
        </p>
        <button
          onClick={handleSignOut}
          className="mt-6 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
