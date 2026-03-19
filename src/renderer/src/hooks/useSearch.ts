// src/renderer/src/hooks/useSearch.ts
// Global search hook with Fuse.js for fuzzy matching across tasks, clients, and comments

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import Fuse from 'fuse.js'
import { subscribeToAllTasks, subscribeToCommentsForBoards } from '../lib/firestore'
import { useBoardStore } from '../store/boardStore'
import { useSettingsStore } from '../store/settingsStore'
import { formatDate } from '../utils/dateUtils'
import type { Task, Comment, SearchResult } from '../types'

const LS_KEY = 'npd:recent_searches'
const MAX_RECENT = 5

// Fuse.js configuration keys for tasks
const TASK_FUSE_KEYS = [
  { name: 'title', weight: 2 },
  { name: 'notes', weight: 1 },
  { name: 'description', weight: 1 },
  { name: 'poNumber', weight: 1.5 },
  { name: 'awbs.number', weight: 1 },
]

// Fuse.js configuration keys for comments
const COMMENT_FUSE_KEYS = [
  { name: 'text', weight: 2 },
  { name: 'authorName', weight: 1 },
]

interface UseSearchReturn {
  // Data
  tasks: Task[]
  comments: Comment[]
  isLoading: boolean

  // Search
  query: string
  setQuery: (query: string) => void
  results: SearchResult[]

  // Recent searches
  recentSearches: SearchResult[]
  addToRecent: (result: SearchResult) => void
  clearRecent: () => void

  // Selection
  selectedIndex: number
  setSelectedIndex: (index: number) => void
  selectNext: () => void
  selectPrevious: () => void

  // Navigation
  getResultUrl: (result: SearchResult) => string
}

/**
 * Load recent searches from localStorage
 */
function loadRecentFromStorage(): SearchResult[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    return JSON.parse(raw) as SearchResult[]
  } catch {
    return []
  }
}

/**
 * Save recent searches to localStorage
 */
function saveRecentToStorage(results: SearchResult[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(results.slice(0, MAX_RECENT)))
  } catch {
    // Ignore localStorage errors (e.g., quota exceeded)
  }
}

/**
 * Hook for global search functionality with Fuse.js fuzzy matching
 * Searches across tasks, clients, and comments
 */
export function useSearch(): UseSearchReturn {
  const { boards } = useBoardStore()
  const { clients } = useSettingsStore()

  // Data state
  const [tasks, setTasks] = useState<Task[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Search state
  const [query, setQuery] = useState('')
  const [recentSearches, setRecentSearches] = useState<SearchResult[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Load recent searches on mount
  useEffect(() => {
    setRecentSearches(loadRecentFromStorage())
  }, [])

  // Subscribe to all tasks across boards
  useEffect(() => {
    if (boards.length === 0) {
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    const unsubscribe = subscribeToAllTasks(
      boards.map((b) => b.id),
      (loadedTasks) => {
        setTasks(loadedTasks)
        setIsLoading(false)
      }
    )

    return unsubscribe
  }, [boards])

  // Subscribe to all comments
  useEffect(() => {
    if (boards.length === 0) return

    const unsubscribe = subscribeToCommentsForBoards(
      boards.map((b) => b.id),
      (loadedComments) => {
        setComments(loadedComments)
      }
    )

    return unsubscribe
  }, [boards])

  // Create Fuse indexes
  const taskFuse = useMemo(
    () =>
      new Fuse(tasks, {
        keys: TASK_FUSE_KEYS,
        threshold: 0.35,
        minMatchCharLength: 1,
        includeScore: true,
      }),
    [tasks]
  )
  const commentFuse = useMemo(
    () =>
      new Fuse(comments, {
        keys: COMMENT_FUSE_KEYS,
        threshold: 0.35,
        minMatchCharLength: 1,
        includeScore: true,
      }),
    [comments]
  )

  // Reset selection when query changes
  const prevQueryRef = useRef(query)
  useEffect(() => {
    if (prevQueryRef.current !== query) {
      setSelectedIndex(0)
      prevQueryRef.current = query
    }
  }, [query])

  // Compute search results
  const results = useMemo((): SearchResult[] => {
    if (!query.trim()) return []

    const lowerQuery = query.toLowerCase()

    // Task results from Fuse
    const taskResults: SearchResult[] = taskFuse.search(query).map((fuseResult) => {
      const task = fuseResult.item
      const board = boards.find((b) => b.id === task.boardId)
      const client = clients.find((c) => c.id === task.clientId)

      return {
        type: 'task',
        id: task.id,
        title: task.title,
        subtitle: `${client?.name ?? 'No client'} • ${board?.name ?? 'Unknown board'}`,
        boardId: task.boardId,
        taskId: task.id,
        clientName: client?.name,
        boardName: board?.name,
        date: task.dateEnd ? formatDate(task.dateEnd) : null,
      }
    })

    // Client matches - find tasks by client name that weren't already in task results
    const taskResultIds = new Set(taskResults.map((r) => r.id))
    const clientResults: SearchResult[] = tasks
      .filter((task) => {
        const client = clients.find((c) => c.id === task.clientId)
        return (
          client?.name.toLowerCase().includes(lowerQuery) &&
          !taskResultIds.has(task.id)
        )
      })
      .slice(0, 5)
      .map((task) => {
        const board = boards.find((b) => b.id === task.boardId)
        const client = clients.find((c) => c.id === task.clientId)

        return {
          type: 'client',
          id: `client-${task.id}`,
          title: task.title,
          subtitle: `${client?.name ?? 'No client'} • ${board?.name ?? 'Unknown board'}`,
          boardId: task.boardId,
          taskId: task.id,
          clientName: client?.name,
          boardName: board?.name,
          date: task.dateEnd ? formatDate(task.dateEnd) : null,
        }
      })

    // Comment results from Fuse
    const commentResults: SearchResult[] = commentFuse
      .search(query)
      .slice(0, 5)
      .map((fuseResult) => {
        const comment = fuseResult.item
        const task = tasks.find((t) => t.id === comment.taskId)
        const board = task ? boards.find((b) => b.id === task.boardId) : null

        return {
          type: 'comment',
          id: comment.id,
          title: comment.text.slice(0, 60) + (comment.text.length > 60 ? '...' : ''),
          subtitle: `Comment by ${comment.authorName} on "${task?.title ?? 'Unknown task'}"`,
          boardId: task?.boardId,
          taskId: comment.taskId,
          authorName: comment.authorName,
          boardName: board?.name,
        }
      })

    // Deduplicate and combine results
    const seen = new Set<string>()
    const combined = [...taskResults, ...clientResults, ...commentResults].filter(
      (result) => {
        const key = `${result.type}-${result.id}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      }
    )

    return combined.slice(0, 10)
  }, [query, taskFuse, commentFuse, tasks, boards, clients])

  // Add a result to recent searches
  const addToRecent = useCallback((result: SearchResult) => {
    setRecentSearches((prev) => {
      // Remove if already exists
      const filtered = prev.filter(
        (r) => !(r.id === result.id && r.type === result.type)
      )
      // Add to front and limit to MAX_RECENT
      const updated = [result, ...filtered].slice(0, MAX_RECENT)
      saveRecentToStorage(updated)
      return updated
    })
  }, [])

  // Clear recent searches
  const clearRecent = useCallback(() => {
    setRecentSearches([])
    try {
      localStorage.removeItem(LS_KEY)
    } catch {
      // Ignore localStorage errors
    }
  }, [])

  // Navigation helpers
  const selectNext = useCallback(() => {
    const list = query.trim() ? results : recentSearches
    setSelectedIndex((prev) => Math.min(prev + 1, list.length - 1))
  }, [query, results, recentSearches])

  const selectPrevious = useCallback(() => {
    setSelectedIndex((prev) => Math.max(prev - 1, 0))
  }, [])

  // Get URL for a search result
  const getResultUrl = useCallback((result: SearchResult): string => {
    if (result.taskId) {
      return `/task/${result.taskId}`
    }
    if (result.boardId) {
      return `/board/${result.boardId}`
    }
    return '/dashboard'
  }, [])

  return {
    tasks,
    comments,
    isLoading,
    query,
    setQuery,
    results,
    recentSearches,
    addToRecent,
    clearRecent,
    selectedIndex,
    setSelectedIndex,
    selectNext,
    selectPrevious,
    getResultUrl,
  }
}

export default useSearch
