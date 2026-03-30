import { useState, useEffect } from 'react'
import AppLayout from '../components/ui/AppLayout'
import BoardView from '../components/board/BoardView'
import ListView from '../components/board/ListView'
import BoardCalendar from '../components/board/BoardCalendar'
import GanttView from '../components/board/GanttView'
import GroupBySelector from '../components/board/GroupBySelector'
import TaskPagePanel from '../components/task/TaskPage'
import RecurringModal from '../components/ui/RecurringModal'
import NewTaskModal from '../components/ui/NewTaskModal'
import UndoToast from '../components/ui/UndoToast'
import { useBoard } from '../hooks/useBoard'
import { useTasks } from '../hooks/useTasks'
import { useClients } from '../hooks/useClients'
import { useLabels } from '../hooks/useLabels'
import { subscribeToUsers } from '../lib/firestore'
import { useBoardStore } from '../store/boardStore'
import { getBoardColor } from '../utils/colorUtils'
import { exportTasksToCSV, downloadCSV } from '../utils/exportUtils'
import { Download, Eye } from 'lucide-react'
import { useBoardPermission } from '../hooks/useAreaPermission'
import type { Task, AppUser, RecurringConfig, BoardView as BoardViewType } from '../types'

export default function BoardPage() {
  const { activeBoard } = useBoard()
  const { clients } = useClients()
  const { labels } = useLabels()
  const boardAccess = useBoardPermission(activeBoard?.id ?? '')

  const { tasks, selectedTask, setSelectedTask, complete, remove, duplicate, setRecurring } =
    useTasks(activeBoard?.id, activeBoard?.type)

  const { view, setView, groupBy } = useBoardStore()
  const [users, setUsers] = useState<AppUser[]>([])
  const [recurringTask, setRecurringTask] = useState<Task | null>(null)
  const [newTaskBucket, setNewTaskBucket] = useState<string | undefined>()
  const [newTaskDate, setNewTaskDate] = useState<Date | undefined>()
  const [showNewTask, setShowNewTask] = useState(false)

  useEffect(() => {
    const unsub = subscribeToUsers(setUsers)
    return unsub
  }, [])

  // Set default view based on board type
  useEffect(() => {
    if (!activeBoard) return
    if (activeBoard.type === 'trips' || activeBoard.type === 'vacations') {
      setView('calendar')
    } else if (view === 'calendar' || view === 'gantt') {
      // switching to a planner/custom board — reset to cards if coming from calendar/gantt
      setView('cards')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBoard?.id])

  async function handleDuplicate(task: Task) {
    await duplicate(task)
  }

  async function handleRecurringSave(config: RecurringConfig) {
    if (!recurringTask) return
    await setRecurring(recurringTask, config)
    setRecurringTask(null)
  }

  function handleAddTask(bucket: string) {
    setNewTaskBucket(bucket)
    setShowNewTask(true)
  }

  const boardColor = getBoardColor(activeBoard)

  const isDateBoard = activeBoard?.type === 'trips' || activeBoard?.type === 'vacations'
  const VIEW_OPTIONS: { value: BoardViewType; label: string }[] = isDateBoard
    ? [
        { value: 'list',     label: 'List' },
        { value: 'calendar', label: 'Calendar' },
      ]
    : [
        { value: 'cards',    label: 'Cards' },
        { value: 'list',     label: 'List' },
        { value: 'calendar', label: 'Calendar' },
        { value: 'gantt',    label: 'Timeline' },
      ]

  function handleCalendarDateClick(date: Date) {
    setNewTaskDate(date)
    setNewTaskBucket(undefined)
    setShowNewTask(true)
  }

  if (!activeBoard) {
    return (
      <AppLayout>
        <div className="flex h-full items-center justify-center">
          <p className="text-gray-400 text-sm">Board not found.</p>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="flex h-full flex-col">
        {/* Topbar */}
        <div className="flex items-center gap-3 border-b border-gray-200 px-6 py-3 bg-white dark:bg-gray-900 dark:border-gray-700 shrink-0">
          <div className="flex items-center gap-2 mr-2">
            <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: boardColor }} />
            <h1 className="text-sm font-bold text-gray-900 dark:text-white">{activeBoard.name}</h1>
            {boardAccess === 'view' && (
              <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                <Eye size={10} />
                View only
              </span>
            )}
          </div>

          {/* View switcher */}
          <div className="flex items-center gap-0.5 rounded-lg border border-gray-200 bg-gray-50 p-0.5 dark:border-gray-700 dark:bg-gray-800">
            {VIEW_OPTIONS.map((v) => (
              <button
                key={v.value}
                onClick={() => setView(v.value)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  view === v.value
                    ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>

          <GroupBySelector />

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => {
                const csv = exportTasksToCSV(tasks, clients, users, activeBoard.name)
                downloadCSV(csv, `${activeBoard.name}-tasks-${new Date().toISOString().slice(0, 10)}.csv`)
              }}
              className="flex items-center gap-1 rounded-lg border border-gray-200
                         dark:border-gray-700 px-2.5 py-1.5 text-xs text-gray-500
                         hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200
                         hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              title="Export tasks as CSV"
            >
              <Download size={13} />
              CSV
            </button>
            {boardAccess === 'edit' && (
              <button
                onClick={() => { setNewTaskBucket(undefined); setShowNewTask(true) }}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-colors"
                style={{ backgroundColor: boardColor }}
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
                New Task
              </button>
            )}
          </div>
        </div>

        {/* Content — board + optional task panel */}
        <div className="flex flex-1 overflow-hidden">
          <div className="relative flex-1 overflow-auto">
            {view === 'cards' && (
              <BoardView
                tasks={tasks}
                clients={clients}
                labels={labels}
                users={users}
                groupBy={groupBy}
                boardType={activeBoard.type}
                board={activeBoard}
                onComplete={complete}
                onOpen={setSelectedTask}
                onDuplicate={handleDuplicate}
                onRecurring={(t) => setRecurringTask(t)}
                onDelete={remove}
                onAddTask={handleAddTask}
              />
            )}
            {view === 'list' && (
              <ListView
                tasks={tasks}
                clients={clients}
                labels={labels}
                users={users}
                groupBy={groupBy}
                board={activeBoard}
                onComplete={complete}
                onOpen={setSelectedTask}
              />
            )}
            {view === 'calendar' && (
              <BoardCalendar
                tasks={tasks}
                board={activeBoard}
                onOpenTask={setSelectedTask}
                onDateClick={handleCalendarDateClick}
              />
            )}
            {view === 'gantt' && (
              <GanttView
                tasks={tasks}
                clients={clients}
                onOpenTask={setSelectedTask}
              />
            )}
            {/* Invisible overlay — clicking the board while a task is open closes the panel */}
            {selectedTask && (
              <div
                className="absolute inset-0 z-10 cursor-pointer"
                onClick={() => setSelectedTask(null)}
                aria-label="Close task panel"
              />
            )}
          </div>

          {/* Task side panel */}
          {selectedTask && (
            <div className="relative z-20 w-[600px] shrink-0 border-l border-gray-200 dark:border-gray-700 overflow-hidden">
              <TaskPagePanel
                task={selectedTask}
                board={activeBoard}
                users={users}
                onClose={() => setSelectedTask(null)}
                onDelete={remove}
                onRecurring={(t) => setRecurringTask(t)}
                onDuplicate={handleDuplicate}
                readOnly={boardAccess === 'view'}
              />
            </div>
          )}
        </div>
      </div>

      {recurringTask && (
        <RecurringModal
          task={recurringTask}
          onSave={handleRecurringSave}
          onClose={() => setRecurringTask(null)}
        />
      )}

      {showNewTask && (
        <NewTaskModal
          board={activeBoard}
          defaultBucket={newTaskBucket}
          defaultDate={newTaskDate}
          onClose={() => { setShowNewTask(false); setNewTaskDate(undefined) }}
        />
      )}

      <UndoToast />
    </AppLayout>
  )
}
