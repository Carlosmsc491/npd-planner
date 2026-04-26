// src/renderer/src/pages/CapturePage.tsx
// Photo capture page — Fase 2: tethering (CAPTURE mode) + candidate selection (GALLERY mode)

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { doc, getDoc, Timestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { ChevronLeft, Camera, Loader2, AlertTriangle, CheckCircle, Star, Trash2 } from 'lucide-react'
import type { RecipeFile, RecipeProject, CapturedPhoto, GlobalSettings } from '../types'
import { useAuthStore } from '../store/authStore'
import {
  addCapturedPhoto,
  updateRecipePhotoSelections,
  deleteCapturedPhoto,
  getGlobalSettings,
} from '../lib/firestore'
import { resolvePhotoPath, toRelativePhotoPath } from '../utils/photoUtils'

// ── Local state shape for photos in this session ─────────────────────────────
interface LocalPhoto {
  sequence: number
  filename: string
  picturePath: string
  cameraPath: string
  ssdPath: string | null
  dataUrl: string | null  // null = not yet loaded
}

type PageMode = 'capture' | 'gallery'

export default function CapturePage() {
  const { recipeId } = useParams<{ recipeId: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()

  // ── Recipe / project state ─────────────────────────────────────────────────
  const [recipe, setRecipe]   = useState<RecipeFile | null>(null)
  const [project, setProject] = useState<RecipeProject | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // ── Page mode ──────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<PageMode>('capture')
  const [galleryIndex, setGalleryIndex] = useState(0)

  // ── Camera state ───────────────────────────────────────────────────────────
  const [cameraConnected, setCameraConnected]   = useState(false)
  const [cameraModel, setCameraModel]           = useState<string | null>(null)
  const [cameraChecking, setCameraChecking]     = useState(false)
  const [cameraWarming, setCameraWarming]       = useState(false)  // true only during first-time init
  const [gphoto2Missing, setGphoto2Missing]     = useState(false)
  const [tetheringActive, setTetheringActive]   = useState(false)
  const [tetheringFailed, setTetheringFailed]   = useState(false)
  // Watch Folder mode
  const [watchFolderPath, setWatchFolderPath]   = useState<string | null>(null)
  const [watchFolderActive, setWatchFolderActive] = useState(false)
  const [watchFolderError, setWatchFolderError] = useState<string | null>(null)
  const watchFolderRef = useRef<string | null>(null)

  // ── Photo session state ────────────────────────────────────────────────────
  const [photos, setPhotos]           = useState<LocalPhoto[]>([])
  const [previewIndex, setPreviewIndex] = useState(-1)    // capture mode preview
  const [processingPhoto, setProcessingPhoto] = useState(false)

  // ── Selection state (gallery mode) ────────────────────────────────────────
  // Record<filename, isSelected>
  const [localSelection, setLocalSelection] = useState<Record<string, boolean>>({})

  // ── DONE / finish modals ───────────────────────────────────────────────────
  const [showFinishModal, setShowFinishModal] = useState(false)
  const [finishLoading, setFinishLoading]     = useState(false)

  // ── Delete photo state ────────────────────────────────────────────────────
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null) // filename pending delete
  const [deleteLoading, setDeleteLoading] = useState(false)

  // ── System paths / settings ────────────────────────────────────────────────
  const [userDataPath, setUserDataPath] = useState<string | null>(null)
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings | null>(null)

  // ── Refs for stable callbacks (avoid stale closures) ──────────────────────
  const photosRef        = useRef<LocalPhoto[]>([])
  const processingRef    = useRef(false)
  const tetheringRef     = useRef(false)
  const recipeRef        = useRef<RecipeFile | null>(null)
  const projectRef       = useRef<RecipeProject | null>(null)
  const settingsRef      = useRef<GlobalSettings | null>(null)
  const filmstripRef     = useRef<HTMLDivElement>(null)
  const modeRef          = useRef<PageMode>('capture')

  // Keep refs in sync with state
  useEffect(() => { photosRef.current     = photos },          [photos])
  useEffect(() => { recipeRef.current     = recipe },          [recipe])
  useEffect(() => { projectRef.current    = project },         [project])
  useEffect(() => { settingsRef.current   = globalSettings },  [globalSettings])
  useEffect(() => { tetheringRef.current  = tetheringActive }, [tetheringActive])
  useEffect(() => { modeRef.current       = mode },            [mode])

  // ── Load recipe + project + global settings ────────────────────────────────
  useEffect(() => {
    if (!recipeId) { setNotFound(true); setLoading(false); return }

    async function load() {
      try {
        const sep = recipeId!.indexOf('::')
        if (sep === -1) { setNotFound(true); return }
        const projectId = recipeId!.substring(0, sep)
        const fileId    = recipeId!
        if (!projectId) { setNotFound(true); return }

        const [recipeSnap, projectSnap, settings, udPath] = await Promise.all([
          getDoc(doc(db, 'recipeProjects', projectId, 'recipeFiles', fileId)),
          getDoc(doc(db, 'recipeProjects', projectId)),
          getGlobalSettings(),
          window.electronAPI.getUserDataPath(),
        ])

        if (!recipeSnap.exists()) { setNotFound(true); return }

        const loadedRecipe = { id: recipeSnap.id, ...recipeSnap.data() } as RecipeFile
        setRecipe(loadedRecipe)
        recipeRef.current = loadedRecipe

        if (projectSnap.exists()) {
          const loadedProject = { id: projectSnap.id, ...projectSnap.data() } as RecipeProject
          setProject(loadedProject)
          projectRef.current = loadedProject
        }

        setGlobalSettings(settings)
        settingsRef.current = settings
        setUserDataPath(udPath)

        // Pre-load watch folder path from settings
        if (settings?.captureWatchPath) {
          setWatchFolderPath(settings.captureWatchPath)
          watchFolderRef.current = settings.captureWatchPath
        }

        // Pre-populate from previously captured photos in Firestore
        // Paths stored in Firestore may be relative (new) or absolute (legacy) — resolve both.
        if (loadedRecipe.capturedPhotos?.length) {
          const projRoot = projectRef.current?.rootPath ?? ''
          const existing: LocalPhoto[] = loadedRecipe.capturedPhotos.map(cp => ({
            sequence:    cp.sequence,
            filename:    cp.filename,
            picturePath: resolvePhotoPath(cp.picturePath, projRoot),
            cameraPath:  resolvePhotoPath(cp.cameraPath,  projRoot),
            ssdPath:     cp.ssdPath,
            dataUrl:     null,
          }))
          setPhotos(existing)
          photosRef.current = existing
          setPreviewIndex(existing.length - 1)

          // Restore selection state
          const sel: Record<string, boolean> = {}
          loadedRecipe.capturedPhotos.forEach(p => {
            sel[p.filename] = p.isSelected ?? false
          })
          setLocalSelection(sel)
        }

        // If session already has photos, open gallery mode for 'complete' / 'selected' status
        const status = loadedRecipe.photoStatus
        if (status === 'complete' || status === 'selected') {
          setMode('gallery')
          modeRef.current = 'gallery'
          const count = loadedRecipe.capturedPhotos?.length ?? 0
          if (count > 0) setGalleryIndex(count - 1)
        }
      } catch (err) {
        console.error('CapturePage load error:', err)
        setNotFound(true)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [recipeId])

  // ── Lazy data URL loader ───────────────────────────────────────────────────
  const loadDataUrl = useCallback(async (idx: number) => {
    const photo = photosRef.current[idx]
    if (!photo || photo.dataUrl !== null) return
    try {
      const dataUrl = await window.electronAPI.readFileAsDataUrl(photo.picturePath)
      setPhotos(prev =>
        prev.map((p, i) => (i === idx ? { ...p, dataUrl } : p))
      )
    } catch {
      // File may not exist for stale Firestore records — skip silently
    }
  }, [])

  // Load data URL whenever capture preview changes
  useEffect(() => {
    if (previewIndex >= 0) loadDataUrl(previewIndex)
  }, [previewIndex, loadDataUrl])

  // Load data URL whenever gallery index changes
  useEffect(() => {
    if (mode === 'gallery' && galleryIndex >= 0) loadDataUrl(galleryIndex)
  }, [mode, galleryIndex, loadDataUrl])

  // ── Camera check ───────────────────────────────────────────────────────────
  const checkCamera = useCallback(async (): Promise<boolean> => {
    setCameraChecking(true)
    try {
      const status = await window.electronAPI.checkCameraConnection()
      setCameraConnected(status.connected)
      setCameraModel(status.model)
      return status.connected
    } finally {
      setCameraChecking(false)
    }
  }, [])

  // ── Start tethering ────────────────────────────────────────────────────────
  const startTethering = useCallback(async (udPath: string) => {
    if (tetheringRef.current) return
    const tempDir = `${udPath}/camera-temp`
    setCameraWarming(true)
    const result = await window.electronAPI.startCameraTethering(tempDir)
    setCameraWarming(false)
    if (result.success) {
      setTetheringActive(true)
      tetheringRef.current = true
    } else if (result.error?.toLowerCase().includes('gphoto2')) {
      setGphoto2Missing(true)
    } else {
      setTetheringFailed(true)
      if (watchFolderRef.current) {
        const wfResult = await window.electronAPI.startFolderWatch(watchFolderRef.current)
        if (wfResult.success) setWatchFolderActive(true)
      }
    }
  }, [])

  // ── Watch folder ───────────────────────────────────────────────────────────
  const handleStartWatchFolder = useCallback(async (folderPath: string) => {
    setWatchFolderError(null)
    await window.electronAPI.stopFolderWatch()
    const result = await window.electronAPI.startFolderWatch(folderPath)
    if (result.success) {
      setWatchFolderPath(folderPath)
      setWatchFolderActive(true)
      watchFolderRef.current = folderPath
      const { updateGlobalSettings } = await import('../lib/firestore')
      updateGlobalSettings({ captureWatchPath: folderPath }).catch(console.error)
    } else {
      setWatchFolderError(result.error ?? 'Could not watch folder. Make sure the folder exists.')
    }
  }, [])

  // On mount: check if tethering already active (between-recipe switch), else full init
  useEffect(() => {
    if (loading || !userDataPath) return
    // Gallery-only sessions don't need tethering
    if (modeRef.current === 'gallery') return
    let cancelled = false
    async function init() {
      // Ask main process if gphoto2 is already running from a previous recipe session
      const alreadyActive = await window.electronAPI.isTetheringActive()
      if (cancelled) return
      if (alreadyActive) {
        // Tethering is warm — just sync state, skip the 4-5 second init entirely
        setTetheringActive(true)
        tetheringRef.current = true
        const status = await window.electronAPI.checkCameraConnection()
        if (!cancelled) {
          setCameraConnected(status.connected)
          setCameraModel(status.model)
        }
        return
      }
      // First time (or after camera disconnect) — full init with warming indicator
      const connected = await checkCamera()
      if (!cancelled && connected) await startTethering(userDataPath!)
    }
    init()
    return () => {
      cancelled = true
      // Do NOT stop tethering — keep gphoto2 alive so the next recipe session is instant.
      // Tethering will stop naturally on camera disconnect or app exit.
      window.electronAPI.stopFolderWatch()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, userDataPath])

  // Camera connect/disconnect events
  useEffect(() => {
    const unlisten = window.electronAPI.onCameraStatusChanged(async (data) => {
      setCameraConnected(data.connected)
      setCameraModel(data.model)
      if (data.connected && !tetheringRef.current && userDataPath) {
        await startTethering(userDataPath)
      }
    })
    return () => unlisten()
  }, [startTethering, userDataPath])

  // ── Photo received handler ─────────────────────────────────────────────────
  useEffect(() => {
    const unlisten = window.electronAPI.onCameraPhotoReceived(async (data) => {
      console.log('[CapturePage] photo-received:', data.filename)
      if (processingRef.current) { console.warn('[CapturePage] already processing, skip'); return }
      const currentRecipe  = recipeRef.current
      const currentProject = projectRef.current
      if (!currentRecipe || !currentProject || !recipeId) {
        console.error('[CapturePage] missing data — recipe:', !!currentRecipe, 'project:', !!currentProject)
        return
      }

      processingRef.current = true
      setProcessingPhoto(true)

      try {
        const relParts      = currentRecipe.relativePath.replace(/\\/g, '/').split('/')
        const subfolderName = relParts.length > 1 ? relParts[0] : ''
        const baseName      = currentRecipe.recipeName || currentRecipe.displayName
        const nextSeq       = photosRef.current.length + 1
        const filename      = `${baseName} - ${nextSeq}.jpg`

        const projectRoot = currentProject.rootPath.replace(/\\/g, '/')
        // Absolute paths — for local file ops on THIS machine
        const cameraAbsPath = subfolderName
          ? `${projectRoot}/PICTURES/1. CAMERA/${subfolderName}/${filename}`
          : `${projectRoot}/PICTURES/1. CAMERA/${filename}`
        // Relative paths — portable across machines, stored in Firestore
        const cameraRelPath = subfolderName
          ? `PICTURES/1. CAMERA/${subfolderName}/${filename}`
          : `PICTURES/1. CAMERA/${filename}`
        // SSD stays absolute (it's always machine-specific)
        const ssdBase = settingsRef.current?.ssdPhotoPath ?? null
        const ssdPath = ssdBase
          ? (subfolderName
              ? `${ssdBase}/${currentProject.name}/PICTURES/1. CAMERA/${subfolderName}/${filename}`
              : `${ssdBase}/${currentProject.name}/PICTURES/1. CAMERA/${filename}`)
          : null

        const [camResult] = await Promise.all([
          window.electronAPI.cameraCopyFile(data.tempPath, cameraAbsPath),
        ])
        if (!camResult.success) console.error('[Capture] CAMERA copy failed:', camResult.error)

        if (ssdPath) {
          window.electronAPI.cameraCopyFile(data.tempPath, ssdPath)
            .catch(err => console.warn('[Capture] SSD copy failed:', err))
        }

        // Firestore: store relative paths so any user can resolve them
        const capturedPhoto: CapturedPhoto = {
          sequence:      nextSeq,
          filename,
          subfolderName,
          picturePath:   cameraRelPath,
          cameraPath:    cameraRelPath,
          ssdPath,
          capturedAt:    Timestamp.now(),
          capturedBy:    user?.uid ?? '',
          isSelected:    false,
        }
        await addCapturedPhoto(recipeId, capturedPhoto)

        let dataUrl: string | null = null
        try {
          dataUrl = await window.electronAPI.readFileAsDataUrl(cameraAbsPath)
        } catch { /* skip */ }

        // LocalPhoto: absolute paths for immediate use on this machine
        const newPhoto: LocalPhoto = {
          sequence: nextSeq, filename,
          picturePath: cameraAbsPath,
          cameraPath:  cameraAbsPath,
          ssdPath, dataUrl,
        }

        const newIndex = photosRef.current.length
        setPhotos(prev => {
          const updated = [...prev, newPhoto]
          photosRef.current = updated
          return updated
        })
        // Switch to gallery mode: update preview only if still in capture mode
        if (modeRef.current === 'capture') setPreviewIndex(newIndex)

        requestAnimationFrame(() => {
          if (filmstripRef.current) {
            filmstripRef.current.scrollLeft = filmstripRef.current.scrollWidth
          }
        })
      } catch (err) {
        console.error('[Capture] Photo processing error:', err)
      } finally {
        processingRef.current = false
        setProcessingPhoto(false)
      }
    })
    return () => unlisten()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeId, user?.uid])

  // ── Gallery keyboard + mouse wheel ────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'gallery') return

    function handleKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft')  setGalleryIndex(i => Math.max(0, i - 1))
      if (e.key === 'ArrowRight') setGalleryIndex(i => Math.min(photosRef.current.length - 1, i + 1))
      if (e.key === 'Enter') {
        const photo = photosRef.current[galleryIndex]
        if (photo) toggleSelection(photo.filename)
      }
    }

    function handleWheel(e: WheelEvent) {
      e.preventDefault()
      if (e.deltaY > 0) setGalleryIndex(i => Math.min(photosRef.current.length - 1, i + 1))
      if (e.deltaY < 0) setGalleryIndex(i => Math.max(0, i - 1))
    }

    window.addEventListener('keydown', handleKey)
    window.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      window.removeEventListener('keydown', handleKey)
      window.removeEventListener('wheel', handleWheel)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, galleryIndex])

  // ── Auto-scroll filmstrip to active photo ─────────────────────────────────
  useEffect(() => {
    if (mode !== 'gallery' || !filmstripRef.current) return
    const strip = filmstripRef.current
    const thumb = strip.children[galleryIndex] as HTMLElement | undefined
    if (thumb) {
      thumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
    }
  }, [mode, galleryIndex])

  // ── Selection helpers ──────────────────────────────────────────────────────
  function toggleSelection(filename: string) {
    setLocalSelection(prev => ({ ...prev, [filename]: !prev[filename] }))
  }

  // ── Delete a single captured photo ────────────────────────────────────────
  async function handleDeletePhoto(filename: string) {
    if (!recipeId) return
    setDeleteLoading(true)
    try {
      const target = photosRef.current.find(p => p.filename === filename)
      if (target) {
        // Best-effort: delete physical files (CAMERA + SSD copies)
        await window.electronAPI.deleteFromSelected({ filePath: target.cameraPath })
        if (target.ssdPath) {
          window.electronAPI.deleteFromSelected({ filePath: target.ssdPath }).catch(() => {/* ignore */})
        }
        // Also remove from SELECTED/ if it was selected
        if (localSelection[filename] && project) {
          const relParts      = (recipeRef.current?.relativePath ?? '').replace(/\\/g, '/').split('/')
          const subfolderName = relParts.length > 1 ? relParts[0] : ''
          const projectRoot   = project.rootPath.replace(/\\/g, '/')
          const selectedPath  = subfolderName
            ? `${projectRoot}/PICTURES/2. SELECTED/${subfolderName}/${filename}`
            : `${projectRoot}/PICTURES/2. SELECTED/${filename}`
          window.electronAPI.deleteFromSelected({ filePath: selectedPath }).catch(() => {/* ignore */})
        }
      }

      // Re-build remaining array with re-sequenced numbers.
      // LocalPhoto uses absolute paths; Firestore needs relative paths.
      const rootPath    = projectRef.current?.rootPath ?? ''
      const subfolderForRecipe = (recipeRef.current?.relativePath ?? '').replace(/\\/g, '/').split('/').slice(0, -1)[0] ?? ''
      const remaining: CapturedPhoto[] = photosRef.current
        .filter(p => p.filename !== filename)
        .map((p, i) => ({
          sequence:      i + 1,
          filename:      p.filename,
          subfolderName: subfolderForRecipe,
          picturePath:   toRelativePhotoPath(p.picturePath, rootPath),
          cameraPath:    toRelativePhotoPath(p.cameraPath,  rootPath),
          ssdPath:       p.ssdPath,
          capturedAt:    Timestamp.now(),
          capturedBy:    user?.uid ?? '',
          isSelected:    localSelection[p.filename] ?? false,
        }))

      await deleteCapturedPhoto(recipeId, remaining)

      // Update local state
      const newPhotos = photosRef.current.filter(p => p.filename !== filename)
      setPhotos(newPhotos)
      photosRef.current = newPhotos
      setLocalSelection(prev => {
        const next = { ...prev }
        delete next[filename]
        return next
      })
      // Adjust preview/gallery index so it doesn't go out of bounds
      const lastIdx = newPhotos.length - 1
      if (mode === 'capture') setPreviewIndex(prev => Math.min(prev, lastIdx))
      else setGalleryIndex(prev => Math.min(prev, Math.max(0, lastIdx)))

      setDeleteConfirm(null)
    } catch (err) {
      console.error('[Capture] Delete photo error:', err)
    } finally {
      setDeleteLoading(false)
    }
  }

  // ── Finish session ─────────────────────────────────────────────────────────
  async function handleFinishSession() {
    if (!recipeId || !projectRef.current) return
    setFinishLoading(true)
    try {
      const currentPhotos = photosRef.current
      const projectRoot   = projectRef.current.rootPath.replace(/\\/g, '/')

      const relParts      = (recipeRef.current?.relativePath ?? '').replace(/\\/g, '/').split('/')
      const subfolderName = relParts.length > 1 ? relParts[0] : ''

      // Build updated CapturedPhoto array for Firestore — use RELATIVE paths
      const updatedPhotos: CapturedPhoto[] = currentPhotos.map(p => ({
        sequence:      p.sequence,
        filename:      p.filename,
        subfolderName,
        // LocalPhoto has absolute paths → convert to relative for Firestore
        picturePath:   toRelativePhotoPath(p.picturePath, projectRoot),
        cameraPath:    toRelativePhotoPath(p.cameraPath,  projectRoot),
        ssdPath:       p.ssdPath,
        capturedAt:    Timestamp.now(),
        capturedBy:    user?.uid ?? '',
        isSelected:    localSelection[p.filename] ?? false,
        ...(localSelection[p.filename]
          ? { selectedAt: Timestamp.now(), selectedBy: user?.uid ?? '' }
          : {}),
      }))

      // Copy selected photos to SELECTED/, remove deselected ones
      // File ops use absolute paths (local machine) — resolve from relative
      for (const photo of updatedPhotos) {
        const absCamera    = resolvePhotoPath(photo.cameraPath, projectRoot)
        const selectedPath = subfolderName
          ? `${projectRoot}/PICTURES/2. SELECTED/${subfolderName}/${photo.filename}`
          : `${projectRoot}/PICTURES/2. SELECTED/${photo.filename}`

        if (photo.isSelected) {
          const result = await window.electronAPI.copyToSelected({
            sourcePath: absCamera,
            destPath:   selectedPath,
          })
          if (!result.success) console.error('[Capture] SELECTED copy failed:', result.error)
        } else {
          // Remove from SELECTED/ if it was previously selected and now deselected
          await window.electronAPI.deleteFromSelected({ filePath: selectedPath })
        }
      }

      const newStatus = updatedPhotos.some(p => p.isSelected) ? 'selected' : 'complete'
      await updateRecipePhotoSelections(recipeId, updatedPhotos, newStatus)
      // Keep tethering alive — next recipe session will reuse it without re-init
      navigate(-1)
    } catch (err) {
      console.error('[Capture] Finish session error:', err)
      setFinishLoading(false)
      setShowFinishModal(false)
    }
  }

  // ── Loading / error screens ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 text-white gap-3">
        <Loader2 size={20} className="animate-spin" />
        <span className="text-sm">Loading recipe…</span>
      </div>
    )
  }

  if (notFound || !recipe || !project) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-950 text-white gap-4">
        <p className="text-sm text-gray-400">Recipe not found.</p>
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors"
        >
          <ChevronLeft size={14} /> Go back
        </button>
      </div>
    )
  }

  const relParts2      = recipe.relativePath.replace(/\\/g, '/').split('/')
  const subfolderName  = relParts2.length > 1 ? relParts2[0] : ''
  const previewPhoto   = previewIndex >= 0 ? photos[previewIndex] : null
  const photoCount     = photos.length
  const galleryPhoto   = photos[galleryIndex] ?? null
  const selectedCount  = Object.values(localSelection).filter(Boolean).length

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white overflow-hidden">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 shrink-0">
        {mode === 'gallery' ? (
          <button
            onClick={() => setMode('capture')}
            className="flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors"
          >
            <ChevronLeft size={16} /> Back to capture
          </button>
        ) : (
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors"
          >
            <ChevronLeft size={16} /> Back
          </button>
        )}
        <span className="text-gray-700">|</span>
        <span className="text-sm text-gray-300 flex-1 min-w-0 truncate">
          {subfolderName && (
            <span className="text-gray-500">{subfolderName} › </span>
          )}
          <span className="font-medium text-white">{recipe.displayName}</span>
        </span>
        {mode === 'gallery' && (
          <span className="text-xs text-gray-500 shrink-0">Select your candidate</span>
        )}

        {/* Camera status pill — only in capture mode */}
        {mode === 'capture' && (
          <div
            title={cameraConnected ? (cameraModel ?? 'Camera connected') : 'No camera detected'}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium shrink-0 transition-colors ${
              cameraConnected
                ? 'bg-green-900/40 text-green-400'
                : 'bg-gray-800 text-gray-500'
            }`}
          >
            <Camera size={12} />
            <span className="hidden sm:inline">
              {cameraWarming
                ? 'Warming up…'
                : cameraChecking
                  ? 'Checking…'
                  : cameraConnected
                    ? (cameraModel ?? 'Connected')
                    : 'No Camera'
              }
            </span>
            {cameraConnected && (
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            )}
          </div>
        )}
      </div>

      {/* ── Banners (capture mode only) ─────────────────────────────────────── */}
      {mode === 'capture' && (
        <>
          {cameraWarming && (
            <div className="bg-blue-950/70 border-b border-blue-800/60 px-4 py-3 flex items-center gap-3 shrink-0">
              <Loader2 size={15} className="text-blue-400 animate-spin shrink-0" />
              <div className="flex flex-col">
                <span className="text-sm font-medium text-blue-200">Warming up camera…</span>
                <span className="text-xs text-blue-400/80">
                  Releasing USB device and starting tethering. This only happens once.
                </span>
              </div>
            </div>
          )}

          {gphoto2Missing && (
            <div className="bg-red-950/60 border-b border-red-800/60 px-4 py-2.5 flex items-center gap-2 shrink-0">
              <AlertTriangle size={14} className="text-red-400 shrink-0" />
              <span className="text-sm text-red-300 flex-1">gPhoto2 is not installed.</span>
              <code className="text-red-200 bg-red-900/40 px-2 py-0.5 rounded text-xs shrink-0">
                brew install gphoto2
              </code>
            </div>
          )}

          {!cameraConnected && !gphoto2Missing && !watchFolderActive && (
            <div className="bg-orange-950/50 border-b border-orange-800/40 px-4 py-2.5 flex items-center gap-3 shrink-0">
              <AlertTriangle size={14} className="text-orange-400 shrink-0" />
              <span className="text-sm text-orange-300 flex-1">
                {tetheringFailed
                  ? 'gPhoto2 could not claim the camera (macOS USB restriction). Use Watch Folder mode below.'
                  : 'Connect the Canon camera via USB and turn it on'}
              </span>
              {!tetheringFailed && (
                <button
                  onClick={async () => {
                    const connected = await checkCamera()
                    if (connected && userDataPath) await startTethering(userDataPath)
                  }}
                  disabled={cameraChecking}
                  className="shrink-0 text-xs bg-orange-700 hover:bg-orange-600 disabled:opacity-50 text-white px-3 py-1.5 rounded transition-colors"
                >
                  {cameraChecking ? 'Checking…' : 'Retry'}
                </button>
              )}
            </div>
          )}

          {watchFolderActive && (
            <div className="bg-blue-950/50 border-b border-blue-700/40 px-4 py-2 flex items-center gap-2 shrink-0">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shrink-0" />
              <span className="text-xs text-blue-300 flex-1 truncate">
                Watching: <span className="text-blue-100 font-mono">{watchFolderPath}</span>
              </span>
              <button
                onClick={async () => {
                  await window.electronAPI.stopFolderWatch()
                  setWatchFolderActive(false)
                }}
                className="text-[10px] text-blue-400 hover:text-blue-200 shrink-0"
              >
                Stop
              </button>
            </div>
          )}

          {(tetheringFailed || (!cameraConnected && !gphoto2Missing)) && !watchFolderActive && (
            <div className="bg-gray-900 border-b border-gray-700 px-4 py-2.5 flex items-center gap-3 shrink-0">
              <span className="text-xs text-gray-400 shrink-0">Watch Folder:</span>
              <span className="flex-1 text-xs text-gray-500 font-mono truncate">
                {watchFolderPath ?? 'Not set — point Capture One to a folder and select it here'}
              </span>
              <button
                onClick={async () => {
                  const result = await window.electronAPI.invoke('dialog:open-folder') as string | null
                  if (result) await handleStartWatchFolder(result)
                }}
                className="shrink-0 text-xs bg-blue-700 hover:bg-blue-600 text-white px-3 py-1.5 rounded transition-colors"
              >
                {watchFolderPath ? 'Change Folder' : 'Select Folder'}
              </button>
              {watchFolderPath && (
                <button
                  onClick={() => handleStartWatchFolder(watchFolderPath)}
                  className="shrink-0 text-xs bg-green-700 hover:bg-green-600 text-white px-3 py-1.5 rounded transition-colors"
                >
                  Start Watching
                </button>
              )}
            </div>
          )}

          {watchFolderError && (
            <div className="bg-red-950/50 border-b border-red-800/40 px-4 py-2 flex items-center gap-2 shrink-0">
              <AlertTriangle size={13} className="text-red-400 shrink-0" />
              <span className="text-xs text-red-300 flex-1">{watchFolderError}</span>
              <button onClick={() => setWatchFolderError(null)} className="text-red-400 hover:text-red-200 text-xs">✕</button>
            </div>
          )}
        </>
      )}

      {/* ── Main area ─────────────────────────────────────────────────────────── */}
      {mode === 'capture' ? (
        /* CAPTURE MODE — live preview */
        <div className="flex-1 flex items-center justify-center bg-black overflow-hidden min-h-0 relative">
          {previewPhoto?.dataUrl ? (
            <img
              key={previewPhoto.filename}
              src={previewPhoto.dataUrl}
              alt={previewPhoto.filename}
              className="max-w-full max-h-full object-contain"
              style={{ animation: 'fadeIn 0.25s ease-in' }}
            />
          ) : previewPhoto && previewPhoto.dataUrl === null ? (
            <div className="flex items-center gap-2 text-gray-600">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-sm">Loading…</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 text-gray-700 select-none">
              <Camera size={56} strokeWidth={1} />
              <p className="text-sm">Trigger the camera to take the first photo</p>
            </div>
          )}
          {processingPhoto && (
            <div className="absolute bottom-4 right-4 flex items-center gap-2 bg-gray-900/80 px-3 py-1.5 rounded-full text-xs text-green-400">
              <Loader2 size={11} className="animate-spin" />
              Saving photo…
            </div>
          )}
        </div>
      ) : (
        /* GALLERY MODE — candidate selection */
        <div className="flex-1 flex flex-col overflow-hidden min-h-0 bg-black">
          {/* Photo name */}
          <div className="text-center text-white text-sm font-medium py-2 shrink-0">
            {galleryPhoto?.filename.replace(/\.[^.]+$/, '') ?? '—'}
          </div>

          {/* Photo + nav arrows */}
          <div className="relative flex-1 flex items-center min-h-0">
            {/* Left arrow */}
            {galleryIndex > 0 && (
              <button
                onClick={() => setGalleryIndex(i => i - 1)}
                className="absolute left-0 z-10 h-full w-16 flex items-center justify-center bg-black/20 hover:bg-black/50 text-white text-5xl transition-colors select-none"
              >
                ‹
              </button>
            )}

            {/* Image */}
            <div className="relative flex-1 h-full flex items-center justify-center">
              {galleryPhoto?.dataUrl ? (
                <img
                  key={galleryPhoto.filename}
                  src={galleryPhoto.dataUrl}
                  alt={galleryPhoto.filename}
                  className="max-w-full max-h-full object-contain select-none"
                  style={{ WebkitUserDrag: 'none', animation: 'fadeIn 0.15s ease-in' } as React.CSSProperties}
                  onDoubleClick={() => galleryPhoto && toggleSelection(galleryPhoto.filename)}
                />
              ) : galleryPhoto ? (
                <div
                  className="flex flex-col items-center gap-2 text-gray-600 cursor-pointer"
                  onClick={() => loadDataUrl(galleryIndex)}
                >
                  <Loader2 size={20} className="animate-spin" />
                  <span className="text-xs">Loading…</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4 text-gray-700 select-none">
                  <Camera size={56} strokeWidth={1} />
                  <p className="text-sm">No photos yet</p>
                </div>
              )}

              {/* Star button */}
              {galleryPhoto && (
                <button
                  onClick={() => toggleSelection(galleryPhoto.filename)}
                  className="absolute top-3 right-3 text-3xl transition-transform hover:scale-110 leading-none"
                  style={{ textShadow: '0 1px 6px rgba(0,0,0,0.9)' }}
                  title={localSelection[galleryPhoto.filename] ? 'Deselect' : 'Select as candidate'}
                >
                  {localSelection[galleryPhoto.filename]
                    ? <Star size={28} fill="#F59E0B" className="text-yellow-400" />
                    : <Star size={28} className="text-white opacity-70" />
                  }
                </button>
              )}
              {/* Delete button — gallery mode */}
              {galleryPhoto && (
                <button
                  onClick={() => setDeleteConfirm(galleryPhoto.filename)}
                  title="Delete this photo"
                  className="absolute top-3 left-3 bg-red-700/70 hover:bg-red-600 rounded-lg p-1.5 transition-colors"
                >
                  <Trash2 size={16} className="text-white" />
                </button>
              )}
            </div>

            {/* Right arrow */}
            {galleryIndex < photos.length - 1 && (
              <button
                onClick={() => setGalleryIndex(i => i + 1)}
                className="absolute right-0 z-10 h-full w-16 flex items-center justify-center bg-black/20 hover:bg-black/50 text-white text-5xl transition-colors select-none"
              >
                ›
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Filmstrip (shared between both modes) ─────────────────────────────── */}
      <div
        ref={filmstripRef}
        className="h-24 flex items-center gap-2 px-3 overflow-x-auto shrink-0 bg-gray-900 border-t border-gray-800"
        style={{ scrollbarWidth: 'thin', scrollbarColor: '#374151 transparent' }}
      >
        {photos.length === 0 ? (
          <p className="text-xs text-gray-600 w-full text-center select-none italic">
            Photos will appear here
          </p>
        ) : (
          photos.map((photo, idx) => {
            const isActive = mode === 'capture' ? idx === previewIndex : idx === galleryIndex
            const isSelected = localSelection[photo.filename] ?? false
            return (
              <div
                key={photo.filename}
                className={`relative group shrink-0 w-[120px] h-[80px] rounded overflow-hidden border-2 transition-colors cursor-pointer ${
                  isActive
                    ? mode === 'gallery' ? 'border-white' : 'border-green-500'
                    : 'border-transparent hover:border-gray-600'
                }`}
                onClick={() => {
                  if (mode === 'capture') setPreviewIndex(idx)
                  else setGalleryIndex(idx)
                }}
                title={photo.filename}
              >
                {photo.dataUrl ? (
                  <img src={photo.dataUrl} alt={photo.filename} className="w-full h-full object-cover" />
                ) : (
                  <div
                    className="w-full h-full bg-gray-800 flex items-center justify-center"
                    onClick={e => { e.stopPropagation(); loadDataUrl(idx) }}
                  >
                    <Camera size={16} className="text-gray-600" />
                  </div>
                )}
                {/* Selection star on filmstrip thumbnail */}
                {isSelected && (
                  <div className="absolute top-1 right-1 pointer-events-none">
                    <Star size={12} fill="#F59E0B" className="text-yellow-400 drop-shadow" />
                  </div>
                )}
                {/* Delete button — appears on hover */}
                <button
                  onClick={e => { e.stopPropagation(); setDeleteConfirm(photo.filename) }}
                  title="Delete photo"
                  className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity bg-red-700/80 hover:bg-red-600 rounded p-0.5"
                >
                  <Trash2 size={11} className="text-white" />
                </button>
              </div>
            )
          })
        )}
      </div>

      {/* ── Footer ────────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800 bg-gray-950 shrink-0">
        {mode === 'capture' ? (
          <>
            <span className="text-xs text-gray-500">
              {photoCount === 0
                ? 'No photos in this session'
                : `${photoCount} photo${photoCount === 1 ? '' : 's'} in this session`
              }
            </span>
            <button
              onClick={() => {
                setGalleryIndex(Math.max(0, photos.length - 1))
                setMode('gallery')
              }}
              disabled={photoCount === 0}
              className="flex items-center gap-2 bg-green-700 hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              NEXT →
            </button>
          </>
        ) : (
          <>
            <span className="text-xs text-gray-400">
              {selectedCount === 0
                ? 'No candidates selected'
                : `${selectedCount} candidate${selectedCount !== 1 ? 's' : ''} selected`
              }
            </span>
            <button
              onClick={() => setShowFinishModal(true)}
              className="flex items-center gap-2 bg-green-700 hover:bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <CheckCircle size={15} />
              End Session
            </button>
          </>
        )}
      </div>

      {/* ── Delete photo confirmation modal ───────────────────────────────────── */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-[320px] shadow-2xl">
            <div className="flex items-center gap-2 mb-2">
              <Trash2 size={16} className="text-red-400" />
              <h3 className="text-white font-semibold text-base">Delete photo?</h3>
            </div>
            <p className="text-sm text-gray-400 mb-1 truncate" title={deleteConfirm}>
              {deleteConfirm}
            </p>
            <p className="text-xs text-gray-500 mb-5">
              This will remove the photo from disk and from this session. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={deleteLoading}
                className="flex-1 px-4 py-2 rounded-lg text-sm border border-gray-600 text-gray-300 hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeletePhoto(deleteConfirm)}
                disabled={deleteLoading}
                className="flex-1 px-4 py-2 rounded-lg text-sm bg-red-700 hover:bg-red-600 text-white font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deleteLoading
                  ? <Loader2 size={14} className="animate-spin" />
                  : <Trash2 size={14} />
                }
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Finish session modal ───────────────────────────────────────────────── */}
      {showFinishModal && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-[340px] shadow-2xl">
            <h3 className="text-white font-semibold mb-2 text-base">End session?</h3>
            {selectedCount === 0 ? (
              <p className="text-sm text-gray-400 mb-5">
                No candidate has been selected. End the session anyway?
              </p>
            ) : (
              <p className="text-sm text-gray-400 mb-5">
                <span className="text-white font-medium">{selectedCount}</span> photo
                {selectedCount !== 1 ? 's' : ''} marked as candidate{selectedCount !== 1 ? 's' : ''}.
                Confirm?
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setShowFinishModal(false)}
                disabled={finishLoading}
                className="flex-1 px-4 py-2 rounded-lg text-sm border border-gray-600 text-gray-300 hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleFinishSession}
                disabled={finishLoading}
                className="flex-1 px-4 py-2 rounded-lg text-sm bg-green-700 hover:bg-green-600 text-white font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {finishLoading
                  ? <Loader2 size={14} className="animate-spin" />
                  : <CheckCircle size={14} />
                }
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  )
}
