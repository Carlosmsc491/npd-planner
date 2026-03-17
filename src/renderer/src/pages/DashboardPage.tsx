import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppLayout from '../components/ui/AppLayout'
import { useAuthStore } from '../store/authStore'
import { useBoardStore } from '../store/boardStore'
import { subscribeToTasks, seedDefaultBoards, deduplicateDefaultBoards } from '../lib/firestore'
import { BOARD_COLORS } from '../utils/colorUtils'
import { isOverdue } from '../utils/dateUtils'
import type { Task } from '../types'

export default function DashboardPage() {
  const { user } = useAuthStore()
  const { boards } = useBoardStore()
  const navigate = useNavigate()
  const [allTasks, setAllTasks] = useState<Task[]>([])

  const seededRef = useRef(false)
  useEffect(() => {
    if (user && !seededRef.current) {
      seededRef.current = true
      deduplicateDefaultBoards().then(() => seedDefaultBoards(user.uid))
    }
  }, [user?.uid])

  useEffect(() => {
    if (boards.length === 0) return
    const unsubs = boards.map((board) =>
      subscribeToTasks(board.id, (boardTasks) => {
        setAllTasks((prev) => [...prev.filter((t) => t.boardId !== board.id), ...boardTasks])
      })
    )
    return () => unsubs.forEach((u) => u())
  }, [boards])

  const plannerBoardIds = boards.filter((b) => b.type === 'planner').map((b) => b.id)
  const plannerTasks = allTasks.filter((t) => plannerBoardIds.includes(t.boardId))

  const active    = plannerTasks.filter((t) => !t.completed)
  const overdue   = active.filter((t) => isOverdue(t.dateEnd))
  const mine      = active.filter((t) => user && t.assignees.includes(user.uid))
  const doneToday = plannerTasks.filter((t) => {
    if (!t.completedAt) return false
    const d = t.completedAt.toDate()
    const now = new Date()
    return d.toDateString() === now.toDateString()
  })

  const stats = [
    { label: 'Active Tasks',    value: active.length,    color: 'text-blue-600',   bg: 'bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400' },
    { label: 'Assigned to Me',  value: mine.length,      color: 'text-green-600',  bg: 'bg-green-50 dark:bg-green-900/20 dark:text-green-400' },
    { label: 'Overdue',         value: overdue.length,   color: 'text-red-600',    bg: 'bg-red-50 dark:bg-red-900/20 dark:text-red-400' },
    { label: 'Completed Today', value: doneToday.length, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-900/20 dark:text-purple-400' },
  ]

  return (
    <AppLayout>
      <div className="p-6 w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Good {getGreeting()}, {user?.name?.split(' ')[0] ?? 'there'} 👋
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Here's what's happening today.</p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-4 gap-4 mb-8 w-full">
          {stats.map((s) => (
            <div key={s.label} className={`rounded-2xl p-4 ${s.bg}`}>
              <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Boards quick access */}
        {boards.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">Boards</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {boards.map((board) => {
                const color = BOARD_COLORS[board.type] ?? board.color
                const boardCount = allTasks.filter((t) => t.boardId === board.id && !t.completed).length
                const boardLabel = board.type === 'trips' ? 'trips' : board.type === 'vacations' ? 'vacations' : 'active tasks'
                return (
                  <button
                    key={board.id}
                    onClick={() => navigate(`/board/${board.id}`)}
                    className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 text-left hover:shadow-md transition-all dark:border-gray-700 dark:bg-gray-800"
                  >
                    <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{board.name}</p>
                      <p className="text-xs text-gray-400">{boardCount} {boardLabel}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* My tasks */}
        {mine.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">Assigned to Me</h2>
            <div className="space-y-2">
              {mine.slice(0, 8).map((task) => {
                const board = boards.find((b) => b.id === task.boardId)
                const color = board ? (BOARD_COLORS[board.type] ?? board.color) : '#888'
                return (
                  <button
                    key={task.id}
                    onClick={() => navigate(`/board/${task.boardId}`)}
                    className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-left hover:bg-gray-50 transition-colors dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700/50"
                  >
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <span className="flex-1 truncate text-sm text-gray-800 dark:text-gray-200">{task.title}</span>
                    {isOverdue(task.dateEnd) && (
                      <span className="shrink-0 text-xs font-medium text-red-500">Overdue</span>
                    )}
                  </button>
                )
              })}
              {mine.length > 8 && (
                <p className="pl-1 text-xs text-gray-400">+{mine.length - 8} more</p>
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 18) return 'afternoon'
  return 'evening'
}
