// src/renderer/src/components/recipes/RecipeFileManagerDialog.tsx
// Full project file explorer — browse, create, rename, delete files and folders

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  X, FolderOpen, File, FileSpreadsheet, ChevronRight,
  FolderPlus, FilePlus, ExternalLink, Loader2, Pencil, Trash2,
} from 'lucide-react'
import { nanoid } from 'nanoid'
import { useTaskStore } from '../../store/taskStore'
import type { RecipeFSEntry, RecipeProjectConfig, RecipeFile } from '../../types'

interface Props {
  isOpen: boolean
  onClose: () => void
  projectName: string
  projectRootPath: string
  projectConfig: RecipeProjectConfig
  lockedFiles: RecipeFile[]    // to prevent deleting locked files
  onFileRenamed: (oldPath: string, newPath: string) => void
  onRefresh: () => void        // tells RecipeProjectPage to re-scan
}

type ConfirmState = { type: 'delete'; entry: RecipeFSEntry } | null
type NewFileDialogState = { name: string; error: string | null; saving: boolean } | null

export default function RecipeFileManagerDialog({
  isOpen,
  onClose,
  projectName,
  projectRootPath,
  projectConfig,
  lockedFiles,
  onFileRenamed,
  onRefresh,
}: Props) {
  const setToast = useTaskStore((s) => s.setToast)

  const [currentPath, setCurrentPath] = useState(projectRootPath)
  const [entries, setEntries] = useState<RecipeFSEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [folderError, setFolderError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedEntry, setSelectedEntry] = useState<RecipeFSEntry | null>(null)

  // Inline rename state: entryFullPath → new name
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renameError, setRenameError] = useState<string | null>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  // New folder inline state
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [newFolderError, setNewFolderError] = useState<string | null>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  // New recipe file mini-dialog
  const [newFileDialog, setNewFileDialog] = useState<NewFileDialogState>(null)

  // Confirm delete
  const [confirm, setConfirm] = useState<ConfirmState>(null)

  // ── Load folder ────────────────────────────────────────────────────────

  const loadFolder = useCallback(async (folderPath: string) => {
    setLoading(true)
    setFolderError(null)
    setRenamingPath(null)
    setCreatingFolder(false)
    try {
      const raw = await window.electronAPI.recipeListFolder(folderPath)
      const mapped: RecipeFSEntry[] = raw.map((e) => ({
        ...e,
        modifiedAt: new Date(e.modifiedAt),
      }))
      setEntries(mapped)
    } catch {
      setFolderError(`Cannot access folder: ${folderPath}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isOpen) return
    setCurrentPath(projectRootPath)
    setSearch('')
    loadFolder(projectRootPath)
  }, [isOpen, projectRootPath, loadFolder])

  useEffect(() => {
    if (isOpen) loadFolder(currentPath)
  }, [currentPath]) // eslint-disable-line react-hooks/exhaustive-deps

  // Focus rename input when opened
  useEffect(() => {
    if (renamingPath && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [renamingPath])

  // Focus new folder input
  useEffect(() => {
    if (creatingFolder && folderInputRef.current) {
      folderInputRef.current.focus()
    }
  }, [creatingFolder])

  // ── Breadcrumb ────────────────────────────────────────────────────────

  function buildBreadcrumbs(): Array<{ label: string; path: string }> {
    const root = projectRootPath.replace(/\\/g, '/')
    const cur  = currentPath.replace(/\\/g, '/')
    const crumbs: Array<{ label: string; path: string }> = [
      { label: projectName, path: projectRootPath },
    ]
    if (cur === root) return crumbs

    const rel = cur.startsWith(root) ? cur.slice(root.length + 1) : cur
    let built = projectRootPath
    for (const part of rel.split('/').filter(Boolean)) {
      built = `${built}\\${part}`
      crumbs.push({ label: part, path: built })
    }
    return crumbs
  }

  // ── Navigate ─────────────────────────────────────────────────────────

  function navigateTo(folderPath: string) {
    setCurrentPath(folderPath)
    setSelectedEntry(null)
    setSearch('')
  }

  // ── New folder ────────────────────────────────────────────────────────

  async function confirmNewFolder() {
    const name = newFolderName.trim()
    if (!name) { setCreatingFolder(false); setNewFolderName(''); return }
    const already = entries.some((e) => e.isDirectory && e.name.toLowerCase() === name.toLowerCase())
    if (already) { setNewFolderError('A folder with that name already exists'); return }

    const fullPath = `${currentPath}\\${name}`
    const result = await window.electronAPI.recipeCreateFolder(fullPath)
    if (result.success) {
      setCreatingFolder(false)
      setNewFolderName('')
      setNewFolderError(null)
      await loadFolder(currentPath)
    } else {
      setNewFolderError('Could not create folder')
    }
  }

  // ── New recipe file from template ─────────────────────────────────────

  async function confirmNewFile() {
    if (!newFileDialog) return
    const name = newFileDialog.name.trim()
    if (!name) return
    setNewFileDialog((s) => s ? { ...s, saving: true, error: null } : s)

    const result = await window.electronAPI.recipeCreateFileFromTemplate(
      projectConfig.templatePath,
      currentPath,
      name
    )
    if (result.success) {
      setNewFileDialog(null)
      setToast({ id: nanoid(), message: 'Recipe file created', type: 'success' })
      await loadFolder(currentPath)
      onRefresh()
    } else {
      setNewFileDialog((s) => s ? { ...s, saving: false, error: result.error ?? 'Could not create file' } : s)
    }
  }

  // ── Rename ────────────────────────────────────────────────────────────

  function startRename(entry: RecipeFSEntry) {
    const nameWithoutExt = entry.isDirectory
      ? entry.name
      : entry.name.replace(/\.xlsx$/i, '')
    setRenamingPath(entry.fullPath)
    setRenameValue(nameWithoutExt)
    setRenameError(null)
  }

  async function confirmRename() {
    if (!renamingPath) return
    const entry = entries.find((e) => e.fullPath === renamingPath)
    if (!entry) { setRenamingPath(null); return }

    const newName = entry.isDirectory
      ? renameValue.trim()
      : renameValue.trim().endsWith('.xlsx')
        ? renameValue.trim()
        : `${renameValue.trim()}.xlsx`

    if (!newName || newName === entry.name) { setRenamingPath(null); return }

    const dir = currentPath
    const newFullPath = `${dir}\\${newName}`
    const result = await window.electronAPI.recipeRenameItem(entry.fullPath, newFullPath)

    if (!result.success) {
      setRenameError(result.error ?? 'Rename failed')
      return
    }

    // Notify parent to update Firestore if it was an xlsx
    if (!entry.isDirectory && entry.name.endsWith('.xlsx')) {
      onFileRenamed(entry.fullPath, newFullPath)
    }
    setRenamingPath(null)
    await loadFolder(currentPath)
    onRefresh()
  }

  function cancelRename() {
    setRenamingPath(null)
    setRenameError(null)
  }

  // ── Delete ────────────────────────────────────────────────────────────

  async function executeDelete(entry: RecipeFSEntry) {
    // Block if file has an active lock in Firestore
    if (!entry.isDirectory) {
      const locked = lockedFiles.find(
        (f) => f.status === 'in_progress' && entry.fullPath.endsWith(f.relativePath.replace(/\//g, '\\'))
      )
      if (locked) {
        setToast({
          id: nanoid(),
          message: `This recipe is currently locked by ${locked.lockedBy ?? 'another user'}`,
          type: 'error',
        })
        setConfirm(null)
        return
      }
    }

    const result = await window.electronAPI.recipeDeleteItem(entry.fullPath)
    if (result.success) {
      setToast({ id: nanoid(), message: `${entry.name} deleted`, type: 'info' })
      setConfirm(null)
      setSelectedEntry(null)
      await loadFolder(currentPath)
      onRefresh()
    } else {
      setToast({ id: nanoid(), message: result.error ?? 'Delete failed', type: 'error' })
      setConfirm(null)
    }
  }

  // ── Filtered list ─────────────────────────────────────────────────────

  const filtered = search.trim()
    ? entries.filter((e) => e.name.toLowerCase().includes(search.toLowerCase()))
    : entries

  if (!isOpen) return null

  const breadcrumbs = buildBreadcrumbs()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative z-10 flex flex-col bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-4xl h-[80vh]">

        {/* ── Header ── */}
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-gray-200 dark:border-gray-700 shrink-0">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1 text-sm min-w-0 flex-1">
            {breadcrumbs.map((crumb, i) => (
              <span key={crumb.path} className="flex items-center gap-1 min-w-0">
                {i > 0 && <ChevronRight size={13} className="text-gray-300 dark:text-gray-600 shrink-0" />}
                <button
                  onClick={() => navigateTo(crumb.path)}
                  className={`truncate transition-colors ${
                    i === breadcrumbs.length - 1
                      ? 'font-semibold text-gray-900 dark:text-white cursor-default'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  {crumb.label}
                </button>
              </span>
            ))}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors shrink-0">
            <X size={18} />
          </button>
        </div>

        {/* ── Toolbar ── */}
        <div className="flex items-center gap-2 px-5 py-2.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 shrink-0 flex-wrap">
          <button
            onClick={() => { setCreatingFolder(true); setNewFolderName(''); setNewFolderError(null) }}
            className="flex items-center gap-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-600 px-3 py-1.5 text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 transition-colors"
          >
            <FolderPlus size={13} />
            New Folder
          </button>

          <button
            onClick={() => setNewFileDialog({ name: '', error: null, saving: false })}
            className="flex items-center gap-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-600 px-3 py-1.5 text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 transition-colors"
          >
            <FilePlus size={13} />
            New Recipe File
          </button>

          <button
            onClick={() => window.electronAPI.recipeOpenInExcel(currentPath)}
            className="flex items-center gap-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-600 px-3 py-1.5 text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 transition-colors"
          >
            <ExternalLink size={13} />
            Open in Explorer
          </button>

          <div className="flex-1" />

          <input
            type="text"
            placeholder="Filter by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-xs text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-green-500 w-44"
          />
        </div>

        {/* ── File list ── */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <SkeletonRows />
          ) : folderError ? (
            <div className="m-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-600 dark:text-red-400">
              {folderError}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-gray-100 dark:border-gray-800">
                  {['Name', 'Type', 'Size', 'Modified', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                {/* New folder inline row */}
                {creatingFolder && (
                  <tr className="bg-blue-50 dark:bg-blue-900/10">
                    <td className="px-4 py-2" colSpan={5}>
                      <div className="flex items-center gap-2">
                        <FolderOpen size={15} className="text-blue-500 shrink-0" />
                        <input
                          ref={folderInputRef}
                          value={newFolderName}
                          onChange={(e) => { setNewFolderName(e.target.value); setNewFolderError(null) }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') confirmNewFolder()
                            if (e.key === 'Escape') { setCreatingFolder(false); setNewFolderName('') }
                          }}
                          onBlur={confirmNewFolder}
                          placeholder="Folder name…"
                          className="flex-1 rounded border border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-800 px-2 py-1 text-sm text-gray-900 dark:text-white focus:outline-none"
                        />
                        {newFolderError && (
                          <span className="text-xs text-red-500">{newFolderError}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                )}

                {filtered.length === 0 && !creatingFolder && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-400 dark:text-gray-500">
                      {search ? 'No files match your search' : 'This folder is empty'}
                    </td>
                  </tr>
                )}

                {filtered.map((entry) => (
                  <EntryRow
                    key={entry.fullPath}
                    entry={entry}
                    isSelected={selectedEntry?.fullPath === entry.fullPath}
                    isRenaming={renamingPath === entry.fullPath}
                    renameValue={renameValue}
                    renameError={renameError}
                    renameInputRef={renameInputRef}
                    onSelect={() => setSelectedEntry(entry)}
                    onNavigate={() => navigateTo(entry.fullPath)}
                    onRenameChange={(v) => { setRenameValue(v); setRenameError(null) }}
                    onRenameConfirm={confirmRename}
                    onRenameCancel={cancelRename}
                    onStartRename={() => startRename(entry)}
                    onConfirmDelete={() => setConfirm({ type: 'delete', entry })}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Count bar ── */}
        {!loading && !folderError && (
          <div className="px-5 py-2 border-t border-gray-100 dark:border-gray-800 text-[11px] text-gray-400 dark:text-gray-500 shrink-0">
            {filtered.length} item{filtered.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* ── New Recipe File mini-dialog ── */}
      {newFileDialog !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0" onClick={() => setNewFileDialog(null)} />
          <div className="relative z-10 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 p-5 w-80">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">New Recipe File</h3>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">File name</label>
            <input
              autoFocus
              type="text"
              value={newFileDialog.name}
              onChange={(e) => setNewFileDialog((s) => s ? { ...s, name: e.target.value, error: null } : s)}
              onKeyDown={(e) => { if (e.key === 'Enter') confirmNewFile() }}
              placeholder="e.g. $12.99 A VALENTINE"
              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-green-500 mb-1"
            />
            {newFileDialog.name.trim() && (
              <p className="text-[10px] text-gray-400 mb-2">
                Final name: <span className="font-mono font-medium">{newFileDialog.name.trim()}.xlsx</span>
              </p>
            )}
            {newFileDialog.error && (
              <p className="text-xs text-red-500 mb-2">{newFileDialog.error}</p>
            )}
            <div className="flex gap-2 justify-end mt-3">
              <button
                onClick={() => setNewFileDialog(null)}
                className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmNewFile}
                disabled={!newFileDialog.name.trim() || newFileDialog.saving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-green-500 text-white font-semibold hover:bg-green-600 disabled:opacity-50 transition-colors"
              >
                {newFileDialog.saving && <Loader2 size={11} className="animate-spin" />}
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirmation ── */}
      {confirm?.type === 'delete' && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0" onClick={() => setConfirm(null)} />
          <div className="relative z-10 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 p-5 w-80">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
              {confirm.entry.isDirectory ? 'Delete folder?' : 'Delete file?'}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              {confirm.entry.isDirectory
                ? `Delete folder "${confirm.entry.name}" and all its contents? This cannot be undone.`
                : `Delete "${confirm.entry.name}"? This cannot be undone.`}
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirm(null)}
                className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => executeDelete(confirm.entry)}
                className="px-3 py-1.5 text-xs rounded-lg bg-red-500 text-white font-semibold hover:bg-red-600 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── EntryRow ───────────────────────────────────────────────────────────────

function EntryRow({
  entry,
  isSelected,
  isRenaming,
  renameValue,
  renameError,
  renameInputRef,
  onSelect,
  onNavigate,
  onRenameChange,
  onRenameConfirm,
  onRenameCancel,
  onStartRename,
  onConfirmDelete,
}: {
  entry: RecipeFSEntry
  isSelected: boolean
  isRenaming: boolean
  renameValue: string
  renameError: string | null
  renameInputRef: React.RefObject<HTMLInputElement>
  onSelect: () => void
  onNavigate: () => void
  onRenameChange: (v: string) => void
  onRenameConfirm: () => void
  onRenameCancel: () => void
  onStartRename: () => void
  onConfirmDelete: () => void
}) {
  const Icon = entry.isDirectory
    ? FolderOpen
    : entry.name.endsWith('.xlsx')
    ? FileSpreadsheet
    : File

  const iconColor = entry.isDirectory
    ? 'text-amber-500'
    : entry.name.endsWith('.xlsx')
    ? 'text-green-500'
    : 'text-gray-400'

  const typeLabel = entry.isDirectory
    ? 'Folder'
    : entry.name.endsWith('.xlsx')
    ? 'Excel File'
    : 'File'

  return (
    <tr
      onClick={onSelect}
      onDoubleClick={() => { if (entry.isDirectory) onNavigate() }}
      className={`cursor-pointer transition-colors ${
        isSelected
          ? 'bg-green-50 dark:bg-green-900/10'
          : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
      }`}
    >
      {/* Name */}
      <td className="px-4 py-2 min-w-0">
        <div className="flex items-center gap-2">
          <Icon size={15} className={`shrink-0 ${iconColor}`} />
          {isRenaming ? (
            <div className="flex items-center gap-1.5 flex-1">
              <input
                ref={renameInputRef}
                value={renameValue}
                onChange={(e) => onRenameChange(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Enter') onRenameConfirm()
                  if (e.key === 'Escape') onRenameCancel()
                }}
                onBlur={onRenameConfirm}
                className="flex-1 rounded border border-green-400 dark:border-green-600 bg-white dark:bg-gray-800 px-2 py-0.5 text-sm text-gray-900 dark:text-white focus:outline-none"
                onClick={(e) => e.stopPropagation()}
              />
              {!entry.isDirectory && (
                <span className="text-xs text-gray-400">.xlsx</span>
              )}
              {renameError && (
                <span className="text-xs text-red-500 whitespace-nowrap">{renameError}</span>
              )}
            </div>
          ) : (
            <span
              className={`text-sm text-gray-800 dark:text-gray-200 truncate ${
                entry.isDirectory ? 'font-medium' : ''
              }`}
            >
              {entry.name}
            </span>
          )}
        </div>
      </td>

      {/* Type */}
      <td className="px-4 py-2 text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
        {typeLabel}
      </td>

      {/* Size */}
      <td className="px-4 py-2 text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
        {entry.isDirectory ? '—' : formatSize(entry.size)}
      </td>

      {/* Modified */}
      <td className="px-4 py-2 text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
        {entry.modifiedAt.toLocaleDateString()}
      </td>

      {/* Actions */}
      <td className="px-4 py-2">
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onStartRename}
            title="Rename"
            className="rounded p-1 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={onConfirmDelete}
            title="Delete"
            className="rounded p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </td>
    </tr>
  )
}

// ── SkeletonRows ───────────────────────────────────────────────────────────

function SkeletonRows() {
  return (
    <table className="w-full">
      <tbody>
        {[1, 2, 3, 4, 5].map((i) => (
          <tr key={i} className="border-b border-gray-50 dark:border-gray-800">
            <td className="px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 rounded bg-gray-200 dark:bg-gray-700 animate-pulse shrink-0" />
                <div className="h-3.5 w-48 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
              </div>
            </td>
            <td className="px-4 py-3"><div className="h-3 w-16 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" /></td>
            <td className="px-4 py-3"><div className="h-3 w-12 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" /></td>
            <td className="px-4 py-3"><div className="h-3 w-20 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" /></td>
            <td className="px-4 py-3"><div className="h-3 w-16 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
