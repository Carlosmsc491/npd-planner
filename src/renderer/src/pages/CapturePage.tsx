// src/renderer/src/pages/CapturePage.tsx
// Photo capture page — tethering session for a single recipe file (PC-5)

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { doc, getDoc, Timestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { ChevronLeft, Camera, Loader2, AlertTriangle, CheckCircle } from 'lucide-react'
import type { RecipeFile, RecipeProject, CapturedPhoto, GlobalSettings } from '../types'
import { useAuthStore } from '../store/authStore'
import {
  addCapturedPhoto,
  updateRecipePhotoStatus,
  getGlobalSettings,
} from '../lib/firestore'

// ── Local state shape for photos in this session ─────────────────────────────
interface LocalPhoto {
  sequence: number
  filename: string
  picturePath: string
  cameraPath: string
  ssdPath: string | null
  dataUrl: string | null  // null = not yet loaded
}

export default function CapturePage() {
  const { recipeId } = useParams<{ recipeId: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()

  // ── Recipe / project state ─────────────────────────────────────────────────
  const [recipe, setRecipe]   = useState<RecipeFile | null>(null)
  const [project, setProject] = useState<RecipeProject | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // ── Camera state ───────────────────────────────────────────────────────────
  const [cameraConnected, setCameraConnected] = useState(false)
  const [cameraModel, setCameraModel]         = useState<string | null>(null)
  const [cameraChecking, setCameraChecking]   = useState(false)
  const [gphoto2Missing, setGphoto2Missing]   = useState(false)
  const [tetheringActive, setTetheringActive] = useState(false)

  // ── Photo session state ────────────────────────────────────────────────────
  const [photos, setPhotos]           = useState<LocalPhoto[]>([])
  const [previewIndex, setPreviewIndex] = useState(-1)
  const [processingPhoto, setProcessingPhoto] = useState(false)

  // ── DONE modal ─────────────────────────────────────────────────────────────
  const [showDoneModal, setShowDoneModal] = useState(false)
  const [doneLoading, setDoneLoading]     = useState(false)

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

  // Keep refs in sync with state
  useEffect(() => { photosRef.current     = photos },        [photos])
  useEffect(() => { recipeRef.current     = recipe },        [recipe])
  useEffect(() => { projectRef.current    = project },       [project])
  useEffect(() => { settingsRef.current   = globalSettings }, [globalSettings])
  useEffect(() => { tetheringRef.current  = tetheringActive }, [tetheringActive])

  // ── Load recipe + project + global settings ────────────────────────────────
  useEffect(() => {
    if (!recipeId) { setNotFound(true); setLoading(false); return }

    async function load() {
      try {
        const [projectId] = recipeId!.split('::')
        if (!projectId) { setNotFound(true); return }

        const [recipeSnap, projectSnap, settings, udPath] = await Promise.all([
          getDoc(doc(db, 'recipeProjects', projectId, 'files', recipeId!)),
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

        // Pre-populate from previously captured photos in Firestore
        if (loadedRecipe.capturedPhotos?.length) {
          const existing: LocalPhoto[] = loadedRecipe.capturedPhotos.map(cp => ({
            sequence:    cp.sequence,
            filename:    cp.filename,
            picturePath: cp.picturePath,
            cameraPath:  cp.cameraPath,
            ssdPath:     cp.ssdPath,
            dataUrl:     null,
          }))
          setPhotos(existing)
          photosRef.current = existing
          setPreviewIndex(existing.length - 1)
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

  // ── Lazy data URL loader for preview / filmstrip ───────────────────────────
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

  // Load data URL whenever preview changes to an unloaded photo
  useEffect(() => {
    if (previewIndex >= 0) loadDataUrl(previewIndex)
  }, [previewIndex, loadDataUrl])

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
    const result = await window.electronAPI.startCameraTethering(tempDir)
    if (result.success) {
      setTetheringActive(true)
    } else if (result.error?.toLowerCase().includes('gphoto2')) {
      setGphoto2Missing(true)
    }
  }, [])

  // On mount (once recipe + userDataPath are ready): check camera, start tethering
  useEffect(() => {
    if (loading || !userDataPath) return

    let cancelled = false

    async function init() {
      const connected = await checkCamera()
      if (!cancelled && connected) await startTethering(userDataPath!)
    }

    init()

    return () => {
      cancelled = true
      window.electronAPI.stopCameraTethering()
    }
  // Run only once after initial load
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, userDataPath])

  // Listen for camera connect/disconnect events during the session
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
      // Debounce: skip if already processing a photo
      if (processingRef.current) return
      const currentRecipe  = recipeRef.current
      const currentProject = projectRef.current
      if (!currentRecipe || !currentProject || !recipeId) return

      processingRef.current = true
      setProcessingPhoto(true)

      try {
        const subfolderName = currentRecipe.relativePath.split('/')[0] ?? 'Unknown'
        const baseName      = currentRecipe.recipeName || currentRecipe.displayName
        const nextSeq       = photosRef.current.length + 1
        const filename      = `${baseName} - ${nextSeq}.jpg`

        const projectRoot = currentProject.rootPath
        const cameraPath  = `${projectRoot}/CAMERA/${subfolderName}/${filename}`
        const picturePath = `${projectRoot}/Pictures/${subfolderName}/${filename}`
        const ssdBase     = settingsRef.current?.ssdPhotoPath ?? null
        const ssdPath     = ssdBase
          ? `${ssdBase}/${currentProject.name}/${subfolderName}/${filename}`
          : null

        // Copy to permanent locations (createDirs = true)
        const [camResult, picResult] = await Promise.all([
          window.electronAPI.copyFile(data.tempPath, cameraPath, true),
          window.electronAPI.copyFile(data.tempPath, picturePath, true),
        ])

        if (!camResult.success)
          console.error('[Capture] CAMERA copy failed:', camResult.error)
        if (!picResult.success)
          console.error('[Capture] Pictures copy failed:', picResult.error)

        // SSD copy is best-effort — do not block on it
        if (ssdPath) {
          window.electronAPI.copyFile(data.tempPath, ssdPath, true)
            .catch(err => console.warn('[Capture] SSD copy failed:', err))
        }

        // Save metadata to Firestore
        const capturedPhoto: CapturedPhoto = {
          sequence:      nextSeq,
          filename,
          subfolderName,
          picturePath,
          cameraPath,
          ssdPath,
          capturedAt: Timestamp.now(),
          capturedBy: user?.uid ?? '',
        }
        await addCapturedPhoto(recipeId, capturedPhoto)

        // Load data URL for immediate display
        let dataUrl: string | null = null
        try {
          dataUrl = await window.electronAPI.readFileAsDataUrl(picturePath)
        } catch { /* skip if read fails */ }

        const newPhoto: LocalPhoto = {
          sequence: nextSeq,
          filename,
          picturePath,
          cameraPath,
          ssdPath,
          dataUrl,
        }

        // The new photo's index will be the current length (before push)
        const newIndex = photosRef.current.length
        setPhotos(prev => {
          const updated = [...prev, newPhoto]
          photosRef.current = updated
          return updated
        })
        setPreviewIndex(newIndex)

        // Auto-scroll filmstrip to end
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
  // Only recipeId and user?.uid are stable identifiers needed here;
  // everything else is accessed via refs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeId, user?.uid])

  // ── DONE: confirm and close session ────────────────────────────────────────
  async function handleDoneConfirm() {
    if (!recipeId) return
    setDoneLoading(true)
    try {
      await window.electronAPI.stopCameraTethering()
      await updateRecipePhotoStatus(recipeId, 'complete')
      navigate(-1)
    } catch (err) {
      console.error('[Capture] DONE error:', err)
      setDoneLoading(false)
      setShowDoneModal(false)
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

  const subfolderName  = recipe.relativePath.split('/')[0] ?? ''
  const previewPhoto   = previewIndex >= 0 ? photos[previewIndex] : null
  const photoCount     = photos.length

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white overflow-hidden">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <ChevronLeft size={16} /> Back
        </button>
        <span className="text-gray-700">|</span>
        <span className="text-sm text-gray-300 flex-1 min-w-0 truncate">
          {subfolderName && (
            <span className="text-gray-500">{subfolderName} › </span>
          )}
          <span className="font-medium text-white">{recipe.displayName}</span>
        </span>

        {/* Camera status pill */}
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
            {cameraChecking
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
      </div>

      {/* ── gPhoto2 missing banner ───────────────────────────────────────────── */}
      {gphoto2Missing && (
        <div className="bg-red-950/60 border-b border-red-800/60 px-4 py-2.5 flex items-center gap-2 shrink-0">
          <AlertTriangle size={14} className="text-red-400 shrink-0" />
          <span className="text-sm text-red-300 flex-1">
            gPhoto2 no está instalado.
          </span>
          <code className="text-red-200 bg-red-900/40 px-2 py-0.5 rounded text-xs shrink-0">
            brew install gphoto2
          </code>
        </div>
      )}

      {/* ── No camera banner ─────────────────────────────────────────────────── */}
      {!cameraConnected && !gphoto2Missing && (
        <div className="bg-orange-950/50 border-b border-orange-800/40 px-4 py-2.5 flex items-center gap-3 shrink-0">
          <AlertTriangle size={14} className="text-orange-400 shrink-0" />
          <span className="text-sm text-orange-300 flex-1">
            Conecta la cámara Canon por USB y enciéndela
          </span>
          <button
            onClick={async () => {
              const connected = await checkCamera()
              if (connected && userDataPath) await startTethering(userDataPath)
            }}
            disabled={cameraChecking}
            className="shrink-0 text-xs bg-orange-700 hover:bg-orange-600 disabled:opacity-50 text-white px-3 py-1.5 rounded transition-colors"
          >
            {cameraChecking ? 'Checking…' : 'Reintentar'}
          </button>
        </div>
      )}

      {/* ── Main preview area ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center bg-black overflow-hidden min-h-0">
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
            <p className="text-sm">Dispara la cámara para tomar la primera foto</p>
          </div>
        )}

        {/* Processing overlay */}
        {processingPhoto && (
          <div className="absolute bottom-4 right-4 flex items-center gap-2 bg-gray-900/80 px-3 py-1.5 rounded-full text-xs text-green-400">
            <Loader2 size={11} className="animate-spin" />
            Guardando foto…
          </div>
        )}
      </div>

      {/* ── Filmstrip ─────────────────────────────────────────────────────────── */}
      <div
        ref={filmstripRef}
        className="h-24 flex items-center gap-2 px-3 overflow-x-auto shrink-0 bg-gray-900 border-t border-gray-800"
        style={{ scrollbarWidth: 'thin', scrollbarColor: '#374151 transparent' }}
      >
        {photos.length === 0 ? (
          <p className="text-xs text-gray-600 w-full text-center select-none italic">
            Las fotos aparecerán aquí
          </p>
        ) : (
          photos.map((photo, idx) => (
            <button
              key={photo.filename}
              onClick={() => setPreviewIndex(idx)}
              title={photo.filename}
              className={`shrink-0 w-[120px] h-[80px] rounded overflow-hidden border-2 transition-colors ${
                idx === previewIndex
                  ? 'border-green-500'
                  : 'border-transparent hover:border-gray-600'
              }`}
            >
              {photo.dataUrl ? (
                <img
                  src={photo.dataUrl}
                  alt={photo.filename}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div
                  className="w-full h-full bg-gray-800 flex items-center justify-center cursor-pointer"
                  onClick={() => loadDataUrl(idx)}
                >
                  <Camera size={16} className="text-gray-600" />
                </div>
              )}
            </button>
          ))
        )}
      </div>

      {/* ── Footer ────────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800 bg-gray-950 shrink-0">
        <span className="text-xs text-gray-500">
          {photoCount === 0
            ? 'Sin fotos en esta sesión'
            : `${photoCount} foto${photoCount === 1 ? '' : 's'} en esta sesión`
          }
        </span>
        <button
          onClick={() => setShowDoneModal(true)}
          className="flex items-center gap-2 bg-green-700 hover:bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <CheckCircle size={15} />
          Terminar sesión
        </button>
      </div>

      {/* ── DONE confirmation modal ───────────────────────────────────────────── */}
      {showDoneModal && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-[320px] shadow-2xl">
            <h3 className="text-white font-semibold mb-2 text-base">¿Terminar sesión?</h3>
            <p className="text-sm text-gray-400 mb-1">
              ¿Marcar{' '}
              <span className="text-white font-medium">{recipe.displayName}</span>{' '}
              como fotografiada?
            </p>
            <p className="text-xs text-gray-500 mb-5">
              {photoCount} foto{photoCount !== 1 ? 's' : ''} tomada{photoCount !== 1 ? 's' : ''} en esta sesión.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDoneModal(false)}
                disabled={doneLoading}
                className="flex-1 px-4 py-2 rounded-lg text-sm border border-gray-600 text-gray-300 hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDoneConfirm}
                disabled={doneLoading}
                className="flex-1 px-4 py-2 rounded-lg text-sm bg-green-700 hover:bg-green-600 text-white font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {doneLoading
                  ? <Loader2 size={14} className="animate-spin" />
                  : <CheckCircle size={14} />
                }
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inline fade-in keyframe (Tailwind doesn't ship this by default) */}
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  )
}
