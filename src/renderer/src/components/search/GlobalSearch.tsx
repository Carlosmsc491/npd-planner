import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X, Clock, FileText, MessageSquare, Building2, Folder, CornerDownLeft } from 'lucide-react'
import { useBoardStore } from '../../store/boardStore'
import { useSearch } from '../../hooks/useSearch'
import { getBoardColor } from '../../utils/colorUtils'
import type { SearchResult } from '../../types'

interface Props {
  onClose: () => void
}

export default function GlobalSearch({ onClose }: Props) {
  const navigate = useNavigate()
  const { boards } = useBoardStore()
  const {
    query,
    setQuery,
    results,
    recentSearches,
    addToRecent,
    isLoading,
    selectedIndex,
    setSelectedIndex,
    selectNext,
    selectPrevious,
    getResultUrl,
  } = useSearch()

  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Handle Escape key
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Scroll selected item into view
  useEffect(() => {
    const container = listRef.current
    if (!container) return
    const items = container.querySelectorAll('[data-result-item]')
    const selectedItem = items[selectedIndex] as HTMLElement | undefined
    if (selectedItem) {
      selectedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [selectedIndex])

  function handleSelect(result: SearchResult) {
    addToRecent(result)
    onClose()

    const url = getResultUrl(result)
    navigate(url)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    const list = query.trim() ? results : recentSearches

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      selectNext()
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      selectPrevious()
    }
    if (e.key === 'Enter' && list[selectedIndex]) {
      handleSelect(list[selectedIndex])
    }
  }

  const showResults = query.trim().length > 0
  const showRecent = !showResults && recentSearches.length > 0
  const listItems = showResults ? results : showRecent ? recentSearches : []

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[14vh] bg-black/40 backdrop-blur-sm transition-opacity"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl mx-4 rounded-2xl bg-white dark:bg-gray-800 shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col max-h-[70vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-200 dark:border-gray-700">
          <Search size={20} className="text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search tasks, clients, comments..."
            className="flex-1 bg-transparent text-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none"
            aria-label="Search"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center gap-1 rounded border border-gray-200 dark:border-gray-600 px-2 py-1 text-[10px] text-gray-400 font-mono bg-gray-50 dark:bg-gray-700">
            Esc
          </kbd>
        </div>

        {/* Results container */}
        <div ref={listRef} className="flex-1 overflow-y-auto min-h-0">
          {/* Section label for recent */}
          {showRecent && (
            <div className="flex items-center gap-1.5 px-4 pt-3 pb-1">
              <Clock size={12} className="text-gray-400" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                Recent searches
              </span>
            </div>
          )}

          {/* Loading state */}
          {isLoading && (
            <div className="px-4 py-12 text-center">
              <div className="inline-flex items-center gap-2 text-gray-400">
                <div className="w-4 h-4 border-2 border-gray-300 border-t-green-500 rounded-full animate-spin" />
                <span className="text-sm">Indexing tasks...</span>
              </div>
            </div>
          )}

          {/* Empty states */}
          {!isLoading && showResults && results.length === 0 && (
            <div className="px-4 py-12 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 mb-3">
                <Search size={20} className="text-gray-400" />
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No results for &ldquo;{query}&rdquo;
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Try different keywords or check your spelling
              </p>
            </div>
          )}

          {!isLoading && !showResults && !showRecent && (
            <div className="px-4 py-12 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 mb-3">
                <Search size={20} className="text-gray-400" />
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Start typing to search tasks, clients, and comments
              </p>
              <div className="flex items-center justify-center gap-4 mt-4 text-xs text-gray-400">
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 font-mono">
                    ↑↓
                  </kbd>
                  to navigate
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 font-mono">
                    ↵
                  </kbd>
                  to open
                </span>
              </div>
            </div>
          )}

          {/* Results list */}
          {!isLoading &&
            listItems.map((result, i) => {
              const isActive = i === selectedIndex
              const Icon =
                result.type === 'task'
                  ? FileText
                  : result.type === 'client'
                    ? Building2
                    : MessageSquare
              const board = boards.find((b) => b.id === result.boardId)
              const color = getBoardColor(board)

              return (
                <button
                  key={`${result.type}-${result.id}`}
                  data-result-item
                  onClick={() => handleSelect(result)}
                  onMouseEnter={() => setSelectedIndex(i)}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left border-b border-gray-100 dark:border-gray-700/40 last:border-0 transition-colors ${
                    isActive
                      ? 'bg-green-50 dark:bg-green-900/20'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }`}
                >
                  {/* Icon */}
                  <div
                    className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
                      result.type === 'task'
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-500'
                        : result.type === 'client'
                          ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-500'
                          : 'bg-amber-50 dark:bg-amber-900/20 text-amber-500'
                    }`}
                  >
                    <Icon size={16} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {result.title}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {result.subtitle}
                    </p>
                  </div>

                  {/* Board badge */}
                  <div className="flex items-center gap-2 shrink-0">
                    {result.boardName && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white flex items-center gap-1"
                        style={{ backgroundColor: color }}
                      >
                        <Folder size={10} />
                        {result.boardName}
                      </span>
                    )}
                    {result.date && (
                      <span className="text-[10px] text-gray-400">{result.date}</span>
                    )}
                    {isActive && <CornerDownLeft size={12} className="text-gray-400" />}
                  </div>
                </button>
              )
            })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <div className="flex items-center gap-3 text-[10px] text-gray-400">
            <span>{results.length > 0 ? `${results.length} results` : 'Ready to search'}</span>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-gray-400">
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 font-mono">
                ↑↓
              </kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 font-mono">
                ↵
              </kbd>
              open
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 font-mono">
                esc
              </kbd>
              close
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
