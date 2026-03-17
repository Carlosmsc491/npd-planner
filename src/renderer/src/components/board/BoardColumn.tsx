import TaskCard from './TaskCard'
import type { Task, Client, Label, AppUser, Board } from '../../types'
import { useBoardStore } from '../../store/boardStore'

interface Props {
  groupKey: string
  tasks: Task[]
  clients: Client[]
  labels: Label[]
  users: AppUser[]
  board?: Board | null
  bucketColor?: string
  onComplete: (task: Task) => void
  onOpen: (task: Task) => void
  onDuplicate: (task: Task) => void
  onRecurring: (task: Task) => void
  onDelete: (task: Task) => void
  onAddTask: (bucket: string) => void
}

export default function BoardColumn({
  groupKey, tasks, clients, labels, users, board, bucketColor,
  onComplete, onOpen, onDuplicate, onRecurring, onDelete, onAddTask,
}: Props) {
  const { showCompleted, toggleShowCompleted } = useBoardStore()
  const isShowingCompleted = showCompleted[groupKey] ?? false

  const active = tasks.filter((t) => !t.completed)
  const completed = tasks.filter((t) => t.completed)
  const visible = isShowingCompleted ? [...active, ...completed] : active

  return (
    <div className="flex w-[280px] shrink-0 flex-col">
      {/* Column header */}
      <div className="mb-2 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          {bucketColor && (
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: bucketColor }} />
          )}
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            {groupKey}
          </h3>
          <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-400">
            {active.length}
          </span>
        </div>
        <button
          onClick={() => onAddTask(groupKey)}
          className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200 transition-colors"
          title="Add task"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* Task cards */}
      <div className="flex flex-col gap-2 flex-1">
        {visible.length === 0 && (
          <button
            onClick={() => onAddTask(groupKey)}
            className="rounded-xl border-2 border-dashed border-gray-200 py-4 text-xs text-gray-400 hover:border-gray-300 hover:text-gray-500 dark:border-gray-700 dark:hover:border-gray-600 transition-colors"
          >
            + Add task
          </button>
        )}
        {visible.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            clients={clients}
            labels={labels}
            users={users}
            board={board}
            onComplete={onComplete}
            onOpen={onOpen}
            onDuplicate={onDuplicate}
            onRecurring={onRecurring}
            onDelete={onDelete}
          />
        ))}

        {/* Show completed toggle */}
        {completed.length > 0 && (
          <button
            onClick={() => toggleShowCompleted(groupKey)}
            className="mt-1 rounded-lg py-1.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors text-left px-1"
          >
            {isShowingCompleted
              ? `Hide completed (${completed.length})`
              : `Show completed (${completed.length})`}
          </button>
        )}
      </div>
    </div>
  )
}
