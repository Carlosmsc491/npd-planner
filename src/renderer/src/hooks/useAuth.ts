// src/renderer/src/hooks/useAuth.ts
// Subscribes to Firebase auth state and loads user document from Firestore
// Exposes: user, isAdmin, isOwner, isFounder, isLoading, signOut

import { useEffect, useCallback } from 'react'
import { onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth'
import { useNavigate } from 'react-router-dom'
import { auth } from '../lib/firebase'
import { getUser, subscribeToPlatformGovernance, bootstrapFounder } from '../lib/firestore'
import { useAuthStore } from '../store/authStore'
import type { AppUser } from '../types'

export function useAuth() {
  const { user, isLoading, founderUid, setUser, setLoading, setFounderUid } = useAuthStore()
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
          // Founder bootstrap: the first owner to log in claims founder status
          // (no-op once settings/platform exists — rules enforce it too)
          if (appUser?.role === 'owner' && appUser.status === 'active') {
            void bootstrapFounder(appUser.uid)
          }
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

  // Single-doc listener on settings/platform — keeps founderUid current for
  // permission checks (only the founder can mint owners / transfer legacy)
  useEffect(() => {
    if (!user) {
      setFounderUid(null)
      return
    }
    const unsub = subscribeToPlatformGovernance((gov) => setFounderUid(gov?.founderUid ?? null))
    return unsub
  }, [user?.uid, setFounderUid])

  const signOut = useCallback(async () => {
    try {
      // Long-lived task listeners must die before auth does — security rules
      // reject unauthenticated reads and the listeners would error-loop.
      const { releaseAllTaskListeners } = await import('../lib/taskSubscriptions')
      releaseAllTaskListeners()
      await firebaseSignOut(auth)
      setUser(null)
      navigate('/login')
    } catch (err) {
      console.error('Sign out failed:', err)
    }
  }, [setUser, navigate])

  const isOwner = user?.role === 'owner'
  const isAdmin = user?.role === 'admin' || isOwner
  const isFounder = !!user && !!founderUid && user.uid === founderUid && isOwner

  return { user, isAdmin, isOwner, isFounder, founderUid, isLoading, signOut }
}
