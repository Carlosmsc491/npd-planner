import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import Fuse from 'fuse.js'
import { Search, X, Clock } from 'lucide-react'
import { subscribeToAllTasks } from '../../lib/firestore'
import { useBoardStore } from '../../store/boardStore'
import { useSettingsStore } from '../../store/settingsStore'
import { getBoardColor } from '../../utils/colorUtils'
import { formatDate } from '../../utils/dateUtils'
import type { Task } from '../../types'

const LS_KEY = 'npd:recent_searches'

function loadRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') } catch { return [] }
}
function saveRecent(taskId: string) {
  const cur = loadRecent().filter((id) => id !== taskId)
  localStorage.setItem(LS_KEY, JSON.stringify([taskId, ...cur].slice(0, 5)))
}

interface Props {
  onClose: () => void
}

export default function GlobalSearch({ onClose }: Props) {
  const navigate = useNavigate()
  const { boards } = useBoardStore()
  const { clients } = useSettingsStore()
  const [query, setQuery] = useState('')
  const [allTasks, setAllTasks] = useState<Task[]>([])
  const [recentIds, setRecentIds] = useState<string[]>(loadRecent)
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Subscribe to all tasks across all boards
  useEffect(() => {
    if (boards.length === 0) return
    const unsub = subscribeToAllTasks(boards.map((b) => b.id), setAllTasks)
    return unsub
  }, [boards])

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Fuse index over all tasks
  const fuse = useMemo(() => new Fuse(allTasks, {
    keys: ['title', 'notes', 'description', 'poNumber'],
    threshold: 0.35,
    minMatchCharLength: 1,
  }), [allTasks])

  // Search results — also match client names
  const results = useMemo(() => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    const byFuse = fuse.search(query).map((r) => r.item)
    const byClient = allTasks.filter((t) => {
      const c = clients.find((x) => x.id === t.clientId)
      return c?.name.toLowerCase().includes(q)
    })
    const seen = new Set<string>()
    return [...byFuse, ...byClient].filter((t) => {
      if (seen.has(t.id)) return false
      seen.add(t.id)
      return true
    }).slice(0, 10)
  }, [query, fuse, allTasks, clients])

  const recentTasks = useMemo(
    () => recentIds.map((id) => allTasks.find((t) => t.id === id)).filter(Boolean) as Task[],
    [recentIds, allTasks]
  )

  function handleSelect(task: Task) {
    saveRecent(task.id)
    setRecentIds(loadRecent())
    onClose()
    navigate(`/task/${task.id}`)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    const list = query.trim() ? results : recentTasks
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((s) => Math.min(s + 1, list.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)) }
    if (e.key === 'Enter' && list[selected]) handleSelect(list[selected])
  }

  const showResults = query.trim().length > 0
  const showRecent  = !showResults && recentTasks.length > 0
  const listItems   = showResults ? results : (showRecent ? recentTasks : [])

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[14vh] bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl mx-4 rounded-2xl bg-white dark:bg-gray-800 shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <Search size={18} className="text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(0) }}
            onKeyDown={handleKeyDown}
            placeholder="Search tasks, clients, AWB…"
            className="flex-1 bg-transparent text-base text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
              <X size={16} />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center rounded border border-gray-200 dark:border-gray-600 px-1.5 py-0.5 text-[10px] text-gray-400 font-mono">Esc</kbd>
        </div>

        {/* Section label for recent */}
        {showRecent && (
          <div className="flex items-center gap-1.5 px-4 pt-2 pb-0.5">
            <Clock size={11} className="text-gray-400" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Recent</span>
          </div>
        )}

        {/* Results */}
        <div className="max-h-[400px] overflow-y-auto">
          {showResults && results.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-gray-400">No results for "{query}"</p>
          )}
          {!showResults && !showRecent && (
            <p className="px-4 py-10 text-center text-sm text-gray-400">Type to search tasks and clients…</p>
          )}
          {listItems.map((task, i) => {
            const board  = boards.find((b) => b.id === task.boardId)
            const client = clients.find((c) => c.id === task.clientId)
            const color  = getBoardColor(board)
            const isActive = i === selected
            return (
              <button
                key={task.id}
                onClick={() => handleSelect(task)}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left border-b border-gray-100 dark:border-gray-700/40 last:border-0 transition-colors ${
                  isActive ? 'bg-green-50 dark:bg-green-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{task.title}</p>
                  {client && <p className="text-xs text-gray-400 truncate">{client.name}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {board && (
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white" style={{ backgroundColor: color }}>
                      {board.name}
                    </span>
                  )}
                  {task.dateEnd && (
                    <span className="text-[10px] text-gray-400">{formatDate(task.dateEnd)}</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <span className="text-[10px] text-gray-400">{allTasks.length} tasks indexed</span>
          <span className="text-[10px] text-gray-400">↑↓ navigate · ↵ open</span>
        </div>
      </div>
    </div>
  )
}
