import { useRef, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { EventDropArg, EventClickArg, EventApi } from '@fullcalendar/core'
import type { EventResizeDoneArg, DateClickArg } from '@fullcalendar/interaction'
import {
  Hammer, Truck, Wrench, Star,
  Calendar as CalendarIcon,
  Package, MapPin, Flag, Clock, Zap,
  ChevronDown, Search, X,
  type LucideIcon,
} from 'lucide-react'
import { updateTaskField } from '../../lib/firestore'
import { useAuthStore } from '../../store/authStore'
import { useDateTypeStore } from '../../store/dateTypeStore'
import { getBoardColor, getBucketColor } from '../../utils/colorUtils'
import { toFirestoreDate, toLocalDateString, toFCExclusiveEnd, fromFCExclusiveEnd } from '../../utils/dateUtils'
import type { Task, Board } from '../../types'

const ICON_MAP: Record<string, LucideIcon> = {
  Hammer, Truck, Wrench, Star, Calendar: CalendarIcon,
  Package, MapPin, Flag, Clock, Zap,
}

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

function lastWeekday(year: number, month: number, weekday: number): string {
  const d = new Date(year, month, 0)
  while (d.getDay() !== weekday) d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]
}

function mkHol(id: string, name: string, start: string): object {
  return { id, title: `🇺🇸 ${name}`, start, allDay: true, backgroundColor: '#EF444420', borderColor: '#EF4444', textColor: '#991B1B', editable: false, extendedProps: { isHoliday: true, _groupOrder: 999999 } }
}

interface Props {
  tasks: Task[]
  board: Board
  onOpenTask: (task: Task) => void
  onDateClick: (date: Date) => void
}


export default function BoardCalendar({ tasks, board, onOpenTask, onDateClick }: Props) {
  const { user } = useAuthStore()
  const { dateTypes } = useDateTypeStore()
  const calRef = useRef<FullCalendar>(null)
  const color = getBoardColor(board)

  // ── Filters ───────────────────────────────────────────────────────────────
  const [selectedBuckets, setSelectedBuckets] = useState<Set<string>>(new Set())
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set())
  const [hideEventDates, setHideEventDates] = useState(false)
  const [showHolidays, setShowHolidays] = useState(false)
  const [taskSearch, setTaskSearch] = useState('')
  const [bucketOpen, setBucketOpen] = useState(false)
  const [taskOpen, setTaskOpen] = useState(false)

  const withDates = tasks.filter((t) => !t.completed && (t.dateStart || t.dateEnd))
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

  // Build events: subtle parent bar + one bar per taskDate entry.
  // Each event gets a _groupOrder so FullCalendar places parent → children together.
  const events: object[] = []
  filteredTasks.forEach((t, taskIdx) => {
    const eventColor = getBucketColor(t.bucket, board) ?? color
    events.push({
      id: t.id,
      title: t.title,
      start: toLocalDateString((t.dateStart ?? t.dateEnd)!.toDate()),
      end: t.dateEnd ? toFCExclusiveEnd(t.dateEnd.toDate()) : undefined,
      allDay: true,
      backgroundColor: eventColor + '40',
      borderColor: eventColor + '90',
      textColor: '#ffffff',
      extendedProps: { task: t, isEventDate: false, _groupOrder: taskIdx * 20 },
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
          extendedProps: { task: t, taskDate: td, dateType: dt, isEventDate: true, _groupOrder: taskIdx * 20 + 1 + dateIdx },
          editable: false,
        })
      })
    }
  })

  const holidayEvents = (() => {
    if (!showHolidays) return []
    const result: object[] = []
    const years = [new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1]
    years.forEach((y) => {
      result.push(
        mkHol(`ny-${y}`,       "New Year's Day",          `${y}-01-01`),
        mkHol(`mlk-${y}`,      'MLK Day',                 nthWeekday(y, 1, 1, 3)),
        mkHol(`pres-${y}`,     "Presidents' Day",         nthWeekday(y, 2, 1, 3)),
        mkHol(`mem-${y}`,      'Memorial Day',            lastWeekday(y, 5, 1)),
        mkHol(`june-${y}`,     'Juneteenth',              `${y}-06-19`),
        mkHol(`july4-${y}`,    'Independence Day',        `${y}-07-04`),
        mkHol(`labor-${y}`,    'Labor Day',               nthWeekday(y, 9, 1, 1)),
        mkHol(`col-${y}`,      'Columbus Day',            nthWeekday(y, 10, 1, 2)),
        mkHol(`vet-${y}`,      'Veterans Day',            `${y}-11-11`),
        mkHol(`thx-${y}`,      'Thanksgiving',            nthWeekday(y, 11, 4, 4)),
        mkHol(`thxf-${y}`,     'Black Friday',            nthWeekday(y, 11, 4, 4, 1)),
        mkHol(`xmas-${y}`,     'Christmas',               `${y}-12-25`),
        mkHol(`val-${y}`,      "Valentine's Day",         `${y}-02-14`),
        mkHol(`hal-${y}`,      'Halloween',               `${y}-10-31`),
        mkHol(`moth-${y}`,     "Mother's Day",            nthWeekday(y, 5, 0, 2)),
        mkHol(`fath-${y}`,     "Father's Day",            nthWeekday(y, 6, 0, 3)),
        mkHol(`easter-${y}`,   'Easter',                  (() => { const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=((h+l-7*m+114)%31)+1; return `${y}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}` })()),
      )
    })
    return result
  })()

  const holidayDateSet = new Set(holidayEvents.map((e) => (e as { start: string }).start))

  async function handleEventDrop({ event }: EventDropArg) {
    if (!user || !event.start || event.extendedProps.isEventDate) return
    const task = event.extendedProps.task as Task
    const newStart = toFirestoreDate(event.start)
    const newEnd = event.end ? toFirestoreDate(fromFCExclusiveEnd(event.end)) : null
    await updateTaskField(task.id, 'dateStart', newStart, user.uid, user.name, task.dateStart)
    if (newEnd) await updateTaskField(task.id, 'dateEnd', newEnd, user.uid, user.name, task.dateEnd)
  }

  async function handleEventResize({ event }: EventResizeDoneArg) {
    if (!user || event.extendedProps.isEventDate) return
    const task = event.extendedProps.task as Task
    if (event.start) await updateTaskField(task.id, 'dateStart', toFirestoreDate(event.start), user.uid, user.name, task.dateStart)
    if (event.end)   await updateTaskField(task.id, 'dateEnd', toFirestoreDate(fromFCExclusiveEnd(event.end)), user.uid, user.name, task.dateEnd)
  }

  function handleEventClick({ event }: EventClickArg) {
    onOpenTask(event.extendedProps.task as Task) // always opens parent task
  }

  function handleDateClick({ date }: DateClickArg) {
    onDateClick(date)
  }

  const hasFilters = selectedBuckets.size > 0 || selectedTaskIds.size > 0

  return (
    <div className="h-full flex flex-col">

      {/* ── Filter bar ── */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-700 shrink-0 flex-wrap">

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
                  {allBuckets.length === 0 && (
                    <p className="px-3 py-2 text-xs text-gray-400">No buckets found</p>
                  )}
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
                    <button
                      onClick={() => { setSelectedBuckets(new Set()); setBucketOpen(false) }}
                      className="w-full text-xs text-gray-400 hover:text-red-500 px-3 py-1.5 text-left transition-colors"
                    >
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
                  {taskSearchResults.length === 0 && (
                    <p className="px-3 py-2 text-xs text-gray-400">No tasks found</p>
                  )}
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
                    <button
                      onClick={() => { setSelectedTaskIds(new Set()); setTaskOpen(false) }}
                      className="w-full text-xs text-gray-400 hover:text-red-500 px-3 py-1.5 text-left transition-colors"
                    >
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

        {/* Hide Event Dates toggle */}
        <button
          onClick={() => setHideEventDates((h) => !h)}
          className={`ml-auto flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
            hideEventDates
              ? 'border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
              : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-500'
          }`}
        >
          {hideEventDates ? 'Show Event Dates' : 'Hide Event Dates'}
        </button>

        {/* US Holidays toggle */}
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

      {/* ── Calendar ── */}
      <div className="flex-1 overflow-auto p-4">
      <FullCalendar
        ref={calRef}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        headerToolbar={{
          left: 'title',
          center: 'dayGridMonth,timeGridWeek,timeGridDay',
          right: 'prev,today,next',
        }}
        buttonText={{ today: 'Today', month: 'Month', week: 'Week', day: 'Day' }}
        titleFormat={() => ' '}
        datesSet={(arg) => {
          setTimeout(() => {
            const el = (calRef.current?.getApi() as unknown as { el: HTMLElement }).el.querySelector('.fc-toolbar-title')
            if (!el) return
            const d = arg.view.currentStart
            const month = d.toLocaleString('en-US', { month: 'long' })
            const year = d.getFullYear()
            el.innerHTML = `<strong>${month}</strong><span>${year}</span>`
          }, 0)
        }}
        height="100%"
        editable={true}
        droppable={true}
        selectable={true}
        eventDurationEditable={true}
        eventResizableFromStart={true}
        dayMaxEvents={6}
        events={[...events, ...holidayEvents]}
        eventOrder={(a: unknown, b: unknown) => {
          const ae = (a as EventApi).extendedProps as Record<string, number>
          const be = (b as EventApi).extendedProps as Record<string, number>
          return (ae._groupOrder ?? 0) - (be._groupOrder ?? 0)
        }}
        eventDrop={handleEventDrop}
        eventResize={handleEventResize}
        eventClick={handleEventClick}
        dateClick={handleDateClick}
        eventDisplay="block"
        eventTimeFormat={{ hour: 'numeric', minute: '2-digit', meridiem: 'short' }}
        eventContent={(arg) => {
          const { isEventDate, dateType, task: parentTask } = arg.event.extendedProps as {
            isEventDate: boolean
            dateType?: typeof dateTypes[0]
            task: Task
          }

          if (isEventDate && dateType) {
            // ── Event date sub-bar ──
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

          // ── Parent task bar (subtle container) ──
          return (
            <div className="flex items-center px-2 h-full overflow-hidden">
              <span className="text-[11px] font-medium leading-tight truncate opacity-80">{arg.event.title}</span>
            </div>
          )
        }}
        dayCellContent={(arg) => (
          <div className="group/day relative flex items-center justify-between w-full px-1">
            <span>{arg.dayNumberText}</span>
            <button
              onMouseDown={(e) => { e.preventDefault(); onDateClick(arg.date) }}
              className="hidden group-hover/day:flex h-5 w-5 items-center justify-center rounded-full bg-gray-200 text-gray-500 hover:bg-green-500 hover:text-white text-xs font-bold transition-colors"
            >
              +
            </button>
          </div>
        )}
        dayCellClassNames={(arg) => {
          const iso = arg.date.toISOString().split('T')[0]
          return holidayDateSet.has(iso) ? ['fc-day-holiday'] : []
        }}
      />
      </div>
    </div>
  )
}
