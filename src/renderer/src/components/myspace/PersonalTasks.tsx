import { useState, useRef, useEffect } from 'react'
import { Plus, Check, Trash2, Calendar, X, Pencil } from 'lucide-react'
import type { PersonalTask } from '../../types'

interface Props {
  tasks: PersonalTask[]
  completedTasks: PersonalTask[]
  onAddTask: (title: string, dueDate: Date | null) => void
  onToggleComplete: (taskId: string, completed: boolean) => void
  onDeleteTask: (taskId: string) => void
  onUpdateTask: (taskId: string, title: string, dueDate: Date | null) => void
}

export default function PersonalTasks({
  tasks,
  completedTasks,
  onAddTask,
  onToggleComplete,
  onDeleteTask,
  onUpdateTask,
}: Props) {
  const [newTitle, setNewTitle] = useState('')
  const [newDueDate, setNewDueDate] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDueDate, setEditDueDate] = useState('')
  const [showCompleted, setShowCompleted] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus()
    }
  }, [editingId])

  const handleAddTask = () => {
    if (!newTitle.trim()) return
    const dueDate = newDueDate ? new Date(newDueDate) : null
    onAddTask(newTitle.trim(), dueDate)
    setNewTitle('')
    setNewDueDate('')
  }

  const startEditing = (task: PersonalTask) => {
    setEditingId(task.id)
    setEditTitle(task.title)
    // Format date as YYYY-MM-DD for input type="date"
    const formatDateInput = (date: Date): string => {
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }
    setEditDueDate(task.dueDate ? formatDateInput(task.dueDate.toDate()) : '')
  }

  const saveEdit = () => {
    if (!editingId || !editTitle.trim()) return
    const dueDate = editDueDate ? new Date(editDueDate) : null
    onUpdateTask(editingId, editTitle.trim(), dueDate)
    setEditingId(null)
    setEditTitle('')
    setEditDueDate('')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditTitle('')
    setEditDueDate('')
  }

  const handleKeyDown = (e: React.KeyboardEvent, action: 'add' | 'save') => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (action === 'add') handleAddTask()
      else saveEdit()
    } else if (e.key === 'Escape') {
      if (action === 'save') cancelEdit()
    }
  }

  const renderTaskItem = (task: PersonalTask, isCompleted: boolean) => {
    const isEditing = editingId === task.id

    if (isEditing) {
      return (
        <div
          key={task.id}
          className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 p-2 dark:border-green-700 dark:bg-green-900/20"
        >
          <input
            ref={inputRef}
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, 'save')}
            className="flex-1 rounded border border-gray-200 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-green-500"
          />
          <div className="flex items-center gap-1">
            <input
              type="date"
              value={editDueDate}
              onChange={(e) => setEditDueDate(e.target.value)}
              className="rounded border border-gray-200 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-green-500"
            />
            <button
              onClick={saveEdit}
              className="rounded p-1.5 text-green-600 hover:bg-green-100 dark:text-green-400 dark:hover:bg-green-900/30"
              title="Save"
            >
              <Check size={14} />
            </button>
            <button
              onClick={cancelEdit}
              className="rounded p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
              title="Cancel"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )
    }

    return (
      <div
        key={task.id}
        className={`group flex items-center gap-2 rounded-lg border border-gray-200 p-2 transition-colors dark:border-gray-700 ${
          isCompleted
            ? 'opacity-40 bg-gray-50 dark:bg-gray-800/50'
            : 'bg-white hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-700/50'
        }`}
      >
        <button
          onClick={() => onToggleComplete(task.id, !isCompleted)}
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
            isCompleted
              ? 'border-green-500 bg-green-500 text-white'
              : 'border-gray-300 hover:border-green-500 dark:border-gray-600 dark:hover:border-green-500'
          }`}
        >
          {isCompleted && <Check size={12} />}
        </button>

        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={() => !isCompleted && startEditing(task)}
        >
          <p
            className={`text-sm truncate ${
              isCompleted
                ? 'text-gray-500 line-through dark:text-gray-500'
                : 'text-gray-900 dark:text-gray-100'
            }`}
          >
            {task.title}
          </p>
          {task.dueDate && (
            <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-0.5">
              <Calendar size={10} />
              {task.dueDate.toDate().toLocaleDateString()}
            </p>
          )}
        </div>

        {!isCompleted && (
          <button
            onClick={() => startEditing(task)}
            className="opacity-0 group-hover:opacity-100 rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300 transition-all"
            title="Edit"
          >
            <Pencil size={12} />
          </button>
        )}

        <button
          onClick={() => onDeleteTask(task.id)}
          className="opacity-0 group-hover:opacity-100 rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400 transition-all"
          title="Delete"
        >
          <Trash2 size={12} />
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          Personal Tasks
        </h3>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {tasks.length} active
        </span>
      </div>

      {/* Add Task Input */}
      <div className="p-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex gap-2">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, 'add')}
            placeholder="Add a new task…"
            className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-green-500"
          />
          <input
            type="date"
            value={newDueDate}
            onChange={(e) => setNewDueDate(e.target.value)}
            className="w-auto rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-green-500"
          />
          <button
            onClick={handleAddTask}
            disabled={!newTitle.trim()}
            className="rounded-lg bg-green-500 px-3 py-2 text-white hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Plus size={18} />
          </button>
        </div>
      </div>

      {/* Task Lists */}
      <div className="flex-1 overflow-auto p-3 space-y-2">
        {/* Active Tasks */}
        {tasks.length === 0 ? (
          <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-8">
            No active tasks. Add one above!
          </p>
        ) : (
          tasks.map((task) => renderTaskItem(task, false))
        )}

        {/* Completed Tasks Toggle */}
        {completedTasks.length > 0 && (
          <div className="pt-4">
            <button
              onClick={() => setShowCompleted(!showCompleted)}
              className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 transition-colors"
            >
              <span>Completed ({completedTasks.length})</span>
              <span className="transform transition-transform">
                {showCompleted ? '▼' : '▶'}
              </span>
            </button>

            {showCompleted && (
              <div className="mt-2 space-y-1">
                {completedTasks.map((task) => renderTaskItem(task, true))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
