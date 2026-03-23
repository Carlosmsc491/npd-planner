// src/renderer/src/hooks/useRecipeFiles.ts
// Merges Firestore file records with the local filesystem scan

import { useState, useEffect, useMemo } from 'react'
import { subscribeToRecipeFiles, upsertRecipeFile } from '../lib/recipeFirestore'
import { DEFAULT_RECIPE_DISTRIBUTION } from '../types'
import type { RecipeFile, RecipeScannedFile } from '../types'
import { Timestamp } from 'firebase/firestore'

export function useRecipeFiles(projectId: string, rootPath: string, scanKey = 0) {
  const [fsFiles, setFsFiles] = useState<RecipeScannedFile[]>([])
  const [firestoreFiles, setFirestoreFiles] = useState<RecipeFile[]>([])
  const [isScanning, setIsScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)

  // ── EFECTO 1: Escaneo del filesystem (solo cuando scanKey cambia) ──────────
  useEffect(() => {
    if (!projectId || !rootPath) return

    let cancelled = false
    setIsScanning(true)
    setScanError(null)

    // Verificar primero que la carpeta existe
    window.electronAPI.recipePathExists(rootPath)
      .then((exists) => {
        if (cancelled) return

        if (!exists) {
          setScanError(`Project folder not found: ${rootPath}`)
          setIsScanning(false)
          return
        }

        // La carpeta existe — proceder con el scan
        return window.electronAPI.recipeScanProject(rootPath)
      })
      .then((scanned) => {
        if (cancelled || !scanned) return
        setFsFiles(scanned)
        setIsScanning(false)
      })
      .catch((err) => {
        if (cancelled) return
        console.error('recipeScanProject failed:', err)
        setScanError(`Cannot access project folder: ${String(err)}`)
        setIsScanning(false)
      })

    return () => { cancelled = true }
  }, [projectId, rootPath, scanKey])

  // ── EFECTO 2: Suscripción Firestore (independiente del scan) ───────────────
  useEffect(() => {
    if (!projectId) return

    const unsub = subscribeToRecipeFiles(projectId, (firestoreFiles) => {
      setFirestoreFiles(firestoreFiles)
    })

    return unsub
  }, [projectId])

  // ── MERGE: Combinar filesystem + Firestore sin re-escanear disco ───────────
  const files = useMemo(() => {
    return mergeFilesWithFirestore(fsFiles, firestoreFiles, projectId)
  }, [fsFiles, firestoreFiles, projectId])

  // ── Group by top-level folder ─────────────────────────────────────────────
  const filesByFolder: Record<string, RecipeFile[]> = useMemo(() => {
    const grouped: Record<string, RecipeFile[]> = {}
    for (const file of files) {
      const parts = file.relativePath.split('/')
      const folder = parts.length > 1 ? parts[0] : '(root)'
      if (!grouped[folder]) grouped[folder] = []
      grouped[folder].push(file)
    }
    return grouped
  }, [files])

  return {
    files,
    filesByFolder,
    isLoading: isScanning && firestoreFiles.length === 0,
    isScanning,
    scanError,
  }
}

// ── Helper: Merge filesystem entries con Firestore data ──────────────────────
function mergeFilesWithFirestore(
  fsFiles: RecipeScannedFile[],
  firestoreFiles: RecipeFile[],
  projectId: string
): RecipeFile[] {
  // Files en Firestore keyed by fileId
  const firestoreByFileId = new Map(firestoreFiles.map((f) => [f.fileId, f]))
  const firestoreByPath = new Map(firestoreFiles.map((f) => [f.relativePath, f]))

  const result: RecipeFile[] = []
  const now = Timestamp.now()

  for (const fsFile of fsFiles) {
    const fileId = `${projectId}::${fsFile.relativePath}`

    // Buscar en Firestore por fileId primero, luego por relativePath (para compatibilidad)
    const existing = firestoreByFileId.get(fileId) || firestoreByPath.get(fsFile.relativePath)

    if (existing) {
      // Usar el registro existente de Firestore (con metadata como locks, overrides, etc.)
      // Pero actualizar los campos del filesystem si cambiaron
      if (existing.price !== fsFile.price ||
          existing.option !== fsFile.option ||
          existing.recipeName !== fsFile.name ||
          existing.displayName !== fsFile.displayName) {
        // El archivo cambió en disco — actualizar en Firestore async
        const updated: RecipeFile = {
          ...existing,
          price: fsFile.price,
          option: fsFile.option,
          recipeName: fsFile.name,
          displayName: fsFile.displayName,
          updatedAt: now,
        }
        upsertRecipeFile(projectId, fileId, updated).catch(console.error)
        result.push(updated)
      } else {
        result.push(existing)
      }
    } else {
      // Nuevo archivo en filesystem — crear en Firestore
      const newFile: RecipeFile = {
        id: fileId,
        projectId,
        fileId,
        relativePath: fsFile.relativePath,
        displayName: fsFile.displayName,
        price: fsFile.price,
        option: fsFile.option,
        recipeName: fsFile.name,
        holidayOverride: '',
        customerOverride: '',
        wetPackOverride: 'N',
        distributionOverride: { ...DEFAULT_RECIPE_DISTRIBUTION },
        status: 'pending',
        lockedBy: null,
        lockClaimedAt: null,
        lockHeartbeatAt: null,
        lockToken: null,
        doneBy: null,
        doneAt: null,
        requiresManualUpdate: false,
        version: 0,
        updatedAt: now,
      }
      upsertRecipeFile(projectId, fileId, newFile).catch(console.error)
      result.push(newFile)
    }
  }

  // Ordenar por carpeta y nombre
  result.sort((a, b) => {
    const folderA = a.relativePath.split('/')[0] || ''
    const folderB = b.relativePath.split('/')[0] || ''
    if (folderA !== folderB) return folderA.localeCompare(folderB)
    return a.displayName.localeCompare(b.displayName)
  })

  return result
}
