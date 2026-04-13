import { useRef } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { EventDropArg, EventClickArg } from '@fullcalendar/core'
import type { EventResizeDoneArg, DateClickArg } from '@fullcalendar/interaction'
import { Hammer, Truck, Wrench, Star, Calendar as CalendarIcon, type LucideIcon } from 'lucide-react'
import { updateTaskField } from '../../lib/firestore'
import { useAuthStore } from '../../store/authStore'
import { useDateTypeStore } from '../../store/dateTypeStore'
import { getBoardColor, getBucketColor } from '../../utils/colorUtils'
import { toFirestoreDate, toLocalDateString, toFCExclusiveEnd, fromFCExclusiveEnd } from '../../utils/dateUtils'
import type { Task, Board } from '../../types'

const ICON_MAP: Record<string, LucideIcon> = {
  Hammer, Truck, Wrench, Star, Calendar: CalendarIcon,
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

  // Main task events
  const mainEvents = tasks
    .filter((t) => !t.completed && (t.dateStart || t.dateEnd))
    .map((t) => {
      const eventColor = getBucketColor(t.bucket, board) ?? color
      return {
        id: t.id,
        title: t.title,
        start: toLocalDateString((t.dateStart ?? t.dateEnd)!.toDate()),
        end: t.dateEnd ? toFCExclusiveEnd(t.dateEnd.toDate()) : undefined,
        allDay: true,
        backgroundColor: eventColor,
        borderColor: eventColor,
        textColor: '#ffffff',
        extendedProps: { task: t },
      }
    })

  // Task date events (from taskDates array)
  const taskDateEvents = tasks.flatMap((t) =>
    (t.taskDates ?? []).flatMap((td) => {
      const dt = dateTypes.find((x) => x.key === td.typeKey)
      if (!dt) return []
      return [{
        id: `${t.id}-td-${td.id}`,
        title: t.title,
        start: toLocalDateString(td.dateStart.toDate()),
        end: td.dateEnd ? toFCExclusiveEnd(td.dateEnd.toDate()) : undefined,
        allDay: true,
        backgroundColor: dt.color + 'CC',
        borderColor: dt.color,
        textColor: '#ffffff',
        editable: false, // Task date events are not draggable
        extendedProps: {
          task: t,
          isTaskDate: true,
          dateTypeKey: td.typeKey,
          dateTypeIcon: dt.icon,
          dateTypeLabel: dt.label,
        },
      }]
    })
  )

  const events = [...mainEvents, ...taskDateEvents]

  async function handleEventDrop({ event }: EventDropArg) {
    if (!user || !event.start) return
    // Skip task date events - they are not draggable
    if (event.extendedProps.isTaskDate) return
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
          const { isTaskDate, dateTypeIcon } = arg.event.extendedProps
          const Icon = isTaskDate ? (ICON_MAP[dateTypeIcon] ?? CalendarIcon) : null
          return (
            <div className="flex items-center gap-1 px-1 py-0.5 overflow-hidden w-full">
              {Icon && <Icon size={10} className="shrink-0 opacity-90" />}
              <span className="truncate text-xs font-medium leading-tight">{arg.event.title}</span>
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
