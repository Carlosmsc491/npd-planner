// src/renderer/src/hooks/useDivisions.ts
// Hook to fetch divisions for a specific client

import { useState, useEffect } from 'react'
import { subscribeToDivisions } from '../lib/firestore'
import type { Division } from '../types'

export function useDivisions(clientId: string | null | undefined) {
  const [divisions, setDivisions] = useState<Division[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // Reset when clientId is empty
    if (!clientId) {
      setDivisions([])
      setLoading(false)
      return
    }

    setLoading(true)
    const unsub = subscribeToDivisions(clientId, (data) => {
      setDivisions(data)
      setLoading(false)
    })

    return () => {
      unsub()
    }
  }, [clientId])

  return { divisions, loading }
}
