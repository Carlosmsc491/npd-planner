// src/renderer/src/hooks/useRecipeFiles.ts
// Merges Firestore file records with the local filesystem scan

import { useState, useEffect, useMemo, useRef } from 'react'
import { subscribeToRecipeFiles, upsertRecipeFile, migrateRecipeFile, writeRecipeUid } from '../lib/recipeFirestore'
import { DEFAULT_RECIPE_DISTRIBUTION } from '../types'
import type { RecipeFile, RecipeScannedFile } from '../types'
import { Timestamp } from 'firebase/firestore'

export function useRecipeFiles(projectId: string, rootPath: string, scanKey = 0) {
  const [fsFiles, setFsFiles] = useState<RecipeScannedFile[]>([])
  const [firestoreFiles, setFirestoreFiles] = useState<RecipeFile[]>([])
  const [isScanning, setIsScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  // Track which fileIds have had their recipeUid backfilled this session (avoids repeated writes)
  const backfilledUids = useRef<Set<string>>(new Set())

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

  // ── EFECTO 3: Backfill recipeUid para archivos legacy (Z52 vacío en el scan) ─
  // Once per session per file — writes the UUID to Excel and Firestore.
  useEffect(() => {
    if (!projectId || fsFiles.length === 0 || firestoreFiles.length === 0) return

    for (const fsFile of fsFiles) {
      if (!fsFile.recipeUid) continue   // no UID in Excel yet
      const fileId = `${projectId}::${fsFile.relativePath.replace(/\\/g, '/').replace(/\//g, '|')}`
      const existing = firestoreFiles.find(f => f.fileId === fileId || f.relativePath === fsFile.relativePath)
      if (!existing) continue
      if (existing.recipeUid) continue  // already has it
      if (backfilledUids.current.has(fileId)) continue  // already done this session

      backfilledUids.current.add(fileId)
      writeRecipeUid(projectId, existing.fileId, fsFile.recipeUid).catch(console.error)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fsFiles, firestoreFiles, projectId])

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
  // Files en Firestore keyed by fileId, relativePath, and stable recipeUid
  const firestoreByFileId = new Map(firestoreFiles.map((f) => [f.fileId, f]))
  const firestoreByPath   = new Map(firestoreFiles.map((f) => [f.relativePath, f]))
  const firestoreByUid    = new Map(firestoreFiles.filter(f => f.recipeUid).map((f) => [f.recipeUid, f]))

  // ── Detectar docs huérfanos (en Firestore pero sin match en disco) ──────────
  // Usados para recuperar fotos cuando se renombra un archivo o carpeta.
  const fsFileIdSet    = new Set(fsFiles.map(f => `${projectId}::${f.relativePath.replace(/\\/g, '/').replace(/\//g, '|')}`))
  const fsRelPathSet   = new Set(fsFiles.map(f => f.relativePath))
  const orphanedDocs   = firestoreFiles.filter(
    f => !fsFileIdSet.has(f.fileId) && !fsRelPathSet.has(f.relativePath)
  )

  // Agrupar huérfanos por carpeta y por displayName para matching rápido
  const orphansBySubfolder = new Map<string, RecipeFile[]>()
  const orphansByDisplayName = new Map<string, RecipeFile>()
  for (const orphan of orphanedDocs) {
    const sub = orphan.relativePath.split('/')[0] ?? ''
    if (!orphansBySubfolder.has(sub)) orphansBySubfolder.set(sub, [])
    orphansBySubfolder.get(sub)!.push(orphan)
    // displayName is unique enough within a project for cross-folder matching
    orphansByDisplayName.set(orphan.displayName, orphan)
  }

  const usedOrphanIds = new Set<string>()

  const result: RecipeFile[] = []
  const now = Timestamp.now()

  for (const fsFile of fsFiles) {
    const fileId = `${projectId}::${fsFile.relativePath.replace(/\\/g, '/').replace(/\//g, '|')}`

    // Priority 1: match by stable recipeUid (survives any rename or move)
    const byUid = fsFile.recipeUid ? firestoreByUid.get(fsFile.recipeUid) : undefined
    // Priority 2/3: match by fileId or relativePath (existing behaviour)
    const existing = byUid || firestoreByFileId.get(fileId) || firestoreByPath.get(fsFile.relativePath)

    if (existing) {
      // If matched by UID but the path/fileId changed → file was renamed/moved
      const pathChanged = existing.fileId !== fileId || existing.relativePath !== fsFile.relativePath
      const metaChanged = existing.price !== fsFile.price ||
        existing.option !== fsFile.option ||
        existing.recipeName !== fsFile.name ||
        existing.displayName !== fsFile.displayName

      if (pathChanged || metaChanged) {
        const updated: RecipeFile = {
          ...existing,
          id:           fileId,
          fileId,
          relativePath: fsFile.relativePath,
          displayName:  fsFile.displayName,
          price:        fsFile.price,
          option:       fsFile.option,
          recipeName:   fsFile.name,
          recipeUid:    fsFile.recipeUid || existing.recipeUid,
          updatedAt:    now,
        }
        // If the doc path changed (rename), migrate the Firestore doc
        if (pathChanged) {
          migrateRecipeFile(projectId, existing.fileId, fileId, updated).catch(console.error)
        } else {
          upsertRecipeFile(projectId, fileId, updated).catch(console.error)
        }
        result.push(updated)
      } else {
        // Ensure recipeUid is stored even if nothing else changed
        if (fsFile.recipeUid && !existing.recipeUid) {
          const withUid = { ...existing, recipeUid: fsFile.recipeUid }
          upsertRecipeFile(projectId, fileId, withUid).catch(console.error)
          result.push(withUid)
        } else {
          result.push(existing)
        }
      }
    } else {
      // No hay match directo — intentar recuperar un doc huérfano (rename detectado)
      const subfolder = fsFile.relativePath.split('/')[0] ?? ''
      const subOrphans = (orphansBySubfolder.get(subfolder) ?? [])
        .filter(o => !usedOrphanIds.has(o.fileId))

      let orphan: RecipeFile | null = null

      if (subOrphans.length === 1) {
        // Exactamente 1 huérfano en la misma carpeta → rename de archivo
        orphan = subOrphans[0]
      } else if (subOrphans.length === 0) {
        // Sin huérfanos en misma carpeta → buscar por displayName en todas las carpetas
        // (cubre rename de carpeta: misma receta, distinto subfolder)
        const crossFolderMatch = orphansByDisplayName.get(fsFile.displayName)
        if (crossFolderMatch && !usedOrphanIds.has(crossFolderMatch.fileId)) {
          orphan = crossFolderMatch
        }
      }
      // Si subOrphans.length > 1: múltiples candidatos → no auto-migrar, crear fresco

      if (orphan) {
        // ── Migración: mover fotos y metadata del doc huérfano al nuevo fileId ──
        usedOrphanIds.add(orphan.fileId)
        const migrated: RecipeFile = {
          ...orphan,
          id:           fileId,
          fileId,
          recipeUid:    fsFile.recipeUid || orphan.recipeUid,
          relativePath: fsFile.relativePath,
          displayName:  fsFile.displayName,
          price:        fsFile.price,
          option:       fsFile.option,
          recipeName:   fsFile.name,
          updatedAt:    now,
          // capturedPhotos, photoStatus, readyPngPath, locks, overrides → preserved from orphan
        }
        migrateRecipeFile(projectId, orphan.fileId, fileId, migrated).catch(console.error)
        result.push(migrated)
      } else {
        // Archivo genuinamente nuevo — crear registro vacío en Firestore
        const newFile: RecipeFile = {
          id: fileId,
          projectId,
          fileId,
          recipeUid: fsFile.recipeUid,
          relativePath: fsFile.relativePath,
          displayName: fsFile.displayName,
          price: fsFile.price,
          option: fsFile.option,
          recipeName: fsFile.name,
          holidayOverride: '',
          customerOverride: '',
          wetPackOverride: 'N',
          boxTypeOverride: '',
          pickNeededOverride: '',
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
          assignedTo: null,
          assignedToName: null,
          photoStatus: 'pending',
          capturedPhotos: [],
          readyPngPath: null,
          readyJpgPath: null,
          readyProcessedAt: null,
          readyProcessedBy: null,
          activeNotesCount: 0,
          cleanedPhotoPaths: [],
          cleanedPhotoStatus: null,
          cleanedPhotoDroppedAt: null,
          excelInsertedAt: null,
          excelInsertedBy: null,
        }
        upsertRecipeFile(projectId, fileId, newFile).catch(console.error)
        result.push(newFile)
      }
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
