import { useRef, useState, useCallback, useEffect } from 'react'
import { Timestamp } from 'firebase/firestore'
import { updateTaskField } from '../../lib/firestore'
import { useAuthStore } from '../../store/authStore'
import type { Task, Client } from '../../types'

const DAY_PX = 36      // pixels per day
const ROW_H  = 38      // row height in pixels
const LABEL_W = 200    // left label column width

interface Props {
  tasks: Task[]
  clients: Client[]
  onOpenTask: (task: Task) => void
}

// ── Helpers ──────────────────────────────────────────────────
function startOfDay(d: Date) {
  const c = new Date(d); c.setHours(0,0,0,0); return c
}
function addDays(d: Date, n: number) {
  const c = new Date(d); c.setDate(c.getDate() + n); return c
}
function diffDays(a: Date, b: Date) {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86_400_000)
}
function fmtMonth(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}
function fmtDay(d: Date) {
  return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })
}

// ── Component ─────────────────────────────────────────────────
export default function GanttView({ tasks, clients, onOpenTask }: Props) {
  const { user } = useAuthStore()
  const scrollRef = useRef<HTMLDivElement>(null)

  // ── Build date range ──────────────────────────────────────
  const today = startOfDay(new Date())
  const datesArr = tasks.flatMap((t) => [
    t.dateStart ? startOfDay(t.dateStart.toDate()) : null,
    t.dateEnd   ? startOfDay(t.dateEnd.toDate())   : null,
  ]).filter(Boolean) as Date[]

  const viewStart = datesArr.length
    ? addDays(datesArr.reduce((a, b) => a < b ? a : b), -7)
    : addDays(today, -7)
  const viewEnd = datesArr.length
    ? addDays(datesArr.reduce((a, b) => a > b ? a : b), 14)
    : addDays(today, 30)

  const totalDays = diffDays(viewStart, viewEnd) + 1
  const totalW    = totalDays * DAY_PX

  // ── Group tasks by bucket ──────────────────────────────────
  const withDates = tasks.filter((t) => !t.completed && (t.dateStart || t.dateEnd))
  const withoutDates = tasks.filter((t) => !t.completed && !t.dateStart && !t.dateEnd)

  const groups = new Map<string, Task[]>()
  for (const t of withDates) {
    const key = t.bucket || 'No Bucket'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(t)
  }

  // ── Drag / Resize state ────────────────────────────────────
  type DragState = {
    taskId: string
    mode: 'move' | 'resize'
    startX: number
    origStart: Date | null
    origEnd: Date | null
  }
  const drag = useRef<DragState | null>(null)
  const [dragOffsets, setDragOffsets] = useState<Record<string, { dx: number; dw: number }>>({})

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!drag.current) return
    const { taskId, mode, startX, origStart, origEnd } = drag.current
    const deltaPx  = e.clientX - startX
    const deltaDays = Math.round(deltaPx / DAY_PX)
    if (mode === 'move') {
      setDragOffsets({ [taskId]: { dx: deltaDays * DAY_PX, dw: 0 } })
    } else {
      setDragOffsets({ [taskId]: { dx: 0, dw: deltaDays * DAY_PX } })
    }
    void origStart; void origEnd
  }, [])

  const onMouseUp = useCallback(async (e: MouseEvent) => {
    if (!drag.current || !user) { drag.current = null; setDragOffsets({}); return }
    const { taskId, mode, startX, origStart, origEnd } = drag.current
    drag.current = null
    setDragOffsets({})

    const deltaPx  = e.clientX - startX
    const deltaDays = Math.round(deltaPx / DAY_PX)
    if (deltaDays === 0) return

    const task = tasks.find((t) => t.id === taskId)
    if (!task) return

    if (mode === 'move') {
      if (origStart) await updateTaskField(taskId, 'dateStart', Timestamp.fromDate(addDays(origStart, deltaDays)), user.uid, user.name, task.dateStart)
      if (origEnd)   await updateTaskField(taskId, 'dateEnd',   Timestamp.fromDate(addDays(origEnd,   deltaDays)), user.uid, user.name, task.dateEnd)
    } else {
      if (origEnd) {
        const newEnd = addDays(origEnd, deltaDays)
        if (newEnd > (origStart ?? new Date(0)))
          await updateTaskField(taskId, 'dateEnd', Timestamp.fromDate(newEnd), user.uid, user.name, task.dateEnd)
      }
    }
  }, [user, tasks])

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup',  onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup',  onMouseUp)
    }
  }, [onMouseMove, onMouseUp])

  function startDrag(e: React.MouseEvent, task: Task, mode: 'move' | 'resize') {
    e.preventDefault()
    drag.current = {
      taskId:    task.id,
      mode,
      startX:    e.clientX,
      origStart: task.dateStart ? startOfDay(task.dateStart.toDate()) : null,
      origEnd:   task.dateEnd   ? startOfDay(task.dateEnd.toDate())   : null,
    }
  }

  // ── Bar for a task ──────────────────────────────────────────
  function TaskBar({ task }: { task: Task }) {
    const offset = dragOffsets[task.id]
    const taskStart = task.dateStart ? startOfDay(task.dateStart.toDate()) : today
    const taskEnd   = task.dateEnd   ? startOfDay(task.dateEnd.toDate())   : taskStart

    const x0 = diffDays(viewStart, taskStart) * DAY_PX + (offset?.dx ?? 0)
    const w0  = Math.max((diffDays(taskStart, taskEnd) + 1) * DAY_PX + (offset?.dw ?? 0), DAY_PX)

    const client = clients.find((c) => c.id === task.clientId)

    return (
      <div
        className="absolute top-1.5 h-[26px] rounded-md flex items-center overflow-hidden cursor-grab active:cursor-grabbing select-none group/bar"
        style={{ left: x0, width: w0, backgroundColor: '#1D9E75' }}
        onMouseDown={(e) => startDrag(e, task, 'move')}
        onClick={() => onOpenTask(task)}
      >
        <span className="pl-2 pr-1 text-xs font-medium text-white truncate flex-1">
          {task.title}{client ? ` · ${client.name}` : ''}
        </span>
        {/* Resize handle */}
        <div
          className="w-2 h-full cursor-ew-resize bg-black/20 hover:bg-black/40 shrink-0"
          onMouseDown={(e) => { e.stopPropagation(); startDrag(e, task, 'resize') }}
        />
      </div>
    )
  }

  // ── Day header ──────────────────────────────────────────────
  const todayOffset = diffDays(viewStart, today)

  // Build month markers
  const monthMarkers: { label: string; x: number }[] = []
  let cur = new Date(viewStart)
  while (cur <= viewEnd) {
    monthMarkers.push({ label: fmtMonth(cur), x: diffDays(viewStart, cur) * DAY_PX })
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Outer scroll container */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left label column — fixed */}
        <div className="shrink-0 border-r border-gray-200 dark:border-gray-700 overflow-y-auto" style={{ width: LABEL_W }}>
          {/* Header spacer */}
          <div className="h-[52px] border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800" />
          {[...groups.entries()].map(([group, groupTasks]) => (
            <div key={group}>
              <div className="flex items-center bg-gray-50 dark:bg-gray-800/50 px-3 py-1.5 border-b border-gray-100 dark:border-gray-800">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 truncate">{group}</span>
              </div>
              {groupTasks.map((t) => (
                <div key={t.id} className="flex items-center border-b border-gray-100 dark:border-gray-800 px-3" style={{ height: ROW_H }}>
                  <button onClick={() => onOpenTask(t)} className="text-xs text-gray-700 dark:text-gray-300 hover:text-green-600 dark:hover:text-green-400 truncate text-left">
                    {t.title}
                  </button>
                </div>
              ))}
            </div>
          ))}
          {withoutDates.length > 0 && (
            <>
              <div className="flex items-center bg-gray-50 dark:bg-gray-800/50 px-3 py-1.5 border-b border-gray-100 dark:border-gray-800">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">No Date</span>
              </div>
              {withoutDates.map((t) => (
                <div key={t.id} className="flex items-center border-b border-gray-100 dark:border-gray-800 px-3" style={{ height: ROW_H }}>
                  <button onClick={() => onOpenTask(t)} className="text-xs text-gray-400 hover:text-gray-600 dark:text-gray-600 dark:hover:text-gray-400 truncate text-left">
                    {t.title}
                  </button>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Scrollable grid */}
        <div ref={scrollRef} className="flex-1 overflow-auto">
          <div style={{ width: totalW, position: 'relative' }}>
            {/* Month header */}
            <div className="sticky top-0 z-10 bg-white dark:bg-gray-900" style={{ height: 52 }}>
              {/* Month labels */}
              <div className="relative border-b border-gray-200 dark:border-gray-700" style={{ height: 24 }}>
                {monthMarkers.map((m) => (
                  <span key={m.x} className="absolute top-1 text-[10px] font-semibold text-gray-500 dark:text-gray-400" style={{ left: m.x + 4 }}>
                    {m.label}
                  </span>
                ))}
              </div>
              {/* Day columns */}
              <div className="relative flex border-b border-gray-200 dark:border-gray-700" style={{ height: 28 }}>
                {Array.from({ length: totalDays }, (_, i) => {
                  const d = addDays(viewStart, i)
                  const isToday = i === todayOffset
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6
                  return (
                    <div
                      key={i}
                      className={`flex-shrink-0 flex items-center justify-center border-r text-[10px] font-medium ${
                        isToday ? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400 border-green-200 dark:border-green-800' :
                        isWeekend ? 'bg-gray-50 text-gray-400 dark:bg-gray-800/50 dark:text-gray-600 border-gray-100 dark:border-gray-800' :
                        'text-gray-500 dark:text-gray-400 border-gray-100 dark:border-gray-800'
                      }`}
                      style={{ width: DAY_PX }}
                    >
                      {fmtDay(d).split(' ').map((s, si) => (
                        <span key={si} className={si === 0 ? 'mr-0.5 text-[9px] uppercase' : ''}>{s}</span>
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Task rows */}
            {[...groups.entries()].map(([group, groupTasks]) => (
              <div key={group}>
                {/* Group header row */}
                <div className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30" style={{ height: 30, position: 'relative' }}>
                  {/* Today line */}
                  {todayOffset >= 0 && todayOffset < totalDays && (
                    <div className="absolute top-0 bottom-0 w-px bg-green-400 dark:bg-green-600 opacity-50 z-10" style={{ left: todayOffset * DAY_PX }} />
                  )}
                  {/* Gridlines */}
                  {Array.from({ length: totalDays }, (_, i) => (
                    <div key={i} className="absolute top-0 bottom-0 w-px bg-gray-100 dark:bg-gray-800" style={{ left: i * DAY_PX }} />
                  ))}
                </div>
                {groupTasks.map((task) => (
                  <div key={task.id} className="relative border-b border-gray-100 dark:border-gray-800" style={{ height: ROW_H }}>
                    {/* Gridlines */}
                    {Array.from({ length: totalDays }, (_, i) => {
                      const d = addDays(viewStart, i)
                      const isWeekend = d.getDay() === 0 || d.getDay() === 6
                      return (
                        <div key={i} className={`absolute top-0 bottom-0 w-px ${isWeekend ? 'bg-gray-200 dark:bg-gray-700' : 'bg-gray-100 dark:bg-gray-800'}`} style={{ left: i * DAY_PX }} />
                      )
                    })}
                    {/* Today highlight */}
                    {todayOffset >= 0 && todayOffset < totalDays && (
                      <div className="absolute top-0 bottom-0 bg-green-50 dark:bg-green-900/10 z-0" style={{ left: todayOffset * DAY_PX, width: DAY_PX }} />
                    )}
                    {(task.dateStart || task.dateEnd) && <TaskBar task={task} />}
                  </div>
                ))}
              </div>
            ))}

            {/* No-date rows */}
            {withoutDates.length > 0 && (
              <>
                <div className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30" style={{ height: 30 }} />
                {withoutDates.map((task) => (
                  <div key={task.id} className="relative border-b border-gray-100 dark:border-gray-800" style={{ height: ROW_H }}>
                    {Array.from({ length: totalDays }, (_, i) => (
                      <div key={i} className="absolute top-0 bottom-0 w-px bg-gray-100 dark:bg-gray-800" style={{ left: i * DAY_PX }} />
                    ))}
                    <div className="absolute inset-y-1.5 left-2 right-2 rounded-md bg-gray-100 dark:bg-gray-800 flex items-center px-2">
                      <span className="text-xs text-gray-400 dark:text-gray-600">no date</span>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
