import { useRef, useMemo, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { EventClickArg, EventInput } from '@fullcalendar/core'
import { getBoardColor } from '../../utils/colorUtils'
import { toLocalDateString, toFCExclusiveEnd } from '../../utils/dateUtils'
import type { Task, PersonalTask, Board } from '../../types'

interface Props {
  boardTasks: Task[]  // Assigned tasks from boards
  personalTasks: PersonalTask[]  // Private tasks
  boards: Board[]
  onBoardTaskClick: (task: Task) => void
  onPersonalTaskClick: (task: PersonalTask) => void
}

// Purple color for personal tasks
const PERSONAL_TASK_COLOR = '#8B5CF6'

export default function PersonalCalendar({
  boardTasks,
  personalTasks,
  boards,
  onBoardTaskClick,
  onPersonalTaskClick,
}: Props) {
  const calRef = useRef<FullCalendar>(null)
  const [currentView, setCurrentView] = useState<'dayGridMonth' | 'timeGridWeek' | 'timeGridDay'>('dayGridMonth')

  // Build board lookup map for colors
  const boardMap = useMemo(() => {
    const map = new Map<string, Board>()
    boards.forEach((board) => map.set(board.id, board))
    return map
  }, [boards])

  // Convert tasks to FullCalendar events
  const events: EventInput[] = useMemo(() => {
    const boardEvents: EventInput[] = boardTasks
      .filter((task) => !task.completed && (task.dateStart || task.dateEnd))
      .map((task) => {
        const board = boardMap.get(task.boardId)
        const color = board ? getBoardColor(board) : '#888'
        const start = toLocalDateString((task.dateStart ?? task.dateEnd)!.toDate())
        const end = task.dateEnd ? toFCExclusiveEnd(task.dateEnd.toDate()) : undefined

        return {
          id: `board-${task.id}`,
          title: task.title,
          start,
          end,
          allDay: true,
          backgroundColor: color,
          borderColor: color,
          textColor: '#ffffff',
          extendedProps: { task, type: 'board' as const },
        }
      })

    const personalEvents: EventInput[] = personalTasks
      .filter((task) => !task.completed && task.dueDate)
      .map((task) => {
        const dueDate = task.dueDate!.toDate()

        return {
          id: `personal-${task.id}`,
          title: task.title,
          start: toLocalDateString(dueDate),
          allDay: true,
          backgroundColor: PERSONAL_TASK_COLOR,
          borderColor: PERSONAL_TASK_COLOR,
          textColor: '#ffffff',
          extendedProps: { task, type: 'personal' as const },
        }
      })

    return [...boardEvents, ...personalEvents]
  }, [boardTasks, personalTasks, boardMap])

  function handleEventClick({ event }: EventClickArg) {
    const { task, type } = event.extendedProps as {
      task: Task | PersonalTask
      type: 'board' | 'personal'
    }

    if (type === 'board') {
      onBoardTaskClick(task as Task)
    } else {
      onPersonalTaskClick(task as PersonalTask)
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Single toolbar row: view switcher (left) + legend + nav (right) */}
      <div className="flex-shrink-0 flex items-center justify-between px-2 py-2">
        {/* View switcher */}
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
          {([
            { key: 'dayGridMonth', label: 'Month' },
            { key: 'timeGridWeek', label: 'Week' },
            { key: 'timeGridDay', label: 'Day' },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => {
                setCurrentView(key)
                calRef.current?.getApi().changeView(key)
              }}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                currentView === key
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Legend + nav arrows */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PERSONAL_TASK_COLOR }} />
              <span className="text-gray-500 dark:text-gray-400">Personal</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
              <span className="text-gray-500 dark:text-gray-400">Board Tasks</span>
            </div>
          </div>
          {/* Nav buttons */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => calRef.current?.getApi().prev()}
              className="h-7 w-7 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 text-base font-bold transition-colors"
            >‹</button>
            <button
              onClick={() => calRef.current?.getApi().today()}
              className="px-3 h-7 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >today</button>
            <button
              onClick={() => calRef.current?.getApi().next()}
              className="h-7 w-7 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 text-base font-bold transition-colors"
            >›</button>
          </div>
        </div>
      </div>

      {/* Calendar — title only in toolbar, no FC nav buttons */}
      <div className="flex-1 overflow-hidden p-2">
        <FullCalendar
          ref={calRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView={currentView}
          headerToolbar={{
            left: 'title',
            center: '',
            right: '',
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
          editable={false}
          selectable={false}
          droppable={false}
          eventDurationEditable={false}
          eventStartEditable={false}
          dayMaxEvents={3}
          events={events}
          eventClick={handleEventClick}
          eventDisplay="block"
          eventTimeFormat={{ hour: 'numeric', minute: '2-digit', meridiem: 'short' }}
          views={{
            dayGridWeek: {
              titleFormat: { month: 'short', day: 'numeric' },
            },
            timeGridDay: {
              titleFormat: { month: 'short', day: 'numeric' },
            },
          }}
          eventContent={(arg) => (
            <div className="flex items-center gap-1 px-1 py-0.5 overflow-hidden w-full">
              <span className="truncate text-xs font-medium leading-tight">
                {arg.event.title}
              </span>
            </div>
          )}
          dayCellContent={(arg) => (
            <div className="flex items-center justify-center w-full">
              <span className="text-xs">{arg.dayNumberText}</span>
            </div>
          )}
        />
      </div>
    </div>
  )
}
