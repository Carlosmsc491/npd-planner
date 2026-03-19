import { useEffect, useState, useMemo, useCallback } from 'react'
import { subscribeToMyTasks } from '../lib/firestore'
import { useAuthStore } from '../store/authStore'
import { useBoardStore } from '../store/boardStore'
import type { Task, MyTaskGroup, MyTaskFilter } from '../types'

interface GroupedTasks {
  today: Task[]
  thisWeek: Task[]
  thisMonth: Task[]
  later: Task[]
  noDate: Task[]
  completed: Task[]
}

interface UseMyTasksReturn {
  tasks: Task[]
  groupedTasks: GroupedTasks
  loading: boolean
  filter: MyTaskFilter
  setFilter: (filter: Partial<MyTaskFilter>) => void
  getTaskGroup: (task: Task) => MyTaskGroup
  refresh: () => void
}

export function useMyTasks(): UseMyTasksReturn {
  const { user } = useAuthStore()
  const { boards } = useBoardStore()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilterState] = useState<MyTaskFilter>({
    boardId: 'all',
    sortBy: 'dueDate',
  })

  // Subscribe to my tasks
  useEffect(() => {
    if (!user) {
      setTasks([])
      setLoading(false)
      return
    }

    setLoading(true)
    const unsub = subscribeToMyTasks(user.uid, (fetchedTasks) => {
      setTasks(fetchedTasks)
      setLoading(false)
    })

    return unsub
  }, [user])

  // Filter and sort tasks
  const filteredTasks = useMemo(() => {
    let result = [...tasks]

    // Filter by board
    if (filter.boardId !== 'all') {
      result = result.filter((t) => t.boardId === filter.boardId)
    }

    // Sort
    result.sort((a, b) => {
      switch (filter.sortBy) {
        case 'dueDate':
          // Tasks with dates come first, sorted by date
          // Tasks without dates come last
          if (!a.dateStart && !b.dateStart) return 0
          if (!a.dateStart) return 1
          if (!b.dateStart) return -1
          return a.dateStart.toMillis() - b.dateStart.toMillis()

        case 'board':
          const boardA = boards.find((board) => board.id === a.boardId)?.name || ''
          const boardB = boards.find((board) => board.id === b.boardId)?.name || ''
          return boardA.localeCompare(boardB)

        case 'priority':
          // High priority first
          if (a.priority === 'high' && b.priority !== 'high') return -1
          if (a.priority !== 'high' && b.priority === 'high') return 1
          return 0

        case 'created':
          return (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0)

        default:
          return 0
      }
    })

    return result
  }, [tasks, filter, boards])

  // Group tasks by date
  const groupedTasks = useMemo(() => {
    const groups: GroupedTasks = {
      today: [],
      thisWeek: [],
      thisMonth: [],
      later: [],
      noDate: [],
      completed: [],
    }

    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    // Start of week (Monday)
    const startOfWeek = new Date(today)
    const dayOfWeek = today.getDay()
    const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1)
    startOfWeek.setDate(diff)

    // End of week (Sunday)
    const endOfWeek = new Date(startOfWeek)
    endOfWeek.setDate(endOfWeek.getDate() + 6)

    // Start and end of month
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)

    filteredTasks.forEach((task) => {
      if (task.completed) {
        groups.completed.push(task)
        return
      }

      if (!task.dateStart) {
        groups.noDate.push(task)
        return
      }

      const taskDate = task.dateStart.toDate()
      const taskDay = new Date(taskDate.getFullYear(), taskDate.getMonth(), taskDate.getDate())

      if (taskDay.getTime() === today.getTime()) {
        groups.today.push(task)
      } else if (taskDay >= startOfWeek && taskDay <= endOfWeek) {
        groups.thisWeek.push(task)
      } else if (taskDay >= startOfMonth && taskDay <= endOfMonth) {
        groups.thisMonth.push(task)
      } else {
        groups.later.push(task)
      }
    })

    return groups
  }, [filteredTasks])

  // Helper to determine which group a task belongs to
  const getTaskGroup = useCallback((task: Task): MyTaskGroup => {
    if (task.completed) return 'completed'
    if (!task.dateStart) return 'noDate'

    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const taskDate = task.dateStart.toDate()
    const taskDay = new Date(taskDate.getFullYear(), taskDate.getMonth(), taskDate.getDate())

    if (taskDay.getTime() === today.getTime()) return 'today'

    const dayOfWeek = today.getDay()
    const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1)
    const startOfWeek = new Date(today)
    startOfWeek.setDate(diff)
    const endOfWeek = new Date(startOfWeek)
    endOfWeek.setDate(endOfWeek.getDate() + 6)

    if (taskDay >= startOfWeek && taskDay <= endOfWeek) return 'thisWeek'

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)

    if (taskDay >= startOfMonth && taskDay <= endOfMonth) return 'thisMonth'

    return 'later'
  }, [])

  // Update filter
  const setFilter = useCallback((partial: Partial<MyTaskFilter>) => {
    setFilterState((prev) => ({ ...prev, ...partial }))
  }, [])

  // Refresh (no-op since subscription is reactive, but useful for UI)
  const refresh = useCallback(() => {
    // Subscription will auto-update
  }, [])

  return {
    tasks: filteredTasks,
    groupedTasks,
    loading,
    filter,
    setFilter,
    getTaskGroup,
    refresh,
  }
}
