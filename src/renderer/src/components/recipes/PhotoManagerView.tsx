// PhotoManagerView.tsx — Photo Manager: CAMERA · SELECTED · CLEANED · READY + KPIs
// Tabs: 1. CAMERA  |  2. SELECTED  |  3. CLEANED  |  4. READY
// Selection: checkbox overlay on hover, Select All, Select All from Recipe, Delete, Save As, ZIP

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  Camera, Star, Upload, ImageOff, Loader2, AlertTriangle,
  ExternalLink, CheckCircle2, Check, Trash2, FolderDown, Archive, Scissors, Wand2,
} from 'lucide-react'
import { collection, onSnapshot, doc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuthStore } from '../../store/authStore'
import {
  updateRecipeReadyPaths, updateRecipeCleanedPaths, updateRecipeExcelInserted,
  updateRecipePhotoSelections, acquireExcelInsertLock, releaseExcelInsertLock,
  EXCEL_LOCK_TTL_MS,
} from '../../lib/firestore'
import { resolvePhotoPath, toRelativePhotoPath } from '../../utils/photoUtils'
import { resolveAllRecipeNotes } from '../../lib/recipeFirestore'
import { canTakePhotos } from '../../lib/permissions'
import { useRecipeNotes } from '../../hooks/useRecipeNotes'
import { useCleanQueue } from '../../hooks/useCleanQueue'
import PhotoGalleryPopup from './PhotoGalleryPopup'
import CutoutCompareModal from '../ui/CutoutCompareModal'
import type { RecipeProject, RecipeFile, CapturedPhoto } from '../../types'
import type { PhotoManifest } from '../../../../shared/photoManifest'
import {
  loadAllManifests,
  toggleCameraSelected,
  removeCameraEntries,
  appendCleanedEntry,
  markCleanedDone,
  setReady,
  clearReady,
  markExcelInserted,
  migrateLegacyManifests,
} from '../../lib/photoManifestApi'
import { projectManifestOntoRecipe } from '../../lib/photoManifestProjection'

/** Derive subfolder + manifest ref from a recipe + current user. */
function refFromRecipe(recipe: RecipeFile, userId: string) {
  if (!recipe.recipeUid) return null
  const parts = recipe.relativePath.replace(/\\/g, '/').split('/')
  const subfolderName = parts.length > 1 ? parts[0] : ''
  return {
    recipeId:          recipe.id,
    recipeUid:         recipe.recipeUid,
    excelRelativePath: recipe.relativePath,
    recipeName:        recipe.recipeName || recipe.displayName,
    subfolderName,
    userId,
  }
}

interface Props {
  project: RecipeProject
  effectiveRootPath: string
  pathNotFound?: boolean
  onLocateFolder?: () => Promise<void>
  onBack: () => void
}

type Tab = 'camera' | 'selected' | 'cleaned' | 'ready'

interface PhotoGroup {
  folder: string
  recipeId: string
  recipeName: string
  activeNotesCount: number
  photos: (CapturedPhoto & { recipeId: string; recipeName: string })[]
}

interface NotesModalState {
  recipeId: string   // full fileId (projectId::...)
  projectId: string
  recipeName: string
}

interface WarningDialogState {
  file: File
  recipe: RecipeFile
  dataUrl: string
}

interface ExportFormatState {
  mode: 'saveAs' | 'zip'
  wantPng: boolean
  wantJpg: boolean
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function sanitize(name: string) {
  return name.replace(/[/\\:*?"<>|]/g, '-').trim()
}

// ── Main component ─────────────────────────────────────────────────────────────

export function PhotoManagerView({ project, effectiveRootPath, pathNotFound, onLocateFolder }: Props) {
  const { user } = useAuthStore()
  /**
   * Only owner + photographer (or anyone with the isPhotographer add-on) can
   * mutate the photo pipeline at the CAMERA / SELECTED / CLEANED stages and
   * promote files into READY. Everyone else has view + READY-only consumption
   * access (select, ZIP, download, insert into Excel).
   */
  const canEdit = user ? canTakePhotos(user) : false
  const [activeTab, setActiveTab]   = useState<Tab>('camera')
  const [recipesRaw, setRecipesRaw] = useState<RecipeFile[]>([])
  const [manifests, setManifests]   = useState<Record<string, PhotoManifest>>({})
  const [loading, setLoading]       = useState(true)

  // Gallery popup
  const [galleryOpen, setGalleryOpen]             = useState(false)
  const [galleryPhotos, setGalleryPhotos]         = useState<CapturedPhoto[]>([])
  const [galleryIndex, setGalleryIndex]           = useState(0)
  const [galleryRecipeName, setGalleryRecipeName] = useState('')

  // ── Selection state ─────────────────────────────────────────────────────────
  // CAMERA / SELECTED tabs: key = picturePath
  const [selectedPhotoKeys, setSelectedPhotoKeys] = useState<Set<string>>(new Set())
  const [lastSelectedRecipeId, setLastSelectedRecipeId]     = useState<string | null>(null)
  const [lastSelectedRecipeName, setLastSelectedRecipeName] = useState<string | null>(null)
  // READY tab: key = recipe.id
  const [selectedReadyIds, setSelectedReadyIds] = useState<Set<string>>(new Set())

  // Reset selection when tab changes
  useEffect(() => {
    setSelectedPhotoKeys(new Set())
    setSelectedReadyIds(new Set())
    setLastSelectedRecipeId(null)
    setLastSelectedRecipeName(null)
  }, [activeTab])

  // ── Dialogs ─────────────────────────────────────────────────────────────────
  const [deleteConfirm, setDeleteConfirm]   = useState(false)
  const [deleteLoading, setDeleteLoading]   = useState(false)
  const [exportFormat, setExportFormat]     = useState<ExportFormatState | null>(null)
  const [exportLoading, setExportLoading]   = useState(false)
  const [exportError, setExportError]       = useState<string | null>(null)
  const [warningDialog, setWarningDialog]   = useState<WarningDialogState | null>(null)
  const [warningProcessing, setWarningProcessing] = useState(false)
  const [notesModal, setNotesModal]         = useState<NotesModalState | null>(null)

  // ── CLEANED tab state ───────────────────────────────────────────────────────
  const [cleanedProcessing, setCleanedProcessing] = useState<string | null>(null)
  const [cleanedErrors, setCleanedErrors]         = useState<string[]>([])
  // Select Subject comparison (engine vs Photoshop)
  const [compare, setCompare] = useState<{ cleanedAbs: string; subjectPng: string; engineUrl: string | null; subjectUrl: string | null; name: string } | null>(null)
  const [compareBusy, setCompareBusy] = useState(false)
  const chooseRecut = async (keepSubject: boolean) => {
    if (!compare) return
    setCompareBusy(true)
    await window.electronAPI.bgRemovalResolveRecut({ keepSubject, enginePng: compare.cleanedAbs, subjectPng: compare.subjectPng })
    setCompareBusy(false)
    setCompare(null)
  }

  // ── READY tab state ─────────────────────────────────────────────────────────
  const [dragOver, setDragOver]           = useState(false)
  const [processing, setProcessing]       = useState<string[]>([])
  const [processErrors, setProcessErrors] = useState<string[]>([])
  const [manualAssign, setManualAssign]   = useState<{ file: File; dataUrl: string } | null>(null)
  const [manualRecipeSearch, setManualRecipeSearch]       = useState('')
  const [manualSelectedRecipe, setManualSelectedRecipe]   = useState<RecipeFile | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Load recipes (real-time so activeNotesCount updates when notes are resolved) ──

  useEffect(() => {
    setLoading(true)
    const unsub = onSnapshot(
      collection(db, 'recipeProjects', project.id, 'recipeFiles'),
      (snap) => {
        setRecipesRaw(snap.docs.map(d => ({ id: d.id, ...d.data() } as RecipeFile)))
        setLoading(false)
      },
      (err) => {
        console.error('[PhotoManagerView] load error:', err)
        setLoading(false)
      }
    )
    return unsub
  }, [project.id])

  // ── Load on-disk photo manifests once we have the project root ──────────────
  // The manifest is the source of truth; Firestore fields are read-only fallback
  // for legacy data that hasn't been migrated yet.
  useEffect(() => {
    if (!effectiveRootPath) { setManifests({}); return }
    let cancelled = false
    loadAllManifests(effectiveRootPath)
      .then(ms => {
        if (cancelled) return
        const map: Record<string, PhotoManifest> = {}
        for (const m of ms) map[m.recipeUid] = m
        setManifests(map)
      })
      .catch(err => console.warn('[PhotoManagerView] manifest load failed:', err))
    return () => { cancelled = true }
  }, [effectiveRootPath, project.id])

  // ── One-time migration of legacy projects (capturedPhotos[] → manifest) ─────
  // Runs once per project per session. The migrator itself is idempotent (skips
  // recipes that already have a manifest on disk), so a duplicate run is cheap.
  const migrationRanRef = useRef<string | null>(null)
  useEffect(() => {
    if (!effectiveRootPath || !user || recipesRaw.length === 0) return
    const key = `${project.id}::${effectiveRootPath}`
    if (migrationRanRef.current === key) return
    migrationRanRef.current = key
    migrateLegacyManifests(effectiveRootPath, recipesRaw, manifests, user.uid)
      .then(({ stats, manifests: newOnes }) => {
        if (stats.migrated > 0) {
          console.log(`[PhotoManagerView] auto-migrated ${stats.migrated} legacy recipes`)
          setManifests(prev => {
            const next = { ...prev }
            for (const m of newOnes) next[m.recipeUid] = m
            return next
          })
        }
      })
      .catch(err => console.warn('[PhotoManagerView] migration failed:', err))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveRootPath, project.id, recipesRaw.length, user?.uid])

  /** Merge manifest data onto each recipe so the rest of the component reads a single shape. */
  const recipes = useMemo(
    () => recipesRaw.map(r => projectManifestOntoRecipe(r, r.recipeUid ? manifests[r.recipeUid] ?? null : null)),
    [recipesRaw, manifests]
  )

  /** Apply a manifest change locally so the UI updates instantly (writes return the merged manifest from the IPC). */
  const upsertManifest = useCallback((m: PhotoManifest) => {
    setManifests(prev => ({ ...prev, [m.recipeUid]: m }))
  }, [])

  // ── Auto-clean on select (background removal) ───────────────────────────────
  // Selecting a candidate enqueues a single-photo cut-out; the transparent PNG
  // lands in CLEANED (needs_retouch). Mac + installed engine only.
  const isMac = window.electronAPI.platform === 'darwin'
  const [engineReady, setEngineReady] = useState(false)
  const [autoClean, setAutoClean] = useState(() => localStorage.getItem('npd:autoCleanOnSelect') !== '0')
  const cleanQueue = useCleanQueue(1)

  useEffect(() => { localStorage.setItem('npd:autoCleanOnSelect', autoClean ? '1' : '0') }, [autoClean])
  useEffect(() => {
    if (!isMac) return
    window.electronAPI.bgRemovalInstallState()
      .then(s => setEngineReady(s.installed && s.supported))
      .catch(() => {})
  }, [isMac])

  function enqueueAutoClean(recipe: RecipeFile, photo: CapturedPhoto) {
    const ref = refFromRecipe(recipe, user?.uid ?? '')
    const projectRoot = effectiveRootPath.replace(/\\/g, '/')
    if (!ref || !projectRoot) return
    const pngName = photo.filename.replace(/\.[^.]+$/, '') + '.png'
    // Already cleaned? skip the (slow) re-cut.
    if (manifests[ref.recipeUid]?.cleaned?.some(e => e.filename === pngName)) return
    const input = resolvePhotoPath(photo.picturePath, projectRoot)
    const output = ref.subfolderName
      ? `${projectRoot}/PICTURES/3. CLEANED/${ref.subfolderName}/${pngName}`
      : `${projectRoot}/PICTURES/3. CLEANED/${pngName}`
    cleanQueue.enqueue({
      id: `${ref.recipeUid}/${photo.filename}`,
      label: `${recipe.displayName} · ${photo.filename}`,
      run: async () => {
        const res = await window.electronAPI.bgRemovalCleanPhoto({ input, output })
        if (!res.ok) throw new Error(res.error || 'Cut-out failed.')
        const merged = await appendCleanedEntry(projectRoot, ref, pngName)
        upsertManifest(merged)
      },
    })
  }

  // ── KPIs ─────────────────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const photographed = recipes.filter(r => (r.capturedPhotos?.length ?? 0) > 0).length
    const totalPhotos  = recipes.reduce((sum, r) => sum + (r.capturedPhotos?.length ?? 0), 0)
    const selected     = recipes.filter(r => r.capturedPhotos?.some(p => p.isSelected)).length
    const ready        = recipes.filter(r => !!r.readyJpgPath).length
    const warnings     = recipes.filter(r => (r.activeNotesCount ?? 0) > 0).length
    const cleaned      = recipes.filter(
      r => (r.cleanedPhotoPaths?.length ?? 0) > 0 && r.cleanedPhotoStatus === 'needs_retouch'
    ).length
    return { photographed, totalPhotos, selected, ready, warnings, cleaned, total: recipes.length }
  }, [recipes])

  // ── Photo groups for CAMERA / SELECTED ───────────────────────────────────────

  const buildGroups = useCallback((filterFn: (p: CapturedPhoto) => boolean): PhotoGroup[] => {
    const map = new Map<string, PhotoGroup>()
    for (const recipe of recipes) {
      const name = recipe.recipeName || recipe.displayName
      for (const photo of recipe.capturedPhotos ?? []) {
        if (!filterFn(photo)) continue
        // Group by recipe name (not subfolder) so the warning badge can be per-recipe
        const key = name
        if (!map.has(key)) map.set(key, {
          folder: name,
          recipeId: recipe.id,
          recipeName: name,
          activeNotesCount: recipe.activeNotesCount ?? 0,
          photos: [],
        })
        map.get(key)!.photos.push({
          ...photo,
          recipeId:   recipe.id,
          recipeName: name,
        })
      }
    }
    return Array.from(map.values()).sort((a, b) => a.folder.localeCompare(b.folder))
  }, [recipes])

  const cameraGroups   = buildGroups(() => true)
  const selectedGroups = buildGroups(p => p.isSelected)
  const readyRecipes   = recipes.filter(r => r.readyJpgPath)

  const activeGroups = activeTab === 'camera' ? cameraGroups : selectedGroups

  // ── Selection helpers ─────────────────────────────────────────────────────────

  function togglePhoto(picturePath: string, recipeId: string, recipeName: string) {
    setSelectedPhotoKeys(prev => {
      const next = new Set(prev)
      if (next.has(picturePath)) next.delete(picturePath)
      else next.add(picturePath)
      return next
    })
    setLastSelectedRecipeId(recipeId)
    setLastSelectedRecipeName(recipeName)
  }

  function toggleReadyRecipe(id: string) {
    setSelectedReadyIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleSelectAll() {
    if (activeTab === 'ready') {
      setSelectedReadyIds(new Set(readyRecipes.map(r => r.id)))
      return
    }
    const all = new Set<string>()
    for (const g of activeGroups) for (const p of g.photos) all.add(p.picturePath)
    setSelectedPhotoKeys(all)
  }

  function handleSelectAllFromRecipe() {
    if (!lastSelectedRecipeId) return
    setSelectedPhotoKeys(prev => {
      const next = new Set(prev)
      for (const g of activeGroups)
        for (const p of g.photos)
          if (p.recipeId === lastSelectedRecipeId) next.add(p.picturePath)
      return next
    })
  }

  function handleDeselectAll() {
    if (activeTab === 'ready') { setSelectedReadyIds(new Set()); return }
    setSelectedPhotoKeys(new Set())
    setLastSelectedRecipeId(null)
    setLastSelectedRecipeName(null)
  }

  const selectionCount = activeTab === 'ready'
    ? selectedReadyIds.size
    : selectedPhotoKeys.size

  // ── Star / un-star a photo from CAMERA tab ─────────────────────────────────

  async function togglePhotoSelected(photo: CapturedPhoto & { recipeId: string }) {
    const recipe = recipesRaw.find(r => r.id === photo.recipeId)
    if (!recipe) return
    const ref = refFromRecipe(recipe, user?.uid ?? '')
    const projectRoot = effectiveRootPath.replace(/\\/g, '/')
    if (!ref || !projectRoot) {
      // Legacy fallback (no recipeUid yet) — keep old Firestore path.
      const newIsSelected = !photo.isSelected
      const updatedPhotos = (recipe.capturedPhotos ?? []).map(p =>
        p.filename === photo.filename
          ? { ...p, isSelected: newIsSelected,
              ...(newIsSelected
                ? { selectedAt: Timestamp.now(), selectedBy: user?.uid ?? '' }
                : { selectedAt: undefined, selectedBy: undefined }) }
          : p
      )
      const anySelected = updatedPhotos.some(p => p.isSelected)
      const newStatus: 'complete' | 'selected' = anySelected ? 'selected' : 'complete'
      try { await updateRecipePhotoSelections(recipe.id, updatedPhotos, newStatus) }
      catch (err) { console.error('[togglePhotoSelected] legacy write failed:', err) }
      return
    }

    const newIsSelected = !photo.isSelected
    try {
      const merged = await toggleCameraSelected(projectRoot, ref, photo.filename)
      upsertManifest(merged)
      // Mirror to SELECTED/ folder on disk (best-effort).
      const selectedPath = ref.subfolderName
        ? `${projectRoot}/PICTURES/2. SELECTED/${ref.subfolderName}/${photo.filename}`
        : `${projectRoot}/PICTURES/2. SELECTED/${photo.filename}`
      const absCamera = resolvePhotoPath(photo.picturePath, projectRoot)
      if (newIsSelected) {
        window.electronAPI.copyToSelected({ sourcePath: absCamera, destPath: selectedPath }).catch(() => {})
        // Auto-clean: kick off the background-removal cut-out for this candidate.
        if (isMac && engineReady && canEdit && autoClean) enqueueAutoClean(recipe, photo)
      } else {
        window.electronAPI.deleteFromSelected({ filePath: selectedPath }).catch(() => {})
      }
    } catch (err) {
      console.error('[togglePhotoSelected] manifest write failed:', err)
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────────

  async function handleDelete() {
    setDeleteConfirm(false)
    setDeleteLoading(true)
    const projectRoot = effectiveRootPath.replace(/\\/g, '/')
    try {
      if (activeTab === 'ready') {
        for (const recipeId of selectedReadyIds) {
          const recipe = recipesRaw.find(r => r.id === recipeId)
          if (!recipe) continue
          const projected = projectManifestOntoRecipe(recipe, recipe.recipeUid ? manifests[recipe.recipeUid] ?? null : null)
          if (projected.readyPngPath) await window.electronAPI.recipeDeleteItem(resolvePhotoPath(projected.readyPngPath, effectiveRootPath)).catch(() => {})
          if (projected.readyJpgPath) await window.electronAPI.recipeDeleteItem(resolvePhotoPath(projected.readyJpgPath, effectiveRootPath)).catch(() => {})
          const ref = refFromRecipe(recipe, user?.uid ?? '')
          if (ref && projectRoot) {
            try {
              const merged = await clearReady(projectRoot, ref)
              upsertManifest(merged)
            } catch (err) {
              console.error('[handleDelete:ready] manifest write failed:', err)
            }
          } else {
            // Legacy fallback
            const projectId = recipeId.substring(0, recipeId.indexOf('::'))
            const newStatus = recipe.capturedPhotos?.some(p => p.isSelected) ? 'selected' as const
                            : (recipe.capturedPhotos?.length ?? 0) > 0 ? 'in_progress' as const
                            : 'pending' as const
            await updateDoc(doc(db, 'recipeProjects', projectId, 'recipeFiles', recipeId), {
              readyPngPath: null, readyJpgPath: null,
              readyProcessedAt: null, readyProcessedBy: null,
              photoStatus: newStatus,
              updatedAt: serverTimestamp(),
            })
          }
        }
        setSelectedReadyIds(new Set())
      } else {
        // CAMERA / SELECTED tabs — group selected photos by recipe
        const byRecipe = new Map<string, { filenames: string[]; absPaths: string[] }>()
        for (const g of activeGroups) {
          for (const photo of g.photos) {
            if (!selectedPhotoKeys.has(photo.picturePath)) continue
            const arr = byRecipe.get(photo.recipeId) ?? { filenames: [], absPaths: [] }
            arr.filenames.push(photo.filename)
            arr.absPaths.push(resolvePhotoPath(photo.picturePath, effectiveRootPath))
            byRecipe.set(photo.recipeId, arr)
          }
        }
        // Delete files from disk first (camera + selected mirror)
        for (const [recipeId, { absPaths, filenames }] of byRecipe) {
          for (const absPath of absPaths) {
            await window.electronAPI.recipeDeleteItem(absPath).catch(() => {})
          }
          // Also clear SELECTED/ mirror
          const recipe = recipesRaw.find(r => r.id === recipeId)
          if (recipe && projectRoot) {
            const parts = recipe.relativePath.replace(/\\/g, '/').split('/')
            const sub = parts.length > 1 ? parts[0] : ''
            for (const filename of filenames) {
              const selPath = sub
                ? `${projectRoot}/PICTURES/2. SELECTED/${sub}/${filename}`
                : `${projectRoot}/PICTURES/2. SELECTED/${filename}`
              window.electronAPI.deleteFromSelected({ filePath: selPath }).catch(() => {})
            }
          }
        }
        // Update manifests (or legacy Firestore array)
        for (const [recipeId, { filenames }] of byRecipe) {
          const recipe = recipesRaw.find(r => r.id === recipeId)
          if (!recipe) continue
          const ref = refFromRecipe(recipe, user?.uid ?? '')
          if (ref && projectRoot) {
            try {
              const merged = await removeCameraEntries(projectRoot, ref, filenames)
              upsertManifest(merged)
            } catch (err) {
              console.error('[handleDelete:camera] manifest write failed:', err)
            }
          } else {
            const projectId = recipeId.substring(0, recipeId.indexOf('::'))
            const remaining = (recipe.capturedPhotos ?? []).filter(p => !filenames.includes(p.filename))
            const newStatus = remaining.length === 0 ? 'pending' as const
                            : remaining.some(p => p.isSelected) ? 'selected' as const
                            : 'in_progress' as const
            await updateDoc(doc(db, 'recipeProjects', projectId, 'recipeFiles', recipeId), {
              capturedPhotos: remaining, photoStatus: newStatus, updatedAt: serverTimestamp(),
            })
          }
        }
        setSelectedPhotoKeys(new Set())
      }
    } finally {
      setDeleteLoading(false)
    }
  }

  // ── Export ────────────────────────────────────────────────────────────────────

  function openExportDialog(mode: 'saveAs' | 'zip') {
    setExportError(null)
    if (activeTab === 'ready') {
      // READY tab: user must choose PNG / JPG
      setExportFormat({ mode, wantPng: false, wantJpg: false })
    } else {
      // CAMERA / SELECTED: all photos are JPG → skip format dialog, go directly
      runExport(mode, false, true)
    }
  }

  async function runExport(mode: 'saveAs' | 'zip', wantPng: boolean, wantJpg: boolean) {
    setExportFormat(null)
    setExportLoading(true)
    setExportError(null)
    try {
      let entries: { srcPath: string; archivePath: string }[]

      if (activeTab === 'ready') {
        entries = []
        for (const recipe of readyRecipes) {
          if (!selectedReadyIds.has(recipe.id)) continue
          const safeName = sanitize(recipe.recipeName || recipe.displayName)
          if (wantPng && recipe.readyPngPath) {
            const ext = recipe.readyPngPath.split('.').pop() ?? 'png'
            entries.push({ srcPath: resolvePhotoPath(recipe.readyPngPath, effectiveRootPath), archivePath: `${safeName}/PNG/${safeName}.${ext}` })
          }
          if (wantJpg && recipe.readyJpgPath) {
            const ext = recipe.readyJpgPath.split('.').pop() ?? 'jpg'
            entries.push({ srcPath: resolvePhotoPath(recipe.readyJpgPath, effectiveRootPath), archivePath: `${safeName}/JPG/${safeName}.${ext}` })
          }
        }
      } else {
        entries = []
        for (const g of activeGroups) {
          for (const photo of g.photos) {
            if (!selectedPhotoKeys.has(photo.picturePath)) continue
            const safeName = sanitize(photo.recipeName)
            entries.push({ srcPath: resolvePhotoPath(photo.picturePath, effectiveRootPath), archivePath: `${safeName}/${photo.filename}` })
          }
        }
      }

      if (entries.length === 0) return

      if (mode === 'saveAs') {
        const destFolder = await window.electronAPI.selectFolder()
        if (!destFolder) return
        const result = await window.electronAPI.photoSaveAs(entries, destFolder)
        if (!result.success && result.errors.length > 0)
          setExportError(`Some files failed:\n${result.errors.join('\n')}`)
      } else {
        const defaultName = `${sanitize(project.name ?? 'photos')}-${new Date().toISOString().slice(0, 10)}.zip`
        const destPath = await window.electronAPI.photoShowSaveDialog(defaultName)
        if (!destPath) return
        const result = await window.electronAPI.photoExportZip(entries, destPath)
        if (!result.success) setExportError(result.error ?? 'ZIP creation failed')
      }
    } finally {
      setExportLoading(false)
    }
  }

  // ── File path helpers ─────────────────────────────────────────────────────────

  function matchRecipe(baseName: string): RecipeFile | null {
    const lower = baseName.toLowerCase().trim()
    const cleanName = (recipe: RecipeFile) =>
      (recipe.recipeName || recipe.displayName || '').replace(/\s*done\s*by\s*.*/i, '').trim().toLowerCase()

    // 1) Exact name match — always safe
    for (const recipe of recipes) {
      if (cleanName(recipe) === lower) return recipe
    }
    // 2) Exact match against a captured photo's base name
    for (const recipe of recipes) {
      for (const photo of recipe.capturedPhotos ?? []) {
        const photoBase = photo.filename.replace(/\s*-\s*\d+\.[^.]+$/, '').toLowerCase().trim()
        if (photoBase === lower) return recipe
      }
    }
    // 3) Prefix match — ONLY when exactly one recipe qualifies and the prefix
    //    ends at a word boundary. The old bidirectional startsWith could send
    //    "ROSE.png" to "ROSE DELUXE" (or vice versa) — wrong photo into the
    //    wrong recipe's Excel. Ambiguity falls through to the manual dialog.
    const boundary = (longer: string, shorter: string) => {
      const next = longer.charAt(shorter.length)
      return next === '' || next === ' ' || next === '-' || next === '_' || next === '.'
    }
    const candidates = recipes.filter(recipe => {
      const rName = cleanName(recipe)
      if (!rName) return false
      if (rName.startsWith(lower) && boundary(rName, lower)) return true
      if (lower.startsWith(rName) && boundary(lower, rName)) return true
      return false
    })
    return candidates.length === 1 ? candidates[0] : null
  }

  async function moveOldReady(recipe: RecipeFile): Promise<void> {
    if (!recipe.readyJpgPath && !recipe.readyPngPath) return
    // Archive a copy of the old files in PICTURES/old/, then DELETE them from
    // 4. READY — leftovers there got picked up by exports (ZIP / Save As) and
    // by the disk reconciliation scan as if they were current.
    const projectRoot = effectiveRootPath.replace(/\\/g, '/')
    const archiveOne = async (storedPath: string | null | undefined) => {
      if (!storedPath) return
      try {
        const abs      = resolvePhotoPath(storedPath, projectRoot)
        const baseName = abs.split('/').pop() ?? 'old'
        const oldDest  = `${projectRoot}/PICTURES/old/${recipe.id.replace(/::/g, '-')}-${baseName}`
        await window.electronAPI.copyToSelected({ sourcePath: abs, destPath: oldDest })
        await window.electronAPI.deleteFromSelected({ filePath: abs })
      } catch { /* non-critical */ }
    }
    await archiveOne(recipe.readyJpgPath)
    await archiveOne(recipe.readyPngPath)
  }

  async function processPng(file: File, recipe: RecipeFile): Promise<void> {
    const srcPath = (file as File & { path?: string }).path
    if (!srcPath) {
      setProcessErrors(prev => [...prev, `${file.name}: cannot read file path (drag & drop from Finder)`])
      return
    }
    const baseName      = file.name.replace(/\.png$/i, '')
    const parts         = recipe.relativePath.replace(/\\/g, '/').split('/')
    const subfolderName = parts.length > 1 ? parts[0] : (recipe.capturedPhotos?.[0]?.subfolderName ?? '')
    const projectRoot   = effectiveRootPath.replace(/\\/g, '/')

    const pngFilename = `${baseName}.png`
    const jpgFilename = `${baseName}.jpg`
    const pngDest = subfolderName
      ? `${projectRoot}/PICTURES/4. READY/PNG/${subfolderName}/${pngFilename}`
      : `${projectRoot}/PICTURES/4. READY/PNG/${pngFilename}`
    const jpgDest = subfolderName
      ? `${projectRoot}/PICTURES/4. READY/JPG/${subfolderName}/${jpgFilename}`
      : `${projectRoot}/PICTURES/4. READY/JPG/${jpgFilename}`

    await moveOldReady(recipe)

    const copyResult = await window.electronAPI.copyToSelected({ sourcePath: srcPath, destPath: pngDest })
    if (!copyResult.success) {
      setProcessErrors(prev => [...prev, `${file.name}: PNG copy failed — ${copyResult.error}`])
      return
    }
    const convertResult = await window.electronAPI.convertPngToJpg({ sourcePng: pngDest, destJpg: jpgDest, quality: 90 })
    if (!convertResult.success) {
      setProcessErrors(prev => [...prev, `${file.name}: JPG conversion failed — ${convertResult.error}`])
      return
    }

    const ref = refFromRecipe(recipe, user?.uid ?? '')
    if (ref) {
      try {
        const merged = await setReady(projectRoot, ref, pngFilename, jpgFilename)
        upsertManifest(merged)
      } catch (err) {
        setProcessErrors(prev => [...prev, `${file.name}: manifest write failed — ${err}`])
      }
    } else {
      // Legacy fallback — store relative paths in Firestore
      const pngRel = toRelativePhotoPath(pngDest, projectRoot)
      const jpgRel = toRelativePhotoPath(jpgDest, projectRoot)
      await updateRecipeReadyPaths(recipe.id, pngRel, jpgRel, user?.uid ?? '')
    }
  }

  async function finalizeReadyPhoto(file: File, recipe: RecipeFile, resolveNotes: boolean): Promise<void> {
    if (resolveNotes && user) {
      await resolveAllRecipeNotes(recipe.projectId, recipe.fileId, user.uid, user.name)
    }
    await processPng(file, recipe)
    const ref = refFromRecipe(recipe, user?.uid ?? '')
    const projectRoot = effectiveRootPath.replace(/\\/g, '/')
    if (ref && projectRoot && (recipe.cleanedPhotoPaths?.length ?? 0) > 0) {
      try {
        const merged = await markCleanedDone(projectRoot, ref)
        upsertManifest(merged)
      } catch (err) {
        console.error('[finalizeReadyPhoto] markCleanedDone failed:', err)
      }
    } else if ((recipe.cleanedPhotoPaths?.length ?? 0) > 0) {
      // Legacy fallback
      await updateRecipeCleanedPaths(recipe.id, recipe.cleanedPhotoPaths ?? [], 'done', user?.uid ?? '')
    }
  }

  // ── READY tab drop handlers ───────────────────────────────────────────────────

  // Files that need a dialog (manual assign / notes warning) wait here so a
  // multi-file drop processes EVERYTHING. The old code `break`-ed out of the
  // loop on the first dialog and silently dropped the remaining files.
  const deferredFilesRef = useRef<File[]>([])

  function openNextDeferredDialog() {
    const file = deferredFilesRef.current.shift()
    if (!file) return
    const matched = matchRecipe(file.name.replace(/\.png$/i, ''))
    const reader = new FileReader()
    reader.onload = () => {
      if (matched && (matched.activeNotesCount ?? 0) > 0) {
        setWarningDialog({ file, recipe: matched, dataUrl: reader.result as string })
      } else {
        setManualAssign({ file, dataUrl: reader.result as string })
        setManualRecipeSearch('')
        setManualSelectedRecipe(null)
      }
    }
    reader.readAsDataURL(file)
  }

  async function handleFiles(files: File[]) {
    const pngs = files.filter(f => f.name.toLowerCase().endsWith('.png'))
    if (pngs.length === 0) return
    setProcessErrors([])
    setProcessing(pngs.map(f => f.name))
    const needDialog: File[] = []
    try {
      for (const file of pngs) {
        const matched = matchRecipe(file.name.replace(/\.png$/i, ''))
        if (!matched || (matched.activeNotesCount ?? 0) > 0) {
          needDialog.push(file)
          continue
        }
        await processPng(file, matched)
      }
    } finally {
      setProcessing([])
    }
    deferredFilesRef.current.push(...needDialog)
    openNextDeferredDialog()
  }

  async function handleWarningConfirm(resolveNotes: boolean) {
    if (!warningDialog) return
    const { file, recipe } = warningDialog
    setWarningDialog(null)
    setWarningProcessing(true)
    try { await finalizeReadyPhoto(file, recipe, resolveNotes) } finally { setWarningProcessing(false) }
    openNextDeferredDialog()
  }

  // ── CLEANED tab drop handlers ─────────────────────────────────────────────────

  async function processCleaned(file: File, recipe: RecipeFile): Promise<void> {
    const srcPath = (file as File & { path?: string }).path
    if (!srcPath) { setCleanedErrors(prev => [...prev, `${file.name}: cannot read file path`]); return }
    const filename      = file.name.toLowerCase().endsWith('.png') ? file.name : `${file.name}.png`
    const parts         = recipe.relativePath.replace(/\\/g, '/').split('/')
    const subfolderName = parts.length > 1 ? parts[0] : (recipe.capturedPhotos?.[0]?.subfolderName ?? '')
    const projectRoot   = effectiveRootPath.replace(/\\/g, '/')
    const destPath      = subfolderName
      ? `${projectRoot}/PICTURES/3. CLEANED/${subfolderName}/${filename}`
      : `${projectRoot}/PICTURES/3. CLEANED/${filename}`
    const copyResult = await window.electronAPI.copyToSelected({ sourcePath: srcPath, destPath })
    if (!copyResult.success) { setCleanedErrors(prev => [...prev, `${file.name}: copy failed — ${copyResult.error}`]); return }

    const ref = refFromRecipe(recipe, user?.uid ?? '')
    if (ref) {
      try {
        const merged = await appendCleanedEntry(projectRoot, ref, filename)
        upsertManifest(merged)
      } catch (err) {
        setCleanedErrors(prev => [...prev, `${file.name}: manifest write failed — ${err}`])
      }
    } else {
      // Legacy fallback
      const destRel  = toRelativePhotoPath(destPath, projectRoot)
      const newPaths = [...(recipe.cleanedPhotoPaths ?? []), destRel]
      await updateRecipeCleanedPaths(recipe.id, newPaths, 'needs_retouch', user?.uid ?? '')
    }
  }

  async function handleCleanedDrop(file: File, recipe: RecipeFile): Promise<void> {
    const hasPendingClean = (recipe.cleanedPhotoPaths?.length ?? 0) > 0 && recipe.cleanedPhotoStatus === 'needs_retouch'
    if (hasPendingClean) {
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        if ((recipe.activeNotesCount ?? 0) > 0) setWarningDialog({ file, recipe, dataUrl })
        else {
          setCleanedProcessing(recipe.id)
          finalizeReadyPhoto(file, recipe, false)
            .catch(err => setCleanedErrors(prev => [...prev, `${file.name}: ${err}`]))
            .finally(() => setCleanedProcessing(null))
        }
      }
      reader.readAsDataURL(file)
    } else {
      setCleanedProcessing(recipe.id)
      try {
        await processCleaned(file, recipe)
      } catch (err) {
        setCleanedErrors(prev => [...prev, `${file.name}: ${err instanceof Error ? err.message : String(err)}`])
      } finally {
        setCleanedProcessing(null)
      }
    }
  }

  // ── Gallery ───────────────────────────────────────────────────────────────────

  function openGallery(photos: CapturedPhoto[], idx: number, recipeName: string) {
    setGalleryPhotos(photos); setGalleryIndex(idx); setGalleryRecipeName(recipeName); setGalleryOpen(true)
  }

  // ── Tab config ────────────────────────────────────────────────────────────────

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'camera',   label: '1. CAMERA',   badge: kpis.photographed || undefined },
    { id: 'selected', label: '2. SELECTED', badge: kpis.selected || undefined },
    { id: 'cleaned',  label: '3. CLEANED',  badge: kpis.cleaned || undefined },
    { id: 'ready',    label: '4. READY',    badge: kpis.ready || undefined },
  ]

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col flex-1 overflow-hidden">

      {/* Path not found banner — shown for Windows/new-machine users who need to locate the project folder */}
      {pathNotFound && (
        <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-700">
          <AlertTriangle size={14} className="text-amber-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
              Project folder not found on this machine — photos can't be loaded.
            </p>
            <p className="text-[10px] text-amber-600 dark:text-amber-400">
              Click "Locate Folder" to point to your local OneDrive-synced project folder.
            </p>
          </div>
          {onLocateFolder && (
            <button
              onClick={onLocateFolder}
              className="shrink-0 text-xs px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium transition-colors"
            >
              Locate Folder
            </button>
          )}
        </div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-5 gap-2 px-4 pt-3 pb-2 shrink-0">
        <KpiCard label="Photographed" value={kpis.photographed} total={kpis.total} subtitle={kpis.totalPhotos > 0 ? `${kpis.totalPhotos} photos` : undefined} color="green" />
        <KpiCard label="Selected"     value={kpis.selected}     total={kpis.total} color="yellow" />
        <KpiCard label="Warnings"     value={kpis.warnings}     color="amber" alert={kpis.warnings > 0} />
        <KpiCard label="Cleaned"      value={kpis.cleaned}      subtitle={kpis.cleaned > 0 ? 'need retouch' : undefined} color="purple" />
        <KpiCard label="Ready"        value={kpis.ready}        total={kpis.total} color="blue" />
      </div>

      {/* Progress bar */}
      <div className="px-4 pb-2 shrink-0">
        <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
          <div className="h-full rounded-full bg-green-500 transition-all duration-500"
            style={{ width: `${kpis.total > 0 ? (kpis.ready / kpis.total) * 100 : 0}%` }} />
        </div>
        <p className="text-[10px] text-gray-400 mt-0.5">{kpis.ready} of {kpis.total} recipes ready</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-gray-200 dark:border-gray-700 px-4 shrink-0">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors -mb-px ${
              activeTab === tab.id
                ? 'border-green-500 text-green-700 dark:text-green-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {tab.label}
            {tab.badge !== undefined && (
              <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                activeTab === tab.id
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
              }`}>{tab.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* Auto-clean (background removal) status bar — Mac + editors, on capture tabs */}
      {isMac && canEdit && (activeTab === 'camera' || activeTab === 'selected') && (
        <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 flex-wrap">
          <label className={`inline-flex items-center gap-1.5 text-xs font-medium cursor-pointer ${engineReady ? 'text-gray-600 dark:text-gray-300' : 'text-gray-400 cursor-not-allowed'}`}>
            <input type="checkbox" checked={autoClean && engineReady} disabled={!engineReady}
              onChange={e => setAutoClean(e.target.checked)} className="accent-[#1D9E75]" />
            <Scissors size={13} /> Auto-clean on select
          </label>
          {!engineReady ? (
            <span className="text-[11px] text-amber-600 dark:text-amber-400">
              Engine not installed — open Background Removal to set it up.
            </span>
          ) : (cleanQueue.activeCount + cleanQueue.pendingCount) > 0 ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-600 dark:text-gray-300">
              <Loader2 size={12} className="animate-spin" style={{ color: '#1D9E75' }} />
              Cleaning {cleanQueue.activeCount + cleanQueue.pendingCount} photo{(cleanQueue.activeCount + cleanQueue.pendingCount) !== 1 ? 's' : ''}…
            </span>
          ) : (
            <span className="text-[11px] text-gray-400">Selected photos are cut out automatically.</span>
          )}
          {cleanQueue.errors.length > 0 && (
            <button onClick={cleanQueue.clearErrors} className="text-[11px] text-red-500 hover:underline">
              {cleanQueue.errors.length} failed — dismiss
            </button>
          )}
        </div>
      )}

      {/* Selection toolbar — sticky below tabs */}
      {(activeTab !== 'cleaned') && selectionCount > 0 && (
        <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800 flex-wrap">
          <span className="text-xs font-semibold text-blue-700 dark:text-blue-300 mr-1">
            {selectionCount} {activeTab === 'ready' ? 'recipe' : 'photo'}{selectionCount !== 1 ? 's' : ''} selected
          </span>
          <button onClick={handleSelectAll}
            className="px-2 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400">
            Select All
          </button>
          {activeTab !== 'ready' && lastSelectedRecipeName && (
            <button onClick={handleSelectAllFromRecipe}
              className="px-2 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400">
              All from "{lastSelectedRecipeName}"
            </button>
          )}
          <button onClick={handleDeselectAll}
            className="px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400">
            Deselect All
          </button>
          <div className="flex-1" />
          {canEdit && (
            <button
              onClick={() => setDeleteConfirm(true)}
              disabled={deleteLoading}
              className="flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-semibold bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 disabled:opacity-50"
            >
              <Trash2 size={10} /> Delete
            </button>
          )}
          <button
            onClick={() => openExportDialog('saveAs')}
            disabled={exportLoading}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-semibold bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 disabled:opacity-50"
          >
            <FolderDown size={10} /> Save As
          </button>
          <button
            onClick={() => openExportDialog('zip')}
            disabled={exportLoading}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-semibold bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-400 disabled:opacity-50"
          >
            <Archive size={10} /> Download ZIP
          </button>
          {exportLoading && <Loader2 size={12} className="animate-spin text-gray-500" />}
        </div>
      )}

      {/* Export error */}
      {exportError && (
        <div className="shrink-0 flex items-start gap-2 px-4 py-2 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-400">
          <AlertTriangle size={12} className="shrink-0 mt-0.5" />
          <span className="whitespace-pre-wrap">{exportError}</span>
          <button onClick={() => setExportError(null)} className="ml-auto text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center gap-2 text-gray-400 py-8 justify-center">
            <Loader2 size={16} className="animate-spin" /> Loading photos…
          </div>
        ) : activeTab === 'camera' || activeTab === 'selected' ? (
          <PhotoGroupGrid
            groups={activeGroups}
            emptyMessage={activeTab === 'camera'
              ? 'No photos in CAMERA. Go to Take Photos to start a session.'
              : 'No candidates selected yet. Select photos in the CAMERA tab.'}
            allSelected={activeTab === 'selected'}
            selectedKeys={selectedPhotoKeys}
            projectRootPath={effectiveRootPath}
            showStarButton={activeTab === 'camera' && canEdit}
            allowSelection={canEdit}
            onToggle={togglePhoto}
            onToggleStar={togglePhotoSelected}
            onOpen={(photos, idx, name) => openGallery(photos, idx, name)}
            onWarningClick={(recipeId, recipeName) => setNotesModal({
              recipeId,
              projectId: project.id,
              recipeName,
            })}
          />
        ) : activeTab === 'cleaned' ? (
          /* ── 3. CLEANED tab ── */
          <div className="space-y-3">
            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider mb-1">
              Selected photos are cut out automatically. Open in Photoshop to retouch, Save &amp; return, then re-drop to send to Ready.
            </p>
            {cleanedErrors.map((err, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
                <AlertTriangle size={12} className="shrink-0 mt-0.5" />{err}
              </div>
            ))}
            {!canEdit && (
              <p className="text-[11px] text-gray-500 dark:text-gray-400 italic">
                View-only — only owners and photographers can promote photos through cleaning.
              </p>
            )}
            {recipes.length === 0
              ? <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2"><Camera size={32} strokeWidth={1} /><p className="text-sm">No recipes in this project.</p></div>
              : recipes.map(recipe => (
                  <CleanedRecipeRow
                    key={recipe.id}
                    recipe={recipe}
                    isProcessing={cleanedProcessing === recipe.id}
                    canEdit={canEdit}
                    onDrop={file => handleCleanedDrop(file, recipe)}
                    onOpenPhotoshop={async path => {
                      const abs = resolvePhotoPath(path, effectiveRootPath)
                      if (isMac) {
                        const r = await window.electronAPI.photoshopOpen(abs)
                        if (!r.ok) setCleanedErrors(e => [...e, `${recipe.displayName}: ${r.error || 'could not open Photoshop'}`])
                      } else {
                        window.electronAPI.openFile(abs)
                      }
                    }}
                    onSaveReturn={isMac ? async path => {
                      const r = await window.electronAPI.photoshopSaveReturn(resolvePhotoPath(path, effectiveRootPath))
                      if (!r.ok) setCleanedErrors(e => [...e, `${recipe.displayName}: ${r.error || 'save failed'}`])
                    } : undefined}
                    onSelectSubject={isMac ? async path => {
                      const cleanedAbs = resolvePhotoPath(path, effectiveRootPath)
                      const stem = (path.split(/[\\/]/).pop() ?? '').replace(/\.[^.]+$/, '')
                      const orig = recipe.capturedPhotos?.find(p => p.filename.replace(/\.[^.]+$/, '') === stem)
                      if (!orig) { setCleanedErrors(e => [...e, `${recipe.displayName}: original photo not found for re-cut`]); return }
                      const subjectPng = cleanedAbs.replace(/\.png$/i, '.subject.png')
                      const r = await window.electronAPI.photoshopSelectSubject(resolvePhotoPath(orig.picturePath, effectiveRootPath), subjectPng)
                      if (!r.ok) { setCleanedErrors(e => [...e, `${recipe.displayName}: ${r.error || 'Select Subject failed'}`]); return }
                      const [eu, su] = await Promise.all([
                        window.electronAPI.bgRemovalReadFull(cleanedAbs),
                        window.electronAPI.bgRemovalReadFull(subjectPng),
                      ])
                      setCompare({ cleanedAbs, subjectPng, engineUrl: eu, subjectUrl: su, name: recipe.displayName })
                    } : undefined}
                    onWarningClick={() => setNotesModal({ recipeId: recipe.id, projectId: project.id, recipeName: recipe.recipeName || recipe.displayName })}
                  />
                ))
            }
          </div>
        ) : (
          /* ── 4. READY tab ── */
          <div className="space-y-4">
            {warningProcessing && (
              <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 size={14} className="animate-spin" /> Processing…</div>
            )}
            {/* Drop zone — only photographers/owners promote to READY */}
            {canEdit && (
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(Array.from(e.dataTransfer.files)) }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors duration-200 ${
                  dragOver ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500'
                }`}
              >
                <input ref={fileInputRef} type="file" accept=".png" multiple className="hidden"
                  onChange={e => handleFiles(Array.from(e.target.files ?? []))} />
                <Upload size={28} className="mx-auto mb-3 text-gray-400" />
                <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">Drop your retouched PNGs here</p>
                <p className="text-xs text-gray-400 mt-1">or click to select files · only .png accepted</p>
              </div>
            )}
            {processing.length > 0 && (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 size={14} className="animate-spin" />Processing {processing.join(', ')}…
              </div>
            )}
            {processErrors.map((err, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
                <AlertTriangle size={12} className="shrink-0 mt-0.5" />{err}
              </div>
            ))}
            {readyRecipes.length > 0 ? (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    Processed — click to select
                  </p>
                  <button
                    onClick={() => {
                      setSelectedReadyIds(new Set(readyRecipes.map(r => r.id)))
                      openExportDialog('zip')
                    }}
                    disabled={exportLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 transition-colors"
                  >
                    <Archive size={12} /> Compress All
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  {readyRecipes.map(recipe => (
                    <ReadyCard
                      key={recipe.id}
                      recipe={recipe}
                      effectiveRootPath={effectiveRootPath}
                      userId={user?.uid ?? ''}
                      userName={user?.name ?? ''}
                      isSelected={selectedReadyIds.has(recipe.id)}
                      onToggle={() => toggleReadyRecipe(recipe.id)}
                      onWarningClick={() => setNotesModal({ recipeId: recipe.id, projectId: project.id, recipeName: recipe.recipeName || recipe.displayName })}
                      onManifestUpdate={upsertManifest}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-4">No files in READY yet. Drop retouched PNGs above.</p>
            )}
          </div>
        )}
      </div>

      {/* Notes modal — opened by warning badge in any tab */}
      {notesModal && (
        <NotesModal
          projectId={notesModal.projectId}
          fileId={notesModal.recipeId}
          recipeName={notesModal.recipeName}
          onClose={() => setNotesModal(null)}
        />
      )}

      {/* Select Subject comparison — keep engine vs Photoshop cut */}
      {compare && (
        <CutoutCompareModal
          title={`Which cut-out do you want to keep? · ${compare.name}`}
          engineUrl={compare.engineUrl}
          subjectUrl={compare.subjectUrl}
          busy={compareBusy}
          onChoose={chooseRecut}
          onCancel={() => { if (!compareBusy) { void window.electronAPI.bgRemovalResolveRecut({ keepSubject: false, enginePng: compare.cleanedAbs, subjectPng: compare.subjectPng }); setCompare(null) } }}
        />
      )}

      {/* Manual assignment modal */}
      {manualAssign && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-[560px] p-6 flex gap-4">
            <div className="w-36 shrink-0">
              <img src={manualAssign.dataUrl} alt="PNG" className="w-full aspect-square object-contain rounded-lg bg-gray-100 dark:bg-gray-800" />
              <p className="text-[10px] text-gray-500 mt-1 text-center truncate">{manualAssign.file.name}</p>
            </div>
            <div className="flex-1 flex flex-col gap-2">
              <p className="text-sm font-semibold text-gray-800 dark:text-white">Could not auto-assign</p>
              <p className="text-xs text-gray-500">Select the recipe for this PNG:</p>
              <input type="text" placeholder="Search recipe…" value={manualRecipeSearch}
                onChange={e => setManualRecipeSearch(e.target.value)}
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-800 dark:text-white" />
              <div className="flex-1 overflow-y-auto max-h-48 space-y-1">
                {recipes.filter(r => {
                  const q = manualRecipeSearch.toLowerCase()
                  return !q || (r.recipeName || r.displayName).toLowerCase().includes(q)
                }).map(r => (
                  <button key={r.id} onClick={() => setManualSelectedRecipe(r)}
                    className={`w-full text-left px-3 py-1.5 rounded-lg text-xs transition-colors ${
                      manualSelectedRecipe?.id === r.id
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {r.recipeName || r.displayName}
                    {(r.activeNotesCount ?? 0) > 0 && (
                      <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1 py-0.5 text-[9px] text-amber-700">
                        <AlertTriangle size={7} />{r.activeNotesCount}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => { setManualAssign(null); openNextDeferredDialog() }}
                  className="flex-1 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700">
                  Skip
                </button>
                <button disabled={!manualSelectedRecipe}
                  onClick={async () => {
                    if (!manualSelectedRecipe) return
                    const { file } = manualAssign
                    setManualAssign(null)
                    if ((manualSelectedRecipe.activeNotesCount ?? 0) > 0) {
                      const reader = new FileReader()
                      reader.onload = () => setWarningDialog({ file, recipe: manualSelectedRecipe, dataUrl: reader.result as string })
                      reader.readAsDataURL(file)
                    } else {
                      setProcessing([file.name])
                      await processPng(file, manualSelectedRecipe)
                      setProcessing([])
                      openNextDeferredDialog()
                    }
                  }}
                  className="flex-1 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold disabled:opacity-40 hover:bg-green-700">
                  Assign
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-80 p-6 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Trash2 size={18} className="text-red-500" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Delete {selectionCount} item{selectionCount !== 1 ? 's' : ''}?</h3>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Files will be permanently deleted from disk and removed from Firestore. This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteConfirm(false)}
                className="flex-1 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700">
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleteLoading}
                className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
                {deleteLoading ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export format dialog (READY tab only) */}
      {exportFormat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-72 p-5 flex flex-col gap-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              {exportFormat.mode === 'saveAs' ? 'Save As' : 'Export ZIP'} — Select Format
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">Select at least one format to export:</p>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={exportFormat.wantPng}
                  onChange={e => setExportFormat({ ...exportFormat, wantPng: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-green-600" />
                <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">PNG</span>
                <span className="text-xs text-gray-400">background-removed</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={exportFormat.wantJpg}
                  onChange={e => setExportFormat({ ...exportFormat, wantJpg: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-green-600" />
                <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">JPG</span>
                <span className="text-xs text-gray-400">compressed for web</span>
              </label>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setExportFormat(null)}
                className="flex-1 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700">
                Cancel
              </button>
              <button
                disabled={!exportFormat.wantPng && !exportFormat.wantJpg}
                onClick={() => runExport(exportFormat.mode, exportFormat.wantPng, exportFormat.wantJpg)}
                className="flex-1 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold disabled:opacity-40 hover:bg-green-700">
                {exportFormat.mode === 'saveAs' ? 'Choose Folder' : 'Choose Location'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Warning dialog */}
      {warningDialog && (
        <ReadyWarningDialog
          file={warningDialog.file}
          recipe={warningDialog.recipe}
          dataUrl={warningDialog.dataUrl}
          onConfirm={handleWarningConfirm}
          onCancel={() => { setWarningDialog(null); openNextDeferredDialog() }}
        />
      )}

      {/* Gallery popup */}
      {galleryOpen && (
        <PhotoGalleryPopup
          photos={galleryPhotos}
          initialIndex={galleryIndex}
          recipeName={galleryRecipeName}
          projectRootPath={effectiveRootPath}
          onClose={() => setGalleryOpen(false)}
        />
      )}
    </div>
  )
}

// ── KPI card ───────────────────────────────────────────────────────────────────

function KpiCard({ label, value, total, subtitle, color, alert }: {
  label: string; value: number; total?: number; subtitle?: string
  color: 'green' | 'yellow' | 'blue' | 'amber' | 'purple'; alert?: boolean
}) {
  const colorMap = { green: 'text-green-600 dark:text-green-400', yellow: 'text-yellow-600 dark:text-yellow-400', blue: 'text-blue-600 dark:text-blue-400', amber: 'text-amber-600 dark:text-amber-400', purple: 'text-purple-600 dark:text-purple-400' }
  const bgMap    = { green: 'bg-green-50 dark:bg-green-900/10', yellow: 'bg-yellow-50 dark:bg-yellow-900/10', blue: 'bg-blue-50 dark:bg-blue-900/10', amber: 'bg-amber-50 dark:bg-amber-900/10', purple: 'bg-purple-50 dark:bg-purple-900/10' }
  return (
    <div className={`rounded-xl px-3 py-2 ${bgMap[color]} ${alert && value > 0 ? 'ring-1 ring-amber-300 dark:ring-amber-700' : ''}`}>
      <div className="flex items-baseline gap-1">
        <span className={`text-2xl font-bold leading-none ${colorMap[color]}`}>{value}</span>
        {total !== undefined && <span className="text-[10px] text-gray-400">/ {total}</span>}
      </div>
      <p className="text-[10px] font-semibold text-gray-600 dark:text-gray-400 mt-0.5">{label}</p>
      {subtitle && <p className="text-[9px] text-gray-400 mt-0.5">{subtitle}</p>}
    </div>
  )
}

// ── CLEANED recipe row ─────────────────────────────────────────────────────────

function CleanedRecipeRow({ recipe, isProcessing, canEdit, onDrop, onOpenPhotoshop, onSaveReturn, onSelectSubject, onWarningClick }: {
  recipe: RecipeFile; isProcessing: boolean
  canEdit: boolean
  onDrop: (file: File) => void; onOpenPhotoshop: (path: string) => void
  onSaveReturn?: (path: string) => Promise<void>   // Mac scripted save-back to same path
  onSelectSubject?: (path: string) => Promise<void> // Mac re-cut with Photoshop Select Subject
  onWarningClick?: () => void
}) {
  const [dragOver, setDragOver] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [recut, setRecut]       = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const hasCleaned   = (recipe.cleanedPhotoPaths?.length ?? 0) > 0
  const isDone       = recipe.cleanedPhotoStatus === 'done'
  const needsRetouch = hasCleaned && !isDone

  return (
    <div className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
      dragOver ? 'border-purple-400 bg-purple-50 dark:bg-purple-900/10' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900'
    }`}>
      <div className="shrink-0">
        {isDone ? <CheckCircle2 size={14} className="text-green-500" />
          : needsRetouch ? <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-purple-500 text-white text-[8px] font-bold">{recipe.cleanedPhotoPaths!.length}</span>
          : <span className="h-3.5 w-3.5 rounded-full border-2 border-gray-300 dark:border-gray-600 block" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{recipe.displayName}</span>
          {(recipe.activeNotesCount ?? 0) > 0 && (
            <button
              onClick={onWarningClick}
              title={`${recipe.activeNotesCount} active note(s) — click to view`}
              className="shrink-0 flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50 transition-colors"
            >
              <AlertTriangle size={8} />{recipe.activeNotesCount}
            </button>
          )}
        </div>
        {needsRetouch && <p className="text-[10px] text-purple-600 dark:text-purple-400 mt-0.5">{recipe.cleanedPhotoPaths!.length} cleaned · re-drop after retouching to send to Ready</p>}
        {isDone && <p className="text-[10px] text-green-600 dark:text-green-400 mt-0.5">Retouch accepted — moved to Ready</p>}
      </div>
      {hasCleaned && recipe.cleanedPhotoPaths![0] && (
        <button onClick={() => onOpenPhotoshop(recipe.cleanedPhotoPaths![0])} title="Open in Photoshop"
          className="shrink-0 flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-indigo-100 text-indigo-700 hover:bg-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 transition-colors">
          <ExternalLink size={10} /><span className="hidden sm:inline">Open in Photoshop</span>
        </button>
      )}
      {hasCleaned && recipe.cleanedPhotoPaths![0] && onSelectSubject && canEdit && (
        <button
          disabled={recut}
          onClick={async () => { setRecut(true); try { await onSelectSubject(recipe.cleanedPhotoPaths![0]) } finally { setRecut(false) } }}
          title="Re-cut this photo with Photoshop Select Subject"
          className="shrink-0 flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-400 transition-colors disabled:opacity-50">
          {recut ? <Loader2 size={10} className="animate-spin" /> : <Wand2 size={10} />}
          <span className="hidden sm:inline">Select Subject</span>
        </button>
      )}
      {hasCleaned && recipe.cleanedPhotoPaths![0] && onSaveReturn && canEdit && (
        <button
          disabled={saving}
          onClick={async () => { setSaving(true); try { await onSaveReturn(recipe.cleanedPhotoPaths![0]) } finally { setSaving(false) } }}
          title="Save the edited file back to the app (no dialog)"
          className="shrink-0 flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 transition-colors disabled:opacity-50">
          {saving ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
          <span className="hidden sm:inline">Save &amp; return</span>
        </button>
      )}
      {canEdit && (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); const png = Array.from(e.dataTransfer.files).find(f => f.name.toLowerCase().endsWith('.png')); if (png) onDrop(png) }}
          onClick={() => fileInputRef.current?.click()}
          className={`shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg border-2 border-dashed text-[10px] cursor-pointer transition-colors ${
            dragOver ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400' : 'border-gray-300 dark:border-gray-600 text-gray-400 hover:border-gray-400 dark:hover:border-gray-500'
          }`}
        >
          <input ref={fileInputRef} type="file" accept=".png" className="hidden"
            onChange={e => { const png = Array.from(e.target.files ?? []).find(f => f.name.toLowerCase().endsWith('.png')); if (png) onDrop(png) }} />
          {isProcessing ? <Loader2 size={10} className="animate-spin" /> : <Upload size={10} />}
          <span>{needsRetouch ? 'Drop retouched' : 'Drop cleaned PNG'}</span>
        </div>
      )}
    </div>
  )
}

// ── Ready warning dialog ───────────────────────────────────────────────────────

function ReadyWarningDialog({ file, recipe, dataUrl, onConfirm, onCancel }: {
  file: File; recipe: RecipeFile; dataUrl: string
  onConfirm: (resolveNotes: boolean) => Promise<void>; onCancel: () => void
}) {
  const { activeNotes } = useRecipeNotes(recipe.projectId, recipe.fileId)
  const [processing, setProcessing] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
          <AlertTriangle size={18} className="text-amber-500 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Active Notes — {recipe.displayName}</p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">Review before accepting as Ready</p>
          </div>
        </div>
        <div className="flex gap-4 px-5 py-4">
          <div className="shrink-0 w-28">
            <img src={dataUrl} alt={file.name} className="w-full aspect-square object-contain rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700" />
            <p className="text-[9px] text-gray-400 mt-1 text-center truncate">{file.name}</p>
          </div>
          <div className="flex-1 space-y-2 max-h-48 overflow-y-auto">
            {activeNotes.length === 0
              ? <div className="flex items-center gap-1.5 text-xs text-gray-400 py-4"><Loader2 size={12} className="animate-spin" /> Loading notes…</div>
              : activeNotes.map(note => (
                <div key={note.id} className="rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/10 px-3 py-2">
                  <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 mb-0.5">{note.authorName}</p>
                  <p className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-snug">{note.text}</p>
                </div>
              ))
            }
          </div>
        </div>
        <div className="px-5 pb-5 flex flex-col gap-2">
          <p className="text-xs text-gray-600 dark:text-gray-400 text-center font-medium mb-0.5">Were the changes from these notes applied to this photo?</p>
          <button disabled={processing} onClick={async () => { setProcessing(true); await onConfirm(true) }}
            className="w-full rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
            {processing ? 'Processing…' : 'Yes — Mark Notes Resolved & Accept Photo'}
          </button>
          <button disabled={processing} onClick={async () => { setProcessing(true); await onConfirm(false) }}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50">
            No — Accept Photo Without Resolving
          </button>
          <button disabled={processing} onClick={onCancel}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-center py-1">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Photo group grid (CAMERA + SELECTED tabs) ──────────────────────────────────

function PhotoGroupGrid({ groups, emptyMessage, allSelected, selectedKeys, projectRootPath, showStarButton, allowSelection = true, onToggle, onToggleStar, onOpen, onWarningClick }: {
  groups: PhotoGroup[]; emptyMessage: string; allSelected?: boolean
  selectedKeys: Set<string>; projectRootPath: string; showStarButton?: boolean
  allowSelection?: boolean
  onToggle: (picturePath: string, recipeId: string, recipeName: string) => void
  onToggleStar?: (photo: CapturedPhoto & { recipeId: string; recipeName: string }) => void
  onOpen: (photos: CapturedPhoto[], idx: number, recipeName: string) => void
  onWarningClick?: (recipeId: string, recipeName: string) => void
}) {
  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
        <Camera size={32} strokeWidth={1} /><p className="text-sm">{emptyMessage}</p>
      </div>
    )
  }
  return (
    <div className="space-y-6">
      {groups.map(group => (
        <div key={group.folder}>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xs font-bold text-gray-700 dark:text-gray-200">{group.folder}</span>
            {group.activeNotesCount > 0 && (
              <button
                onClick={() => onWarningClick?.(group.recipeId, group.recipeName)}
                title={`${group.activeNotesCount} active note${group.activeNotesCount !== 1 ? 's' : ''} — click to view`}
                className="flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50 transition-colors"
              >
                <AlertTriangle size={9} />{group.activeNotesCount}
              </button>
            )}
            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
            <span className="text-xs text-gray-400">{group.photos.length} photo{group.photos.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="grid grid-cols-6 gap-2">
            {group.photos.map((photo, idx) => (
              <ManagerThumbnail
                key={photo.filename}
                photo={photo}
                projectRootPath={projectRootPath}
                forceSelected={allSelected}
                isChecked={selectedKeys.has(photo.picturePath)}
                showStarButton={showStarButton}
                allowSelection={allowSelection}
                onToggle={() => onToggle(photo.picturePath, photo.recipeId, photo.recipeName)}
                onToggleStar={onToggleStar ? () => onToggleStar(photo) : undefined}
                onDoubleClick={() => onOpen(group.photos, idx, photo.recipeName)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Manager thumbnail ──────────────────────────────────────────────────────────

function ManagerThumbnail({ photo, projectRootPath, forceSelected, isChecked, showStarButton, allowSelection = true, onToggle, onToggleStar, onDoubleClick }: {
  photo: CapturedPhoto; projectRootPath: string; forceSelected?: boolean; isChecked: boolean
  showStarButton?: boolean
  allowSelection?: boolean
  onToggle: () => void; onToggleStar?: () => void; onDoubleClick: () => void
}) {
  const [dataUrl, setDataUrl] = useState<string | null | undefined>(undefined)
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    let cancelled = false
    const absPath = resolvePhotoPath(photo.picturePath, projectRootPath)
    // Grid thumbnail: 512px is enough — full-res base64 of every photo in the
    // grid OOM-crashed the renderer (4GB heap) on large projects
    window.electronAPI.readPhotoThumbnail(absPath, 512)
      .then(url => { if (!cancelled) setDataUrl(url) })
      .catch(() => { if (!cancelled) setDataUrl(null) })
    return () => { cancelled = true }
  }, [photo.picturePath, projectRootPath])

  const isStarred = forceSelected || photo.isSelected

  return (
    <div
      onDoubleClick={onDoubleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="relative aspect-square rounded-lg overflow-hidden cursor-pointer group"
      style={isStarred ? { border: '2px solid #F59E0B' } : isChecked ? { border: '2px solid #3B82F6' } : { border: '2px solid transparent' }}
    >
      {/* Photo */}
      {dataUrl === undefined ? (
        <div className="w-full h-full bg-gray-200 dark:bg-gray-700 animate-pulse" />
      ) : dataUrl === null ? (
        <div className="w-full h-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
          <ImageOff size={16} className="text-gray-400" />
        </div>
      ) : (
        <img src={dataUrl} alt={photo.filename} className="w-full h-full object-cover" />
      )}

      {/* Checkbox — top left. Hidden for read-only viewers. */}
      {allowSelection && (
        <div
          onClick={e => { e.stopPropagation(); onToggle() }}
          className={`absolute top-1 left-1 z-10 h-4 w-4 rounded border-2 flex items-center justify-center cursor-pointer transition-all duration-150 ${
            isChecked
              ? 'opacity-100 bg-blue-500 border-blue-500'
              : 'opacity-0 group-hover:opacity-100 bg-white/70 border-white backdrop-blur-sm'
          }`}
        >
          {isChecked && <Check size={9} className="text-white" strokeWidth={3} />}
        </div>
      )}

      {/* Hover overlay */}
      {hovered && (
        <div className="absolute inset-0 bg-black/40 flex flex-col items-end justify-between p-1 pointer-events-none">
          {/* Select button — only for editors */}
          {allowSelection && (
            <button
              onClick={e => { e.stopPropagation(); onToggle() }}
              className="pointer-events-auto rounded px-1.5 py-0.5 text-[9px] font-semibold bg-white/20 text-white hover:bg-white/40 backdrop-blur-sm"
            >
              {isChecked ? '✓ Selected' : 'Select'}
            </button>
          )}
          {/* Filename — bottom */}
          <span className="w-full text-[9px] text-white leading-tight line-clamp-2 pointer-events-none">{photo.filename}</span>
        </div>
      )}

      {/* Star button — clickable in CAMERA tab; display-only indicator in SELECTED tab */}
      {(showStarButton || isStarred) && (
        <div
          className={`absolute bottom-0.5 right-0.5 ${showStarButton ? 'cursor-pointer' : 'pointer-events-none'}`}
          onClick={showStarButton ? (e) => { e.stopPropagation(); onToggleStar?.() } : undefined}
          title={showStarButton ? (isStarred ? 'Remove from Selected' : 'Add to Selected') : undefined}
        >
          <Star
            size={14}
            fill={isStarred ? '#F59E0B' : 'transparent'}
            className={isStarred ? 'text-yellow-400 drop-shadow' : 'text-white/60 drop-shadow'}
          />
        </div>
      )}
    </div>
  )
}

// ── Ready card ─────────────────────────────────────────────────────────────────

function ReadyCard({ recipe, effectiveRootPath, userId, userName, isSelected, onToggle, onWarningClick, onManifestUpdate }: {
  recipe: RecipeFile
  effectiveRootPath: string
  userId: string
  userName: string
  isSelected: boolean
  onToggle: () => void
  onWarningClick?: () => void
  onManifestUpdate?: (m: PhotoManifest) => void
}) {
  const [dataUrl, setDataUrl]           = useState<string | null | undefined>(undefined)
  const [inserting, setInserting]       = useState(false)
  const [insertError, setInsertError]   = useState<string | null>(null)
  const [insertedAt, setInsertedAt]     = useState<Date | null>(
    recipe.excelInsertedAt ? (recipe.excelInsertedAt as { toDate(): Date }).toDate() : null
  )

  /**
   * If another user holds the Excel insert lock (and it's not stale), block our
   * UI and show "In progress by X". The recipe doc is subscribed live by the
   * parent's onSnapshot so we re-render automatically when the lock changes.
   */
  const lock = recipe.excelInsertLock
  const isLockedByOther = !!(
    lock &&
    lock.userId &&
    lock.userId !== userId &&
    Date.now() - (lock.startedAt?.toDate?.()?.getTime?.() ?? 0) < EXCEL_LOCK_TTL_MS
  )

  useEffect(() => {
    if (!recipe.readyJpgPath) return
    let cancelled = false
    const absJpg = resolvePhotoPath(recipe.readyJpgPath, effectiveRootPath)
    window.electronAPI.readPhotoThumbnail(absJpg, 512)
      .then(url => { if (!cancelled) setDataUrl(url) })
      .catch(() => { if (!cancelled) setDataUrl(null) })
    return () => { cancelled = true }
  }, [recipe.readyJpgPath, effectiveRootPath])

  const hasBoth = !!(recipe.readyPngPath && recipe.readyJpgPath)

  async function handleInsertExcel(e: React.MouseEvent) {
    e.stopPropagation()
    if (!recipe.readyJpgPath) return
    setInserting(true)
    setInsertError(null)
    // ── Acquire cross-machine lock so two users don't corrupt the same workbook
    const holder = await acquireExcelInsertLock(recipe.id, userId, userName)
    if (holder) {
      setInsertError(`Already being inserted by ${holder.holderUserName}. Try again in a moment.`)
      setInserting(false)
      return
    }
    try {
      const sep = effectiveRootPath.includes('\\') ? '\\' : '/'
      const excelPath = effectiveRootPath + sep + recipe.relativePath.replace(/\//g, sep)
      const jpgPath   = resolvePhotoPath(recipe.readyJpgPath, effectiveRootPath)
      const result = await window.electronAPI.insertPhotoInExcel({ excelPath, jpgPath })
      if (!result.success) {
        setInsertError(result.error ?? 'Unknown error')
      } else {
        // Prefer manifest write; fall back to legacy Firestore field
        const projectRoot = effectiveRootPath.replace(/\\/g, '/')
        const parts = recipe.relativePath.replace(/\\/g, '/').split('/')
        const subfolderName = parts.length > 1 ? parts[0] : ''
        if (recipe.recipeUid && projectRoot && onManifestUpdate) {
          try {
            const merged = await markExcelInserted(projectRoot, {
              recipeId:          recipe.id,
              recipeUid:         recipe.recipeUid,
              excelRelativePath: recipe.relativePath,
              recipeName:        recipe.recipeName || recipe.displayName,
              subfolderName,
              userId,
            })
            onManifestUpdate(merged)
          } catch (err) {
            console.warn('[handleInsertExcel] manifest write failed, falling back:', err)
            await updateRecipeExcelInserted(recipe.id, userId)
          }
        } else {
          await updateRecipeExcelInserted(recipe.id, userId)
        }
        setInsertedAt(new Date())
      }
    } catch (err) {
      setInsertError(err instanceof Error ? err.message : String(err))
    } finally {
      // Always release the lock, even on error, so other users aren't blocked.
      releaseExcelInsertLock(recipe.id, userId).catch(() => {})
      setInserting(false)
    }
  }

  return (
    <div
      onClick={onToggle}
      className={`flex flex-col gap-1 cursor-pointer rounded-xl p-1 transition-colors ${
        isSelected ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
      }`}
    >
      <div className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
        {dataUrl === undefined ? (
          <div className="w-full h-full animate-pulse bg-gray-200 dark:bg-gray-700" />
        ) : dataUrl === null ? (
          <div className="w-full h-full flex items-center justify-center"><ImageOff size={20} className="text-gray-400" /></div>
        ) : (
          <img src={dataUrl} alt={recipe.displayName} className="w-full h-full object-cover" />
        )}
        {/* Selection indicator */}
        <div className={`absolute top-1 left-1 h-4 w-4 rounded border-2 flex items-center justify-center transition-all ${
          isSelected ? 'bg-blue-500 border-blue-500 opacity-100' : 'bg-white/70 border-white opacity-0'
        }`}>
          {isSelected && <Check size={9} className="text-white" strokeWidth={3} />}
        </div>
      </div>

      <div className="flex items-center gap-1 px-0.5 min-w-0">
        <p className="text-[10px] text-gray-700 dark:text-gray-300 truncate font-medium flex-1">
          {recipe.recipeName || recipe.displayName}
        </p>
        {(recipe.activeNotesCount ?? 0) > 0 && (
          <button
            onClick={e => { e.stopPropagation(); onWarningClick?.() }}
            title={`${recipe.activeNotesCount} active note(s) — click to view`}
            className="shrink-0 flex items-center gap-0.5 rounded-full bg-amber-100 px-1 py-0.5 text-[9px] font-semibold text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50 transition-colors"
          >
            <AlertTriangle size={8} />{recipe.activeNotesCount}
          </button>
        )}
      </div>

      <span className={`text-[9px] rounded-full px-1.5 py-0.5 font-medium w-fit ml-0.5 ${
        hasBoth ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
      }`}>
        {hasBoth ? 'PNG + JPG' : 'PNG only'}
      </span>

      {/* Insertar en Excel — only show when JPG is available */}
      {recipe.readyJpgPath && (
        <div className="flex flex-col gap-0.5 px-0.5" onClick={e => e.stopPropagation()}>
          {isLockedByOther ? (
            <div className="flex items-center justify-center gap-1 text-[9px] font-semibold rounded-md px-1.5 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 cursor-not-allowed">
              <Loader2 size={9} className="animate-spin" />
              <span className="truncate" title={`${lock?.userName} is inserting now`}>
                In progress ({lock?.userName})
              </span>
            </div>
          ) : insertedAt ? (
            <div className="flex gap-1 items-center">
              <span className="text-[9px] text-green-600 dark:text-green-400 font-medium flex items-center gap-0.5 flex-1 truncate">
                <Check size={9} strokeWidth={3} />
                Insertado {insertedAt.toLocaleDateString()}
              </span>
              <button
                onClick={handleInsertExcel}
                disabled={inserting}
                className="text-[8px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline shrink-0"
              >
                Reinsertar
              </button>
            </div>
          ) : (
            <button
              onClick={handleInsertExcel}
              disabled={inserting}
              className="flex items-center justify-center gap-1 text-[9px] font-semibold rounded-md px-1.5 py-1 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white transition-colors"
            >
              {inserting ? <Loader2 size={9} className="animate-spin" /> : null}
              {inserting ? 'Insertando…' : 'Insertar en Excel'}
            </button>
          )}
          {insertError && (
            <p className="text-[8px] text-red-500 dark:text-red-400 leading-tight px-0.5">{insertError}</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Notes modal — shown when clicking any warning badge in the Photo Manager ───

function NotesModal({ projectId, fileId, recipeName, onClose }: {
  projectId: string
  fileId: string
  recipeName: string
  onClose: () => void
}) {
  const { activeNotes, isLoading } = useRecipeNotes(projectId, fileId)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(3px)' }}
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
          <AlertTriangle size={16} className="text-amber-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 truncate">{recipeName}</p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
              {isLoading ? 'Loading…' : `${activeNotes.length} active note${activeNotes.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-amber-400 hover:text-amber-700 dark:hover:text-amber-200 text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* Notes list */}
        <div className="px-5 py-4 space-y-2 max-h-80 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-400 py-4 justify-center">
              <Loader2 size={14} className="animate-spin" /> Loading notes…
            </div>
          ) : activeNotes.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-gray-400 py-4 justify-center">
              <CheckCircle2 size={14} className="text-green-500" /> No active notes — all resolved.
            </div>
          ) : (
            activeNotes.map(note => (
              <div key={note.id} className="rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/10 px-3 py-2.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <AlertTriangle size={10} className="text-amber-500 shrink-0" />
                  <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">{note.authorName}</span>
                  {note.createdAt && (
                    <span className="text-[9px] text-gray-400 ml-auto">
                      {(note.createdAt as { toDate(): Date }).toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-snug">{note.text}</p>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-4">
          <button
            onClick={onClose}
            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
