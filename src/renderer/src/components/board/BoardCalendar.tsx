import { useRef } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { EventDropArg, EventClickArg } from '@fullcalendar/core'
import type { EventResizeDoneArg, DateClickArg } from '@fullcalendar/interaction'
import { updateTaskField } from '../../lib/firestore'
import { useAuthStore } from '../../store/authStore'
import { BOARD_COLORS, getBucketColor } from '../../utils/colorUtils'
import { toFirestoreDate } from '../../utils/dateUtils'
import type { Task, Board } from '../../types'

interface Props {
  tasks: Task[]
  board: Board
  onOpenTask: (task: Task) => void
  onDateClick: (date: Date) => void
}

export default function BoardCalendar({ tasks, board, onOpenTask, onDateClick }: Props) {
  const { user } = useAuthStore()
  const calRef = useRef<FullCalendar>(null)
  const color = BOARD_COLORS[board.type] ?? board.color

  const events = tasks
    .filter((t) => !t.completed && (t.dateStart || t.dateEnd))
    .map((t) => {
      const eventColor = getBucketColor(t.bucket, board) ?? color
      return {
        id: t.id,
        title: t.title,
        start: (t.dateStart ?? t.dateEnd)!.toDate(),
        end: t.dateEnd?.toDate(),
        allDay: true,
        backgroundColor: eventColor,
        borderColor: eventColor,
        textColor: '#ffffff',
        extendedProps: { task: t },
      }
    })

  async function handleEventDrop({ event }: EventDropArg) {
    if (!user || !event.start) return
    const task = event.extendedProps.task as Task
    const newStart = toFirestoreDate(event.start)
    const newEnd = event.end ? toFirestoreDate(event.end) : null
    await updateTaskField(task.id, 'dateStart', newStart, user.uid, user.name, task.dateStart)
    if (newEnd) await updateTaskField(task.id, 'dateEnd', newEnd, user.uid, user.name, task.dateEnd)
  }

  async function handleEventResize({ event }: EventResizeDoneArg) {
    if (!user) return
    const task = event.extendedProps.task as Task
    if (event.start) await updateTaskField(task.id, 'dateStart', toFirestoreDate(event.start), user.uid, user.name, task.dateStart)
    if (event.end)   await updateTaskField(task.id, 'dateEnd',   toFirestoreDate(event.end),   user.uid, user.name, task.dateEnd)
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
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,timeGridDay',
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
        eventContent={(arg) => (
          <div className="flex items-center gap-1 px-1 py-0.5 overflow-hidden w-full">
            <span className="truncate text-xs font-medium leading-tight">{arg.event.title}</span>
          </div>
        )}
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
