// FollowUpList — pending items that BLOCK task completion until all are checked.
// Mirrors SubtaskList's interaction model, with an amber accent to signal that
// these are not optional: the task cannot be completed while any remain open.

import { useState, KeyboardEvent } from 'react'
import { Flag } from 'lucide-react'
import { updateTaskField } from '../../lib/firestore'
import { useAuthStore } from '../../store/authStore'
import { Timestamp } from 'firebase/firestore'
import type { Task, FollowUp } from '../../types'

interface Props {
  task: Task
  readOnly?: boolean
}

export default function FollowUpList({ task, readOnly }: Props) {
  const { user } = useAuthStore()
  const [newTitle, setNewTitle] = useState('')

  const followUps = task.followUps ?? []
  const pending = followUps.filter((f) => !f.completed).length

  async function persist(updated: FollowUp[]) {
    if (!user) return
    await updateTaskField(task.id, 'followUps', updated, user.uid, user.name, task.followUps ?? [])
  }

  async function toggle(item: FollowUp) {
    await persist(followUps.map((f) => (f.id === item.id ? { ...f, completed: !f.completed } : f)))
  }

  async function addFollowUp() {
    if (!newTitle.trim()) return
    await persist([
      ...followUps,
      { id: crypto.randomUUID(), title: newTitle.trim(), completed: false, createdAt: Timestamp.now() },
    ])
    setNewTitle('')
  }

  async function deleteFollowUp(id: string) {
    await persist(followUps.filter((f) => f.id !== id))
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') addFollowUp()
  }

  return (
    <div>
      {/* Blocking hint — only while open follow-ups exist */}
      {pending > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 px-3 py-1.5">
          <Flag size={12} className="shrink-0 text-amber-500" />
          <span className="text-xs text-amber-700 dark:text-amber-400">
            {pending} open follow-up{pending !== 1 ? 's' : ''} — the task can't be completed until all are checked
          </span>
        </div>
      )}

      {/* Follow-up list */}
      <div className="space-y-1.5 mb-3">
        {followUps.map((f) => (
          <div key={f.id} className="group flex items-center gap-2">
            <button
              onClick={() => { if (!readOnly) toggle(f) }}
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-colors ${
                f.completed
                  ? 'border-amber-500 bg-amber-500'
                  : 'border-amber-300 hover:border-amber-500 dark:border-amber-700'
              }`}
            >
              {f.completed && (
                <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
            <span className={`flex-1 text-sm ${f.completed ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-200'}`}>
              {f.title}
            </span>
            {!readOnly && (
              <button
                onClick={() => deleteFollowUp(f.id)}
                className="hidden group-hover:flex h-5 w-5 items-center justify-center rounded text-gray-300 hover:text-red-400 dark:text-gray-600"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Add follow-up input */}
      {!readOnly && (
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 shrink-0 rounded border-2 border-dashed border-amber-300 dark:border-amber-700" />
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="+ Add follow-up (blocks completion)"
            className="flex-1 bg-transparent text-sm text-gray-600 placeholder-gray-400 focus:outline-none dark:text-gray-300 dark:placeholder-gray-600"
          />
          {newTitle && (
            <button
              onClick={addFollowUp}
              className="rounded px-2 py-0.5 text-xs font-medium text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/20 transition-colors"
            >
              Add
            </button>
          )}
        </div>
      )}
    </div>
  )
}
