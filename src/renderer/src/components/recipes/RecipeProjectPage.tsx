// src/renderer/src/components/recipes/RecipeProjectPage.tsx
// Full project window: file list, locks, presence, progress, detail panel

import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import {
  checkAndExpireLocks,
  markRecipeDone,
  reopenRecipeFile,
  forceUnlockRecipeFile,
  updatePresence,
  removePresence,
  subscribeToRecipePresence,
  getRecipeSettings,
  initDefaultRecipeSettings,
  assignRecipeFile,
  updateRecipeFileId,
  updateRecipeProject,
} from '../../lib/recipeFirestore'
import { subscribeToUsers, createNotification } from '../../lib/firestore'
import { canEditArea } from '../../lib/permissions'
import { useAuthStore } from '../../store/authStore'
import { useRecipeLock } from '../../hooks/useRecipeLock'
import { useRecipeFiles } from '../../hooks/useRecipeFiles'
import RecipeDetailPanel from './RecipeDetailPanel'
import RecipeFolderSection from './RecipeFolderSection'
import RecipeProgressCard from './RecipeProgressCard'
import RecipeActivityFeed from './RecipeActivityFeed'
import DeadlineWidget from './DeadlineWidget'
import RecipeFileManagerDialog from './RecipeFileManagerDialog'
import RecipeSettingsTab from './settings/RecipeSettingsTab'
import type { RecipeProject, RecipeFile, RecipePresence, RecipeSettings, AppUser, AppNotification } from '../../types'
import { FolderOpen, Loader2, Users, RefreshCw, AlertTriangle, Search, Download, Settings, Archive, CheckSquare, X, LayoutGrid, List, ChevronLeft } from 'lucide-react'
import AppLayout from '../ui/AppLayout'

export default function RecipeProjectPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  const [project, setProject] = useState<RecipeProject | null>(null)
  const [projectLoading, setProjectLoading] = useState(true)
  const [selectedFile, setSelectedFile] = useState<RecipeFile | null>(null)
  const [presence, setPresence] = useState<RecipePresence[]>([])
  const [settings, setSettings] = useState<RecipeSettings | null>(null)
  const [scanKey, setScanKey] = useState(0)
  const [fileManagerOpen, setFileManagerOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [users, setUsers] = useState<AppUser[]>([])

  // Bulk selection
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false)

  // Explorer navigation & view
  const [currentFolder, setCurrentFolder] = useState<string | null>(null)
  const [fileViewMode, setFileViewModeState] = useState<'grid' | 'list'>(() =>
    (localStorage.getItem('recipe-project-view') as 'grid' | 'list') ?? 'grid'
  )
  const [fileGridSize, setFileGridSizeState] = useState<'sm' | 'md' | 'lg'>(() =>
    (localStorage.getItem('recipe-project-grid-size') as 'sm' | 'md' | 'lg') ?? 'md'
  )
  function applyFileView(v: 'grid' | 'list') {
    setFileViewModeState(v); localStorage.setItem('recipe-project-view', v)
  }
  function applyFileGridSize(s: 'sm' | 'md' | 'lg') {
    setFileGridSizeState(s); localStorage.setItem('recipe-project-grid-size', s)
  }

  // Search and filter states
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'pending' | 'in_progress' | 'done' | 'mine'
  >('all')

  const canEdit = user ? canEditArea(user, 'recipes') : false

  const { currentLock, claimFile, unclaimFile } = useRecipeLock()
  const { files, filesByFolder, isLoading: filesLoading, scanError } = useRecipeFiles(
    projectId ?? '',
    project?.rootPath ?? '',
    scanKey
  )

  // ── Load project from Firestore ──────────────────────────────────────────
  useEffect(() => {
    if (!projectId) return
    const unsub = onSnapshot(
      doc(db, 'recipeProjects', projectId),
      (snap) => {
        if (snap.exists()) {
          setProject({ id: snap.id, ...snap.data() } as RecipeProject)
        } else {
          setProject(null)
        }
        setProjectLoading(false)
      },
      (err) => {
        console.error('RecipeProjectPage project load error:', err)
        setProjectLoading(false)
      }
    )
    return unsub
  }, [projectId])

  // ── Presence: update every 15 s, remove on unmount ──────────────────────
  const presenceRef = useRef({ projectId, userId: user?.uid, userName: user?.name })
  presenceRef.current = { projectId, userId: user?.uid, userName: user?.name }

  useEffect(() => {
    if (!projectId || !user) return

    updatePresence(projectId, user.uid, user.name).catch(console.error)
    const interval = setInterval(() => {
      updatePresence(projectId, user.uid, user.name).catch(console.error)
    }, 15_000)

    return () => {
      clearInterval(interval)
      const { projectId: pid, userId } = presenceRef.current
      if (pid && userId) {
        removePresence(pid, userId).catch(console.error)
      }
    }
  }, [projectId, user])

  // ── Subscribe to presence ────────────────────────────────────────────────
  useEffect(() => {
    if (!projectId) return
    const unsub = subscribeToRecipePresence(projectId, setPresence)
    return unsub
  }, [projectId])

  // ── Load (or init) recipe settings for current user ─────────────────────
  useEffect(() => {
    if (!user) return
    getRecipeSettings(user.uid).then(async (s) => {
      if (s) {
        setSettings(s)
      } else {
        const defaults = await initDefaultRecipeSettings(user.uid)
        setSettings(defaults)
      }
    }).catch(console.error)
  }, [user])

  // ── Subscribe to users ───────────────────────────────────────────────────
  useEffect(() => {
    const unsub = subscribeToUsers(setUsers)
    return unsub
  }, [])

  // ── Check and expire stale locks on mount ────────────────────────────────
  useEffect(() => {
    if (!projectId) return
    checkAndExpireLocks(projectId).catch(console.error)
  }, [projectId])

  // ── Keep selectedFile in sync with live file list ─────────────────────────
  useEffect(() => {
    if (!selectedFile) return
    const updated = files.find((f) => f.id === selectedFile.id)
    if (updated) setSelectedFile(updated)
  }, [files]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Action handlers ──────────────────────────────────────────────────────

  const handleClaim = useCallback(async () => {
    if (!projectId || !selectedFile || !user) return
    await claimFile(projectId, selectedFile.id, user.name)
  }, [projectId, selectedFile, user, claimFile])

  const handleUnclaim = useCallback(async () => {
    await unclaimFile()
  }, [unclaimFile])

  const handleMarkDone = useCallback(async () => {
    if (!projectId || !selectedFile || !user || !currentLock) return
    await markRecipeDone(projectId, selectedFile.id, user.name, currentLock.lockToken)
    // Lock is released as part of markRecipeDone — reset local state
    await unclaimFile()
  }, [projectId, selectedFile, user, currentLock, unclaimFile])

  const handleReopen = useCallback(async () => {
    if (!projectId || !selectedFile) return
    await reopenRecipeFile(projectId, selectedFile.id)
  }, [projectId, selectedFile])

  const handleForceUnlock = useCallback(async () => {
    if (!projectId || !selectedFile) return
    await forceUnlockRecipeFile(projectId, selectedFile.id)
  }, [projectId, selectedFile])

  const handleOpenInExcel = useCallback(async () => {
    if (!project || !selectedFile) return
    const fullPath = `${project.rootPath}/${selectedFile.relativePath}`.replace(/\//g, '\\')
    await window.electronAPI.recipeOpenInExcel(fullPath)
  }, [project, selectedFile])

  const handleOpenInExcelForFile = useCallback(async (file: RecipeFile) => {
    if (!project) return
    const fullPath = `${project.rootPath}/${file.relativePath}`.replace(/\//g, '\\')
    await window.electronAPI.recipeOpenInExcel(fullPath)
  }, [project])

  // ── Assign handler ──────────────────────────────────────────────────────
  const handleAssign = useCallback(async (uid: string | null, name: string | null) => {
    if (!projectId || !selectedFile) return
    await assignRecipeFile(projectId, selectedFile.id, uid, name)
    // Send bell notification to the assignee
    if (uid && uid !== user?.uid) {
      await createNotification({
        userId: uid,
        taskId: selectedFile.id,
        boardId: projectId,
        boardType: 'custom',
        type: 'assigned',
        message: `You were assigned recipe "${selectedFile.displayName}" in ${project?.name ?? 'a project'}`,
        read: false,
        triggeredBy: user?.uid ?? '',
        triggeredByName: user?.name ?? '',
      } as Omit<AppNotification, 'id'>)
    }
  }, [projectId, selectedFile, user, project])

  // ── Archive project ──────────────────────────────────────────────────────
  const handleArchiveProject = useCallback(async () => {
    if (!projectId) return
    const confirmed = window.confirm(
      `Archive "${project?.name}"?\nThe project will be hidden from the active list but all data is preserved.`
    )
    if (!confirmed) return
    try {
      await updateRecipeProject(projectId, { status: 'archived' })
      navigate('/recipes')
    } catch (err) {
      console.error('Failed to archive project:', err)
    }
  }, [projectId, project?.name, navigate])

  // ── Bulk action helpers ──────────────────────────────────────────────────
  function toggleCheck(id: string) {
    setSelectedFileIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const handleBulkReopen = useCallback(async () => {
    if (!projectId || selectedFileIds.size === 0) return
    setBulkBusy(true)
    try {
      const ids = [...selectedFileIds]
      await Promise.all(ids.map(id => reopenRecipeFile(projectId, id)))
      setSelectedFileIds(new Set())
    } finally {
      setBulkBusy(false)
    }
  }, [projectId, selectedFileIds])

  const handleBulkDone = useCallback(async () => {
    if (!projectId || selectedFileIds.size === 0 || !user) return
    setBulkBusy(true)
    try {
      const ids = [...selectedFileIds]
      await Promise.all(ids.map(id => markRecipeDone(projectId, id, user.name, '')))
      setSelectedFileIds(new Set())
    } finally {
      setBulkBusy(false)
    }
  }, [projectId, selectedFileIds, user])

  const handleBulkAssign = useCallback(async (uid: string | null, name: string | null) => {
    if (!projectId || selectedFileIds.size === 0) return
    setBulkAssignOpen(false)
    setBulkBusy(true)
    try {
      const ids = [...selectedFileIds]
      await Promise.all(ids.map(id => assignRecipeFile(projectId, id, uid, name)))
      if (uid && uid !== user?.uid) {
        await createNotification({
          userId: uid,
          taskId: ids[0],
          boardId: projectId,
          boardType: 'custom',
          type: 'assigned',
          message: `You were assigned ${ids.length} recipe${ids.length > 1 ? 's' : ''} in ${project?.name ?? 'a project'}`,
          read: false,
          triggeredBy: user?.uid ?? '',
          triggeredByName: user?.name ?? '',
        } as Omit<AppNotification, 'id'>)
      }
      setSelectedFileIds(new Set())
    } finally {
      setBulkBusy(false)
    }
  }, [projectId, selectedFileIds, user, project?.name])

  // ── File rename sync with Firestore ─────────────────────────────────────
  const handleFileRenamed = useCallback(async (oldPath: string, newPath: string) => {
    if (!projectId || !project) return
    const root = project.rootPath.replace(/\\/g, '/')
    const oldRel = oldPath.replace(/\\/g, '/').replace(root + '/', '')
    const newRel = newPath.replace(/\\/g, '/').replace(root + '/', '')
    const oldFileId = `${projectId}::${oldRel}`
    const newFileId = `${projectId}::${newRel}`
    const newDisplayName = newPath.split('\\').pop()?.replace(/\.xlsx$/i, '') ?? newRel
    try {
      await updateRecipeFileId(projectId, oldFileId, newFileId, newRel, newDisplayName)
    } catch (err) {
      console.error('handleFileRenamed error:', err)
    }
    setScanKey((k) => k + 1)
  }, [projectId, project])

  // ── Update folder path when project folder not found ─────────────────────
  const handleUpdateFolderPath = useCallback(async () => {
    if (!projectId || !project) return

    const newPath = await window.electronAPI.selectFolder()
    if (!newPath) return

    // Verificar que la nueva ruta existe
    const exists = await window.electronAPI.recipePathExists(newPath)
    if (!exists) {
      // Mostrar toast de error (usar alert por ahora, o implementar toast si existe)
      alert('Selected folder does not exist or is not accessible.')
      return
    }

    // Actualizar en Firestore
    try {
      await updateRecipeProject(projectId, {
        rootPath: newPath,
      })
      // Disparar re-scan con la nueva ruta
      setScanKey(k => k + 1)
    } catch (err) {
      console.error('Failed to update project path:', err)
      alert('Failed to update project folder path.')
    }
  }, [projectId, project])

  // ── Filtered files logic ────────────────────────────────────────────────
  const filteredFiles = useMemo(() => {
    return files.filter(file => {
      // Filtro de búsqueda (fuzzy simple por displayName)
      const matchesSearch = searchQuery.trim() === '' ||
        file.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        file.price.toLowerCase().includes(searchQuery.toLowerCase())

      // Filtro de estado
      const matchesStatus = (() => {
        if (statusFilter === 'all') return true
        if (statusFilter === 'mine') {
          return file.lockedBy === user?.name ||
                 file.doneBy === user?.name ||
                 file.assignedTo === user?.uid
        }
        return file.status === statusFilter
      })()

      return matchesSearch && matchesStatus
    })
  }, [files, searchQuery, statusFilter, user?.name, user?.uid])

  // Group filtered files by folder
  const filteredFilesByFolder = useMemo(() => {
    const grouped: Record<string, RecipeFile[]> = {}
    for (const file of filteredFiles) {
      const parts = file.relativePath.split('/')
      const folder = parts.length > 1 ? parts[0] : '(root)'
      if (!grouped[folder]) grouped[folder] = []
      grouped[folder].push(file)
    }
    return grouped
  }, [filteredFiles])

  // Auto-exit folder view when the active folder disappears from filter results
  useEffect(() => {
    if (currentFolder !== null && !filteredFilesByFolder[currentFolder]) {
      setCurrentFolder(null)
    }
  }, [filteredFilesByFolder, currentFolder])

  // ── CSV export (after filteredFiles is declared) ────────────────────────
  const handleExportCSV = useCallback(() => {
    const rows = filteredFiles.map(f => [
      f.displayName,
      f.price,
      f.option,
      f.status,
      f.lockedBy ?? '',
      f.doneBy ?? '',
      f.assignedToName ?? '',
      f.holidayOverride,
      f.customerOverride,
    ])
    const header = ['Name', 'Price', 'Option', 'Status', 'Locked By', 'Done By', 'Assigned To', 'Holiday', 'Customer']
    const csv = [header, ...rows]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${project?.name ?? 'recipes'}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [filteredFiles, project?.name])

  // ── Progress stats ───────────────────────────────────────────────────────
  const total      = files.length
  const doneCount  = files.filter((f) => f.status === 'done').length
  const inProgress = files.filter((f) => f.status === 'in_progress').length
  const pending    = files.filter((f) => f.status === 'pending').length
  const progressPct = total > 0 ? Math.round((doneCount / total) * 100) : 0

  // ── Early returns ────────────────────────────────────────────────────────
  if (!projectId) {
    return (
      <AppLayout mainClassName="flex-1 overflow-hidden">
        <div className="flex items-center justify-center h-full text-gray-400 text-sm">
          Project not found
        </div>
      </AppLayout>
    )
  }

  if (projectLoading) {
    return (
      <AppLayout mainClassName="flex-1 overflow-hidden">
        <div className="flex items-center justify-center h-full text-gray-400 gap-2">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">Loading project…</span>
        </div>
      </AppLayout>
    )
  }

  if (!project) {
    return (
      <AppLayout mainClassName="flex-1 overflow-hidden">
        <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
          <p className="text-sm">Project not found.</p>
          <button
            onClick={() => navigate('/recipes')}
            className="text-xs underline hover:text-gray-600 dark:hover:text-gray-300"
          >
            Back to projects
          </button>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout mainClassName="flex-1 overflow-hidden">
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shrink-0">
        <h1 className="text-sm font-semibold text-gray-900 dark:text-white truncate flex-1">
          {project.name}
        </h1>

        {/* Presence avatars */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Users size={13} className="text-gray-400" />
          <div className="flex -space-x-1">
            {presence.slice(0, 5).map((p) => (
              <PresenceAvatar key={p.userId} name={p.userName} />
            ))}
            {presence.length > 5 && (
              <div className="h-6 w-6 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-[9px] font-semibold text-gray-500 ring-2 ring-white dark:ring-gray-900">
                +{presence.length - 5}
              </div>
            )}
          </div>
          {presence.length > 0 && (
            <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-0.5">
              {presence.length} online
            </span>
          )}
        </div>

        {/* Refresh scan */}
        <button
          onClick={() => setScanKey((k) => k + 1)}
          disabled={filesLoading}
          title="Re-scan project folder"
          className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 transition-colors shrink-0 disabled:opacity-40"
        >
          <RefreshCw size={13} className={filesLoading ? 'animate-spin' : ''} />
          Refresh
        </button>

        {/* File manager */}
        <button
          onClick={() => setFileManagerOpen(true)}
          title="Browse project files and folders"
          className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 transition-colors shrink-0"
        >
          <FolderOpen size={13} />
          Files &amp; Folders
        </button>

        {/* CSV export */}
        <button
          onClick={handleExportCSV}
          title="Export recipes as CSV"
          className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 transition-colors shrink-0"
        >
          <Download size={13} />
          CSV
        </button>

        {/* Settings */}
        {canEdit && (
          <button
            onClick={() => setSettingsOpen(true)}
            title="Recipe project settings"
            className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 transition-colors shrink-0"
          >
            <Settings size={13} />
            Settings
          </button>
        )}

        {/* Archive */}
        {canEdit && (
          <button
            onClick={handleArchiveProject}
            title="Archive this project"
            className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 border border-red-200 dark:border-red-800 rounded-lg px-2.5 py-1.5 transition-colors shrink-0"
          >
            <Archive size={13} />
            Archive
          </button>
        )}
      </div>

      {/* ── Progress bar + summary cards ── */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 shrink-0">
        {/* Progress bar */}
        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
            <div
              className="h-2 rounded-full bg-green-500 transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 w-10 text-right shrink-0">
            {progressPct}%
          </span>
        </div>

        {/* Summary cards + Deadline */}
        <div className="flex items-start gap-3">
          <div className="grid grid-cols-4 gap-2 flex-1">
            <RecipeProgressCard
              label="Total"
              count={total}
              color="text-gray-700 dark:text-gray-200"
              bgColor="bg-gray-400"
            />
            <RecipeProgressCard
              label="Done"
              count={doneCount}
              color="text-green-600 dark:text-green-400"
              bgColor="bg-green-500"
            />
            <RecipeProgressCard
              label="In Progress"
              count={inProgress}
              color="text-amber-600 dark:text-amber-400"
              bgColor="bg-amber-500"
            />
            <RecipeProgressCard
              label="Pending"
              count={pending}
              color="text-gray-500 dark:text-gray-400"
              bgColor="bg-gray-300 dark:bg-gray-600"
            />
          </div>
          <DeadlineWidget
            dueDate={project.config.dueDate}
            doneCount={doneCount}
            totalCount={total}
            projectCreatedAt={project.createdAt.toDate()}
          />
        </div>
      </div>

      {/* ── Main body: file list + detail panel ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left column: folders + activity ── */}
        <div className="flex flex-col w-2/3 overflow-hidden border-r border-gray-200 dark:border-gray-700">
          {/* File list */}
          <div className="flex-1 overflow-y-auto p-3">
            {/* Search + filters bar */}
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              {/* Search input */}
              <div className="relative flex-1 min-w-[200px]">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search recipes..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border
                            border-gray-200 dark:border-gray-700
                            bg-white dark:bg-gray-800
                            text-gray-900 dark:text-white
                            focus:outline-none focus:border-green-500"
                />
              </div>

              {/* Status filter pills */}
              {(['all', 'pending', 'in_progress', 'done', 'mine'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                    statusFilter === f
                      ? 'bg-green-500 text-white border-green-500'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400'
                  }`}
                >
                  {f === 'all' ? 'All' :
                   f === 'in_progress' ? 'In Progress' :
                   f.charAt(0).toUpperCase() + f.slice(1)}
                  {' '}
                  ({f === 'all' ? files.length :
                    f === 'mine' ? files.filter(file =>
                      file.lockedBy === user?.name || file.doneBy === user?.name || file.assignedTo === user?.uid
                    ).length :
                    files.filter(file => file.status === f).length})
                </button>
              ))}

              {/* Limpiar filtros — solo si hay algo activo */}
              {(searchQuery || statusFilter !== 'all') && (
                <button
                  onClick={() => { setSearchQuery(''); setStatusFilter('all') }}
                  className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline"
                >
                  Clear
                </button>
              )}

              {/* View controls */}
              <div className="ml-auto flex items-center gap-1 shrink-0">
                <button
                  onClick={() => applyFileView('list')}
                  title="List view"
                  className={`p-1.5 rounded transition-colors ${
                    fileViewMode === 'list'
                      ? 'bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white'
                      : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                  }`}
                >
                  <List size={14} />
                </button>
                <button
                  onClick={() => applyFileView('grid')}
                  title="Grid view"
                  className={`p-1.5 rounded transition-colors ${
                    fileViewMode === 'grid'
                      ? 'bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white'
                      : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                  }`}
                >
                  <LayoutGrid size={14} />
                </button>
                {fileViewMode === 'grid' && (
                  <div className="flex items-center ml-1 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                    {(['sm', 'md', 'lg'] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => applyFileGridSize(s)}
                        className={`px-2 py-1 text-[10px] font-medium uppercase transition-colors ${
                          fileGridSize === s
                            ? 'bg-green-500 text-white'
                            : 'bg-white dark:bg-gray-800 text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Bulk action bar */}
            {selectedFileIds.size > 0 && (
              <div className="flex items-center gap-2 mb-3 p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                <CheckSquare size={14} className="text-blue-600 dark:text-blue-400 shrink-0" />
                <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                  {selectedFileIds.size} selected
                </span>
                <div className="flex items-center gap-1.5 ml-auto">
                  {/* Bulk Reopen */}
                  <button
                    disabled={bulkBusy}
                    onClick={handleBulkReopen}
                    className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-amber-300 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-40 transition-colors"
                  >
                    {bulkBusy ? <Loader2 size={12} className="animate-spin" /> : null}
                    Reopen
                  </button>
                  {/* Bulk Done */}
                  {canEdit && (
                    <button
                      disabled={bulkBusy}
                      onClick={handleBulkDone}
                      className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-green-300 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 disabled:opacity-40 transition-colors"
                    >
                      {bulkBusy ? <Loader2 size={12} className="animate-spin" /> : null}
                      Mark Done
                    </button>
                  )}
                  {/* Bulk Assign */}
                  {canEdit && (
                    <div className="relative">
                      <button
                        disabled={bulkBusy}
                        onClick={() => setBulkAssignOpen((v) => !v)}
                        className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors"
                      >
                        Assign to…
                      </button>
                      {bulkAssignOpen && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setBulkAssignOpen(false)} />
                          <div className="absolute right-0 z-20 mt-1 w-44 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg overflow-hidden">
                            <button
                              onClick={() => handleBulkAssign(null, null)}
                              className="w-full px-3 py-2 text-left text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                            >
                              Remove assignment
                            </button>
                            <div className="border-t border-gray-100 dark:border-gray-700" />
                            {users.filter(u => u.status === 'active').map(u => (
                              <button
                                key={u.uid}
                                onClick={() => handleBulkAssign(u.uid, u.name)}
                                className="w-full px-3 py-2 text-left text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                              >
                                {u.name}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  {/* Deselect */}
                  <button
                    onClick={() => setSelectedFileIds(new Set())}
                    className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 ml-1"
                    title="Clear selection"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* Breadcrumb / back button when inside a folder */}
            {currentFolder !== null && (
              <div className="flex items-center gap-2 mb-2 py-1">
                <button
                  onClick={() => setCurrentFolder(null)}
                  className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                >
                  <ChevronLeft size={14} />
                  All folders
                </button>
                <span className="text-gray-300 dark:text-gray-600 text-xs">/</span>
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{currentFolder}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500 ml-0.5">
                  ({(filteredFilesByFolder[currentFolder] ?? []).length})
                </span>
              </div>
            )}

            {/* Mensaje si no hay resultados */}
            {filteredFiles.length === 0 && (searchQuery || statusFilter !== 'all') && (
              <div className="text-center py-8 text-sm text-gray-400 dark:text-gray-500">
                No recipes match your search
              </div>
            )}

            {/* Error banner when project folder not found */}
            {scanError && (
              <div className="mb-4">
                <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20
                                border border-red-200 dark:border-red-800 rounded-lg">
                  <AlertTriangle size={20} className="text-red-500 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-red-800 dark:text-red-200">
                      Project folder not found
                    </p>
                    <p className="text-xs text-red-600 dark:text-red-400 mt-0.5 truncate">
                      {scanError}
                    </p>
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                      Make sure your SharePoint folder is mounted and the path is correct.
                    </p>
                  </div>
                  <button
                    onClick={handleUpdateFolderPath}
                    className="text-xs text-red-700 dark:text-red-300 underline shrink-0"
                  >
                    Update folder path
                  </button>
                </div>
              </div>
            )}

            {filesLoading ? (
              <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
                <Loader2 size={16} className="animate-spin" />
                <span className="text-sm">Scanning files…</span>
              </div>
            ) : Object.keys(filesByFolder).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FolderOpen size={28} className="text-gray-300 dark:text-gray-600 mb-2" />
                <p className="text-sm text-gray-400 dark:text-gray-500">No recipe files found</p>
                <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">
                  Check that the project folder contains .xlsx files
                </p>
              </div>
            ) : currentFolder === null ? (
              /* ── Folder grid ── */
              fileViewMode === 'list' ? (
                Object.entries(filteredFilesByFolder)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([folder, folderFiles]) => (
                    <RecipeFolderSection
                      key={folder}
                      folderName={folder}
                      files={folderFiles}
                      selectedFileId={selectedFile?.id ?? null}
                      currentUserName={user?.name ?? ''}
                      currentUserUid={user?.uid}
                      userRole={user?.role}
                      selectedFileIds={selectedFileIds}
                      onSelectFile={setSelectedFile}
                      onOpenInExcel={handleOpenInExcelForFile}
                      onCheckToggle={toggleCheck}
                    />
                  ))
              ) : (
                <div
                  className="grid gap-2"
                  style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${FOLDER_GRID_MIN[fileGridSize]}, 1fr))` }}
                >
                  {Object.entries(filteredFilesByFolder)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([folder, folderFiles]) => {
                      const allFiles = filesByFolder[folder] ?? folderFiles
                      const doneInFolder = allFiles.filter((f) => f.status === 'done').length
                      return (
                        <FolderExplorerCard
                          key={folder}
                          folderName={folder}
                          done={doneInFolder}
                          total={allFiles.length}
                          size={fileGridSize}
                          onDoubleClick={() => setCurrentFolder(folder)}
                        />
                      )
                    })}
                </div>
              )
            ) : fileViewMode === 'list' ? (
              /* ── File list inside folder ── */
              <RecipeFolderSection
                folderName={currentFolder}
                files={filteredFilesByFolder[currentFolder] ?? []}
                selectedFileId={selectedFile?.id ?? null}
                currentUserName={user?.name ?? ''}
                currentUserUid={user?.uid}
                userRole={user?.role}
                selectedFileIds={selectedFileIds}
                onSelectFile={setSelectedFile}
                onOpenInExcel={handleOpenInExcelForFile}
                onCheckToggle={toggleCheck}
              />
            ) : (
              /* ── File grid inside folder ── */
              <div
                className="grid gap-2"
                style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${FILE_GRID_MIN[fileGridSize]}, 1fr))` }}
              >
                {(filteredFilesByFolder[currentFolder] ?? []).map((file) => (
                  <FileExplorerCard
                    key={file.id}
                    file={file}
                    size={fileGridSize}
                    selected={selectedFile?.id === file.id}
                    checked={selectedFileIds.has(file.id)}
                    currentUserUid={user?.uid}
                    onSelect={() => setSelectedFile(file)}
                    onCheckToggle={() => toggleCheck(file.id)}
                    onDoubleClick={() => handleOpenInExcelForFile(file)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Activity feed */}
          <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 max-h-48 overflow-y-auto">
            <div className="px-3 pt-2 pb-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Activity
              </p>
            </div>
            <RecipeActivityFeed files={files} />
          </div>
        </div>

        {/* ── Right column: detail panel ── */}
        <div className="w-1/3 overflow-y-auto">
          <RecipeDetailPanel
            file={selectedFile}
            project={project}
            settings={settings}
            currentUserName={user?.name ?? ''}
            currentLockToken={currentLock?.lockToken ?? null}
            users={users}
            canEdit={canEdit}
            onClaim={handleClaim}
            onUnclaim={handleUnclaim}
            onMarkDone={handleMarkDone}
            onReopen={handleReopen}
            onOpenInExcel={handleOpenInExcel}
            onAssign={handleAssign}
            onForceUnlock={handleForceUnlock}
          />
        </div>
      </div>

      {/* Settings modal */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-2xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Recipe Settings</h2>
              <button
                onClick={() => setSettingsOpen(false)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {user && <RecipeSettingsTab userId={user.uid} />}
            </div>
          </div>
        </div>
      )}

      {/* File Manager Dialog */}
      <RecipeFileManagerDialog
        isOpen={fileManagerOpen}
        onClose={() => setFileManagerOpen(false)}
        projectName={project.name}
        projectRootPath={project.rootPath}
        projectConfig={project.config}
        lockedFiles={files.filter((f) => f.status === 'in_progress')}
        onFileRenamed={handleFileRenamed}
        onRefresh={() => setScanKey((k) => k + 1)}
      />
    </div>
    </AppLayout>
  )
}

// ── Explorer constants ──────────────────────────────────────────────────────

const FOLDER_GRID_MIN: Record<'sm' | 'md' | 'lg', string> = {
  sm: '100px',
  md: '140px',
  lg: '190px',
}

const FILE_GRID_MIN: Record<'sm' | 'md' | 'lg', string> = {
  sm: '88px',
  md: '120px',
  lg: '160px',
}

// ── FolderExplorerSVG ────────────────────────────────────────────────────────
function FolderExplorerSVG({ color, size = 56 }: { color: string; size?: number }) {
  const h = Math.round(size * 0.75)
  return (
    <svg width={size} height={h} viewBox="0 0 80 60" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="16" width="78" height="43" rx="5" fill={color} opacity="0.2" />
      <path d="M4 16 L4 12 C4 10 6 9 8 9 L28 9 L34 16 Z" fill={color} opacity="0.65" />
      <rect x="1" y="16" width="78" height="43" rx="5" fill={color} opacity="0.8" />
      <rect x="1" y="16" width="78" height="8" rx="0" fill="white" opacity="0.15" />
      <rect x="1" y="16" width="78" height="43" rx="5" stroke={color} strokeWidth="1" strokeOpacity="0.4" />
    </svg>
  )
}

// ── FolderExplorerCard ───────────────────────────────────────────────────────
function FolderExplorerCard({
  folderName, done, total, size, onDoubleClick,
}: {
  folderName: string
  done: number
  total: number
  size: 'sm' | 'md' | 'lg'
  onDoubleClick: () => void
}) {
  const complete = total > 0 && done === total
  const color = complete ? '#1D9E75' : done > 0 ? '#F59E0B' : '#9CA3AF'
  const isSm = size === 'sm'

  return (
    <div
      onDoubleClick={onDoubleClick}
      className="group flex flex-col items-center rounded-xl p-2 cursor-pointer select-none transition-all hover:bg-gray-100 dark:hover:bg-gray-700/60 active:scale-95"
      title={`${folderName} — double-click to open`}
    >
      <FolderExplorerSVG color={color} size={isSm ? 44 : size === 'md' ? 56 : 72} />

      <p
        className={`mt-1.5 font-medium text-center text-gray-800 dark:text-gray-200 leading-tight w-full ${isSm ? 'text-[10px]' : 'text-xs'}`}
        style={{ wordBreak: 'break-word' }}
      >
        {folderName}
      </p>

      {!isSm && (
        <p className={`text-[10px] mt-0.5 ${complete ? 'text-green-500' : 'text-gray-400 dark:text-gray-500'}`}>
          {done}/{total} done
        </p>
      )}

      {size === 'lg' && total > 0 && (
        <div className="w-full mt-1.5 bg-gray-200 dark:bg-gray-700 rounded-full h-1 overflow-hidden">
          <div
            className="h-1 rounded-full transition-all"
            style={{ width: `${Math.round((done / total) * 100)}%`, backgroundColor: color }}
          />
        </div>
      )}
    </div>
  )
}

// ── FileExplorerCard ─────────────────────────────────────────────────────────
function FileExplorerCard({
  file, size, selected, checked, onSelect, onCheckToggle, onDoubleClick,
}: {
  file: import('../../types').RecipeFile
  size: 'sm' | 'md' | 'lg'
  selected: boolean
  checked: boolean
  currentUserUid: string | undefined
  onSelect: () => void
  onCheckToggle: () => void
  onDoubleClick: () => void
}) {
  const isSm = size === 'sm'

  const statusColor: Record<string, string> = {
    pending:      'text-gray-400 dark:text-gray-500',
    in_progress:  'text-amber-500',
    lock_expired: 'text-orange-500',
    done:         'text-green-500',
  }
  const statusDot: Record<string, string> = {
    pending:      'bg-gray-300 dark:bg-gray-600',
    in_progress:  'bg-amber-400',
    lock_expired: 'bg-orange-400',
    done:         'bg-green-500',
  }

  return (
    <div
      onClick={onSelect}
      onDoubleClick={onDoubleClick}
      className={`group relative flex flex-col items-center rounded-xl p-2 cursor-pointer select-none transition-all
        ${selected
          ? 'bg-green-50 dark:bg-green-900/20 ring-2 ring-green-400'
          : 'hover:bg-gray-100 dark:hover:bg-gray-700/60'
        }
        ${file.status === 'done' ? 'opacity-60' : ''}
      `}
    >
      {/* Checkbox top-left */}
      <div
        className={`absolute top-1.5 left-1.5 transition-opacity z-10 ${checked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
        onClick={(e) => { e.stopPropagation(); onCheckToggle() }}
      >
        <div className={`h-4 w-4 rounded border-2 flex items-center justify-center text-white text-[9px] transition-colors ${
          checked ? 'bg-green-500 border-green-500' : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'
        }`}>
          {checked && '✓'}
        </div>
      </div>

      {/* Excel icon */}
      <div className={`flex items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30 ${
        isSm ? 'w-9 h-9' : size === 'md' ? 'w-11 h-11' : 'w-14 h-14'
      }`}>
        <svg viewBox="0 0 24 24" className={isSm ? 'w-5 h-5' : 'w-6 h-6'} fill="none">
          <rect x="2" y="2" width="20" height="20" rx="3" fill="#217346" />
          <path d="M7 8l2.5 4L7 16h2l1.5-2.5L12 16h2l-2.5-4L14 8h-2l-1.5 2.5L9 8H7z" fill="white" />
          <rect x="13" y="8" width="1" height="8" fill="white" opacity="0.5" />
          <rect x="14" y="8" width="4" height="8" rx="1" fill="white" opacity="0.2" />
        </svg>
      </div>

      {/* Name */}
      <p
        className={`mt-1.5 font-medium text-center text-gray-800 dark:text-gray-200 leading-tight w-full ${isSm ? 'text-[9px]' : 'text-[10px]'}`}
        style={{ wordBreak: 'break-word', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as React.CSSProperties}
      >
        {file.displayName}
      </p>

      {/* Status — md and lg */}
      {!isSm && (
        <div className={`flex items-center gap-1 mt-1 ${statusColor[file.status] ?? 'text-gray-400'}`}>
          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot[file.status] ?? 'bg-gray-300'}`} />
          <span className="text-[9px] capitalize leading-none">{file.status.replace('_', ' ')}</span>
        </div>
      )}

      {/* Assignee — lg only */}
      {size === 'lg' && file.assignedToName && (
        <p className="text-[9px] text-gray-400 dark:text-gray-500 mt-0.5 truncate w-full text-center">
          {file.assignedToName}
        </p>
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

function PresenceAvatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  // Simple deterministic color from name
  const colors = [
    'bg-blue-500', 'bg-purple-500', 'bg-rose-500',
    'bg-teal-500', 'bg-orange-500', 'bg-indigo-500',
  ]
  const color = colors[name.charCodeAt(0) % colors.length]

  return (
    <div
      title={name}
      className={`h-6 w-6 rounded-full ${color} flex items-center justify-center text-[9px] font-bold text-white ring-2 ring-white dark:ring-gray-900`}
    >
      {initials}
    </div>
  )
}
