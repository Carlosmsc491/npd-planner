import { useEffect } from 'react'
import { subscribeToClients, createClient } from '../lib/firestore'
import { useSettingsStore } from '../store/settingsStore'
import { useAuthStore } from '../store/authStore'

export function useClients() {
  const { clients, setClients } = useSettingsStore()
  const { user } = useAuthStore()

  useEffect(() => {
    const unsub = subscribeToClients(setClients)
    return unsub
  }, [setClients])

  async function addClient(name: string): Promise<string> {
    if (!user) throw new Error('Not authenticated')
    return createClient(name, user.uid)
  }

  return { clients, addClient }
}
