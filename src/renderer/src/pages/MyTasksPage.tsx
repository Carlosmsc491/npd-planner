import { useState, useMemo } from 'react'
import AppLayout from '../components/ui/AppLayout'
import TaskPage from '../components/task/TaskPage'
import { useMyTasks } from '../hooks/useMyTasks'
import { useBoardStore } from '../store/boardStore'
import { useSettingsStore } from '../store/settingsStore'
import { useAuthStore } from '../store/authStore'
import { CheckSquare, Calendar, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react'
import { getBoardColor } from '../utils/colorUtils'
import { formatDateRange } from '../utils/dateUtils'
import type { Task, MyTaskGroup } from '../types'

const GROUP_LABELS: Record<MyTaskGroup, string> = {
  today: 'Today',
  thisWeek: 'This Week',
  thisMonth: 'This Month',
  later: 'Later',
  noDate: 'No Date',
  completed: 'Completed',
}

export default function MyTasksPage() {
  const { user } = useAuthStore()
  const { boards } = useBoardStore()
  const { clients } = useSettingsStore()
  const { tasks, groupedTasks, loading, filter, setFilter } = useMyTasks()
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<MyTaskGroup, boolean>>({
    today: false,
    thisWeek: false,
    thisMonth: false,
    later: false,
    noDate: false,
    completed: true, // Collapsed by default
  })

  const toggleGroup = (group: MyTaskGroup) => {
    setCollapsedGroups((prev) => ({ ...prev, [group]: !prev[group] }))
  }

  const boardOptions = useMemo(() => {
    const defaultBoards = [
      { id: 'all', name: 'All Boards', type: 'all' as const },
      { id: 'planner', name: 'Planner', type: 'planner' as const },
      { id: 'trips', name: 'Trips', type: 'trips' as const },
      { id: 'vacations', name: 'Vacations', type: 'vacations' as const },
    ]
    const customBoards = boards
      .filter((b) => b.type === 'custom')
      .map((b) => ({ id: b.id, name: b.name, type: 'custom' as const }))
    return [...defaultBoards, ...customBoards]
  }, [boards])

  const getClientName = (clientId: string) => {
    return clients.find((c) => c.id === clientId)?.name || 'Unknown'
  }

  const getBoardForTask = (task: Task) => {
    return boards.find((b) => b.id === task.boardId)
  }

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task)
  }

  const handleCloseTaskPage = () => {
    setSelectedTask(null)
  }

  const handleDeleteTask = () => {
    // Task deletion is handled in TaskPage
    setSelectedTask(null)
  }

  const handleRecurringTask = () => {
    // Recurring task creation is handled in TaskPage
  }

  const handleDuplicateTask = () => {
    // Task duplication is handled in TaskPage
  }

  const totalCount = tasks.length

  const groups: MyTaskGroup[] = ['today', 'thisWeek', 'thisMonth', 'later', 'noDate', 'completed']

  if (loading) {
    return (
      <AppLayout>
        <div className="p-6 w-full">
          <div className="animate-pulse">
            <div className="h-8 w-48 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
            <div className="h-10 w-full bg-gray-200 dark:bg-gray-700 rounded mb-6" />
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 w-full bg-gray-200 dark:bg-gray-700 rounded" />
              ))}
            </div>
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="p-6 w-full max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Tasks</h1>
            {totalCount > 0 && (
              <span className="px-2.5 py-0.5 text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full">
                {totalCount}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            All tasks assigned to you across all boards
          </p>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            {boardOptions.map((option) => (
              <button
                key={option.id}
                onClick={() =>
                  setFilter({
                    boardId: option.id === 'all' ? 'all' : option.type === 'custom' ? option.id : option.id,
                  })
                }
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  (option.id === 'all' && filter.boardId === 'all') ||
                  (option.type !== 'all' &&
                    (option.type === 'custom'
                      ? filter.boardId === option.id
                      : boards.some((b) => b.type === option.type && filter.boardId === b.id)))
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                {option.name}
              </button>
            ))}
          </div>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm text-gray-500 dark:text-gray-400">Sort by:</span>
            <select
              value={filter.sortBy}
              onChange={(e) => setFilter({ sortBy: e.target.value as typeof filter.sortBy })}
              className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-green-500"
            >
              <option value="dueDate">Due Date</option>
              <option value="board">Board</option>
              <option value="priority">Priority</option>
              <option value="created">Created</option>
            </select>
          </div>
        </div>

        {/* Empty State */}
        {totalCount === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-16 w-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
              <CheckSquare className="h-8 w-8 text-gray-400 dark:text-gray-500" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
              No tasks assigned to you
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">
              Tasks assigned to you will appear here. Check back later or ask your team to assign you to tasks.
            </p>
          </div>
        )}

        {/* Grouped Task Sections */}
        {totalCount > 0 && (
          <div className="space-y-6">
            {groups.map((group) => {
              const groupTasks = groupedTasks[group]
              if (groupTasks.length === 0) return null

              const isCollapsed = collapsedGroups[group]
              const isCompleted = group === 'completed'

              return (
                <div
                  key={group}
                  className={`${isCompleted ? 'opacity-40 hover:opacity-70 transition-opacity' : ''}`}
                >
                  {/* Section Header */}
                  <button
                    onClick={() => toggleGroup(group)}
                    className="flex items-center gap-2 w-full mb-3 group"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300" />
                    )}
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      {GROUP_LABELS[group]}
                    </h2>
                    <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full">
                      {groupTasks.length}
                    </span>
                  </button>

                  {/* Task Cards */}
                  {!isCollapsed && (
                    <div className="space-y-2">
                      {groupTasks.map((task) => {
                        const board = getBoardForTask(task)
                        const boardColor = getBoardColor(board)
                        const clientName = getClientName(task.clientId)

                        return (
                          <button
                            key={task.id}
                            onClick={() => handleTaskClick(task)}
                            className="flex items-center gap-3 w-full text-left rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group"
                          >
                            {/* Board Color Pill */}
                            <span
                              className="h-2.5 w-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: boardColor }}
                              title={board?.name || 'Unknown Board'}
                            />

                            {/* Task Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-900 dark:text-white truncate group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors">
                                  {task.title}
                                </span>
                                {task.priority === 'high' && (
                                  <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                                )}
                              </div>
                              <div className="flex items-center gap-3 mt-0.5">
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  {clientName}
                                </span>
                                {(task.dateStart || task.dateEnd) && (
                                  <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    {formatDateRange(task.dateStart, task.dateEnd)}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Priority Indicator */}
                            {task.priority === 'high' && (
                              <span className="h-2 w-2 rounded-full bg-red-500 shrink-0" title="High Priority" />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Task Page Modal */}
      {selectedTask && user && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={handleCloseTaskPage}
          />
          <div className="fixed inset-4 md:inset-10 lg:inset-16 z-50 rounded-2xl overflow-hidden shadow-2xl">
            <TaskPage
              task={selectedTask}
              board={getBoardForTask(selectedTask) || null}
              users={[]}
              onClose={handleCloseTaskPage}
              onDelete={handleDeleteTask}
              onRecurring={handleRecurringTask}
              onDuplicate={handleDuplicateTask}
            />
          </div>
        </>
      )}
    </AppLayout>
  )
}
