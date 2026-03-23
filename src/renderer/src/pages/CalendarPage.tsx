import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { EventDropArg, EventClickArg, DayCellContentArg } from '@fullcalendar/core'
import type { EventResizeDoneArg } from '@fullcalendar/interaction'
import AppLayout from '../components/ui/AppLayout'
import NewTaskModal from '../components/ui/NewTaskModal'
import { subscribeToAllTasks, updateTaskField } from '../lib/firestore'
import { useAuthStore } from '../store/authStore'
import { useBoardStore } from '../store/boardStore'
import { getBoardColor, getBucketColor } from '../utils/colorUtils'
import { toFirestoreDate } from '../utils/dateUtils'
import type { Task, Board } from '../types'

const LS_KEY = 'npd:calendar_hidden_boards'

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
  const [tasks, setTasks] = useState<Task[]>([])
  const [hiddenBoards, setHiddenBoards] = useState<Set<string>>(loadHidden)
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

  const events = tasks
    .filter((t) => !t.completed && (t.dateStart || t.dateEnd))
    .filter((t) => !hiddenBoards.has(t.boardId))
    .map((t) => {
      const board = boards.find((b) => b.id === t.boardId)
      const boardColor = board ? (getBoardColor(board)) : '#888'
      const eventColor = getBucketColor(t.bucket, board) ?? boardColor
      const start = (t.dateStart ?? t.dateEnd)!.toDate()
      const end = t.dateEnd ? t.dateEnd.toDate() : undefined
      return {
        id: t.id,
        title: t.title,
        start,
        end,
        allDay: true,
        backgroundColor: eventColor,
        borderColor: eventColor,
        textColor: '#ffffff',
        extendedProps: { task: t, board },
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
    if (!user || !event.start) return
    const task = event.extendedProps.task as Task
    const board = event.extendedProps.board as Board | undefined
    const newStart = toFirestoreDate(event.start)
    const newEnd = event.end ? toFirestoreDate(event.end) : null
    await updateTaskField(task.id, 'dateStart', newStart, user.uid, user.name, task.dateStart, board?.type)
    if (newEnd) await updateTaskField(task.id, 'dateEnd', newEnd, user.uid, user.name, task.dateEnd, board?.type)
  }

  async function handleEventResize({ event }: EventResizeDoneArg) {
    if (!user) return
    const task = event.extendedProps.task as Task
    const board = event.extendedProps.board as Board | undefined
    if (event.start) await updateTaskField(task.id, 'dateStart', toFirestoreDate(event.start), user.uid, user.name, task.dateStart, board?.type)
    if (event.end)   await updateTaskField(task.id, 'dateEnd',   toFirestoreDate(event.end),   user.uid, user.name, task.dateEnd, board?.type)
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

  const withDates = tasks.filter((t) => !t.completed && (t.dateStart || t.dateEnd))

  return (
    <AppLayout>
      <div className="flex h-full flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-gray-200 px-6 py-3 bg-white dark:bg-gray-900 dark:border-gray-700 shrink-0 flex-wrap">
          <h1 className="text-sm font-bold text-gray-900 dark:text-white">Master Calendar</h1>
          <span className="text-xs text-gray-400">
            {withDates.length} event{withDates.length !== 1 ? 's' : ''} with dates
          </span>
          <div className="flex items-center gap-2 ml-2 flex-wrap">
            {boards.map((board) => getBoardLabel(board))}
          </div>
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
            events={events}
            height="100%"
            editable={true}
            droppable={true}
            eventDurationEditable={true}
            eventResizableFromStart={true}
            eventDisplay="block"
            dayMaxEvents={4}
            eventTimeFormat={{ hour: 'numeric', minute: '2-digit', meridiem: 'short' }}
            eventDrop={handleEventDrop}
            eventResize={handleEventResize}
            eventClick={handleEventClick}
            eventContent={(arg) => (
              <div className="flex items-center gap-1 px-1 overflow-hidden w-full">
                <span className="truncate text-xs font-medium">{arg.event.title}</span>
              </div>
            )}
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
