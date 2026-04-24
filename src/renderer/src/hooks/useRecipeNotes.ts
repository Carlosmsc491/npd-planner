// src/renderer/src/hooks/useRecipeNotes.ts
// Real-time subscription to a recipe file's notes subcollection

import { useState, useEffect } from 'react'
import { subscribeToRecipeNotes } from '../lib/recipeFirestore'
import type { RecipeNote } from '../types'

export function useRecipeNotes(projectId: string, fileId: string) {
  const [notes, setNotes]     = useState<RecipeNote[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    if (!projectId || !fileId) {
      setNotes([])
      setIsLoading(false)
      return
    }

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

  return { notes, activeNotes, resolvedNotes, isLoading, error }
}
