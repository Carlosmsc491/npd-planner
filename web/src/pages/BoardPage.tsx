import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  collection, onSnapshot, query, where, orderBy,
  doc, getDoc,
} from 'firebase/firestore'
import { db } from '../firebase'
import type { Board, Task } from '../types'
import { STATUS_COLORS, STATUS_LABELS } from '../types'
import NewTaskModal from '../components/NewTaskModal'
import { useAuthStore } from '../store/authStore'

export default function BoardPage() {
  const { boardId } = useParams<{ boardId: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const [board, setBoard] = useState<Board | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [showModal, setShowModal] = useState(false)

  const isAdmin = user?.role === 'admin' || user?.role === 'owner'

  useEffect(() => {
    if (!boardId) return
    getDoc(doc(db, 'boards', boardId)).then((snap) => {
      if (snap.exists()) setBoard({ id: snap.id, ...snap.data() } as Board)
    })
  }, [boardId])

  useEffect(() => {
    if (!boardId) return
    const q = query(
      collection(db, 'tasks'),
      where('boardId', '==', boardId),
      where('completed', '==', false),
      orderBy('createdAt', 'desc')
    )
    return onSnapshot(q, (snap) =>
      setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Task)))
    )
  }, [boardId])

  const byStatus = useMemo(() => {
    const groups: Record<Task['status'], Task[]> = {
      todo: [], inprogress: [], review: [], done: [],
    }
    tasks.forEach((t) => groups[t.status].push(t))
    return groups
  }, [tasks])

  const canEdit = useMemo(() => {
    if (!user || !board) return false
    if (isAdmin) return true
    const perm = user.areaPermissions?.[`board_${boardId}`]
    return perm === 'edit'
  }, [user, board, boardId, isAdmin])

  if (!board) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 rounded-full border-4 border-green-500 border-t-transparent animate-spin" />
      </div>
    )
  }

  const statuses: Task['status'][] = ['todo', 'inprogress', 'review', 'done']

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 safe-top shrink-0">
        <button onClick={() => navigate('/boards')} className="text-gray-400 hover:text-gray-600 p-1">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
          style={{ backgroundColor: board.color }}
        >
          {board.name.charAt(0)}
        </div>
        <h1 className="font-bold text-gray-900 flex-1 truncate">{board.name}</h1>
        {canEdit && (
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 rounded-xl bg-green-500 text-white text-xs font-semibold px-3 py-2 hover:bg-green-600 active:scale-95 transition shrink-0"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            New Task
          </button>
        )}
      </header>

      {/* Task list — grouped by status */}
      <main className="flex-1 overflow-y-auto px-4 py-4 max-w-lg mx-auto w-full">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-12 h-12 mb-3 opacity-30">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="text-sm">No active tasks</p>
            {canEdit && (
              <button onClick={() => setShowModal(true)} className="mt-3 text-sm text-green-600 font-medium">
                Add the first task
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            {statuses.map((status) => {
              const group = byStatus[status]
              if (group.length === 0) return null
              const colors = STATUS_COLORS[status]
              return (
                <section key={status}>
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: colors.bg, color: colors.text }}
                    >
                      {STATUS_LABELS[status]}
                    </span>
                    <span className="text-xs text-gray-400">{group.length}</span>
                  </div>
                  <div className="space-y-2">
                    {group.map((task) => (
                      <TaskCard key={task.id} task={task} />
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </main>

      {showModal && boardId && (
        <NewTaskModal
          boardId={boardId}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}

function TaskCard({ task }: { task: Task }) {
  const colors = STATUS_COLORS[task.status]

  const dateStr = useMemo(() => {
    if (!task.dateEnd) return null
    const d = task.dateEnd.toDate()
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }, [task.dateEnd])

  const isOverdue = useMemo(() => {
    if (!task.dateEnd || task.status === 'done') return false
    return task.dateEnd.toDate() < new Date()
  }, [task.dateEnd, task.status])

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="pt-0.5">
          {task.priority === 'high' && (
            <div className="w-2 h-2 rounded-full bg-red-500 mt-1" />
          )}
          {task.priority !== 'high' && (
            <div className="w-2 h-2 rounded-full bg-gray-200 mt-1" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 leading-snug">{task.title}</p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{ backgroundColor: colors.bg, color: colors.text }}
            >
              {STATUS_LABELS[task.status]}
            </span>
            {dateStr && (
              <span className={`text-xs ${isOverdue ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                {isOverdue ? '⚠ ' : ''}{dateStr}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
