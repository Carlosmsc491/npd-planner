import { create } from 'zustand'
import type { AppUser } from '../types'

interface AuthState {
  user: AppUser | null
  isLoading: boolean
  setUser: (user: AppUser | null) => void
  setLoading: (loading: boolean) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  setUser: (user) => set({ user }),
  setLoading: (isLoading) => set({ isLoading }),
}))
