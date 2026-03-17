// src/renderer/src/components/search/GlobalSearch.tsx
// Global fuzzy search modal — triggered by Ctrl+K / Cmd+K

import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Fuse from 'fuse.js'
import { Search, FileText, Building2, X } from 'lucide-react'
import { useTaskStore } from '../../store/taskStore'
import { useSettingsStore } from '../../store/settingsStore'
import type { SearchResult } from '../../types'

interface Props {
  onClose: () => void
}

export default function GlobalSearch({ onClose }: Props) {
  const navigate = useNavigate()
  const { tasks } = useTaskStore()
  const { clients } = useSettingsStore()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Close on Escape
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const search = useCallback(
    (q: string) => {
      if (!q.trim()) {
        setResults([])
        return
      }

      // Build searchable items
      const taskItems = tasks.map((t) => ({
        type: 'task' as const,
        id: t.id,
        title: t.title,
        subtitle: t.notes ? t.notes.slice(0, 60) : '',
        boardId: t.boardId,
      }))

      const clientItems = clients.map((c) => ({
        type: 'client' as const,
        id: c.id,
        title: c.name,
        subtitle: 'Client',
      }))

      const allItems = [...taskItems, ...clientItems]

      const fuse = new Fuse(allItems, {
        keys: ['title', 'subtitle'],
        threshold: 0.35,
        includeScore: true,
      })

      const raw = fuse.search(q).slice(0, 10)
      setResults(raw.map((r) => r.item))
      setSelected(0)
    },
    [tasks, clients]
  )

  useEffect(() => {
    search(query)
  }, [query, search])

  function handleSelect(result: SearchResult) {
    onClose()
    if (result.type === 'task') {
      navigate(`/task/${result.id}`)
    }
    // Clients don't have a dedicated page yet
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((s) => Math.min(s + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((s) => Math.max(s - 1, 0))
    } else if (e.key === 'Enter' && results[selected]) {
      handleSelect(results[selected])
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          <Search size={16} className="shrink-0 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search tasks, clients…"
            className="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 focus:outline-none dark:text-white dark:placeholder-gray-500"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <X size={14} />
            </button>
          )}
          <kbd className="shrink-0 rounded border border-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-400 dark:border-gray-600">
            ESC
          </kbd>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <ul className="max-h-72 overflow-y-auto py-1">
            {results.map((r, i) => (
              <li key={`${r.type}-${r.id}`}>
                <button
                  onClick={() => handleSelect(r)}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    i === selected
                      ? 'bg-green-50 dark:bg-green-900/20'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }`}
                >
                  <span className={`shrink-0 ${i === selected ? 'text-green-500' : 'text-gray-400'}`}>
                    {r.type === 'task' ? <FileText size={15} /> : <Building2 size={15} />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                      {r.title}
                    </p>
                    {r.subtitle && (
                      <p className="truncate text-xs text-gray-400 dark:text-gray-500">
                        {r.subtitle}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 rounded-full border border-gray-200 px-2 py-0.5 text-[10px] text-gray-400 dark:border-gray-700">
                    {r.type}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {query && results.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-gray-400 dark:text-gray-500">
            No results for &ldquo;{query}&rdquo;
          </div>
        )}

        {!query && (
          <div className="px-4 py-4 text-center text-xs text-gray-400 dark:text-gray-500">
            Type to search tasks and clients
          </div>
        )}
      </div>
    </div>
  )
}
