// src/renderer/src/components/recipes/RecipeHomePage.tsx
// Project list with filters, search, and navigation

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, FolderOpen, Loader2 } from 'lucide-react'
import { subscribeToRecipeProjects } from '../../lib/recipeFirestore'
import { useRecipeStore } from '../../store/recipeStore'
import type { RecipeProject } from '../../types'
import { Timestamp } from 'firebase/firestore'

type FilterStatus = 'all' | 'active' | 'completed' | 'archived'

const FILTER_LABELS: FilterStatus[] = ['all', 'active', 'completed', 'archived']

export default function RecipeHomePage() {
  const { projects, setProjects } = useRecipeStore()
  const [filter, setFilter] = useState<FilterStatus>('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    const unsub = subscribeToRecipeProjects((data) => {
      setProjects(data)
      setLoading(false)
    })
    return unsub
  }, [setProjects])

  const filtered = projects.filter((p) => {
    if (filter !== 'all' && p.status !== filter) return false
    if (search.trim() && !p.name.toLowerCase().includes(search.trim().toLowerCase())) return false
    return true
  })

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">NPD Projects</h1>
        <button
          onClick={() => navigate('/recipes/new')}
          className="flex items-center gap-2 rounded-lg bg-green-500 px-4 py-2 text-sm font-semibold text-white hover:bg-green-600 transition-colors"
        >
          <Plus size={15} />
          New Project
        </button>
      </div>

      {/* Filters + Search */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="flex gap-1 flex-wrap">
          {FILTER_LABELS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors capitalize ${
                filter === f
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search projects…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-green-500"
        />
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-24 text-gray-400">
          <Loader2 size={22} className="animate-spin mr-2" />
          <span className="text-sm">Loading projects…</span>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState hasSearch={search.length > 0 || filter !== 'all'} onNew={() => navigate('/recipes/new')} />
      ) : (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  Name
                </th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  Location
                </th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  Status
                </th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {filtered.map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  onClick={() => navigate(`/recipes/${project.id}`)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────

function ProjectRow({
  project,
  onClick,
}: {
  project: RecipeProject
  onClick: () => void
}) {
  return (
    <tr
      onClick={onClick}
      className="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <FolderOpen size={15} className="text-green-500 shrink-0" />
          <span className="font-medium text-gray-900 dark:text-white">{project.name}</span>
        </div>
      </td>
      <td className="px-4 py-3 max-w-xs">
        <span className="text-xs font-mono text-gray-400 dark:text-gray-500 truncate block" title={project.rootPath}>
          {project.rootPath}
        </span>
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={project.status} />
      </td>
      <td className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500">
        {formatTimestamp(project.createdAt)}
      </td>
    </tr>
  )
}

function StatusBadge({ status }: { status: RecipeProject['status'] }) {
  const styles: Record<RecipeProject['status'], string> = {
    active:    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    completed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    archived:  'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  }
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${styles[status]}`}>
      {status}
    </span>
  )
}

function EmptyState({ hasSearch, onNew }: { hasSearch: boolean; onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <FolderOpen size={40} className="text-gray-300 dark:text-gray-600 mb-3" />
      {hasSearch ? (
        <>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No projects match your search</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Try a different term or filter</p>
        </>
      ) : (
        <>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No NPD projects yet</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Create your first project to get started</p>
          <button
            onClick={onNew}
            className="mt-4 flex items-center gap-2 rounded-lg bg-green-500 px-4 py-2 text-sm font-semibold text-white hover:bg-green-600 transition-colors"
          >
            <Plus size={14} />
            Create Project
          </button>
        </>
      )}
    </div>
  )
}

function formatTimestamp(ts: Timestamp | null | undefined): string {
  if (!ts) return '—'
  try {
    const d = ts instanceof Timestamp ? ts.toDate() : new Date((ts as { seconds: number }).seconds * 1000)
    return d.toLocaleDateString()
  } catch {
    return '—'
  }
}
