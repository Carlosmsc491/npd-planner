// src/renderer/src/pages/PhotoStudioPage.tsx
// Standalone Photo Studio — session-based catalog, multi-view, bg-removal integration
// Mac-only. No recipe dependency.

import { useState, useEffect, useCallback, useRef, memo } from 'react'
import type { StudioSession, StudioPhoto } from '../../../shared/photoStudio'
import {
  Camera, FolderOpen, Grid3X3, List, Image, Plus, Trash2, RefreshCw,
  CheckCircle2, Loader2, AlertTriangle, ChevronLeft, Scissors, Download,
  FolderInput, MoreVertical, Pencil, X, ArrowLeft, ArrowRight,
} from 'lucide-react'

// ─── localStorage ────────────────────────────────────────────────────────────
const LS_CATALOG = 'npd:photostudio_catalog'
const LS_VIEW    = 'npd:photostudio_view'
const LS_TOOL    = 'npd:bgremoval_tool_path'

function getCatalog(): string | null { return localStorage.getItem(LS_CATALOG) }
function setCatalog(p: string): void { localStorage.setItem(LS_CATALOG, p) }

type ViewMode = 'icons' | 'gallery' | 'list'

// ─── Thumbnail component ──────────────────────────────────────────────────────
const PhotoThumb = memo(function PhotoThumb({
  photo, selected, onClick, onSelect,
}: {
  photo: StudioPhoto
  selected: boolean
  onClick: () => void
  onSelect: (shift: boolean) => void
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const src = photo.state === 'ready' && photo.jpgPath
      ? photo.jpgPath
      : photo.state === 'cleaned' && photo.cleanedPath
        ? photo.cleanedPath
        : photo.absPath
    window.electronAPI.bgRemovalThumb(src, 220).then(url => {
      if (!cancelled) setDataUrl(url)
    })
    return () => { cancelled = true }
  }, [photo.absPath, photo.state, photo.cleanedPath, photo.jpgPath])

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
      <div className="aspect-square bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
        {dataUrl ? (
          <img src={dataUrl} alt={photo.filename} className="w-full h-full object-cover" />
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
    </div>
  )
})

// ─── List row ────────────────────────────────────────────────────────────────
function PhotoListRow({ photo, selected, onClick, onSelect }: {
  photo: StudioPhoto; selected: boolean; onClick: () => void; onSelect: (shift: boolean) => void
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
    </div>
  )
}

// ─── Lightbox ────────────────────────────────────────────────────────────────
function Lightbox({ photos, index, onClose, onNav }: {
  photos: StudioPhoto[]; index: number; onClose: () => void; onNav: (dir: -1 | 1) => void
}) {
  const photo = photos[index]
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    setDataUrl(null)
    const src = photo.state === 'ready' && photo.jpgPath
      ? photo.jpgPath
      : photo.state === 'cleaned' && photo.cleanedPath
        ? photo.cleanedPath
        : photo.absPath
    window.electronAPI.bgRemovalReadFull(src).then(url => setDataUrl(url))
  }, [photo])

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
          photo.state === 'cleaned' || photo.state === 'ready' ? (
            <div className="relative" style={{ backgroundImage: 'url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABmJLR0QA/wD/AP+gvaeTAAAAI0lEQVQ4jWNgYGD4TxQGAAf4A/1zkmVkAAAAASUVORK5CYII=")', backgroundRepeat: 'repeat', backgroundSize: '16px' }}>
              <img src={dataUrl} alt={photo.filename} className="max-w-full max-h-[80vh] object-contain rounded" />
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
      </div>
    </div>
  )
}

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
  const [photos, setPhotos] = useState<StudioPhoto[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [view, setView] = useState<ViewMode>((localStorage.getItem(LS_VIEW) as ViewMode) ?? 'icons')
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)
  const [processing, setProcessing] = useState<Set<string>>(new Set())
  const [filterState, setFilterState] = useState<StudioPhoto['state'] | 'all'>('all')
  const lastSelectedRef = useRef<number | null>(null)

  const loadPhotos = useCallback(async () => {
    setLoading(true)
    const res = await window.electronAPI.photoStudioListPhotos(sessionDir)
    if (res.ok) setPhotos(res.photos)
    setLoading(false)
  }, [sessionDir])

  useEffect(() => { loadPhotos() }, [loadPhotos])

  const visiblePhotos = filterState === 'all' ? photos : photos.filter(p => p.state === filterState)

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

  // Update state for a single photo
  const updateState = async (photo: StudioPhoto, state: StudioPhoto['state'], extra?: { cleanedPath?: string | null; jpgPath?: string | null }) => {
    await window.electronAPI.photoStudioUpdatePhotoState({
      sessionDir,
      photoId: photo.id,
      state,
      ...extra,
    })
    setPhotos(prev => prev.map(p => p.id === photo.id ? { ...p, state, ...extra } : p))
  }

  // Mark selected as "selected" state
  const markSelected = async () => {
    for (const photo of photos.filter(p => selected.has(p.id) && p.state === 'captured')) {
      await updateState(photo, 'selected')
    }
  }

  // Run BG removal on selected photos
  const runBgRemoval = async () => {
    const toolDir = localStorage.getItem(LS_TOOL)
    if (!toolDir) { alert('Set up the Background Removal engine first.'); return }
    const targets = photos.filter(p => selected.has(p.id) && (p.state === 'selected' || p.state === 'captured'))
    if (!targets.length) return

    for (const photo of targets) {
      setProcessing(prev => new Set(prev).add(photo.id))
      const outPng = sessionDir + '/_cleaned/' + photo.id + '.png'
      const res = await window.electronAPI.bgRemovalCleanPhoto({
        input: photo.absPath,
        output: outPng,
        toolDir,
      })
      if (res.ok) {
        // Auto-generate JPG too
        const outJpg = sessionDir + '/_cleaned/' + photo.id + '.jpg'
        await window.electronAPI.bgRemovalMakeJpg(outPng, outJpg)
        await updateState(photo, 'cleaned', { cleanedPath: outPng, jpgPath: outJpg })
      }
      setProcessing(prev => { const s = new Set(prev); s.delete(photo.id); return s })
    }
    await loadPhotos()
  }

  // Promote cleaned → ready (generates final JPG)
  const markReady = async () => {
    const targets = photos.filter(p => selected.has(p.id) && p.state === 'cleaned')
    for (const photo of targets) {
      const finalJpg = sessionDir + '/_ready/' + photo.id + '.jpg'
      if (photo.cleanedPath) {
        await window.electronAPI.bgRemovalMakeJpg(photo.cleanedPath, finalJpg)
        await updateState(photo, 'ready', { jpgPath: finalJpg })
      }
    }
    await loadPhotos()
  }

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

  const stateFilterOptions: Array<{ value: StudioPhoto['state'] | 'all'; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'captured', label: 'Captured' },
    { value: 'selected', label: 'Selected' },
    { value: 'cleaned', label: 'Cleaned' },
    { value: 'ready', label: 'Ready' },
  ]

  const counts = {
    captured: photos.filter(p => p.state === 'captured').length,
    selected: photos.filter(p => p.state === 'selected').length,
    cleaned:  photos.filter(p => p.state === 'cleaned').length,
    ready:    photos.filter(p => p.state === 'ready').length,
  }

  return (
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
          {(['icons', 'gallery', 'list'] as ViewMode[]).map(v => (
            <button
              key={v}
              className={`p-1.5 rounded ${view === v ? 'bg-white dark:bg-gray-700 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
              onClick={() => { setView(v); localStorage.setItem(LS_VIEW, v) }}
              title={v}
            >
              {v === 'icons' ? <Grid3X3 size={14} /> : v === 'gallery' ? <Image size={14} /> : <List size={14} />}
            </button>
          ))}
        </div>

        <button onClick={importPhotos} className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          <FolderInput size={14} /> Import
        </button>
        <button onClick={loadPhotos} className="p-1.5 text-gray-400 hover:text-gray-600">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* KPI strip */}
      <div className="flex gap-4 px-4 py-2 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700 text-xs shrink-0">
        <span className="text-gray-500">📷 <b className="text-gray-900 dark:text-white">{counts.captured}</b> captured</span>
        <span className="text-blue-500">⭐ <b>{counts.selected}</b> selected</span>
        <span className="text-purple-500">✂️ <b>{counts.cleaned}</b> cleaned</span>
        <span className="text-green-600">✅ <b>{counts.ready}</b> ready</span>
      </div>

      {/* Filter + selection toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-700 shrink-0">
        {/* State filters */}
        <div className="flex gap-1">
          {stateFilterOptions.map(opt => (
            <button
              key={opt.value}
              className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                filterState === opt.value
                  ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
              }`}
              onClick={() => setFilterState(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {selected.size > 0 && (
          <>
            <span className="text-xs text-gray-500">{selected.size} selected</span>
            <button onClick={selectAll} className="text-xs text-blue-600 hover:underline">All</button>
            <button onClick={deselectAll} className="text-xs text-gray-400 hover:underline">None</button>
            <div className="w-px h-4 bg-gray-200 dark:bg-gray-700" />
            {photos.some(p => selected.has(p.id) && p.state === 'captured') && (
              <button onClick={markSelected} className="flex items-center gap-1 text-xs px-2.5 py-1 bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200">
                ⭐ Mark selected
              </button>
            )}
            {photos.some(p => selected.has(p.id) && (p.state === 'selected' || p.state === 'captured')) && (
              <button
                onClick={runBgRemoval}
                disabled={processing.size > 0}
                className="flex items-center gap-1 text-xs px-2.5 py-1 bg-purple-100 text-purple-700 rounded-full hover:bg-purple-200 disabled:opacity-50"
              >
                {processing.size > 0 ? <Loader2 size={11} className="animate-spin" /> : <Scissors size={11} />}
                Clean background
              </button>
            )}
            {photos.some(p => selected.has(p.id) && p.state === 'cleaned') && (
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
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 size={24} className="animate-spin text-gray-400" />
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
              />
            ))}
          </div>
        ) : (
          <div className={`grid gap-2 ${view === 'gallery'
            ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'
            : 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8'
          }`}>
            {visiblePhotos.map((p, i) => (
              <div key={p.id} className="relative">
                <PhotoThumb
                  photo={p}
                  selected={selected.has(p.id)}
                  onClick={() => setLightboxIdx(i)}
                  onSelect={shift => toggleSelect(i, shift)}
                />
                {processing.has(p.id) && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg">
                    <Loader2 size={20} className="animate-spin text-white" />
                  </div>
                )}
                {p.state === 'ready' && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <CheckCircle2 size={28} className="text-green-400 drop-shadow-lg opacity-80" />
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
          onClose={() => setLightboxIdx(null)}
          onNav={dir => setLightboxIdx(i => {
            if (i === null) return null
            const next = i + dir
            return next >= 0 && next < visiblePhotos.length ? next : i
          })}
        />
      )}
    </div>
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
    return (
      <div className="flex flex-col h-full bg-white dark:bg-gray-900">
        <SessionView
          session={activeSession}
          catalogDir={catalog}
          onBack={() => { setActiveSession(null); loadSessions(catalog) }}
        />
      </div>
    )
  }

  // No catalog set → setup screen
  if (!catalog) {
    return (
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
    )
  }

  // Sessions list
  return (
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
  )
}
