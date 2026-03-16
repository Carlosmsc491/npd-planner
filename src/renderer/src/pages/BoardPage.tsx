import { useState, useEffect } from 'react'
import AppLayout from '../components/ui/AppLayout'
import BoardView from '../components/board/BoardView'
import ListView from '../components/board/ListView'
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
import { BOARD_COLORS } from '../utils/colorUtils'
import type { Task, AppUser, RecurringConfig, BoardView as BoardViewType } from '../types'

export default function BoardPage() {
  const { activeBoard } = useBoard()
  const { clients } = useClients()
  const { labels } = useLabels()

  const { tasks, selectedTask, setSelectedTask, complete, remove, duplicate, setRecurring } =
    useTasks(activeBoard?.id)

  const { view, setView, groupBy } = useBoardStore()
  const [users, setUsers] = useState<AppUser[]>([])
  const [recurringTask, setRecurringTask] = useState<Task | null>(null)
  const [newTaskBucket, setNewTaskBucket] = useState<string | undefined>()
  const [showNewTask, setShowNewTask] = useState(false)

  useEffect(() => {
    const unsub = subscribeToUsers(setUsers)
    return unsub
  }, [])

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

  const boardColor = activeBoard ? (BOARD_COLORS[activeBoard.type] ?? activeBoard.color) : '#1D9E75'

  const VIEW_OPTIONS: { value: BoardViewType; label: string }[] = [
    { value: 'cards',    label: 'Cards' },
    { value: 'list',     label: 'List' },
    { value: 'calendar', label: 'Calendar' },
  ]

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

          <div className="ml-auto">
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
          </div>
        </div>

        {/* Content — board + optional task panel */}
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-auto">
            {view === 'cards' && (
              <BoardView
                tasks={tasks}
                clients={clients}
                labels={labels}
                users={users}
                groupBy={groupBy}
                boardType={activeBoard.type}
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
                onComplete={complete}
                onOpen={setSelectedTask}
              />
            )}
            {view === 'calendar' && (
              <div className="flex h-full items-center justify-center p-8">
                <p className="text-sm text-gray-400">Calendar view — coming in Phase 5.</p>
              </div>
            )}
          </div>

          {/* Task side panel */}
          {selectedTask && (
            <div className="w-[600px] shrink-0 border-l border-gray-200 dark:border-gray-700 overflow-hidden">
              <TaskPagePanel
                task={selectedTask}
                board={activeBoard}
                users={users}
                onClose={() => setSelectedTask(null)}
                onDelete={remove}
                onRecurring={(t) => setRecurringTask(t)}
                onDuplicate={handleDuplicate}
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
          onClose={() => setShowNewTask(false)}
        />
      )}

      <UndoToast />
    </AppLayout>
  )
}
