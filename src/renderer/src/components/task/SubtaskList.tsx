import { useState, KeyboardEvent } from 'react'
import { updateTaskField } from '../../lib/firestore'
import { useAuthStore } from '../../store/authStore'
import { Timestamp } from 'firebase/firestore'
import type { Task, Subtask } from '../../types'

interface Props {
  task: Task
}

export default function SubtaskList({ task }: Props) {
  const { user } = useAuthStore()
  const [newTitle, setNewTitle] = useState('')

  const completed = task.subtasks.filter((s) => s.completed).length
  const total = task.subtasks.length
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0

  async function toggle(subtask: Subtask) {
    if (!user) return
    const updated = task.subtasks.map((s) =>
      s.id === subtask.id ? { ...s, completed: !s.completed } : s
    )
    await updateTaskField(task.id, 'subtasks', updated, user.uid, user.name, task.subtasks)
  }

  async function addSubtask() {
    if (!newTitle.trim() || !user) return
    const updated: Subtask[] = [
      ...task.subtasks,
      {
        id: crypto.randomUUID(),
        title: newTitle.trim(),
        completed: false,
        assigneeUid: null,
        createdAt: Timestamp.now(),
      },
    ]
    await updateTaskField(task.id, 'subtasks', updated, user.uid, user.name, task.subtasks)
    setNewTitle('')
  }

  async function deleteSubtask(id: string) {
    if (!user) return
    const updated = task.subtasks.filter((s) => s.id !== id)
    await updateTaskField(task.id, 'subtasks', updated, user.uid, user.name, task.subtasks)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') addSubtask()
  }

  return (
    <div>
      {/* Progress bar */}
      {total > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500 dark:text-gray-400">{completed} of {total} completed</span>
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{pct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              className="h-1.5 rounded-full bg-green-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* Subtask list */}
      <div className="space-y-1.5 mb-3">
        {task.subtasks.map((s) => (
          <div key={s.id} className="group flex items-center gap-2">
            <button
              onClick={() => toggle(s)}
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-colors ${
                s.completed
                  ? 'border-green-500 bg-green-500'
                  : 'border-gray-300 hover:border-green-400 dark:border-gray-600'
              }`}
            >
              {s.completed && (
                <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
            <span className={`flex-1 text-sm ${s.completed ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-200'}`}>
              {s.title}
            </span>
            <button
              onClick={() => deleteSubtask(s.id)}
              className="hidden group-hover:flex h-5 w-5 items-center justify-center rounded text-gray-300 hover:text-red-400 dark:text-gray-600"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* Add subtask input */}
      <div className="flex items-center gap-2">
        <div className="h-4 w-4 shrink-0 rounded border-2 border-dashed border-gray-300 dark:border-gray-600" />
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="+ Add subtask"
          className="flex-1 bg-transparent text-sm text-gray-600 placeholder-gray-400 focus:outline-none dark:text-gray-300 dark:placeholder-gray-600"
        />
        {newTitle && (
          <button
            onClick={addSubtask}
            className="rounded px-2 py-0.5 text-xs font-medium text-green-600 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/20 transition-colors"
          >
            Add
          </button>
        )}
      </div>
    </div>
  )
}
