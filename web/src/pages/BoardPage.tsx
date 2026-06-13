import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  collection, onSnapshot, query, where, doc, getDoc,
} from 'firebase/firestore'
import { db } from '../firebase'
import type { Board, Task, Client, Label, AppUser } from '../types'
import {
  STATUS_COLORS, STATUS_LABELS, BOARD_BUCKETS,
  getBucketColor, getInitials, getInitialsColor,
} from '../types'
import NewTaskModal from '../components/NewTaskModal'
import TaskDetailModal from '../components/TaskDetailModal'
import { useAuthStore } from '../store/authStore'

const NO_BUCKET = 'No bucket'

type SortKey = 'default' | 'dueDate' | 'title' | 'priority' | 'status'

const SORT_LABELS: Record<SortKey, string> = {
  default:  'Bucket order',
  dueDate:  'Due date',
  title:    'Title A→Z',
  priority: 'Priority',
  status:   'Status',
}

export default function BoardPage() {
  const { boardId } = useParams<{ boardId: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const [board, setBoard] = useState<Board | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [clients, setClients] = useState<Record<string, Client>>({})
  const [labels, setLabels] = useState<Record<string, Label>>({})
  const [users, setUsers] = useState<Record<string, AppUser>>({})

  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortKey>('default')
  const [showModal, setShowModal] = useState(false)
  const [openTask, setOpenTask] = useState<Task | null>(null)

  const isAdmin = user?.role === 'admin' || user?.role === 'owner'

  useEffect(() => {
    if (!boardId) return
    getDoc(doc(db, 'boards', boardId)).then((snap) => {
      if (snap.exists()) setBoard({ id: snap.id, ...snap.data() } as Board)
    })
  }, [boardId])

  // Single-field where — no composite index needed. Filter/sort client-side.
  useEffect(() => {
    if (!boardId) return
    const q = query(collection(db, 'tasks'), where('boardId', '==', boardId))
    return onSnapshot(q, (snap) =>
      setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Task)))
    )
  }, [boardId])

  // Lookup maps — clients, labels, users
  useEffect(() => {
    const u1 = onSnapshot(collection(db, 'clients'), (snap) => {
      const map: Record<string, Client> = {}
      snap.docs.forEach((d) => { map[d.id] = { id: d.id, ...d.data() } as Client })
      setClients(map)
    })
    const u2 = onSnapshot(collection(db, 'labels'), (snap) => {
      const map: Record<string, Label> = {}
      snap.docs.forEach((d) => { map[d.id] = { id: d.id, ...d.data() } as Label })
      setLabels(map)
    })
    const u3 = onSnapshot(collection(db, 'users'), (snap) => {
      const map: Record<string, AppUser> = {}
      snap.docs.forEach((d) => { map[d.id] = { uid: d.id, ...d.data() } as AppUser })
      setUsers(map)
    })
    return () => { u1(); u2(); u3() }
  }, [])

  const isOverdue = (t: Task) =>
    !!t.dateEnd && t.status !== 'done' && t.dateEnd.toDate() < new Date()

  // Active tasks filtered by search
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return tasks
      .filter((t) => !t.completed)
      .filter((t) => {
        if (!q) return true
        const clientName = clients[t.clientId]?.name ?? ''
        const pos = [t.poNumber, ...(t.poNumbers ?? []), ...(t.poEntries?.map((p) => p.number) ?? [])].join(' ')
        const awbs = (t.awbs ?? []).map((a) => a.number).join(' ')
        return (
          t.title.toLowerCase().includes(q) ||
          clientName.toLowerCase().includes(q) ||
          t.bucket.toLowerCase().includes(q) ||
          pos.toLowerCase().includes(q) ||
          awbs.toLowerCase().includes(q)
        )
      })
  }, [tasks, search, clients])

  // Bucket ordering: board.bucketOrder → BOARD_BUCKETS[type] → alphabetical, NO_BUCKET last
  const orderedBuckets = useMemo(() => {
    const present = new Set(filtered.map((t) => t.bucket || NO_BUCKET))
    const baseOrder = board?.bucketOrder?.length
      ? board.bucketOrder
      : BOARD_BUCKETS[board?.type ?? 'planner'] ?? []
    const ordered: string[] = []
    baseOrder.forEach((b) => { if (present.has(b)) { ordered.push(b); present.delete(b) } })
    // remaining buckets (not in defined order) alphabetical, NO_BUCKET pinned last
    const rest = [...present].filter((b) => b !== NO_BUCKET).sort((a, b) => a.localeCompare(b))
    ordered.push(...rest)
    if (present.has(NO_BUCKET)) ordered.push(NO_BUCKET)
    return ordered
  }, [filtered, board])

  function sortTasks(list: Task[]): Task[] {
    const arr = [...list]
    switch (sortBy) {
      case 'dueDate':
        return arr.sort((a, b) => {
          const at = a.dateEnd?.seconds ?? Infinity
          const bt = b.dateEnd?.seconds ?? Infinity
          return at - bt
        })
      case 'title':
        return arr.sort((a, b) => a.title.localeCompare(b.title))
      case 'priority':
        return arr.sort((a, b) => (a.priority === 'high' ? 0 : 1) - (b.priority === 'high' ? 0 : 1))
      case 'status': {
        const ord: Record<Task['status'], number> = { todo: 0, inprogress: 1, review: 2, done: 3 }
        return arr.sort((a, b) => ord[a.status] - ord[b.status])
      }
      default:
        return arr.sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0))
    }
  }

  const groups = useMemo(() => {
    return orderedBuckets.map((bucket) => ({
      bucket,
      tasks: sortTasks(filtered.filter((t) => (t.bucket || NO_BUCKET) === bucket)),
    })).filter((g) => g.tasks.length > 0)
  }, [orderedBuckets, filtered, sortBy])

  const canEdit = useMemo(() => {
    if (!user || !board) return false
    if (isAdmin) return true
    return user.areaPermissions?.[`board_${boardId}`] === 'edit'
  }, [user, board, boardId, isAdmin])

  if (!board) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 rounded-full border-4 border-green-500 border-t-transparent animate-spin" />
      </div>
    )
  }

  const totalShown = filtered.length

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 safe-top shrink-0 sticky top-0 z-20">
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

      {/* Toolbar: search + sort */}
      <div className="bg-white border-b border-gray-200 px-4 py-2.5 flex items-center gap-2 sticky top-[57px] z-10">
        <div className="relative flex-1 max-w-md">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" strokeLinecap="round" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, client, PO, AWB…"
            className="w-full rounded-xl border border-gray-300 bg-white pl-9 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" /></svg>
            </button>
          )}
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortKey)}
          className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500/30 cursor-pointer shrink-0"
        >
          {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
            <option key={k} value={k}>{SORT_LABELS[k]}</option>
          ))}
        </select>
      </div>

      {/* Bucket-grouped list */}
      <main className="flex-1 overflow-y-auto px-4 py-4 max-w-2xl mx-auto w-full">
        {totalShown === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-12 h-12 mb-3 opacity-30">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="text-sm">{search ? 'No tasks match your search' : 'No active tasks'}</p>
            {!search && canEdit && (
              <button onClick={() => setShowModal(true)} className="mt-3 text-sm text-green-600 font-medium">
                Add the first task
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map(({ bucket, tasks: group }) => {
              const color = getBucketColor(bucket, board) ?? '#9CA3AF'
              return (
                <section key={bucket}>
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <h2 className="text-sm font-bold uppercase tracking-wide text-gray-700">{bucket}</h2>
                    <span className="text-xs text-gray-400 font-medium">{group.length}</span>
                  </div>
                  <div className="space-y-2">
                    {group.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        client={clients[task.clientId]}
                        labels={labels}
                        users={users}
                        overdue={isOverdue(task)}
                        onClick={() => setOpenTask(task)}
                      />
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </main>

      {showModal && boardId && (
        <NewTaskModal board={board} onClose={() => setShowModal(false)} />
      )}

      {openTask && (
        <TaskDetailModal
          task={openTask}
          board={board}
          client={clients[openTask.clientId]}
          labels={labels}
          users={users}
          onClose={() => setOpenTask(null)}
        />
      )}
    </div>
  )
}

function TaskCard({
  task, client, labels, users, overdue, onClick,
}: {
  task: Task
  client?: Client
  labels: Record<string, Label>
  users: Record<string, AppUser>
  overdue: boolean
  onClick: () => void
}) {
  const colors = STATUS_COLORS[task.status]

  const dateStr = useMemo(() => {
    if (!task.dateEnd) return null
    return task.dateEnd.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }, [task.dateEnd])

  const taskLabels = (task.labelIds ?? []).map((id) => labels[id]).filter(Boolean) as Label[]
  const assignees = (task.assignees ?? []).map((uid) => users[uid]).filter(Boolean) as AppUser[]
  const subtaskDone = task.subtasks?.filter((s) => s.completed).length ?? 0
  const subtaskTotal = task.subtasks?.length ?? 0

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 hover:border-gray-300 hover:shadow active:scale-[0.99] transition"
    >
      <div className="flex items-start gap-3">
        <div className="pt-1 shrink-0">
          <div className={`w-2 h-2 rounded-full ${task.priority === 'high' ? 'bg-red-500' : 'bg-gray-200'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 leading-snug">{task.title}</p>
          {client && <p className="text-xs text-gray-400 mt-0.5 uppercase">{client.name}</p>}

          {taskLabels.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {taskLabels.map((l) => (
                <span
                  key={l.id}
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded uppercase leading-none"
                  style={{ backgroundColor: l.color, color: l.textColor }}
                >
                  {l.name}
                </span>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: colors.bg, color: colors.text }}>
              {STATUS_LABELS[task.status]}
            </span>
            {dateStr && (
              <span className={`text-xs ${overdue ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>
                {overdue ? '⚠ ' : ''}{dateStr}
              </span>
            )}
            {subtaskTotal > 0 && (
              <span className="text-[10px] text-gray-400">✓ {subtaskDone}/{subtaskTotal}</span>
            )}
            {(task.attachments?.length ?? 0) > 0 && (
              <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {task.attachments!.length}
              </span>
            )}
          </div>
        </div>

        {assignees.length > 0 && (
          <div className="flex -space-x-1.5 shrink-0 pt-0.5">
            {assignees.slice(0, 3).map((a) => (
              <span
                key={a.uid}
                className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white ring-2 ring-white"
                style={{ backgroundColor: getInitialsColor(a.name) }}
                title={a.name}
              >
                {getInitials(a.name)}
              </span>
            ))}
            {assignees.length > 3 && (
              <span className="w-6 h-6 rounded-full bg-gray-300 flex items-center justify-center text-[9px] font-bold text-gray-600 ring-2 ring-white">
                +{assignees.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
    </button>
  )
}
