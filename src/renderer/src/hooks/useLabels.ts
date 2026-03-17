import { useEffect } from 'react'
import { subscribeToLabels } from '../lib/firestore'
import { useSettingsStore } from '../store/settingsStore'

export function useLabels() {
  const { labels, setLabels } = useSettingsStore()

  useEffect(() => {
    const unsub = subscribeToLabels(setLabels)
    return unsub
  }, [setLabels])

  return { labels }
}
