import { create } from 'zustand'
import type { AppUser } from '../types'

interface AuthState {
  user: AppUser | null
  loading: boolean
  setUser: (u: AppUser | null) => void
  setLoading: (v: boolean) => void
}

// Simple zustand store — no immer needed for this slim app
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  setUser:    (user)    => set({ user, loading: false }),
  setLoading: (loading) => set({ loading }),
}))
