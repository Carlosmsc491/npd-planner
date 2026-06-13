import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, onSnapshot } from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { auth, db } from '../firebase'
import { useAuthStore } from '../store/authStore'
import type { Board, Task, Client } from '../types'
import { STATUS_COLORS, STATUS_LABELS } from '../types'

const DAY_MS = 24 * 60 * 60 * 1000

export default function DashboardPage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()

  const [boards, setBoards] = useState<Board[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [clients, setClients] = useState<Record<string, Client>>({})

  useEffect(() => {
    const u1 = onSnapshot(collection(db, 'boards'), (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Board))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      setBoards(list)
    })
    const u2 = onSnapshot(collection(db, 'tasks'), (snap) =>
      setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Task)))
    )
    const u3 = onSnapshot(collection(db, 'clients'), (snap) => {
      const map: Record<string, Client> = {}
      snap.docs.forEach((d) => { map[d.id] = { id: d.id, ...d.data() } as Client })
      setClients(map)
    })
    return () => { u1(); u2(); u3() }
  }, [])

  const active = useMemo(() => tasks.filter((t) => !t.completed), [tasks])

  const now = Date.now()
  const isOverdue = (t: Task) => !!t.dateEnd && t.status !== 'done' && t.dateEnd.toDate().getTime() < now
  const isDueThisWeek = (t: Task) => {
    if (!t.dateEnd) return false
    const d = t.dateEnd.toDate().getTime()
    return d >= now - DAY_MS && d <= now + 7 * DAY_MS
  }

  const kpis = useMemo(() => ({
    activeCount:   active.length,
    overdueCount:  active.filter(isOverdue).length,
    weekCount:     active.filter(isDueThisWeek).length,
    highCount:     active.filter((t) => t.priority === 'high').length,
  }), [active])

  // Per-board: active task count + 3 soonest-due preview tasks
  const boardData = useMemo(() => {
    return boards.map((board) => {
      const boardTasks = active.filter((t) => t.boardId === board.id)
      const preview = [...boardTasks]
        .sort((a, b) => (a.dateEnd?.seconds ?? Infinity) - (b.dateEnd?.seconds ?? Infinity))
        .slice(0, 3)
      return { board, count: boardTasks.length, preview }
    })
  }, [boards, active])

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 safe-top sticky top-0 z-20">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-green-500 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" className="w-4 h-4">
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
              </svg>
            </div>
            <span className="font-bold text-gray-900 text-base">NPD Planner</span>
          </div>
          <button
            onClick={() => signOut(auth)}
            className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-6">
        {/* Greeting */}
        <div>
          <p className="text-sm text-gray-400">Welcome back,</p>
          <h1 className="text-xl font-bold text-gray-900">{user?.name ?? 'there'} 👋</h1>
        </div>

        {/* Summary KPIs */}
        <div className="grid grid-cols-2 gap-3">
          <KpiCard label="Active tasks"   value={kpis.activeCount}  accent="#1D9E75" />
          <KpiCard label="Overdue"        value={kpis.overdueCount} accent="#E24B4A" alert={kpis.overdueCount > 0} />
          <KpiCard label="Due this week"  value={kpis.weekCount}    accent="#378ADD" />
          <KpiCard label="High priority"  value={kpis.highCount}    accent="#F59E0B" />
        </div>

        {/* Boards */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide px-1">Boards</h2>

          {boardData.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">Loading boards…</div>
          ) : (
            boardData.map(({ board, count, preview }) => (
              <div key={board.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {/* Board header */}
                <button
                  onClick={() => navigate(`/board/${board.id}`)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 active:scale-[0.99] transition"
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white text-base font-bold"
                    style={{ backgroundColor: board.color }}
                  >
                    {board.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900">{board.name}</p>
                    <p className="text-xs text-gray-400">{count} active task{count !== 1 ? 's' : ''}</p>
                  </div>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 text-gray-300 shrink-0">
                    <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                {/* 3 preview cards */}
                {preview.length > 0 && (
                  <div className="px-3 pb-3 space-y-2">
                    {preview.map((task) => (
                      <PreviewCard
                        key={task.id}
                        task={task}
                        client={clients[task.clientId]}
                        overdue={isOverdue(task)}
                        onClick={() => navigate(`/board/${board.id}`)}
                      />
                    ))}
                    {count > 3 && (
                      <button
                        onClick={() => navigate(`/board/${board.id}`)}
                        className="w-full text-center text-xs font-medium text-green-600 hover:text-green-700 py-1.5"
                      >
                        View all {count} →
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  )
}

function KpiCard({ label, value, accent, alert }: { label: string; value: number; accent: string; alert?: boolean }) {
  return (
    <div className={`rounded-2xl border bg-white px-4 py-3 ${alert ? 'border-red-200' : 'border-gray-100'} shadow-sm`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: accent }} />
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <p className="text-2xl font-bold" style={{ color: alert ? '#E24B4A' : '#111827' }}>{value}</p>
    </div>
  )
}

function PreviewCard({ task, client, overdue, onClick }: { task: Task; client?: Client; overdue: boolean; onClick: () => void }) {
  const colors = STATUS_COLORS[task.status]
  const dateStr = task.dateEnd
    ? task.dateEnd.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-gray-50 rounded-xl px-3 py-2.5 hover:bg-gray-100 active:scale-[0.99] transition"
    >
      <div className="flex items-start gap-2.5">
        <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${task.priority === 'high' ? 'bg-red-500' : 'bg-gray-300'}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 leading-snug truncate">{task.title}</p>
          {client && <p className="text-[10px] text-gray-400 uppercase mt-0.5">{client.name}</p>}
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: colors.bg, color: colors.text }}>
              {STATUS_LABELS[task.status]}
            </span>
            {dateStr && (
              <span className={`text-[10px] ${overdue ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>
                {overdue ? '⚠ ' : ''}{dateStr}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}
