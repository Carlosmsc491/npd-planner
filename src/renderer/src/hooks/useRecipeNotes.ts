// src/renderer/src/hooks/useRecipeNotes.ts
// Real-time subscription to a recipe file's notes subcollection

import { useState, useEffect, useRef } from 'react'
import { subscribeToRecipeNotes, repairActiveNotesCount } from '../lib/recipeFirestore'
import type { RecipeNote } from '../types'

export function useRecipeNotes(projectId: string, fileId: string, storedCount?: number) {
  const [notes, setNotes]     = useState<RecipeNote[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const repairedRef = useRef(false)

  useEffect(() => {
    if (!projectId || !fileId) {
      setNotes([])
      setIsLoading(false)
      return
    }

    repairedRef.current = false
    setIsLoading(true)
    setError(null)
    const unsub = subscribeToRecipeNotes(
      projectId,
      fileId,
      (incoming) => {
        setNotes(incoming)
        setIsLoading(false)
      },
      (err) => {
        setError(err.message)
        setIsLoading(false)
      }
    )

    return unsub
  }, [projectId, fileId])

  const activeNotes   = notes.filter((n) => n.resolvedAt === null)
  const resolvedNotes = notes.filter((n) => n.resolvedAt !== null)

  // Self-heal: if storedCount differs from the live count, repair once per mount
  useEffect(() => {
    if (isLoading) return
    if (storedCount === undefined) return
    if (repairedRef.current) return
    if (activeNotes.length === storedCount) return
    repairedRef.current = true
    repairActiveNotesCount(projectId, fileId, activeNotes.length).catch(() => {/* silent */})
  }, [isLoading, activeNotes.length, storedCount, projectId, fileId])

  return { notes, activeNotes, resolvedNotes, isLoading, error }
}
