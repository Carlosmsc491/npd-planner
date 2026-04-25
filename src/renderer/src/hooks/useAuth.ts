// src/renderer/src/hooks/useAuth.ts
// Subscribes to Firebase auth state and loads user document from Firestore
// Exposes: user, isAdmin, isLoading, signOut

import { useEffect, useCallback } from 'react'
import { onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth'
import { useNavigate } from 'react-router-dom'
import { auth } from '../lib/firebase'
import { getUser } from '../lib/firestore'
import { useAuthStore } from '../store/authStore'
import type { AppUser } from '../types'

export function useAuth() {
  const { user, isLoading, setUser, setLoading } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Race against a 15-second timeout so the loading spinner never hangs
        // forever when Firestore is unreachable on first launch with no cached data.
        const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), 15_000))
        try {
          const appUser = await Promise.race([getUser(firebaseUser.uid), timeout]) as AppUser | null
          setUser(appUser)
        } catch {
          setUser(null)
        }
      } else {
        setUser(null)
      }
      setLoading(false)
    })

    return unsubscribe
  }, [setUser, setLoading])

  const signOut = useCallback(async () => {
    try {
      await firebaseSignOut(auth)
      setUser(null)
      navigate('/login')
    } catch (err) {
      console.error('Sign out failed:', err)
    }
  }, [setUser, navigate])

  const isOwner = user?.role === 'owner'
  const isAdmin = user?.role === 'admin' || isOwner

  return { user, isAdmin, isOwner, isLoading, signOut }
}
