import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { AppUser } from '../types'

interface AuthState {
  user: AppUser | null
  isLoading: boolean
  founderUid: string | null   // settings/platform.founderUid — single platform founder
  setUser: (user: AppUser | null) => void
  setLoading: (loading: boolean) => void
  setFounderUid: (founderUid: string | null) => void
}

export const useAuthStore = create<AuthState>()(
  subscribeWithSelector((set) => ({
    user: null,
    isLoading: true,
    founderUid: null,
    setUser: (user) => set({ user }),
    setLoading: (isLoading) => set({ isLoading }),
    setFounderUid: (founderUid) => set({ founderUid }),
  }))
)
