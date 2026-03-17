import { create } from 'zustand'
import type { Client, Label } from '../types'

interface SettingsState {
  clients: Client[]
  labels: Label[]
  isOnline: boolean
  setClients: (clients: Client[]) => void
  setLabels: (labels: Label[]) => void
  setOnline: (online: boolean) => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
  clients: [],
  labels: [],
  isOnline: true,
  setClients: (clients) => set({ clients }),
  setLabels: (labels) => set({ labels }),
  setOnline: (isOnline) => set({ isOnline }),
}))
