import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import AppLayout from '../components/ui/AppLayout'
import TaskPagePanel from '../components/task/TaskPage'
import { subscribeToTask, subscribeToUsers, duplicateTask, deleteTask } from '../lib/firestore'
import { useBoardStore } from '../store/boardStore'
import { useAuthStore } from '../store/authStore'
import type { Task, AppUser } from '../types'

export default function TaskFullPage() {
  const { taskId } = useParams<{ taskId: string }>()
  const navigate = useNavigate()
  const { boards } = useBoardStore()
  const { user } = useAuthStore()
  const [task, setTask] = useState<Task | null>(null)
  const [users, setUsers] = useState<AppUser[]>([])
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!taskId) return
    const unsub = subscribeToTask(taskId, (t) => {
      if (t === null) setNotFound(true)
      else setTask(t)
    })
    return unsub
  }, [taskId])

  useEffect(() => {
    const unsub = subscribeToUsers(setUsers)
    return unsub
  }, [])

  if (notFound) {
    return (
      <AppLayout>
        <div className="flex h-full items-center justify-center flex-col gap-3">
          <p className="text-gray-400 text-sm">Task not found.</p>
          <button onClick={() => navigate(-1)} className="text-xs text-green-600 hover:underline">← Go back</button>
        </div>
      </AppLayout>
    )
  }

  if (!task) {
    return (
      <AppLayout>
        <div className="flex h-full items-center justify-center">
          <p className="text-gray-400 text-sm">Loading…</p>
        </div>
      </AppLayout>
    )
  }

  const board = boards.find((b) => b.id === task.boardId) ?? null

  async function handleDelete(t: Task) {
    if (!user) return
    await deleteTask(t.id, user.uid, user.name)
    navigate(-1)
  }

  async function handleDuplicate(t: Task) {
    await duplicateTask(t, `${t.title} (copy)`)
  }

  async function handleRecurring(t: Task) {
    // Full page doesn't have a recurring modal — navigate back to board to use it
    navigate(`/board/${t.boardId}`)
  }


  return (
    <AppLayout>
      <div className="flex h-full flex-col">
        {/* Back button */}
        <div className="flex items-center gap-3 border-b border-gray-200 dark:border-gray-700 px-6 py-3 bg-white dark:bg-gray-900 shrink-0">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white transition-colors"
          >
            <ArrowLeft size={14} />
            Back
          </button>
        </div>

        {/* Full-width task panel */}
        <div className="flex-1 overflow-hidden max-w-3xl w-full mx-auto">
          <TaskPagePanel
            task={task}
            board={board}
            users={users}
            onClose={() => navigate(-1)}
            onDelete={handleDelete}
            onRecurring={handleRecurring}
            onDuplicate={handleDuplicate}
            isFullPage
          />
        </div>
      </div>
    </AppLayout>
  )
}
