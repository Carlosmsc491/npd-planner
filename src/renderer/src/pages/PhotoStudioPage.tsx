// src/renderer/src/pages/PhotoStudioPage.tsx
// Standalone Photo Studio — session-based catalog, multi-view, bg-removal integration
// Mac-only. No recipe dependency.

import { useState, useEffect, useCallback, useRef, memo } from 'react'
import AppLayout from '../components/ui/AppLayout'
import CutoutCompareModal from '../components/ui/CutoutCompareModal'
import type { StudioSession, StudioPhoto } from '../../../shared/photoStudio'
import {
  Camera, FolderOpen, Grid3X3, List, Image, Plus, Trash2, RefreshCw,
  CheckCircle2, Loader2, AlertTriangle, ChevronLeft, Scissors, Download,
  FolderInput, MoreVertical, Pencil, X, ArrowLeft, ArrowRight, WifiOff, Wifi, Star, ExternalLink, Wand2,
  PanelLeftClose, PanelLeftOpen,
} from 'lucide-react'

// ─── localStorage ────────────────────────────────────────────────────────────
const LS_CATALOG = 'npd:photostudio_catalog'
const LS_VIEW    = 'npd:photostudio_view'
const LS_TOOL    = 'npd:bgremoval_tool_path'

function getCatalog(): string | null { return localStorage.getItem(LS_CATALOG) }
function setCatalog(p: string): void { localStorage.setItem(LS_CATALOG, p) }

type ViewMode = 'icons' | 'gallery' | 'list' | 'capture'
type StageFilter = StudioPhoto['state'] | 'all'

// Furthest stage a photo occupies → its single `state` label.
function deriveState(stages: StudioPhoto['stages']): StudioPhoto['state'] {
  return stages.ready ? 'ready' : stages.cleaned ? 'cleaned' : stages.selected ? 'selected' : 'captured'
}

// Apply a stage patch and keep `state` consistent (used for optimistic updates).
function withStages(p: StudioPhoto, patch: Partial<StudioPhoto['stages']>, extra?: Partial<StudioPhoto>): StudioPhoto {
  const stages = { ...p.stages, ...patch }
  return { ...p, ...extra, stages, state: deriveState(stages) }
}

// Cumulative stage booleans implied by a single `state` (legacy 'flat' sessions).
function stagesForState(state: StudioPhoto['state']): StudioPhoto['stages'] {
  const rank = { captured: 0, selected: 1, cleaned: 2, ready: 3 }[state]
  return { selected: rank >= 1, cleaned: rank >= 2, ready: rank >= 3 }
}

// Which artifact to render for a given tab/stage (so a photo shows its capture
// frame under Captured, its cut-out under Cleaned, its export under Ready, etc.).
function artifactFor(p: StudioPhoto, stage: StageFilter): string {
  switch (stage) {
    case 'captured': return p.capturePath ?? p.absPath
    case 'selected': return p.selectedPath ?? p.capturePath ?? p.absPath
    case 'cleaned':  return p.cleanedPath ?? p.absPath
    case 'ready':    return p.jpgPath ?? p.readyPngPath ?? p.cleanedPath ?? p.absPath
    case 'all':
    default:
      return p.stages.ready ? (p.jpgPath ?? p.readyPngPath ?? p.absPath)
        : p.stages.cleaned ? (p.cleanedPath ?? p.absPath)
        : (p.capturePath ?? p.absPath)
  }
}

// Does a photo belong in a given cumulative tab?
function inStage(p: StudioPhoto, stage: StageFilter): boolean {
  switch (stage) {
    case 'all':
    case 'captured': return true            // everything was captured
    case 'selected': return p.stages.selected
    case 'cleaned':  return p.stages.cleaned
    case 'ready':    return p.stages.ready
    default: return true
  }
}

// Is the rendered artifact a transparent cut-out (→ wants the gray backdrop)?
function isCutoutStage(p: StudioPhoto, stage: StageFilter): boolean {
  if (stage === 'cleaned' || stage === 'ready') return true
  if (stage === 'all') return p.stages.cleaned || p.stages.ready
  return false
}

// ─── Thumbnail component ──────────────────────────────────────────────────────
const PhotoThumb = memo(function PhotoThumb({
  photo, selected, displayStage = 'all', onClick, onSelect, onStar, bust,
}: {
  photo: StudioPhoto
  selected: boolean
  displayStage?: StageFilter
  onClick: () => void
  onSelect: (shift: boolean) => void
  onStar?: () => void
  bust?: number
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const src = artifactFor(photo, displayStage)
  const cutout = isCutoutStage(photo, displayStage)

  useEffect(() => {
    let cancelled = false
    window.electronAPI.bgRemovalThumb(src, 220).then(url => {
      if (!cancelled) setDataUrl(url)
    })
    return () => { cancelled = true }
  }, [src, bust])

  const stateColor: Record<StudioPhoto['state'], string> = {
    captured: 'bg-gray-500',
    selected: 'bg-blue-500',
    cleaned:  'bg-purple-500',
    ready:    'bg-green-500',
  }

  return (
    <div
      className={`relative group cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
        selected ? 'border-blue-500 ring-2 ring-blue-300' : 'border-transparent hover:border-gray-300 dark:hover:border-gray-600'
      }`}
      onClick={onClick}
    >
      <div className="aspect-square flex items-center justify-center bg-gradient-to-b from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-800">
        {dataUrl ? (
          <img src={dataUrl} alt={photo.filename} className={`w-full h-full ${cutout ? 'object-contain' : 'object-cover'}`} />
        ) : (
          <Loader2 size={20} className="text-gray-400 animate-spin" />
        )}
      </div>
      {/* State badge */}
      <div className={`absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full ${stateColor[photo.state]} ring-1 ring-white`} title={photo.state} />
      {/* Select checkbox */}
      <div
        className={`absolute top-1.5 left-1.5 w-5 h-5 rounded border-2 flex items-center justify-center transition-opacity cursor-pointer
          ${selected ? 'opacity-100 bg-blue-500 border-blue-500' : 'opacity-0 group-hover:opacity-100 bg-white/80 border-gray-400'}`}
        onClick={e => { e.stopPropagation(); onSelect(e.shiftKey) }}
      >
        {selected && <CheckCircle2 size={12} className="text-white" />}
      </div>
      {/* Filename */}
      <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[10px] px-1.5 py-0.5 truncate opacity-0 group-hover:opacity-100 transition-opacity">
        {photo.filename}
      </div>
      {/* Star toggle */}
      {onStar && (
        <button
          className={`absolute bottom-1.5 right-1.5 p-0.5 rounded transition-opacity ${photo.stages.selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
          onClick={e => { e.stopPropagation(); onStar() }}
        >
          <Star size={12} fill={photo.stages.selected ? 'currentColor' : 'none'} className={photo.stages.selected ? 'text-yellow-400' : 'text-white'} />
        </button>
      )}
    </div>
  )
})

// ─── List row ────────────────────────────────────────────────────────────────
function PhotoListRow({ photo, selected, onClick, onSelect, onStar }: {
  photo: StudioPhoto; selected: boolean; onClick: () => void; onSelect: (shift: boolean) => void; onStar?: () => void
}) {
  const stateLabel: Record<StudioPhoto['state'], string> = {
    captured: 'Captured', selected: 'Selected', cleaned: 'Cleaned', ready: 'Ready',
  }
  const stateColor: Record<StudioPhoto['state'], string> = {
    captured: 'text-gray-500', selected: 'text-blue-600', cleaned: 'text-purple-600', ready: 'text-green-600',
  }
  return (
    <div
      className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
        selected ? 'bg-blue-50 dark:bg-blue-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-800'
      }`}
      onClick={onClick}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={e => onSelect(e.nativeEvent instanceof MouseEvent && e.nativeEvent.shiftKey)}
        onClick={e => e.stopPropagation()}
        className="rounded border-gray-300"
      />
      <Image size={14} className="text-gray-400 shrink-0" />
      <span className="flex-1 text-sm truncate">{photo.filename}</span>
      <span className={`text-xs font-medium ${stateColor[photo.state]}`}>{stateLabel[photo.state]}</span>
      <span className="text-xs text-gray-400">{(photo.size / 1024).toFixed(0)} KB</span>
      {onStar && (
        <button onClick={e => { e.stopPropagation(); onStar() }} className="p-0.5">
          <Star size={13} fill={photo.stages.selected ? 'currentColor' : 'none'} className={photo.stages.selected ? 'text-yellow-400' : 'text-gray-300 hover:text-yellow-400'} />
        </button>
      )}
    </div>
  )
}

// ─── Lightbox ────────────────────────────────────────────────────────────────
function Lightbox({ photos, index, displayStage = 'all', onClose, onNav, onApprove, onPhotoshop, onSaveReturn, onSelectSubject, busy, bust }: {
  photos: StudioPhoto[]; index: number; displayStage?: StageFilter; onClose: () => void; onNav: (dir: -1 | 1) => void
  onApprove?: (p: StudioPhoto) => void
  onPhotoshop?: (p: StudioPhoto) => void
  onSaveReturn?: (p: StudioPhoto) => void
  onSelectSubject?: (p: StudioPhoto) => void
  busy?: boolean
  bust?: number
}) {
  const photo = photos[index]
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const cutout = isCutoutStage(photo, displayStage)

  useEffect(() => {
    setDataUrl(null)
    const src = artifactFor(photo, displayStage)
    window.electronAPI.bgRemovalReadFull(src).then(url => setDataUrl(url))
  }, [photo, displayStage, bust])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft')  onNav(-1)
      if (e.key === 'ArrowRight') onNav(1)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, onNav])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90" onClick={onClose}>
      {/* Nav arrows */}
      {index > 0 && (
        <button
          className="absolute left-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
          onClick={e => { e.stopPropagation(); onNav(-1) }}
        >
          <ArrowLeft size={24} />
        </button>
      )}
      {index < photos.length - 1 && (
        <button
          className="absolute right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
          onClick={e => { e.stopPropagation(); onNav(1) }}
        >
          <ArrowRight size={24} />
        </button>
      )}
      {/* Close */}
      <button className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white" onClick={onClose}>
        <X size={20} />
      </button>
      {/* Image */}
      <div className="max-w-5xl max-h-[90vh] flex flex-col items-center gap-2" onClick={e => e.stopPropagation()}>
        {dataUrl ? (
          cutout ? (
            // Apple-style soft gray backdrop behind the transparent cut-out
            // (no backdrop-filter blur — that crashes the Electron 25 renderer).
            <div className="relative rounded-lg overflow-hidden" style={{ background: 'linear-gradient(160deg, #3a3a3c 0%, #2a2a2c 60%, #232325 100%)' }}>
              <img src={dataUrl} alt={photo.filename} className="max-w-full max-h-[80vh] object-contain" />
            </div>
          ) : (
            <img src={dataUrl} alt={photo.filename} className="max-w-full max-h-[80vh] object-contain rounded" />
          )
        ) : (
          <div className="w-64 h-64 flex items-center justify-center">
            <Loader2 size={32} className="text-white animate-spin" />
          </div>
        )}
        <div className="text-white/70 text-sm">{photo.filename} · {index + 1} / {photos.length}</div>

        {/* Cleaned / ready action bar */}
        {(photo.stages.cleaned || photo.stages.ready) && (onApprove || onPhotoshop || onSaveReturn) && (
          <div className="flex items-center gap-2 mt-1">
            {onPhotoshop && (
              <button
                onClick={() => onPhotoshop(photo)}
                disabled={busy}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-50"
              >
                <ExternalLink size={12} /> Open in Photoshop
              </button>
            )}
            {photo.stages.cleaned && !photo.stages.ready && onSelectSubject && (
              <button
                onClick={() => onSelectSubject(photo)}
                disabled={busy}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-purple-600/80 text-white hover:bg-purple-500 disabled:opacity-50"
                title="Re-cut with Photoshop Select Subject, then compare"
              >
                {busy ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />} Select Subject
              </button>
            )}
            {photo.stages.cleaned && !photo.stages.ready && onApprove && (
              <button
                onClick={() => onApprove(photo)}
                disabled={busy}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-green-600 text-white hover:bg-green-500 disabled:opacity-50"
              >
                {busy ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} Approve → Ready
              </button>
            )}
            {photo.stages.ready && onSaveReturn && (
              <button
                onClick={() => onSaveReturn(photo)}
                disabled={busy}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Save from Photoshop &amp; update JPG
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Filmstrip thumbnail (capture mode) ──────────────────────────────────────
const FilmstripThumb = memo(function FilmstripThumb({
  photo, active, bgActive, onClick,
}: {
  photo: StudioPhoto; active: boolean; bgActive: boolean; onClick: () => void
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    window.electronAPI.bgRemovalThumb(photo.absPath, 120).then(url => {
      if (!cancelled) setDataUrl(url)
    })
    return () => { cancelled = true }
  }, [photo.absPath])
  return (
    <button
      onClick={onClick}
      className={`relative shrink-0 w-[72px] h-[72px] rounded overflow-hidden border-2 transition-all ${
        active ? 'border-white opacity-100' : 'border-transparent opacity-40 hover:opacity-70'
      }`}
    >
      {dataUrl
        ? <img src={dataUrl} alt={photo.filename} className="w-full h-full object-cover" />
        : <div className="w-full h-full bg-gray-700 flex items-center justify-center">
            <Loader2 size={12} className="text-gray-500 animate-spin will-change-transform" />
          </div>
      }
      {bgActive && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <Loader2 size={14} className="text-amber-400 animate-spin will-change-transform" />
        </div>
      )}
      {photo.stages.selected && (
        <div className="absolute top-0.5 right-0.5">
          <Star size={10} fill="currentColor" className="text-yellow-400" />
        </div>
      )}
    </button>
  )
})

// ─── Session Card ─────────────────────────────────────────────────────────────
function SessionCard({ session, catalogDir, onOpen, onDelete, onRename }: {
  session: StudioSession
  catalogDir: string
  onOpen: () => void
  onDelete: () => void
  onRename: (name: string) => void
}) {
  const [thumb, setThumb] = useState<string | null>(null)
  const [menu, setMenu] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(session.name)

  useEffect(() => {
    if (!session.coverThumb) return
    window.electronAPI.bgRemovalThumb(session.coverThumb, 280).then(url => setThumb(url))
  }, [session.coverThumb])

  return (
    <div className="relative group bg-white dark:bg-gray-800 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => !menu && !editing && onOpen()}
    >
      <div className="aspect-video bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
        {thumb ? (
          <img src={thumb} alt={session.name} className="w-full h-full object-cover" />
        ) : (
          <Camera size={32} className="text-gray-300" />
        )}
      </div>
      <div className="p-3">
        {editing ? (
          <form onSubmit={e => { e.preventDefault(); onRename(draftName); setEditing(false) }}
            onClick={e => e.stopPropagation()}>
            <input
              autoFocus
              value={draftName}
              onChange={e => setDraftName(e.target.value)}
              className="w-full text-sm border rounded px-2 py-1 dark:bg-gray-700 dark:border-gray-600"
              onBlur={() => { onRename(draftName); setEditing(false) }}
            />
          </form>
        ) : (
          <div className="font-medium text-sm truncate">{session.name}</div>
        )}
        <div className="text-xs text-gray-400 mt-0.5">
          {session.photoCount} photo{session.photoCount !== 1 ? 's' : ''} · {new Date(session.createdAt).toLocaleDateString()}
        </div>
      </div>
      {/* 3-dot menu */}
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
        <button
          className="p-1 rounded bg-black/40 text-white hover:bg-black/60"
          onClick={() => setMenu(v => !v)}
        >
          <MoreVertical size={14} />
        </button>
        {menu && (
          <div className="absolute right-0 top-6 w-36 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-10">
            <button
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
              onClick={() => { setMenu(false); setEditing(true) }}
            >
              <Pencil size={12} /> Rename
            </button>
            <button
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
              onClick={() => { setMenu(false); window.electronAPI.photoStudioOpenInFinder(catalogDir + '/' + session.id) }}
            >
              <FolderOpen size={12} /> Show in Finder
            </button>
            <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
            <button
              className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
              onClick={() => { setMenu(false); onDelete() }}
            >
              <Trash2 size={12} /> Delete
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Session view (photos inside a session) ──────────────────────────────────
function SessionView({
  session,
  catalogDir,
  onBack,
}: {
  session: StudioSession
  catalogDir: string
  onBack: () => void
}) {
  const sessionDir = catalogDir + '/' + session.id
  const layout = session.layout ?? 'flat'
  // bg-removal output path for a photo id (real cleaned/ folder vs legacy _cleaned/)
  const cleanedOut = (id: string) => layout === 'stages'
    ? `${sessionDir}/cleaned/${id}.png`
    : `${sessionDir}/_cleaned/${id}.png`
  const [photos, setPhotos] = useState<StudioPhoto[]>([])
  const loading = useRef(true)
  const [loadingState, setLoadingState] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [view, setView] = useState<ViewMode>((localStorage.getItem(LS_VIEW) as ViewMode) ?? 'icons')
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)
  const [processing, setProcessing] = useState<Set<string>>(new Set())
  const [filterState, setFilterState] = useState<StudioPhoto['state'] | 'all'>('all')
  const [captureSidebarOpen, setCaptureSidebarOpen] = useState(true)  // floating panel in capture mode
  const lastSelectedRef = useRef<number | null>(null)

  // ── Background-removal engine ───────────────────────────────────────────────
  // Resolve the local engine path the same way BackgroundRemovalPage does — via
  // bgRemovalInstallState() (installed runtime or dev fallback). The old code read
  // an `npd:bgremoval_tool_path` localStorage key that nothing ever wrote, so the
  // engine never ran. Kept as an optional manual override.
  const engineToolDirRef = useRef<string | null>(null)
  const [engineReady, setEngineReady] = useState(false)
  useEffect(() => {
    window.electronAPI.bgRemovalInstallState().then(s => {
      const dir = s.installed ? s.toolDir : (localStorage.getItem(LS_TOOL) || null)
      engineToolDirRef.current = dir
      setEngineReady(!!dir)
    }).catch(() => {
      const dir = localStorage.getItem(LS_TOOL) || null
      engineToolDirRef.current = dir
      setEngineReady(!!dir)
    })
  }, [])

  // ── Capture mode state ──────────────────────────────────────────────────────
  const [bgStatus, setBgStatus] = useState<Map<string, 'queued' | 'loading-model' | 'processing' | 'done' | 'error'>>(new Map())
  const [previewIdx, setPreviewIdx] = useState<number | null>(null)
  const previewIdxRef = useRef<number | null>(null)
  useEffect(() => { previewIdxRef.current = previewIdx }, [previewIdx])
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null)
  const filmstripRef = useRef<HTMLDivElement>(null)

  // ── Camera tethering ────────────────────────────────────────────────────────
  const [cameraConnected, setCameraConnected] = useState(false)
  const [cameraModel, setCameraModel] = useState<string | null>(null)
  const [tethering, setTethering] = useState(false)
  const [tetheringWarming, setTetheringWarming] = useState(false)
  const [tetheringError, setTetheringError] = useState<string | null>(null)
  const tetheringRef = useRef(false)
  const photoQueueRef = useRef<Array<{ tempPath: string; filename: string }>>([])
  const processingPhotoRef = useRef(false)
  const photosRef = useRef<StudioPhoto[]>([])
  useEffect(() => { photosRef.current = photos }, [photos])

  const loadPhotos = useCallback(async () => {
    loading.current = true
    setLoadingState(true)
    const res = await window.electronAPI.photoStudioListPhotos(sessionDir)
    if (res.ok) { setPhotos(res.photos); photosRef.current = res.photos }
    loading.current = false
    setLoadingState(false)
  }, [sessionDir])

  useEffect(() => { loadPhotos() }, [loadPhotos])

  // Check camera on mount + listen for connect/disconnect
  useEffect(() => {
    window.electronAPI.checkCameraConnection().then(s => {
      setCameraConnected(s.connected)
      setCameraModel(s.model)
    }).catch(() => {})

    const unlisten = window.electronAPI.onCameraStatusChanged(s => {
      setCameraConnected(s.connected)
      setCameraModel(s.model)
      // Camera reconnected while not tethering → auto-restart
      if (s.connected && !tetheringRef.current) {
        startTethering()
      }
    })
    return () => {
      unlisten()
      // Stop tethering when leaving this session (keep gphoto2 alive for next session)
      window.electronAPI.stopFolderWatch()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startTethering = useCallback(async () => {
    if (tetheringRef.current) return
    setTetheringError(null)
    setTetheringWarming(true)
    const udPath = await window.electronAPI.getUserDataPath()
    const tempDir = udPath + '/camera-temp'
    const result = await window.electronAPI.startCameraTethering(tempDir)
    setTetheringWarming(false)
    if (result.success) {
      setTethering(true)
      tetheringRef.current = true
    } else {
      setTetheringError(result.error ?? 'Could not start tethering. Check gphoto2 is installed.')
    }
  }, [])

  const stopTethering = useCallback(async () => {
    await window.electronAPI.stopCameraTethering()
    setTethering(false)
    tetheringRef.current = false
  }, [])

  // Process one photo from the queue — burst-safe
  const processNextPhoto = useCallback(async () => {
    if (processingPhotoRef.current || !photoQueueRef.current.length) return
    processingPhotoRef.current = true
    const data = photoQueueRef.current.shift()!

    try {
      // Sequence = max existing + 1
      const nextSeq = photosRef.current.reduce((mx, p) => {
        const n = parseInt(p.id, 10)
        return isNaN(n) ? mx : Math.max(mx, n)
      }, 0) + 1
      const ext = data.filename.slice(data.filename.lastIndexOf('.')).toLowerCase() || '.jpg'
      const destFilename = `${String(nextSeq).padStart(4, '0')}${ext}`
      // stages sessions keep originals in capture/; flat sessions in the root
      const destPath = layout === 'stages'
        ? `${sessionDir}/capture/${destFilename}`
        : `${sessionDir}/${destFilename}`
      const res = await window.electronAPI.cameraCopyFile(data.tempPath, destPath)
      if (res.success) {
        const id = destFilename.replace(/\.[^.]+$/, '')
        // flat sessions track state in _states.json; stages derive it from disk
        if (layout !== 'stages') {
          await window.electronAPI.photoStudioUpdatePhotoState({ sessionDir, photoId: id, state: 'captured' })
        }
        // Append to local state immediately (no full reload needed)
        const newPhoto: StudioPhoto = {
          id,
          filename: destFilename,
          absPath: destPath,
          ext,
          size: 0,
          mtimeMs: Date.now(),
          state: 'captured',
          cleanedPath: null,
          jpgPath: null,
          capturePath: destPath,
          selectedPath: null,
          readyPngPath: null,
          stages: { selected: false, cleaned: false, ready: false },
        }
        setPhotos(prev => [...prev, newPhoto])
        photosRef.current = [...photosRef.current, newPhoto]
        setView('capture')
        setPreviewIdx(photosRef.current.length - 1)
      }
    } catch (err) {
      console.error('[PhotoStudio] photo copy failed:', err)
    } finally {
      processingPhotoRef.current = false
      if (photoQueueRef.current.length) processNextPhoto()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionDir, layout])

  // Listen for photos from gphoto2
  useEffect(() => {
    const unlisten = window.electronAPI.onCameraPhotoReceived(data => {
      photoQueueRef.current.push(data)
      processNextPhoto()
    })
    return () => unlisten()
  }, [processNextPhoto])

  // Star/unstar a photo — optimistic update, copy into selected/, auto-enqueue clean
  const enqueueClean = useCallback((photo: StudioPhoto) => {
    const toolDir = engineToolDirRef.current
    if (toolDir && window.electronAPI.photoStudioEnqueueBg) {
      window.electronAPI.photoStudioEnqueueBg({ sessionDir, photoId: photo.id, input: photo.absPath, output: cleanedOut(photo.id), toolDir })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionDir, layout])

  const starPhoto = useCallback((photo: StudioPhoto) => {
    const willSelect = !photo.stages.selected
    if (layout === 'stages') {
      // Optimistic: toggle selected (unselect also clears cleaned — see handler)
      setPhotos(prev => prev.map(p => p.id === photo.id
        ? withStages(p, willSelect ? { selected: true } : { selected: false, cleaned: false })
        : p))
      if (willSelect) {
        window.electronAPI.photoStudioStageSelect({ sessionDir, photoId: photo.id })
        enqueueClean(photo)
      } else {
        window.electronAPI.photoStudioStageUnselect({ sessionDir, photoId: photo.id })
      }
      return
    }
    // flat (legacy)
    const newState: StudioPhoto['state'] = photo.state === 'selected' ? 'captured' : 'selected'
    setPhotos(prev => prev.map(p => p.id === photo.id ? withStages({ ...p, state: newState }, { selected: newState === 'selected' }) : p))
    window.electronAPI.photoStudioUpdatePhotoState({ sessionDir, photoId: photo.id, state: newState })
    if (newState === 'selected') enqueueClean(photo)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionDir, layout, enqueueClean])

  // Listen for bg-removal worker events
  useEffect(() => {
    if (!window.electronAPI.onPhotoStudioBgEvent) return
    const unlisten = window.electronAPI.onPhotoStudioBgEvent(e => {
      if (e.sessionDir !== sessionDir) return
      const status = e.status as 'queued' | 'loading-model' | 'processing' | 'done' | 'error'
      setBgStatus(prev => {
        const next = new Map(prev)
        if (status === 'done' || status === 'error') next.delete(e.photoId)
        else next.set(e.photoId, status)
        return next
      })
      if (status === 'done' && e.output) {
        if (layout === 'stages') {
          setPhotos(prev => prev.map(p => p.id === e.photoId ? withStages({ ...p, cleanedPath: e.output! }, { cleaned: true }) : p))
        } else {
          window.electronAPI.photoStudioUpdatePhotoState({ sessionDir, photoId: e.photoId, state: 'cleaned', cleanedPath: e.output })
          setPhotos(prev => prev.map(p => p.id === e.photoId ? withStages({ ...p, state: 'cleaned', cleanedPath: e.output! }, { cleaned: true }) : p))
        }
      }
    })
    return () => unlisten()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionDir, layout])

  // Auto-select last photo when entering capture mode
  useEffect(() => {
    if (view === 'capture' && photos.length > 0 && previewIdx === null) {
      setPreviewIdx(photos.length - 1)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  // Load the capture preview when previewIdx changes. Two-stage for snappiness:
  // a small thumb appears almost instantly, then the 1600px sharpens it. Both are
  // size-bounded + disk-cached, so re-viewing a photo is instant and memory stays flat.
  useEffect(() => {
    if (previewIdx === null || view !== 'capture') return
    const p = photos[previewIdx]
    if (!p) return
    let cancelled = false
    const fresh = () => !cancelled && previewIdxRef.current === previewIdx
    setPreviewDataUrl(null)
    // 1) instant low-res placeholder
    window.electronAPI.bgRemovalThumb(p.absPath, 480).then(url => {
      if (fresh() && url) setPreviewDataUrl(prev => prev ?? url)
    })
    // 2) full-size preview replaces it when ready
    window.electronAPI.readPhotoThumbnail(p.absPath, 1600).then(url => {
      if (fresh() && url) setPreviewDataUrl(url)
    })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewIdx, view])

  // Scroll filmstrip to keep active thumb in view
  useEffect(() => {
    if (previewIdx === null || !filmstripRef.current) return
    const el = filmstripRef.current.children[previewIdx] as HTMLElement | undefined
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [previewIdx])

  // Keyboard navigation in capture mode
  useEffect(() => {
    if (view !== 'capture') return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); setView('icons'); return }
      const cur = previewIdxRef.current
      if (cur === null) return
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        const dir = e.key === 'ArrowLeft' ? -1 : 1
        setPreviewIdx(i => (i !== null) ? Math.max(0, Math.min(photos.length - 1, i + dir)) : i)
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const p = photos[cur]
        if (p) starPhoto(p)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [view, photos, sessionDir, starPhoto])

  // Cumulative tabs: a photo shows in every stage it has reached, so the same
  // photo stays visible under Captured, Selected, Cleaned, Ready as it advances.
  const visiblePhotos = photos.filter(p => inStage(p, filterState))

  const toggleSelect = useCallback((idx: number, shift: boolean) => {
    const photo = visiblePhotos[idx]
    setSelected(prev => {
      const next = new Set(prev)
      if (shift && lastSelectedRef.current !== null) {
        const lo = Math.min(lastSelectedRef.current, idx)
        const hi = Math.max(lastSelectedRef.current, idx)
        for (let i = lo; i <= hi; i++) next.add(visiblePhotos[i].id)
      } else {
        if (next.has(photo.id)) next.delete(photo.id)
        else next.add(photo.id)
      }
      lastSelectedRef.current = idx
      return next
    })
  }, [visiblePhotos])

  const selectAll = () => setSelected(new Set(visiblePhotos.map(p => p.id)))
  const deselectAll = () => setSelected(new Set())

  // Update state for a single photo (flat sessions; keeps stages consistent)
  const updateState = async (photo: StudioPhoto, state: StudioPhoto['state'], extra?: { cleanedPath?: string | null; jpgPath?: string | null }) => {
    await window.electronAPI.photoStudioUpdatePhotoState({
      sessionDir,
      photoId: photo.id,
      state,
      ...extra,
    })
    setPhotos(prev => prev.map(p => p.id === photo.id ? withStages({ ...p, state, ...extra }, stagesForState(state)) : p))
  }

  // Mark selected (bulk) — same as starring: copies to selected/ + auto-cleans
  const markSelected = async () => {
    for (const photo of photos.filter(p => selected.has(p.id) && !p.stages.selected)) {
      if (layout === 'stages') {
        await window.electronAPI.photoStudioStageSelect({ sessionDir, photoId: photo.id })
        setPhotos(prev => prev.map(p => p.id === photo.id ? withStages(p, { selected: true }) : p))
      } else {
        await updateState(photo, 'selected')
      }
      enqueueClean(photo)
    }
  }

  // Run BG removal (one-shot) on selected photos
  const runBgRemoval = async () => {
    const toolDir = engineToolDirRef.current
    if (!toolDir) { alert('Background Removal engine is not installed. Open the Background Removal page to install it.'); return }
    const targets = photos.filter(p => selected.has(p.id) && !p.stages.cleaned)
    if (!targets.length) return

    for (const photo of targets) {
      setProcessing(prev => new Set(prev).add(photo.id))
      const outPng = cleanedOut(photo.id)
      const res = await window.electronAPI.bgRemovalCleanPhoto({ input: photo.absPath, output: outPng, toolDir })
      if (res.ok && layout !== 'stages') {
        // legacy quirk: flat sessions also keep a JPG next to the cleaned PNG
        const outJpg = sessionDir + '/_cleaned/' + photo.id + '.jpg'
        await window.electronAPI.bgRemovalMakeJpg(outPng, outJpg)
        await updateState(photo, 'cleaned', { cleanedPath: outPng, jpgPath: outJpg })
      }
      setProcessing(prev => { const s = new Set(prev); s.delete(photo.id); return s })
    }
    await loadPhotos() // stages: re-derive cleaned from disk
  }

  // Promote cleaned → ready (bulk; generates the final JPG)
  const markReady = async () => {
    const targets = photos.filter(p => selected.has(p.id) && p.stages.cleaned && !p.stages.ready)
    for (const photo of targets) {
      if (layout === 'stages') {
        await window.electronAPI.photoStudioStageApprove({ sessionDir, photoId: photo.id })
      } else if (photo.cleanedPath) {
        const finalJpg = sessionDir + '/_ready/' + photo.id + '.jpg'
        await window.electronAPI.bgRemovalMakeJpg(photo.cleanedPath, finalJpg)
        await updateState(photo, 'ready', { jpgPath: finalJpg })
      }
    }
    await loadPhotos()
  }

  // ── Per-photo cleaned/ready actions (Approve · Photoshop · Save&return) ──────
  const [photoBusy, setPhotoBusy] = useState<Set<string>>(new Set())
  const setBusy = (id: string, on: boolean) =>
    setPhotoBusy(prev => { const s = new Set(prev); if (on) s.add(id); else s.delete(id); return s })
  // Per-photo thumbnail cache-bust — bumped when a cleaned/ready PNG changes on
  // disk (Photoshop save or Select Subject recut) so the thumb/lightbox refetch.
  const [thumbBust, setThumbBust] = useState<Record<string, number>>({})
  const bumpThumb = (id: string) => setThumbBust(prev => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }))

  // Approve a cleaned photo → READY (copies the cleaned PNG into ready/ + makes JPG)
  const approvePhoto = useCallback(async (photo: StudioPhoto) => {
    if (!photo.cleanedPath) return
    setBusy(photo.id, true)
    if (layout === 'stages') {
      const res = await window.electronAPI.photoStudioStageApprove({ sessionDir, photoId: photo.id })
      if (res.ok) {
        setPhotos(prev => prev.map(p => p.id === photo.id
          ? withStages({ ...p, jpgPath: res.jpgPath ?? p.jpgPath, readyPngPath: res.readyPngPath ?? p.readyPngPath }, { ready: true })
          : p))
      } else {
        alert('Could not approve: ' + (res.error ?? 'unknown error'))
      }
    } else {
      const finalJpg = sessionDir + '/_ready/' + photo.id + '.jpg'
      const res = await window.electronAPI.bgRemovalMakeJpg(photo.cleanedPath, finalJpg)
      if (res.ok) {
        await window.electronAPI.photoStudioUpdatePhotoState({ sessionDir, photoId: photo.id, state: 'ready', jpgPath: finalJpg })
        setPhotos(prev => prev.map(p => p.id === photo.id ? withStages({ ...p, state: 'ready', jpgPath: finalJpg }, { ready: true }) : p))
      } else {
        alert('Could not create the JPG: ' + (res.error ?? 'unknown error'))
      }
    }
    setBusy(photo.id, false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionDir, layout])

  // Open the cleaned/ready PNG in Photoshop for manual retouch
  const openInPhotoshop = useCallback(async (photo: StudioPhoto) => {
    const png = photo.stages.ready ? (photo.readyPngPath ?? photo.cleanedPath) : photo.cleanedPath
    if (!png) return
    const res = await window.electronAPI.photoshopOpen(png)
    if (!res.ok) alert('Could not open Photoshop: ' + (res.error ?? 'unknown error'))
  }, [])

  // Save the Photoshop-edited PNG back; if the photo is READY, regenerate its JPG
  // so the export stays in sync (deterministic auto-update on save).
  const saveReturnPhotoshop = useCallback(async (photo: StudioPhoto) => {
    const png = photo.stages.ready ? (photo.readyPngPath ?? photo.cleanedPath) : photo.cleanedPath
    if (!png) return
    setBusy(photo.id, true)
    const r = await window.electronAPI.photoshopSaveReturn(png, false)
    if (r.ok && photo.stages.ready) {
      if (layout === 'stages') {
        await window.electronAPI.photoStudioStageRefreshJpg({ sessionDir, photoId: photo.id })
      } else if (photo.jpgPath) {
        await window.electronAPI.bgRemovalMakeJpg(png, photo.jpgPath)
      }
    }
    setBusy(photo.id, false)
    bumpThumb(photo.id)
    if (!r.ok) alert('Could not save from Photoshop: ' + (r.error ?? 'unknown error'))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionDir, layout])

  // ── Select Subject (engine vs Photoshop cut-out compare) ────────────────────
  // Same flow as Background Removal / Photo Manager: run Photoshop "Select Subject"
  // on the ORIGINAL camera frame → compare against the engine cut → keep one.
  const [compare, setCompare] = useState<
    { photoId: string; enginePng: string; subjectPng: string; engineUrl: string | null; subjectUrl: string | null; name: string } | null
  >(null)
  const [compareBusy, setCompareBusy] = useState(false)

  const selectSubject = useCallback(async (photo: StudioPhoto) => {
    if (!photo.cleanedPath) return
    setBusy(photo.id, true)
    const subjectPng = photo.cleanedPath.replace(/\.png$/i, '.subject.png')
    const r = await window.electronAPI.photoshopSelectSubject(photo.absPath, subjectPng)
    if (!r.ok) {
      setBusy(photo.id, false)
      alert('Select Subject failed: ' + (r.error ?? 'unknown error'))
      return
    }
    const [engineUrl, subjectUrl] = await Promise.all([
      window.electronAPI.bgRemovalReadFull(photo.cleanedPath),
      window.electronAPI.bgRemovalReadFull(subjectPng),
    ])
    setBusy(photo.id, false)
    setCompare({ photoId: photo.id, enginePng: photo.cleanedPath, subjectPng, engineUrl, subjectUrl, name: photo.filename })
  }, [])

  const chooseRecut = useCallback(async (keepSubject: boolean) => {
    if (!compare) return
    setCompareBusy(true)
    await window.electronAPI.bgRemovalResolveRecut({ keepSubject, enginePng: compare.enginePng, subjectPng: compare.subjectPng })
    setCompareBusy(false)
    bumpThumb(compare.photoId)
    setCompare(null)
  }, [compare])

  // Remove selected
  const removeSelected = async () => {
    if (!confirm(`Remove ${selected.size} photo(s) from this session?`)) return
    for (const photo of photos.filter(p => selected.has(p.id))) {
      await window.electronAPI.photoStudioRemovePhoto({ sessionDir, photoId: photo.id, filename: photo.filename })
    }
    setSelected(new Set())
    await loadPhotos()
  }

  // Import photos
  const importPhotos = async () => {
    await window.electronAPI.photoStudioSelectImport(sessionDir)
    await loadPhotos()
  }

  // Export ready photos (open their containing folder)
  const exportReady = async () => {
    window.electronAPI.photoStudioOpenInFinder(sessionDir + '/_ready')
  }

  // Cumulative counts — match the cumulative tabs (a ready photo also counts as
  // captured/selected/cleaned, since it lives in all those folders).
  const counts = {
    captured: photos.length,
    selected: photos.filter(p => p.stages.selected).length,
    cleaned:  photos.filter(p => p.stages.cleaned).length,
    ready:    photos.filter(p => p.stages.ready).length,
  }

  const stateFilterOptions: Array<{ value: StudioPhoto['state'] | 'all'; label: string; count: number }> = [
    { value: 'all',      label: 'All',      count: photos.length },
    { value: 'captured', label: 'Captured', count: counts.captured },
    { value: 'selected', label: 'Selected', count: counts.selected },
    { value: 'cleaned',  label: 'Cleaned',  count: counts.cleaned },
    { value: 'ready',    label: 'Ready',    count: counts.ready },
  ]

  // ── Capture mode — immersive full-window, floating collapsible panel ──────
  if (view === 'capture') {
    const activePhoto = previewIdx !== null ? photos[previewIdx] : undefined
    return (
      <div className="fixed inset-0 z-40 bg-black overflow-hidden">
        {/* Photo + filmstrip fill the whole window; the panel floats on top */}
        <div className="absolute inset-0 flex flex-col">
          {/* Main preview */}
          <div className="flex-1 relative flex items-center justify-center min-h-0">
            {previewDataUrl ? (
              <img
                src={previewDataUrl}
                alt=""
                draggable={false}
                className="max-w-full max-h-full object-contain select-none"
              />
            ) : (
              <Loader2 size={28} className="text-gray-600 animate-spin will-change-transform" />
            )}
            {/* Nav arrows */}
            {previewIdx !== null && previewIdx > 0 && (
              <button
                className="absolute left-3 p-2 rounded-full bg-black/40 hover:bg-black/60 text-white"
                onClick={() => setPreviewIdx(i => (i !== null && i > 0) ? i - 1 : i)}
              >
                <ArrowLeft size={18} />
              </button>
            )}
            {previewIdx !== null && previewIdx < photos.length - 1 && (
              <button
                className="absolute right-3 p-2 rounded-full bg-black/40 hover:bg-black/60 text-white"
                onClick={() => setPreviewIdx(i => (i !== null && i < photos.length - 1) ? i + 1 : i)}
              >
                <ArrowRight size={18} />
              </button>
            )}
          </div>

          {/* Filmstrip */}
          <div
            ref={filmstripRef}
            className="flex gap-1.5 px-2 py-2 bg-black/60 shrink-0 overflow-x-auto"
            style={{ scrollbarWidth: 'none' }}
          >
            {photos.map((p, i) => (
              <FilmstripThumb
                key={p.id}
                photo={p}
                active={previewIdx === i}
                bgActive={bgStatus.has(p.id)}
                onClick={() => setPreviewIdx(i)}
              />
            ))}
          </div>
        </div>

        {/* Collapsed → floating opener button in the top-left corner */}
        {!captureSidebarOpen && (
          <button
            onClick={() => setCaptureSidebarOpen(true)}
            title="Show panel"
            className="absolute left-3 top-3 z-20 p-2 rounded-xl bg-black/50 text-white hover:bg-black/70 transition-colors"
          >
            <PanelLeftOpen size={16} />
          </button>
        )}

        {/* Floating, collapsible, semi-transparent panel */}
        {captureSidebarOpen && (
          <div className="absolute left-3 top-3 bottom-3 w-44 flex flex-col rounded-2xl bg-black/50 border border-white/10 z-20 overflow-hidden">
            {/* Header — back to grid + collapse */}
            <div className="flex items-center justify-between px-2.5 pt-2.5 pb-1 shrink-0">
              <button
                onClick={() => setView('icons')}
                title="Back to grid"
                className="flex items-center gap-1 text-xs text-gray-300 hover:text-white"
              >
                <ChevronLeft size={12} /> Grid
              </button>
              <button
                onClick={() => setCaptureSidebarOpen(false)}
                title="Collapse panel"
                className="p-1 rounded text-gray-400 hover:text-white"
              >
                <PanelLeftClose size={13} />
              </button>
            </div>
            <div className="px-3 pb-2 text-white font-medium text-xs truncate shrink-0">{session.name}</div>

            {/* Scrollable middle */}
            <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
              {/* Camera status */}
              <div className={`mx-2 mb-2 px-2 py-1.5 rounded-lg text-xs flex items-center gap-1.5 ${
                tethering ? 'bg-green-900/40 text-green-400' : 'bg-white/5 text-gray-400'
              }`}>
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${tethering ? 'bg-green-400 animate-pulse' : 'bg-gray-600'}`} />
                {tethering ? 'Live' : cameraConnected ? 'Camera ready' : 'No camera'}
              </div>

              {/* Filter pills with counts */}
              <div className="flex flex-col gap-0.5 px-2 pb-2">
                {([
                  { value: 'all' as const,      label: 'All',      count: photos.length },
                  { value: 'captured' as const,  label: 'Captured', count: counts.captured },
                  { value: 'selected' as const,  label: 'Selected', count: counts.selected },
                  { value: 'cleaned' as const,   label: 'Cleaned',  count: counts.cleaned },
                  { value: 'ready' as const,     label: 'Ready',    count: counts.ready },
                ]).map(opt => (
                  <button
                    key={opt.value}
                    className={`flex items-center justify-between px-2 py-1 rounded text-xs transition-colors ${
                      filterState === opt.value ? 'bg-white/15 text-white' : 'text-gray-400 hover:text-gray-200'
                    }`}
                    onClick={() => setFilterState(opt.value)}
                  >
                    <span>{opt.label}</span>
                    <span className="text-gray-500 tabular-nums">{opt.count}</span>
                  </button>
                ))}
              </div>

              {/* Active photo info + star button */}
              {activePhoto && (
                <div className="px-2 pb-2">
                  <div className="text-[10px] text-gray-400 truncate mb-1">{activePhoto.filename}</div>
                  <button
                    className={`w-full py-1.5 rounded text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                      activePhoto.stages.selected
                        ? 'bg-blue-600 text-white hover:bg-blue-500'
                        : 'bg-white/10 text-gray-200 hover:bg-white/20'
                    }`}
                    onClick={() => starPhoto(activePhoto)}
                  >
                    <Star size={11} fill={activePhoto.stages.selected ? 'currentColor' : 'none'} />
                    {activePhoto.stages.selected ? 'Starred' : 'Star (Enter)'}
                  </button>
                </div>
              )}
            </div>

            {/* Import + Refresh pinned at bottom */}
            <div className="flex gap-1 px-2 py-2 shrink-0">
              <button
                onClick={importPhotos}
                className="flex-1 py-1.5 rounded bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 text-xs flex items-center justify-center gap-1"
              >
                <FolderInput size={10} /> Import
              </button>
              <button onClick={loadPhotos} className="p-1.5 rounded bg-white/5 text-gray-400 hover:text-white hover:bg-white/10">
                <RefreshCw size={10} />
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <AppLayout mainClassName="flex-1 overflow-hidden">
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white">
          <ChevronLeft size={16} /> Sessions
        </button>
        <div className="w-px h-4 bg-gray-200 dark:bg-gray-700" />
        <h2 className="font-semibold text-sm flex-1 truncate">{session.name}</h2>

        {/* View toggle */}
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
          {(['icons', 'gallery', 'list', 'capture'] as ViewMode[]).map(v => (
            <button
              key={v}
              className={`p-1.5 rounded ${view === v ? 'bg-white dark:bg-gray-700 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
              onClick={() => { setView(v); if (v !== 'capture') localStorage.setItem(LS_VIEW, v) }}
              title={v === 'capture' ? 'Capture mode' : v}
            >
              {v === 'icons' ? <Grid3X3 size={14} /> : v === 'gallery' ? <Image size={14} /> : v === 'list' ? <List size={14} /> : <Camera size={14} />}
            </button>
          ))}
        </div>

        <button onClick={importPhotos} className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
          <FolderInput size={14} /> Import
        </button>
        <button onClick={loadPhotos} className="p-1.5 text-gray-400 hover:text-gray-600">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* ── Camera tethering bar ─────────────────────────────────────────── */}
      <div className={`flex items-center gap-3 px-4 py-2.5 border-b text-sm shrink-0 transition-colors ${
        tethering
          ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800'
          : 'bg-gray-50 border-gray-200 dark:bg-gray-800/50 dark:border-gray-700'
      }`}>
        {/* Status dot */}
        <div className={`w-2 h-2 rounded-full shrink-0 ${
          tethering ? 'bg-green-500 animate-pulse' : cameraConnected ? 'bg-amber-500' : 'bg-gray-300'
        }`} />

        {tethering ? (
          <>
            <Wifi size={14} className="text-green-600 shrink-0" />
            <span className="text-green-700 dark:text-green-400 font-medium flex-1">
              Live capture active{cameraModel ? ` · ${cameraModel}` : ''}
            </span>
            <button onClick={stopTethering} className="text-xs px-2.5 py-1 rounded-full border border-green-300 dark:border-green-700 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40">
              Stop
            </button>
          </>
        ) : tetheringWarming ? (
          <>
            <Loader2 size={14} className="animate-spin will-change-transform text-purple-500 shrink-0" />
            <span className="text-gray-600 dark:text-gray-400 flex-1">Connecting to camera…</span>
          </>
        ) : cameraConnected ? (
          <>
            <Camera size={14} className="text-amber-600 shrink-0" />
            <span className="text-gray-700 dark:text-gray-300 flex-1">
              Camera ready{cameraModel ? ` · ${cameraModel}` : ''}
            </span>
            <button
              onClick={startTethering}
              className="text-xs px-3 py-1 rounded-full bg-purple-600 text-white hover:bg-purple-700"
            >
              Start capture
            </button>
          </>
        ) : (
          <>
            <WifiOff size={14} className="text-gray-400 shrink-0" />
            <span className="text-gray-500 flex-1">No camera connected — connect via USB then press Start capture</span>
            <button
              onClick={() => { window.electronAPI.checkCameraConnection().then(s => { setCameraConnected(s.connected); setCameraModel(s.model) }) }}
              className="text-xs px-2.5 py-1 rounded-full border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100"
            >
              Check
            </button>
          </>
        )}
        {tetheringError && (
          <span className="text-xs text-red-500 leading-snug max-w-md" title={tetheringError}>{tetheringError}</span>
        )}
      </div>

      {/* Filter pills (label + count, merged from the old KPI strip) + selection toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <div className="flex gap-1">
          {stateFilterOptions.map(opt => {
            const active = filterState === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => setFilterState(opt.value)}
                className={`flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 text-xs rounded-full transition-colors ${
                  active
                    ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {opt.label}
                <span className={`tabular-nums rounded-full px-1.5 min-w-[1.25rem] text-center ${
                  active ? 'bg-white/25 dark:bg-black/10' : 'bg-gray-200 dark:bg-gray-700 text-gray-500'
                }`}>{opt.count}</span>
              </button>
            )
          })}
        </div>

        {!engineReady && (
          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 text-xs" title="Star a photo to auto-clean it — but the engine must be installed first">
            <AlertTriangle size={12} /> Engine not installed
          </span>
        )}

        <div className="flex-1" />

        {selected.size > 0 && (
          <>
            <span className="text-xs text-gray-500">{selected.size} selected</span>
            <button onClick={selectAll} className="text-xs text-blue-600 hover:underline">All</button>
            <button onClick={deselectAll} className="text-xs text-gray-400 hover:underline">None</button>
            <div className="w-px h-4 bg-gray-200 dark:bg-gray-700" />
            {photos.some(p => selected.has(p.id) && !p.stages.selected) && (
              <button onClick={markSelected} className="flex items-center gap-1 text-xs px-2.5 py-1 bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200">
                ⭐ Mark selected
              </button>
            )}
            {photos.some(p => selected.has(p.id) && !p.stages.cleaned) && (
              <button
                onClick={runBgRemoval}
                disabled={processing.size > 0}
                className="flex items-center gap-1 text-xs px-2.5 py-1 bg-purple-100 text-purple-700 rounded-full hover:bg-purple-200 disabled:opacity-50"
              >
                {processing.size > 0 ? <Loader2 size={11} className="animate-spin" /> : <Scissors size={11} />}
                Clean background
              </button>
            )}
            {photos.some(p => selected.has(p.id) && p.stages.cleaned && !p.stages.ready) && (
              <button onClick={markReady} className="flex items-center gap-1 text-xs px-2.5 py-1 bg-green-100 text-green-700 rounded-full hover:bg-green-200">
                ✅ Mark ready
              </button>
            )}
            <button onClick={removeSelected} className="flex items-center gap-1 text-xs px-2.5 py-1 bg-red-100 text-red-700 rounded-full hover:bg-red-200">
              <Trash2 size={11} /> Remove
            </button>
          </>
        )}
        {counts.ready > 0 && (
          <button onClick={exportReady} className="flex items-center gap-1 text-xs px-2.5 py-1 bg-gray-100 dark:bg-gray-800 rounded-full hover:bg-gray-200">
            <Download size={11} /> Export ready
          </button>
        )}
      </div>

      {/* Photo grid / list */}
      <div className="flex-1 overflow-y-auto p-4">
        {loadingState ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 size={24} className="animate-spin will-change-transform text-gray-400" />
          </div>
        ) : visiblePhotos.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3 text-gray-400">
            <Image size={32} />
            <p className="text-sm">No photos{filterState !== 'all' ? ` in "${filterState}"` : ''}.</p>
            <button onClick={importPhotos} className="text-sm text-blue-600 hover:underline">Import photos</button>
          </div>
        ) : view === 'list' ? (
          <div className="space-y-0.5">
            {visiblePhotos.map((p, i) => (
              <PhotoListRow
                key={p.id}
                photo={p}
                selected={selected.has(p.id)}
                onClick={() => setLightboxIdx(i)}
                onSelect={shift => toggleSelect(i, shift)}
                onStar={() => starPhoto(p)}
              />
            ))}
          </div>
        ) : (
          <div className={`grid gap-2 ${view === 'gallery'
            ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'
            : 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8'
          }`}>
            {visiblePhotos.map((p, i) => (
              <div key={p.id} className="group relative">
                <PhotoThumb
                  photo={p}
                  selected={selected.has(p.id)}
                  displayStage={filterState}
                  onClick={() => setLightboxIdx(i)}
                  onSelect={shift => toggleSelect(i, shift)}
                  onStar={() => starPhoto(p)}
                  bust={thumbBust[p.id] ?? 0}
                />
                {processing.has(p.id) && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg">
                    <Loader2 size={20} className="animate-spin text-white" />
                  </div>
                )}
                {p.stages.ready && (
                  <div className="absolute top-1.5 left-1.5 pointer-events-none">
                    <CheckCircle2 size={16} className="text-green-400 drop-shadow" />
                  </div>
                )}
                {/* Cleaned quick actions — hover-reveal, muted so they don't fight the photo */}
                {p.stages.cleaned && !p.stages.ready && (
                  <div className="absolute bottom-1.5 inset-x-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={e => { e.stopPropagation(); approvePhoto(p) }}
                      disabled={photoBusy.has(p.id)}
                      title="Approve → Ready"
                      className="flex-1 flex items-center justify-center gap-1 py-1 rounded-md bg-black/55 text-white/90 text-[10px] font-medium hover:bg-black/75 disabled:opacity-50"
                    >
                      {photoBusy.has(p.id) ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle2 size={10} className="text-emerald-300" />} Approve
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); selectSubject(p) }}
                      disabled={photoBusy.has(p.id)}
                      title="Re-cut with Photoshop Select Subject"
                      className="flex items-center justify-center px-1.5 py-1 rounded-md bg-black/55 text-white/90 hover:bg-black/75 disabled:opacity-50"
                    >
                      <Wand2 size={11} />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); openInPhotoshop(p) }}
                      title="Open in Photoshop"
                      className="flex items-center justify-center px-1.5 py-1 rounded-md bg-black/55 text-white/90 hover:bg-black/75"
                    >
                      <ExternalLink size={11} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxIdx !== null && (
        <Lightbox
          photos={visiblePhotos}
          index={lightboxIdx}
          displayStage={filterState}
          onClose={() => setLightboxIdx(null)}
          onNav={dir => setLightboxIdx(i => {
            if (i === null) return null
            const next = i + dir
            return next >= 0 && next < visiblePhotos.length ? next : i
          })}
          onApprove={approvePhoto}
          onPhotoshop={openInPhotoshop}
          onSaveReturn={saveReturnPhotoshop}
          onSelectSubject={selectSubject}
          busy={visiblePhotos[lightboxIdx] ? photoBusy.has(visiblePhotos[lightboxIdx].id) : false}
          bust={visiblePhotos[lightboxIdx] ? (thumbBust[visiblePhotos[lightboxIdx].id] ?? 0) : 0}
        />
      )}

      {/* Select Subject comparison — engine cut vs Photoshop cut */}
      {compare && (
        <CutoutCompareModal
          title={`Which cut-out do you want to keep? · ${compare.name}`}
          engineUrl={compare.engineUrl}
          subjectUrl={compare.subjectUrl}
          busy={compareBusy}
          onChoose={chooseRecut}
          onCancel={() => {
            if (compareBusy) return
            void window.electronAPI.bgRemovalResolveRecut({ keepSubject: false, enginePng: compare.enginePng, subjectPng: compare.subjectPng })
            setCompare(null)
          }}
        />
      )}
    </div>
    </AppLayout>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function PhotoStudioPage() {
  const [catalog, setCatalogState] = useState<string | null>(getCatalog)
  const [sessions, setSessions] = useState<StudioSession[]>([])
  const [loading, setLoading] = useState(false)
  const [activeSession, setActiveSession] = useState<StudioSession | null>(null)
  const [newSessionName, setNewSessionName] = useState('')
  const [showNewForm, setShowNewForm] = useState(false)
  const [creating, setCreating] = useState(false)

  const loadSessions = useCallback(async (cat: string) => {
    setLoading(true)
    const res = await window.electronAPI.photoStudioListSessions(cat)
    if (res.ok) setSessions(res.sessions)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (catalog) loadSessions(catalog)
  }, [catalog, loadSessions])

  const pickCatalog = async () => {
    const picked = await window.electronAPI.photoStudioPickCatalog()
    if (picked) {
      setCatalog(picked)
      setCatalogState(picked)
    }
  }

  const createSession = async () => {
    if (!catalog || !newSessionName.trim()) return
    setCreating(true)
    const res = await window.electronAPI.photoStudioCreateSession(catalog, newSessionName.trim())
    if (res.ok) {
      setNewSessionName('')
      setShowNewForm(false)
      await loadSessions(catalog)
    }
    setCreating(false)
  }

  const deleteSession = async (session: StudioSession) => {
    if (!catalog) return
    if (!confirm(`Delete session "${session.name}" and all its photos?`)) return
    await window.electronAPI.photoStudioDeleteSession(catalog + '/' + session.id)
    setSessions(prev => prev.filter(s => s.id !== session.id))
  }

  const renameSession = async (session: StudioSession, newName: string) => {
    if (!catalog || !newName.trim() || newName === session.name) return
    await window.electronAPI.photoStudioRenameSession(catalog + '/' + session.id, newName)
    setSessions(prev => prev.map(s => s.id === session.id ? { ...s, name: newName } : s))
  }

  // Session detail view
  if (activeSession && catalog) {
    // SessionView owns its own layout: AppLayout for grid/list/gallery, and a
    // full-window immersive view (no app sidebar) for capture mode.
    return (
      <SessionView
        session={activeSession}
        catalogDir={catalog}
        onBack={() => { setActiveSession(null); loadSessions(catalog) }}
      />
    )
  }

  // No catalog set → setup screen
  if (!catalog) {
    return (
      <AppLayout>
      <div className="flex flex-col items-center justify-center h-full gap-6 text-center px-8">
        <div className="w-16 h-16 rounded-2xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
          <Camera size={32} className="text-purple-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Photo Studio</h2>
          <p className="text-gray-500 text-sm max-w-sm">
            Choose a folder where your photo sessions will be stored. You only need to do this once.
          </p>
        </div>
        <button
          onClick={pickCatalog}
          className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700"
        >
          <FolderOpen size={18} /> Choose catalog folder
        </button>
      </div>
      </AppLayout>
    )
  }

  // Sessions list
  return (
    <AppLayout mainClassName="flex-1 overflow-hidden">
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <Camera size={18} className="text-purple-600" />
        <h1 className="font-semibold text-gray-900 dark:text-white flex-1">Photo Studio</h1>
        <span className="text-xs text-gray-400 truncate max-w-[260px]" title={catalog}>{catalog}</span>
        <button onClick={pickCatalog} className="text-xs text-gray-400 hover:text-gray-600 underline">Change</button>
        <button onClick={() => loadSessions(catalog)} className="p-1.5 text-gray-400 hover:text-gray-600">
          <RefreshCw size={14} />
        </button>
        <button
          onClick={() => setShowNewForm(true)}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
        >
          <Plus size={14} /> New session
        </button>
      </div>

      {/* New session form */}
      {showNewForm && (
        <div className="px-5 py-3 bg-purple-50 dark:bg-purple-900/20 border-b border-purple-200 dark:border-purple-800 flex items-center gap-3 shrink-0">
          <input
            autoFocus
            placeholder="Session name (e.g. Easter 2026)"
            value={newSessionName}
            onChange={e => setNewSessionName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') createSession(); if (e.key === 'Escape') setShowNewForm(false) }}
            className="flex-1 text-sm border border-purple-300 dark:border-purple-700 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800"
          />
          <button
            onClick={createSession}
            disabled={!newSessionName.trim() || creating}
            className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-1"
          >
            {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Create
          </button>
          <button onClick={() => setShowNewForm(false)} className="p-1.5 text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Sessions grid */}
      <div className="flex-1 overflow-y-auto p-5">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 size={24} className="animate-spin text-gray-400" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-60 gap-3 text-gray-400">
            <AlertTriangle size={28} />
            <p className="text-sm">No sessions yet.</p>
            <button
              onClick={() => setShowNewForm(true)}
              className="text-sm text-purple-600 hover:underline"
            >
              Create your first session
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {sessions.map(session => (
              <SessionCard
                key={session.id}
                session={session}
                catalogDir={catalog}
                onOpen={() => setActiveSession(session)}
                onDelete={() => deleteSession(session)}
                onRename={name => renameSession(session, name)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
    </AppLayout>
  )
}
