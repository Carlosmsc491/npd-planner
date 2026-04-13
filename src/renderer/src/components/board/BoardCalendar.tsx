import { useRef } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { EventDropArg, EventClickArg } from '@fullcalendar/core'
import type { EventResizeDoneArg, DateClickArg } from '@fullcalendar/interaction'
import {
  Hammer, Truck, Wrench, Star,
  Calendar as CalendarIcon,
  Package, MapPin, Flag, Clock, Zap,
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

interface Props {
  tasks: Task[]
  board: Board
  onOpenTask: (task: Task) => void
  onDateClick: (date: Date) => void
}

// Calculate marker position as percentage within task range
function markerLeftPct(taskStart: Date, taskEnd: Date, markerDate: Date): number {
  const totalMs = taskEnd.getTime() - taskStart.getTime()
  if (totalMs <= 0) return 50
  const offsetMs = markerDate.getTime() - taskStart.getTime()
  return Math.max(2, Math.min(95, (offsetMs / totalMs) * 100))
}

export default function BoardCalendar({ tasks, board, onOpenTask, onDateClick }: Props) {
  const { user } = useAuthStore()
  const { dateTypes } = useDateTypeStore()
  const calRef = useRef<FullCalendar>(null)
  const color = getBoardColor(board)

  // Single event per task — markers rendered inside eventContent
  const events = tasks
    .filter((t) => !t.completed && (t.dateStart || t.dateEnd))
    .map((t) => {
      const eventColor = getBucketColor(t.bucket, board) ?? color
      return {
        id: t.id,
        title: t.title,
        start: toLocalDateString((t.dateStart ?? t.dateEnd)!.toDate()),
        end: t.dateEnd ? toFCExclusiveEnd(t.dateEnd.toDate()) : undefined,
        allDay: true,
        backgroundColor: eventColor + '55',   // softer background
        borderColor: eventColor + 'BB',
        textColor: '#ffffff',
        extendedProps: { task: t },
      }
    })

  async function handleEventDrop({ event }: EventDropArg) {
    if (!user || !event.start) return
    const task = event.extendedProps.task as Task
    const newStart = toFirestoreDate(event.start)
    // FullCalendar end is exclusive — subtract 1 day to get the actual last day
    const newEnd = event.end ? toFirestoreDate(fromFCExclusiveEnd(event.end)) : null
    await updateTaskField(task.id, 'dateStart', newStart, user.uid, user.name, task.dateStart)
    if (newEnd) await updateTaskField(task.id, 'dateEnd', newEnd, user.uid, user.name, task.dateEnd)
  }

  async function handleEventResize({ event }: EventResizeDoneArg) {
    if (!user) return
    const task = event.extendedProps.task as Task
    if (event.start) await updateTaskField(task.id, 'dateStart', toFirestoreDate(event.start), user.uid, user.name, task.dateStart)
    // FullCalendar end is exclusive — subtract 1 day
    if (event.end)   await updateTaskField(task.id, 'dateEnd', toFirestoreDate(fromFCExclusiveEnd(event.end)), user.uid, user.name, task.dateEnd)
  }

  function handleEventClick({ event }: EventClickArg) {
    onOpenTask(event.extendedProps.task as Task)
  }

  function handleDateClick({ date }: DateClickArg) {
    onDateClick(date)
  }

  return (
    <div className="h-full overflow-auto p-4">
      <FullCalendar
        ref={calRef}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        headerToolbar={{
          left: 'title',
          center: 'dayGridMonth,timeGridWeek,timeGridDay',
          right: 'prev,today,next',
        }}
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
        dayMaxEvents={4}
        events={events}
        eventDrop={handleEventDrop}
        eventResize={handleEventResize}
        eventClick={handleEventClick}
        dateClick={handleDateClick}
        eventDisplay="block"
        eventTimeFormat={{ hour: 'numeric', minute: '2-digit', meridiem: 'short' }}
        eventContent={(arg) => {
          const task = arg.event.extendedProps.task as Task
          const taskDates = task.taskDates ?? []

          // No taskDates, or continuation segment (not isStart): show normal bar
          if (taskDates.length === 0 || !arg.isStart) {
            return (
              <div className="flex items-center gap-1 px-1 py-0.5 overflow-hidden w-full h-full">
                <span className="truncate text-xs font-medium leading-tight" style={{ opacity: 1 }}>
                  {arg.event.title}
                </span>
              </div>
            )
          }

          // isStart segment with taskDates: bar with positioned markers
          const taskStart = arg.event.start!
          const taskEnd = arg.event.end ?? new Date(taskStart.getTime() + 86400000)
          
          // Calculate marker positions for the timeline line
          const firstMarkerPct = taskDates.length > 0 ? (() => {
            const td = taskDates[0]
            const dt = dateTypes.find((x) => x.key === td.typeKey)
            if (!dt) return null
            const d = td.dateStart.toDate()
            if (d >= taskStart && d <= taskEnd) return markerLeftPct(taskStart, taskEnd, d)
            return null
          })() : null
          
          const lastMarkerPct = taskDates.length > 0 ? (() => {
            const td = taskDates[taskDates.length - 1]
            const dt = dateTypes.find((x) => x.key === td.typeKey)
            if (!dt) return null
            if (td.dateEnd) {
              const d = td.dateEnd.toDate()
              if (d >= taskStart && d <= taskEnd) return markerLeftPct(taskStart, taskEnd, d)
            }
            const d = td.dateStart.toDate()
            if (d >= taskStart && d <= taskEnd) return markerLeftPct(taskStart, taskEnd, d)
            return null
          })() : null

          return (
            <div
              className="relative flex items-center px-2 overflow-hidden w-full h-full"
              style={{ minHeight: '20px' }}
            >
              {/* Task title */}
              <span
                className="text-xs font-medium leading-tight shrink-0 z-10"
                style={{ maxWidth: '35%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 1 }}
              >
                {arg.event.title}
              </span>

              {/* Horizontal timeline line connecting markers */}
              {firstMarkerPct !== null && lastMarkerPct !== null && firstMarkerPct !== lastMarkerPct && (
                <div
                  className="absolute h-0.5 bg-white/50"
                  style={{
                    left: `${Math.min(firstMarkerPct, lastMarkerPct)}%`,
                    width: `${Math.abs(lastMarkerPct - firstMarkerPct)}%`,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    zIndex: 1,
                  }}
                />
              )}

              {/* Vertical tick marks at each marker position */}
              {(() => {
                const ticks: Array<{ pct: number; color: string }> = []
                taskDates.forEach((td) => {
                  const dt = dateTypes.find((x) => x.key === td.typeKey)
                  if (!dt) return
                  
                  const startDate = td.dateStart.toDate()
                  if (startDate >= taskStart && startDate <= taskEnd) {
                    ticks.push({
                      pct: markerLeftPct(taskStart, taskEnd, startDate),
                      color: dt.color,
                    })
                  }
                  
                  if (td.dateEnd) {
                    const endDate = td.dateEnd.toDate()
                    const isSameDay = startDate.toDateString() === endDate.toDateString()
                    if (!isSameDay && endDate >= taskStart && endDate <= taskEnd) {
                      ticks.push({
                        pct: markerLeftPct(taskStart, taskEnd, endDate),
                        color: dt.color,
                      })
                    }
                  }
                })
                
                // Remove duplicates (same position)
                const uniqueTicks = ticks.filter((t, i, arr) => 
                  arr.findIndex((other) => Math.abs(other.pct - t.pct) < 1) === i
                )
                
                return uniqueTicks.map((t, i) => (
                  <div
                    key={`tick-${i}`}
                    className="absolute w-px bg-white/60"
                    style={{
                      left: `${t.pct}%`,
                      top: '15%',
                      height: '70%',
                      transform: 'translateX(-50%)',
                      zIndex: 1,
                    }}
                  />
                ))
              })()}

              {/* Markers for each taskDate */}
              {(() => {
                // Build list of all marker positions first
                type MarkerInfo = {
                  key: string
                  date: Date
                  pct: number
                  type: 'start' | 'end'
                  td: typeof taskDates[0]
                  dt: typeof dateTypes[0]
                }
                
                const markersInfo: MarkerInfo[] = []
                
                taskDates.forEach((td) => {
                  const dt = dateTypes.find((x) => x.key === td.typeKey)
                  if (!dt) return
                  
                  const startDate = td.dateStart.toDate()
                  
                  // Start marker
                  if (startDate >= taskStart && startDate <= taskEnd) {
                    markersInfo.push({
                      key: `${td.id}-start`,
                      date: startDate,
                      pct: markerLeftPct(taskStart, taskEnd, startDate),
                      type: 'start',
                      td,
                      dt,
                    })
                  }
                  
                  // End marker (if exists and different from start)
                  if (td.dateEnd) {
                    const endDate = td.dateEnd.toDate()
                    const isSameDay = startDate.toDateString() === endDate.toDateString()
                    
                    if (!isSameDay && endDate >= taskStart && endDate <= taskEnd) {
                      markersInfo.push({
                        key: `${td.id}-end`,
                        date: endDate,
                        pct: markerLeftPct(taskStart, taskEnd, endDate),
                        type: 'end',
                        td,
                        dt,
                      })
                    }
                  }
                })
                
                // Group markers by position (within 3% of each other)
                const grouped: MarkerInfo[][] = []
                const used = new Set<number>()
                
                markersInfo.forEach((m, i) => {
                  if (used.has(i)) return
                  const group: MarkerInfo[] = [m]
                  used.add(i)
                  
                  markersInfo.forEach((other, j) => {
                    if (i === j || used.has(j)) return
                    if (Math.abs(m.pct - other.pct) < 3) {
                      group.push(other)
                      used.add(j)
                    }
                  })
                  
                  grouped.push(group)
                })
                
                // Render markers with offset for overlapping ones
                return grouped.flatMap((group) => {
                  const groupSize = group.length
                  const markerWidth = 16 // px
                  const spacing = 4 // px
                  
                  return group.map((m, idx) => {
                    const Icon = ICON_MAP[m.dt.icon] ?? CalendarIcon
                    const isEnd = m.type === 'end'
                    
                    // Calculate horizontal offset for overlapping markers
                    const totalWidth = groupSize * markerWidth + (groupSize - 1) * spacing
                    const offset = (idx * (markerWidth + spacing)) - (totalWidth / 2) + (markerWidth / 2)
                    
                    return (
                      <div
                        key={m.key}
                        title={`${m.dt.label} ${m.type}s: ${toLocalDateString(m.date)}`}
                        className="absolute flex items-center justify-center rounded-full"
                        style={{
                          left: `calc(${m.pct}% + ${offset}px)`,
                          top: '50%',
                          transform: 'translate(-50%, -50%)',
                          width: '16px',
                          height: '16px',
                          backgroundColor: m.dt.color,
                          opacity: isEnd ? 0.7 : 1,
                          zIndex: 2,
                          flexShrink: 0,
                        }}
                      >
                        <Icon size={9} color="#fff" />
                      </div>
                    )
                  })
                })
              })()}
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
      />
    </div>
  )
}
