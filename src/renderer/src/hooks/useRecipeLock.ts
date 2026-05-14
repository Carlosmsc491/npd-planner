// src/renderer/src/hooks/useRecipeLock.ts
// Manages collaborative file locking for Recipe Manager
// Heartbeat removed in v1.8.0 — locks are permanent until released or force-claimed

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  claimRecipeFile,
  unclaimRecipeFile,
  forceClaimRecipeFile,
} from '../lib/recipeFirestore'

interface LockState {
  projectId: string
  fileId: string
  lockToken: string
}

export function useRecipeLock() {
  const [currentLock, setCurrentLock] = useState<LockState | null>(null)
  const lockRef = useRef<LockState | null>(null)
  lockRef.current = currentLock

  // Release lock when the hook unmounts (user closes project)
  useEffect(() => {
    return () => {
      const lock = lockRef.current
      if (lock) {
        unclaimRecipeFile(lock.projectId, lock.fileId, lock.lockToken).catch(
          console.error
        )
      }
    }
  }, [])

  const claimFile = useCallback(
    async (projectId: string, fileId: string, userName: string): Promise<string> => {
      console.log('[NPD] useRecipeLock.claimFile called', { projectId, fileId, userName })
      try {
        const lockToken = await claimRecipeFile(projectId, fileId, userName)
        console.log('[NPD] useRecipeLock.claimFile SUCCESS — lockToken:', lockToken)
        const lock = { projectId, fileId, lockToken }
        setCurrentLock(lock)
        lockRef.current = lock
        return lockToken
      } catch (err) {
        console.error('[NPD] useRecipeLock.claimFile ERROR:', err)
        throw err
      }
    },
    []
  )

  const unclaimFile = useCallback(async (): Promise<void> => {
    const lock = lockRef.current
    if (!lock) return
    await unclaimRecipeFile(lock.projectId, lock.fileId, lock.lockToken)
    setCurrentLock(null)
    lockRef.current = null
  }, [])

  const forceClaimFile = useCallback(
    async (projectId: string, fileId: string, userName: string): Promise<string> => {
      const lockToken = await forceClaimRecipeFile(projectId, fileId, userName)
      const lock = { projectId, fileId, lockToken }
      setCurrentLock(lock)
      lockRef.current = lock
      return lockToken
    },
    []
  )

  return { currentLock, claimFile, unclaimFile, forceClaimFile }
}
