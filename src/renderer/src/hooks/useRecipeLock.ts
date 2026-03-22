// src/renderer/src/hooks/useRecipeLock.ts
// Manages collaborative file locking with heartbeat for Recipe Manager

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  claimRecipeFile,
  unclaimRecipeFile,
  updateRecipeHeartbeat,
} from '../lib/recipeFirestore'

interface LockState {
  projectId: string
  fileId: string
  lockToken: string
}

export function useRecipeLock() {
  const [currentLock, setCurrentLock] = useState<LockState | null>(null)
  // Keep a ref so cleanup effects always have the latest lock without stale closure
  const lockRef = useRef<LockState | null>(null)
  lockRef.current = currentLock

  // ── Heartbeat: update every 15 s while a file is claimed ────────────────
  useEffect(() => {
    if (!currentLock) return

    const interval = setInterval(() => {
      updateRecipeHeartbeat(
        currentLock.projectId,
        currentLock.fileId,
        currentLock.lockToken
      ).catch(console.error)
    }, 15_000)

    return () => clearInterval(interval)
  }, [currentLock])

  // ── Release lock when the hook unmounts ──────────────────────────────────
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

  // ── Actions ──────────────────────────────────────────────────────────────

  const claimFile = useCallback(
    async (projectId: string, fileId: string, userName: string): Promise<string> => {
      const lockToken = await claimRecipeFile(projectId, fileId, userName)
      const lock = { projectId, fileId, lockToken }
      setCurrentLock(lock)
      lockRef.current = lock
      return lockToken
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

  return { currentLock, claimFile, unclaimFile }
}
