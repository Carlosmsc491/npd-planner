import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { EventDropArg, EventClickArg, DayCellContentArg, EventApi } from '@fullcalendar/core'
import type { EventResizeDoneArg } from '@fullcalendar/interaction'
import {
  Hammer, Truck, Wrench, Star,
  Calendar as CalendarIcon,
  Package, MapPin, Flag, Clock, Zap,
  ChevronDown, Search, X,
  type LucideIcon,
} from 'lucide-react'
import AppLayout from '../components/ui/AppLayout'
import NewTaskModal from '../components/ui/NewTaskModal'
import { subscribeToAllTasks, updateTaskField } from '../lib/firestore'
import { useAuthStore } from '../store/authStore'
import { useBoardStore } from '../store/boardStore'
import { useDateTypeStore } from '../store/dateTypeStore'
import { getBoardColor, getBucketColor } from '../utils/colorUtils'
import { toFirestoreDate, toLocalDateString, toFCExclusiveEnd, fromFCExclusiveEnd } from '../utils/dateUtils'
import type { Task, Board } from '../types'

const ICON_MAP: Record<string, LucideIcon> = {
  Hammer, Truck, Wrench, Star, Calendar: CalendarIcon,
  Package, MapPin, Flag, Clock, Zap,
}

const LS_KEY = 'npd:calendar_hidden_boards'

// Returns the nth occurrence of a weekday in a given month (weekday: 0=Sun…6=Sat)
// optional offset: additional days to add after finding the date
function nthWeekday(year: number, month: number, weekday: number, nth: number, offset = 0): string {
  const d = new Date(year, month - 1, 1)
  let count = 0
  while (d.getMonth() === month - 1) {
    if (d.getDay() === weekday) { count++; if (count === nth) break }
    d.setDate(d.getDate() + 1)
  }
  d.setDate(d.getDate() + offset)
  return d.toISOString().split('T')[0]
}

// Returns the last occurrence of a weekday in a given month
function lastWeekday(year: number, month: number, weekday: number): string {
  const d = new Date(year, month, 0) // last day of month
  while (d.getDay() !== weekday) d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]
}

function mkHol(id: string, name: string, start: string): object {
  return { id, title: `🇺🇸 ${name}`, start, allDay: true, backgroundColor: '#EF444420', borderColor: '#EF4444', textColor: '#991B1B', editable: false, extendedProps: { isHoliday: true, _groupOrder: 999999 } }
}

function loadHidden(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return new Set(JSON.parse(raw) as string[])
  } catch { /* ignore */ }
  return new Set()
}


export default function CalendarPage() {
  const { user } = useAuthStore()
  const { boards } = useBoardStore()
  const { dateTypes } = useDateTypeStore()
  const [tasks, setTasks] = useState<Task[]>([])
  const [hiddenBoards, setHiddenBoards] = useState<Set<string>>(loadHidden)
  const [selectedBuckets, setSelectedBuckets] = useState<Set<string>>(new Set())
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set())
  const [hideEventDates, setHideEventDates] = useState(false)
  const [showHolidays, setShowHolidays] = useState(false)
  const [taskSearch, setTaskSearch] = useState('')
  const [bucketOpen, setBucketOpen] = useState(false)
  const [taskOpen, setTaskOpen] = useState(false)
  const calendarRef = useRef<FullCalendar>(null)

  // New task from calendar states
  const [newTaskDate, setNewTaskDate] = useState<Date | null>(null)
  const [showBoardPicker, setShowBoardPicker] = useState(false)
  const [pendingDate, setPendingDate] = useState<Date | null>(null)
  const [selectedBoardForNew, setSelectedBoardForNew] = useState<Board | null>(null)

  useEffect(() => {
    if (boards.length === 0) return
    const boardIds = boards.map((b) => b.id)
    const unsub = subscribeToAllTasks(boardIds, setTasks)
    return unsub
  }, [boards])

  const withDates = tasks.filter((t) => !t.completed && (t.dateStart || t.dateEnd) && !hiddenBoards.has(t.boardId))
  const allBuckets = [...new Set(withDates.map((t) => t.bucket).filter(Boolean))] as string[]

  function toggleBucket(b: string) {
    setSelectedBuckets((prev) => { const n = new Set(prev); n.has(b) ? n.delete(b) : n.add(b); return n })
  }
  function toggleTask(id: string) {
    setSelectedTaskIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const filteredTasks = withDates
    .filter((t) => selectedBuckets.size === 0 || selectedBuckets.has(t.bucket))
    .filter((t) => selectedTaskIds.size === 0 || selectedTaskIds.has(t.id))

  const taskSearchResults = withDates.filter((t) =>
    t.title.toLowerCase().includes(taskSearch.toLowerCase())
  )

  const hasFilters = selectedBuckets.size > 0 || selectedTaskIds.size > 0

  // US Federal + major holidays, computed for current year ± 1
  const holidayEvents = (() => {
    if (!showHolidays) return []
    const result: object[] = []
    const years = [new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1]
    years.forEach((y) => {
      // Fixed-date holidays
      const fixed: [string, string][] = [
        [`${y}-01-01`, "New Year's Day"],
        [`${y}-06-19`, 'Juneteenth'],
        [`${y}-07-04`, 'Independence Day'],
        [`${y}-11-11`, 'Veterans Day'],
        [`${y}-12-25`, 'Christmas Day'],
      ]
      fixed.forEach(([date, name]) => {
        result.push({ id: `hol-${y}-${name}`, title: `🇺🇸 ${name}`, start: date, allDay: true, backgroundColor: '#EF444420', borderColor: '#EF4444', textColor: '#991B1B', editable: false, extendedProps: { isHoliday: true, _groupOrder: 999999 } })
      })

      // MLK Day — 3rd Monday of January
      result.push(...[nthWeekday(y, 1, 1, 3)].map((d) => mkHol(`hol-${y}-mlk`, "Martin Luther King Jr. Day", d)))
      // Presidents Day — 3rd Monday of February
      result.push(...[nthWeekday(y, 2, 1, 3)].map((d) => mkHol(`hol-${y}-pres`, "Presidents' Day", d)))
      // Memorial Day — last Monday of May
      result.push(...[lastWeekday(y, 5, 1)].map((d) => mkHol(`hol-${y}-mem`, "Memorial Day", d)))
      // Labor Day — 1st Monday of September
      result.push(...[nthWeekday(y, 9, 1, 1)].map((d) => mkHol(`hol-${y}-labor`, "Labor Day", d)))
      // Columbus Day — 2nd Monday of October
      result.push(...[nthWeekday(y, 10, 1, 2)].map((d) => mkHol(`hol-${y}-col`, "Columbus Day", d)))
      // Thanksgiving — 4th Thursday of November
      result.push(...[nthWeekday(y, 11, 4, 4)].map((d) => mkHol(`hol-${y}-thx`, "Thanksgiving Day", d)))
      // Black Friday (day after Thanksgiving)
      result.push(...[nthWeekday(y, 11, 4, 4, 1)].map((d) => mkHol(`hol-${y}-bf`, "Black Friday", d)))
      // Valentine's Day
      result.push(...[`${y}-02-14`].map((d) => mkHol(`hol-${y}-val`, "Valentine's Day", d)))
      // Mother's Day — 2nd Sunday of May
      result.push(...[nthWeekday(y, 5, 0, 2)].map((d) => mkHol(`hol-${y}-mom`, "Mother's Day", d)))
      // Father's Day — 3rd Sunday of June
      result.push(...[nthWeekday(y, 6, 0, 3)].map((d) => mkHol(`hol-${y}-dad`, "Father's Day", d)))
      // Halloween
      result.push(...[`${y}-10-31`].map((d) => mkHol(`hol-${y}-hal`, "Halloween", d)))
      // Christmas Eve
      result.push(...[`${y}-12-24`].map((d) => mkHol(`hol-${y}-xeve`, "Christmas Eve", d)))
      // New Year's Eve
      result.push(...[`${y}-12-31`].map((d) => mkHol(`hol-${y}-nye`, "New Year's Eve", d)))
    })
    return result
  })()

  const holidayDateSet = new Set(holidayEvents.map((e) => (e as { start: string }).start))

  // Build events: subtle parent bar + one bar per taskDate entry.
  // _groupOrder ensures FullCalendar places parent → children vertically together.
  const events: object[] = []
  filteredTasks.forEach((t, taskIdx) => {
    const board = boards.find((b) => b.id === t.boardId)
    const boardColor = board ? getBoardColor(board) : '#888'
    const eventColor = getBucketColor(t.bucket, board) ?? boardColor
    events.push({
      id: t.id,
      title: t.title,
      start: toLocalDateString((t.dateStart ?? t.dateEnd)!.toDate()),
      end: t.dateEnd ? toFCExclusiveEnd(t.dateEnd.toDate()) : undefined,
      allDay: true,
      backgroundColor: eventColor + '40',
      borderColor: eventColor + '90',
      textColor: '#ffffff',
      extendedProps: { task: t, board, isEventDate: false, _groupOrder: taskIdx * 20 },
      editable: true,
    })
    if (!hideEventDates) {
      ;(t.taskDates ?? []).forEach((td, dateIdx) => {
        const dt = dateTypes.find((x) => x.key === td.typeKey)
        if (!dt) return
        events.push({
          id: `${t.id}-${td.id}`,
          title: dt.label,
          start: toLocalDateString(td.dateStart.toDate()),
          end: td.dateEnd ? toFCExclusiveEnd(td.dateEnd.toDate()) : undefined,
          allDay: true,
          backgroundColor: dt.color + 'D0',
          borderColor: dt.color,
          textColor: '#ffffff',
          extendedProps: { task: t, board, taskDate: td, dateType: dt, isEventDate: true, _groupOrder: taskIdx * 20 + 1 + dateIdx },
          editable: false,
        })
      })
    }
  })

  function toggleBoard(id: string) {
    setHiddenBoards((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      localStorage.setItem(LS_KEY, JSON.stringify([...next]))
      return next
    })
  }

  async function handleEventDrop({ event }: EventDropArg) {
    if (!user || !event.start || event.extendedProps.isEventDate) return
    const task = event.extendedProps.task as Task
    const board = event.extendedProps.board as Board | undefined
    const newStart = toFirestoreDate(event.start)
    const newEnd = event.end ? toFirestoreDate(fromFCExclusiveEnd(event.end)) : null
    await updateTaskField(task.id, 'dateStart', newStart, user.uid, user.name, task.dateStart, board?.type)
    if (newEnd) await updateTaskField(task.id, 'dateEnd', newEnd, user.uid, user.name, task.dateEnd, board?.type)
  }

  async function handleEventResize({ event }: EventResizeDoneArg) {
    if (!user || event.extendedProps.isEventDate) return
    const task = event.extendedProps.task as Task
    const board = event.extendedProps.board as Board | undefined
    if (event.start) await updateTaskField(task.id, 'dateStart', toFirestoreDate(event.start), user.uid, user.name, task.dateStart, board?.type)
    if (event.end)   await updateTaskField(task.id, 'dateEnd', toFirestoreDate(fromFCExclusiveEnd(event.end)), user.uid, user.name, task.dateEnd, board?.type)
  }

  const navigate = useNavigate()

  function handleEventClick({ event }: EventClickArg) {
    const task = event.extendedProps.task as Task
    navigate(`/task/${task.id}`)
  }

  function getBoardLabel(board: Board) {
    const color = getBoardColor(board)
    const hidden = hiddenBoards.has(board.id)
    return (
      <button
        key={board.id}
        onClick={() => toggleBoard(board.id)}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-all ${
          hidden ? 'opacity-40' : ''
        }`}
        style={{
          backgroundColor: hidden ? 'transparent' : color + '20',
          borderColor: color,
          color,
        }}
      >
        <span
          className="h-2 w-2 rounded-full shrink-0"
          style={{ backgroundColor: hidden ? 'transparent' : color, borderColor: color, borderWidth: hidden ? 1.5 : 0, borderStyle: 'solid' }}
        />
        {board.name}
      </button>
    )
  }

  return (
    <AppLayout>
      <div className="flex h-full flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-gray-200 px-6 py-3 bg-white dark:bg-gray-900 dark:border-gray-700 shrink-0 flex-wrap">
          <h1 className="text-sm font-bold text-gray-900 dark:text-white">Master Calendar</h1>
          <span className="text-xs text-gray-400">
            {filteredTasks.length}{hasFilters ? ` of ${withDates.length}` : ''} event{filteredTasks.length !== 1 ? 's' : ''}
          </span>

          {/* Board toggles */}
          <div className="flex items-center gap-2 flex-wrap">
            {boards.map((board) => getBoardLabel(board))}
          </div>

          <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />

          {/* Bucket filter */}
          <div className="relative">
            <button
              onClick={() => { setBucketOpen((o) => !o); setTaskOpen(false) }}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                selectedBuckets.size > 0
                  ? 'border-green-500 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-500'
              }`}
            >
              Buckets
              {selectedBuckets.size > 0 && (
                <span className="rounded-full bg-green-500 text-white text-[10px] font-bold px-1.5 py-0.5 leading-none">
                  {selectedBuckets.size}
                </span>
              )}
              <ChevronDown size={12} />
            </button>
            {bucketOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setBucketOpen(false)} />
                <div className="absolute left-0 top-full z-20 mt-1 w-48 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg overflow-hidden">
                  <div className="p-1">
                    {allBuckets.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">No buckets found</p>}
                    {allBuckets.map((b) => (
                      <button
                        key={b}
                        onClick={() => toggleBucket(b)}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors text-left ${
                          selectedBuckets.has(b)
                            ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                      >
                        <span className={`h-2 w-2 rounded-full shrink-0 ${selectedBuckets.has(b) ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                        {b}
                      </button>
                    ))}
                  </div>
                  {selectedBuckets.size > 0 && (
                    <div className="border-t border-gray-100 dark:border-gray-700 p-1">
                      <button onClick={() => { setSelectedBuckets(new Set()); setBucketOpen(false) }} className="w-full text-xs text-gray-400 hover:text-red-500 px-3 py-1.5 text-left transition-colors">
                        Clear selection
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Task filter */}
          <div className="relative">
            <button
              onClick={() => { setTaskOpen((o) => !o); setBucketOpen(false) }}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                selectedTaskIds.size > 0
                  ? 'border-green-500 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-500'
              }`}
            >
              Tasks
              {selectedTaskIds.size > 0 && (
                <span className="rounded-full bg-green-500 text-white text-[10px] font-bold px-1.5 py-0.5 leading-none">
                  {selectedTaskIds.size}
                </span>
              )}
              <ChevronDown size={12} />
            </button>
            {taskOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setTaskOpen(false)} />
                <div className="absolute left-0 top-full z-20 mt-1 w-64 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg overflow-hidden">
                  <div className="p-2 border-b border-gray-100 dark:border-gray-700">
                    <div className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-600 px-2 py-1.5 bg-gray-50 dark:bg-gray-700">
                      <Search size={12} className="text-gray-400 shrink-0" />
                      <input
                        autoFocus
                        value={taskSearch}
                        onChange={(e) => setTaskSearch(e.target.value)}
                        placeholder="Search tasks…"
                        className="flex-1 bg-transparent text-xs text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none"
                      />
                      {taskSearch && <button onClick={() => setTaskSearch('')}><X size={11} className="text-gray-400" /></button>}
                    </div>
                  </div>
                  <div className="max-h-52 overflow-y-auto p-1">
                    {taskSearchResults.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">No tasks found</p>}
                    {taskSearchResults.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => toggleTask(t.id)}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors text-left ${
                          selectedTaskIds.has(t.id)
                            ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                      >
                        <span className={`h-2 w-2 rounded-full shrink-0 ${selectedTaskIds.has(t.id) ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                        <span className="truncate">{t.title}</span>
                      </button>
                    ))}
                  </div>
                  {selectedTaskIds.size > 0 && (
                    <div className="border-t border-gray-100 dark:border-gray-700 p-1">
                      <button onClick={() => { setSelectedTaskIds(new Set()); setTaskOpen(false) }} className="w-full text-xs text-gray-400 hover:text-red-500 px-3 py-1.5 text-left transition-colors">
                        Clear selection
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Clear all */}
          {hasFilters && (
            <button
              onClick={() => { setSelectedBuckets(new Set()); setSelectedTaskIds(new Set()) }}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors"
            >
              <X size={12} /> Clear filters
            </button>
          )}

          {/* Hide Event Dates */}
          <button
            onClick={() => setHideEventDates((h) => !h)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              hideEventDates
                ? 'border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-500'
            }`}
          >
            {hideEventDates ? 'Show Event Dates' : 'Hide Event Dates'}
          </button>

          {/* US Holidays */}
          <button
            onClick={() => setShowHolidays((h) => !h)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              showHolidays
                ? 'border-red-400 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-500'
            }`}
          >
            🇺🇸 Holidays
          </button>
        </div>

        {/* Calendar */}
        <div className="flex-1 overflow-auto p-4">
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            headerToolbar={{
              left: 'title',
              center: 'dayGridMonth,timeGridWeek',
              right: 'prev,today,next',
            }}
            buttonText={{ today: 'Today', month: 'Month', week: 'Week', day: 'Day' }}
            titleFormat={() => ' '}
            datesSet={(arg) => {
              setTimeout(() => {
                const el = (calendarRef.current?.getApi() as unknown as { el: HTMLElement }).el.querySelector('.fc-toolbar-title')
                if (!el) return
                const d = arg.view.currentStart
                const month = d.toLocaleString('en-US', { month: 'long' })
                const year = d.getFullYear()
                el.innerHTML = `<strong>${month}</strong><span>${year}</span>`
              }, 0)
            }}
            events={[...events, ...holidayEvents]}
            eventOrder={(a: unknown, b: unknown) => {
              const ae = (a as EventApi).extendedProps as Record<string, number>
              const be = (b as EventApi).extendedProps as Record<string, number>
              return (ae._groupOrder ?? 0) - (be._groupOrder ?? 0)
            }}
            height="100%"
            editable={true}
            droppable={true}
            eventDurationEditable={true}
            eventResizableFromStart={true}
            eventDisplay="block"
            dayMaxEvents={6}
            eventTimeFormat={{ hour: 'numeric', minute: '2-digit', meridiem: 'short' }}
            eventDrop={handleEventDrop}
            eventResize={handleEventResize}
            eventClick={handleEventClick}
            eventContent={(arg) => {
              const { isEventDate, dateType, task: parentTask } = arg.event.extendedProps as {
                isEventDate: boolean
                dateType?: typeof dateTypes[0]
                task: Task
              }

              if (isEventDate && dateType) {
                const Icon = ICON_MAP[dateType.icon] ?? CalendarIcon
                return (
                  <div className="flex flex-col justify-center px-1.5 py-0.5 h-full overflow-hidden">
                    <div className="flex items-center gap-1 min-w-0">
                      <div className="h-3.5 w-3.5 rounded-full shrink-0 flex items-center justify-center bg-white/20">
                        <Icon size={8} color="#fff" />
                      </div>
                      <span className="text-[11px] font-bold leading-tight truncate">{arg.event.title}</span>
                    </div>
                    <span className="text-[10px] leading-tight truncate pl-[18px] opacity-60">{parentTask.title}</span>
                  </div>
                )
              }

              return (
                <div className="flex items-center px-2 h-full overflow-hidden">
                  <span className="text-[11px] font-medium leading-tight truncate opacity-80">{arg.event.title}</span>
                </div>
              )
            }}
            dayCellClassNames={(arg) => {
              const iso = arg.date.toISOString().split('T')[0]
              return holidayDateSet.has(iso) ? ['fc-day-holiday'] : []
            }}
            dayCellContent={(arg: DayCellContentArg) => (
              <div className="group/day relative flex items-center justify-between w-full px-1">
                <span className="text-sm">{arg.dayNumberText}</span>
                <button
                  onMouseDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setPendingDate(arg.date)
                    setShowBoardPicker(true)
                  }}
                  className="hidden group-hover/day:flex h-5 w-5 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-300 hover:bg-green-500 hover:text-white text-xs font-bold transition-colors"
                >
                  +
                </button>
              </div>
            )}
          />
        </div>

        {/* Board Picker */}
        {showBoardPicker && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-2xl w-80">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
                Select Board
              </h3>
              <div className="space-y-2">
                {boards.map((board) => (
                  <button
                    key={board.id}
                    onClick={() => {
                      setSelectedBoardForNew(board)
                      setNewTaskDate(pendingDate)
                      setShowBoardPicker(false)
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
                  >
                    <span
                      className="h-3 w-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: board.color }}
                    />
                    <span className="text-sm text-gray-800 dark:text-gray-200">{board.name}</span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => { setShowBoardPicker(false); setPendingDate(null) }}
                className="mt-4 w-full text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* New Task Modal */}
        {newTaskDate && selectedBoardForNew && user && (
          <NewTaskModal
            board={selectedBoardForNew}
            defaultDate={newTaskDate}
            onClose={() => {
              setNewTaskDate(null)
              setSelectedBoardForNew(null)
            }}
          />
        )}
      </div>
    </AppLayout>
  )
}
