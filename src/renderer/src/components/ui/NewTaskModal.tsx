import { useState } from 'react'
import { Timestamp } from 'firebase/firestore'
import { createTask } from '../../lib/firestore'
import { useAuthStore } from '../../store/authStore'
import { useSettingsStore } from '../../store/settingsStore'
import { BOARD_BUCKETS } from '../../utils/colorUtils'
import { toFirestoreDate } from '../../utils/dateUtils'
import type { Board, TaskStatus, TaskPriority } from '../../types'

interface Props {
  board: Board
  defaultBucket?: string
  defaultDate?: Date
  onClose: () => void
  onCreated?: (taskId: string) => void
}

export default function NewTaskModal({ board, defaultBucket, defaultDate, onClose, onCreated }: Props) {
  const { user } = useAuthStore()
  const { clients, setClients } = useSettingsStore()
  const [title, setTitle] = useState('')
  const [clientId, setClientId] = useState('')
  const [bucket, setBucket] = useState(defaultBucket ?? '')
  const [status] = useState<TaskStatus>('todo')
  const [priority, setPriority] = useState<TaskPriority>('normal')
  const [newClientName, setNewClientName] = useState('')
  const [showNewClient, setShowNewClient] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleCreateClient() {
    if (!newClientName.trim() || !user) return
    const { createClient } = await import('../../lib/firestore')
    const id = await createClient(newClientName.trim(), user.uid)
    
    // Add to local store immediately so it appears in the dropdown
    // Note: Firestore will sync the actual createdAt Timestamp
    const trimmedName = newClientName.trim()
    const newClient: import('../../types').Client = { 
      id, 
      name: trimmedName, 
      active: true, 
      createdBy: user.uid,
      createdAt: Timestamp.now() as unknown as import('firebase/firestore').Timestamp
    }
    setClients([...clients, newClient].sort((a, b) => a.name.localeCompare(b.name)))
    
    setClientId(id)
    setNewClientName('')
    setShowNewClient(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('Title is required'); return }
    if (!clientId) { setError('Client is required'); return }
    if (!user) return

    setSaving(true)
    try {
      const now = Timestamp.now()
      const dateTs = defaultDate ? toFirestoreDate(defaultDate) : null
      const id = await createTask({
        boardId: board.id,
        title: title.trim(),
        clientId,
        bucket,
        status,
        priority,
        assignees: [],
        labelIds: [],
        dateStart: dateTs,
        dateEnd: dateTs,
        description: '',
        notes: '',
        poNumber: '',
        awbs: [],
        subtasks: [],
        attachments: [],
        recurring: null,
        completed: false,
        completedAt: null,
        completedBy: null,
        createdBy: user.uid,
        updatedBy: user.uid,
        createdAt: now,
        updatedAt: now,
      })
      onCreated?.(id)
      onClose()
    } catch {
      setError('Failed to create task. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl dark:bg-gray-800 p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold text-gray-900 dark:text-white">New Task</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Title *</label>
            <input
              autoFocus
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-green-500"
            />
          </div>

          {/* Client */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Client *</label>
            {showNewClient ? (
              <div className="flex gap-2">
                <input autoFocus value={newClientName} onChange={(e) => setNewClientName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateClient() } if (e.key === 'Escape') setShowNewClient(false) }}
                  placeholder="New client name"
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-green-500"
                />
                <button type="button" onClick={handleCreateClient} className="rounded-lg bg-green-500 px-3 py-2 text-sm font-medium text-white hover:bg-green-600">Add</button>
                <button type="button" onClick={() => setShowNewClient(false)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-500">Cancel</button>
              </div>
            ) : (
              <select value={clientId} onChange={(e) => { if (e.target.value === '__new__') setShowNewClient(true); else setClientId(e.target.value) }}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-green-500"
              >
                <option value="">— Select client —</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                <option value="__new__">+ New Client</option>
              </select>
            )}
          </div>

          {/* Bucket */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Bucket</label>
            <input
              type="text"
              list={`buckets-${board.id}`}
              value={bucket}
              onChange={(e) => setBucket(e.target.value)}
              placeholder="Select or type a bucket"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-green-500"
            />
            <datalist id={`buckets-${board.id}`}>
              {(BOARD_BUCKETS[board.type] ?? []).map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </div>

          {/* Priority */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Priority</label>
            <div className="flex gap-2">
              {(['normal', 'high'] as TaskPriority[]).map((p) => (
                <button type="button" key={p} onClick={() => setPriority(p)}
                  className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${priority === p ? (p === 'high' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300') : 'border border-gray-200 text-gray-400 hover:bg-gray-50 dark:border-gray-600'}`}
                >{p === 'high' ? '! High' : 'Normal'}</button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-gray-200 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 rounded-lg bg-green-500 py-2 text-sm font-semibold text-white hover:bg-green-600 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Creating…' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
