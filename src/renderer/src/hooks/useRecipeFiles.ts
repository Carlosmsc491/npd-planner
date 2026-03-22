// src/renderer/src/hooks/useRecipeFiles.ts
// Merges Firestore file records with the local filesystem scan

import { useState, useEffect } from 'react'
import { subscribeToRecipeFiles, upsertRecipeFile } from '../lib/recipeFirestore'
import { DEFAULT_RECIPE_DISTRIBUTION } from '../types'
import type { RecipeFile } from '../types'
import { Timestamp } from 'firebase/firestore'

export function useRecipeFiles(projectId: string, rootPath: string, _scanKey = 0) {
  const [files, setFiles] = useState<RecipeFile[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!projectId || !rootPath) return

    setIsLoading(true)

    const unsub = subscribeToRecipeFiles(projectId, async (firestoreFiles) => {
      // Scan filesystem for .xlsx files
      let scanned: Array<{
        relativePath: string
        displayName: string
        price: string
        option: string
        name: string
      }> = []

      try {
        scanned = await window.electronAPI.recipeScanProject(rootPath)
      } catch (err) {
        console.error('recipeScanProject error:', err)
      }

      // Files in Firestore keyed by relativePath
      const firestoreByPath = new Map(firestoreFiles.map((f) => [f.relativePath, f]))

      // Detect files present on disk but missing in Firestore → register as pending
      const toCreate: RecipeFile[] = []
      for (const s of scanned) {
        if (!firestoreByPath.has(s.relativePath)) {
          const fileId = `${projectId}::${s.relativePath}`
          const newFile: RecipeFile = {
            id:                   fileId,
            projectId,
            fileId,
            relativePath:         s.relativePath,
            displayName:          s.displayName,
            price:                s.price,
            option:               s.option,
            recipeName:           s.name,
            holidayOverride:      '',
            customerOverride:     '',
            wetPackOverride:      'N',
            distributionOverride: { ...DEFAULT_RECIPE_DISTRIBUTION },
            status:               'pending',
            lockedBy:             null,
            lockClaimedAt:        null,
            lockHeartbeatAt:      null,
            lockToken:            null,
            doneBy:               null,
            doneAt:               null,
            requiresManualUpdate: false,
            version:              0,
            updatedAt:            Timestamp.now(),
          }
          upsertRecipeFile(projectId, fileId, newFile).catch(console.error)
          toCreate.push(newFile)
        }
      }

      const merged = [...firestoreFiles, ...toCreate]
      setFiles(merged)
      setIsLoading(false)
    })

    return unsub
  }, [projectId, rootPath, _scanKey])

  // ── Group by top-level folder ────────────────────────────────────────────
  const filesByFolder: Record<string, RecipeFile[]> = {}
  for (const file of files) {
    const parts = file.relativePath.split('/')
    const folder = parts.length > 1 ? parts[0] : '(root)'
    if (!filesByFolder[folder]) filesByFolder[folder] = []
    filesByFolder[folder].push(file)
  }

  return { files, filesByFolder, isLoading }
}
