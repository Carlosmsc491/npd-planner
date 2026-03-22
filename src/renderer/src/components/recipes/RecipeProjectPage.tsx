// src/renderer/src/components/recipes/RecipeProjectPage.tsx
// Full project window: file list, locks, presence, progress, detail panel

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import {
  checkAndExpireLocks,
  markRecipeDone,
  reopenRecipeFile,
  updatePresence,
  removePresence,
  subscribeToRecipePresence,
  getRecipeSettings,
  initDefaultRecipeSettings,
} from '../../lib/recipeFirestore'
import { useAuthStore } from '../../store/authStore'
import { useRecipeLock } from '../../hooks/useRecipeLock'
import { useRecipeFiles } from '../../hooks/useRecipeFiles'
import RecipeDetailPanel from './RecipeDetailPanel'
import RecipeFolderSection from './RecipeFolderSection'
import RecipeProgressCard from './RecipeProgressCard'
import RecipeActivityFeed from './RecipeActivityFeed'
import type { RecipeProject, RecipeFile, RecipePresence, RecipeSettings } from '../../types'
import { ArrowLeft, FolderOpen, Loader2, Users, RefreshCw } from 'lucide-react'

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

  const { currentLock, claimFile, unclaimFile } = useRecipeLock()
  const { files, filesByFolder, isLoading: filesLoading } = useRecipeFiles(
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

  // ── Progress stats ───────────────────────────────────────────────────────
  const total      = files.length
  const doneCount  = files.filter((f) => f.status === 'done').length
  const inProgress = files.filter((f) => f.status === 'in_progress').length
  const pending    = files.filter((f) => f.status === 'pending').length
  const progressPct = total > 0 ? Math.round((doneCount / total) * 100) : 0

  // ── Early returns ────────────────────────────────────────────────────────
  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        Project not found
      </div>
    )
  }

  if (projectLoading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 gap-2">
        <Loader2 size={18} className="animate-spin" />
        <span className="text-sm">Loading project…</span>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
        <p className="text-sm">Project not found.</p>
        <button
          onClick={() => navigate('/recipes')}
          className="text-xs underline hover:text-gray-600 dark:hover:text-gray-300"
        >
          Back to projects
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shrink-0">
        <button
          onClick={() => navigate('/recipes')}
          className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        >
          <ArrowLeft size={14} />
          Projects
        </button>

        <span className="text-gray-300 dark:text-gray-600">/</span>

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

        {/* Open root folder */}
        <button
          onClick={() => window.electronAPI.recipeOpenInExcel(project.rootPath)}
          title="Open project folder"
          className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 transition-colors shrink-0"
        >
          <FolderOpen size={13} />
          Files &amp; Folders
        </button>
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

        {/* Summary cards */}
        <div className="grid grid-cols-4 gap-2">
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
      </div>

      {/* ── Main body: file list + detail panel ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left column: folders + activity ── */}
        <div className="flex flex-col w-2/3 overflow-hidden border-r border-gray-200 dark:border-gray-700">
          {/* File list */}
          <div className="flex-1 overflow-y-auto p-3">
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
            ) : (
              Object.entries(filesByFolder)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([folder, folderFiles]) => (
                  <RecipeFolderSection
                    key={folder}
                    folderName={folder}
                    files={folderFiles}
                    selectedFileId={selectedFile?.id ?? null}
                    currentUserName={user?.name ?? ''}
                    onSelectFile={setSelectedFile}
                    onOpenInExcel={handleOpenInExcelForFile}
                  />
                ))
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
            onClaim={handleClaim}
            onUnclaim={handleUnclaim}
            onMarkDone={handleMarkDone}
            onReopen={handleReopen}
            onOpenInExcel={handleOpenInExcel}
          />
        </div>
      </div>
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
