// src/renderer/src/pages/LoginPage.tsx
// Login and Sign Up page with separate tabs and forms

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from 'firebase/auth'
import { Eye, EyeOff, Loader2, Check } from 'lucide-react'
import { auth } from '../lib/firebase'
import { createUser, hasAnyAdmin, notifyAdminsOfPendingUser } from '../lib/firestore'
import { useAuthStore } from '../store/authStore'
// Logo placeholder - will use a div with text instead
import type { UserPreferences } from '../types'
import type { Timestamp } from 'firebase/firestore'
import { serverTimestamp } from 'firebase/firestore'

const ALLOWED_DOMAIN = import.meta.env.VITE_ALLOWED_DOMAIN || 'eliteflower.com'

export default function LoginPage() {
  const navigate = useNavigate()
  const { setUser } = useAuthStore()

  // Tab state
  const [activeTab, setActiveTab] = useState<'login' | 'signup'>('login')

  // Loading state
  const [isLoading, setIsLoading] = useState(false)

  // Error state
  const [error, setError] = useState<string | null>(null)

  // Login form state
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [showLoginPassword, setShowLoginPassword] = useState(false)

  // Sign up form state
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [signupEmail, setSignupEmail] = useState('')
  const [signupPassword, setSignupPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showSignupPassword, setShowSignupPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // Validation errors
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  function validateEmail(email: string): boolean {
    return email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`)
  }

  function validatePassword(password: string): { valid: boolean; errors: string[] } {
    const errors: string[] = []
    if (password.length < 6) {
      errors.push('At least 6 characters')
    }
    return { valid: errors.length === 0, errors }
  }

  function getPasswordStrength(password: string): { score: number; label: string; color: string } {
    let score = 0
    if (password.length >= 6) score++
    if (password.length >= 10) score++
    if (/[A-Z]/.test(password)) score++
    if (/[0-9]/.test(password)) score++
    if (/[^A-Za-z0-9]/.test(password)) score++

    const levels = [
      { label: 'Too weak', color: 'bg-red-500' },
      { label: 'Weak', color: 'bg-orange-500' },
      { label: 'Fair', color: 'bg-yellow-500' },
      { label: 'Good', color: 'bg-blue-500' },
      { label: 'Strong', color: 'bg-green-500' },
      { label: 'Very strong', color: 'bg-emerald-600' },
    ]

    return { score, ...levels[score] }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setFieldErrors({})

    // Validate email domain
    if (!validateEmail(loginEmail)) {
      setFieldErrors({ email: `Only @${ALLOWED_DOMAIN} emails are allowed` })
      return
    }

    setIsLoading(true)
    console.log('[Login] Starting login process...')

    try {
      // Set persistence based on remember me
      console.log('[Login] Setting persistence...')
      await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence)

      // Sign in
      console.log('[Login] Calling signInWithEmailAndPassword...')
      const credential = await signInWithEmailAndPassword(auth, loginEmail, loginPassword)
      const { user: firebaseUser } = credential
      console.log('[Login] Firebase auth successful, uid:', firebaseUser.uid)

      // Get user profile from Firestore
      console.log('[Login] Fetching user profile...')
      const { getUser } = await import('../lib/firestore')
      const appUser = await getUser(firebaseUser.uid)
      console.log('[Login] User profile:', appUser)

      if (!appUser) {
        console.error('[Login] No user profile found in Firestore')
        setError('User profile not found. Please contact support.')
        await auth.signOut()
        setIsLoading(false)
        return
      }

      // Check user status
      if (appUser.status === 'suspended') {
        setError('Your account has been suspended. Please contact an administrator.')
        await auth.signOut()
        setIsLoading(false)
        return
      }

      if (appUser.status === 'awaiting') {
        // Redirect to awaiting approval page
        console.log('[Login] User awaiting approval, redirecting...')
        setUser(appUser)
        navigate('/awaiting-approval')
        setIsLoading(false)
        return
      }

      // Active user - set user and navigate to dashboard
      console.log('[Login] Active user, navigating to dashboard...')
      setUser(appUser)
      navigate('/dashboard')
      setIsLoading(false)
    } catch (err: any) {
      console.error('[Login] Error:', err)
      
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
        setError('Invalid email or password')
      } else if (err.code === 'auth/too-many-requests') {
        setError('Too many failed attempts. Please try again later.')
      } else if (err.code === 'auth/user-disabled') {
        setError('This account has been disabled.')
      } else {
        setError(err.message || 'Failed to sign in. Please try again.')
      }
      setIsLoading(false)
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setFieldErrors({})

    const errors: Record<string, string> = {}

    // Validate first name
    if (!firstName.trim()) {
      errors.firstName = 'First name is required'
    }

    // Validate email domain
    if (!validateEmail(signupEmail)) {
      errors.signupEmail = `Only @${ALLOWED_DOMAIN} emails are allowed`
    }

    // Validate password
    const passwordValidation = validatePassword(signupPassword)
    if (!passwordValidation.valid) {
      errors.signupPassword = passwordValidation.errors.join(', ')
    }

    // Validate password match
    if (signupPassword !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match'
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    setIsLoading(true)

    try {
      // Check if this is the first user (for owner role)
      const anyAdminExists = await hasAnyAdmin()

      // Create Firebase Auth user
      const credential = await createUserWithEmailAndPassword(auth, signupEmail, signupPassword)
      const { user: firebaseUser } = credential

      // Determine role and status
      const role = anyAdminExists ? 'member' : 'owner'
      const status = anyAdminExists ? 'awaiting' : 'active'

      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim()

      // Create user preferences
      const preferences: UserPreferences = {
        theme: 'system',
        dndEnabled: false,
        dndStart: '22:00',
        dndEnd: '08:00',
        shortcuts: {},
        sharePointPath: '',
        calendarView: 'week',
        defaultBoardView: 'cards',
        trashRetentionDays: 30,
      }

      // Create user document in Firestore
      const now = serverTimestamp() as unknown as Timestamp
      const appUser = await createUser(firebaseUser.uid, {
        email: signupEmail.toLowerCase(),
        name: fullName,
        role,
        status,
        preferences,
        createdAt: now,
        lastSeen: now,
      })

      // If awaiting approval, notify admins
      if (status === 'awaiting') {
        await notifyAdminsOfPendingUser(appUser)
      }

      // Set user and redirect
      setUser(appUser)

      if (status === 'awaiting') {
        navigate('/awaiting-approval')
      } else {
        navigate('/dashboard')
      }
    } catch (err: any) {
      console.error('Signup error:', err)
      
      if (err.code === 'auth/email-already-in-use') {
        setError('An account with this email already exists. Please sign in instead.')
        setActiveTab('login')
        setLoginEmail(signupEmail)
      } else if (err.code === 'auth/invalid-email') {
        setFieldErrors({ signupEmail: 'Invalid email address' })
      } else if (err.code === 'auth/weak-password') {
        setFieldErrors({ signupPassword: 'Password is too weak' })
      } else {
        setError(err.message || 'Failed to create account. Please try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const passwordStrength = getPasswordStrength(signupPassword)

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-green-500 shadow-lg shadow-green-500/20">
            <span className="text-2xl font-bold text-white">EF</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">NPD Planner</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Elite Flower Operations</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800">
          {/* Tabs */}
          <div className="flex border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={() => {
                setActiveTab('login')
                setError(null)
                setFieldErrors({})
              }}
              className={`flex-1 px-4 py-4 text-sm font-medium transition-colors ${
                activeTab === 'login'
                  ? 'border-b-2 border-green-500 text-green-600 dark:text-green-400'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => {
                setActiveTab('signup')
                setError(null)
                setFieldErrors({})
              }}
              className={`flex-1 px-4 py-4 text-sm font-medium transition-colors ${
                activeTab === 'signup'
                  ? 'border-b-2 border-green-500 text-green-600 dark:text-green-400'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              Create Account
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            {/* Error message */}
            {error && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                {error}
              </div>
            )}

            {activeTab === 'login' ? (
              /* Login Form */
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Email
                  </label>
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder={`you@${ALLOWED_DOMAIN}`}
                    className={`w-full rounded-lg border px-3 py-2.5 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-green-500/20 dark:bg-gray-700 dark:text-white ${
                      fieldErrors.email
                        ? 'border-red-300 focus:border-red-500 dark:border-red-700'
                        : 'border-gray-300 focus:border-green-500 dark:border-gray-600'
                    }`}
                    required
                  />
                  {fieldErrors.email && (
                    <p className="mt-1 text-xs text-red-500">{fieldErrors.email}</p>
                  )}
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showLoginPassword ? 'text' : 'password'}
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 pr-10 text-sm transition-colors focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword(!showLoginPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      tabIndex={-1}
                    >
                      {showLoginPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500 dark:border-gray-600 dark:bg-gray-700"
                    />
                    <span className="text-sm text-gray-600 dark:text-gray-400">Remember me</span>
                  </label>
                  <button
                    type="button"
                    className="text-sm text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
                  >
                    Forgot password?
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex w-full items-center justify-center rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={18} className="mr-2 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    'Sign In'
                  )}
                </button>
              </form>
            ) : (
              /* Sign Up Form */
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      First Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="John"
                      className={`w-full rounded-lg border px-3 py-2.5 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-green-500/20 dark:bg-gray-700 dark:text-white ${
                        fieldErrors.firstName
                          ? 'border-red-300 focus:border-red-500 dark:border-red-700'
                          : 'border-gray-300 focus:border-green-500 dark:border-gray-600'
                      }`}
                      required
                    />
                    {fieldErrors.firstName && (
                      <p className="mt-1 text-xs text-red-500">{fieldErrors.firstName}</p>
                    )}
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Last Name
                    </label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Doe"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm transition-colors focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    placeholder={`you@${ALLOWED_DOMAIN}`}
                    className={`w-full rounded-lg border px-3 py-2.5 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-green-500/20 dark:bg-gray-700 dark:text-white ${
                      fieldErrors.signupEmail
                        ? 'border-red-300 focus:border-red-500 dark:border-red-700'
                        : 'border-gray-300 focus:border-green-500 dark:border-gray-600'
                    }`}
                    required
                  />
                  {fieldErrors.signupEmail && (
                    <p className="mt-1 text-xs text-red-500">{fieldErrors.signupEmail}</p>
                  )}
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Only @{ALLOWED_DOMAIN} emails are allowed
                  </p>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Password <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showSignupPassword ? 'text' : 'password'}
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      placeholder="Create a password"
                      className={`w-full rounded-lg border px-3 py-2.5 pr-10 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-green-500/20 dark:bg-gray-700 dark:text-white ${
                        fieldErrors.signupPassword
                          ? 'border-red-300 focus:border-red-500 dark:border-red-700'
                          : 'border-gray-300 focus:border-green-500 dark:border-gray-600'
                      }`}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowSignupPassword(!showSignupPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      tabIndex={-1}
                    >
                      {showSignupPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {fieldErrors.signupPassword && (
                    <p className="mt-1 text-xs text-red-500">{fieldErrors.signupPassword}</p>
                  )}

                  {/* Password strength indicator */}
                  {signupPassword && (
                    <div className="mt-2">
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((level) => (
                          <div
                            key={level}
                            className={`h-1 flex-1 rounded-full transition-colors ${
                              level <= passwordStrength.score
                                ? passwordStrength.color
                                : 'bg-gray-200 dark:bg-gray-700'
                            }`}
                          />
                        ))}
                      </div>
                      <p className={`mt-1 text-xs ${
                        passwordStrength.score >= 3
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-gray-500 dark:text-gray-400'
                      }`}>
                        {passwordStrength.label}
                      </p>
                    </div>
                  )}
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Confirm Password <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm your password"
                      className={`w-full rounded-lg border px-3 py-2.5 pr-10 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-green-500/20 dark:bg-gray-700 dark:text-white ${
                        fieldErrors.confirmPassword
                          ? 'border-red-300 focus:border-red-500 dark:border-red-700'
                          : confirmPassword && confirmPassword === signupPassword
                          ? 'border-green-300 focus:border-green-500 dark:border-green-700'
                          : 'border-gray-300 focus:border-green-500 dark:border-gray-600'
                      }`}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      tabIndex={-1}
                    >
                      {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {fieldErrors.confirmPassword && (
                    <p className="mt-1 text-xs text-red-500">{fieldErrors.confirmPassword}</p>
                  )}
                  {confirmPassword && confirmPassword === signupPassword && !fieldErrors.confirmPassword && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                      <Check size={12} /> Passwords match
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex w-full items-center justify-center rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={18} className="mr-2 animate-spin" />
                      Creating account...
                    </>
                  ) : (
                    'Create Account'
                  )}
                </button>

                <p className="text-center text-xs text-gray-500 dark:text-gray-400">
                  By creating an account, you agree to await admin approval before accessing the system.
                </p>
              </form>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-gray-500 dark:text-gray-400">
          © {new Date().getFullYear()} CS Automations. All rights reserved.
        </p>
      </div>
    </div>
  )
}
