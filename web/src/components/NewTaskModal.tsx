import { useState, useEffect, useMemo } from 'react'
import {
  collection, addDoc, serverTimestamp, onSnapshot,
} from 'firebase/firestore'
import { db } from '../firebase'
import { useAuthStore } from '../store/authStore'
import type { Board, Client, Task } from '../types'
import { BOARD_BUCKETS } from '../types'

interface Props {
  board: Board
  onClose: () => void
}

export default function NewTaskModal({ board, onClose }: Props) {
  const { user } = useAuthStore()

  const [title, setTitle]       = useState('')
  const [clientId, setClientId] = useState('')
  const [bucket, setBucket]     = useState('')
  const [status, setStatus]     = useState<Task['status']>('todo')
  const [priority, setPriority] = useState<Task['priority']>('normal')
  const [dateEnd, setDateEnd]   = useState('')
  const [clients, setClients]   = useState<Client[]>([])
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  // Bucket options: board's "Bucket" custom property → fallback to BOARD_BUCKETS[type]
  const bucketOptions = useMemo(() => {
    const prop = board.customProperties?.find((p) => p.id === 'builtin-bucket' || p.name === 'Bucket')
    if (prop?.options?.length) return prop.options.map((o) => o.label)
    return BOARD_BUCKETS[board.type] ?? []
  }, [board])

  // No orderBy — sort client-side to avoid composite index requirement.
  useEffect(() => {
    return onSnapshot(collection(db, 'clients'), (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Client))
        .filter((c) => c.active)
        .sort((a, b) => a.name.localeCompare(b.name))
      setClients(list)
    })
  }, [])

  async function handleSave() {
    if (!title.trim()) { setError('Title is required'); return }
    if (!clientId)     { setError('Client is required'); return }
    if (!user)         { setError('Not signed in'); return }

    setSaving(true)
    try {
      await addDoc(collection(db, 'tasks'), {
        boardId:     board.id,
        title:       title.trim(),
        clientId,
        status,
        priority,
        assignees:   [user.uid],
        labelIds:    [],
        bucket,
        dateStart:   null,
        dateEnd:     dateEnd ? new Date(dateEnd) : null,
        notes:       '',
        poNumber:    '',
        poNumbers:   [],
        poEntries:   [],
        awbs:        [],
        subtasks:    [],
        attachments: [],
        emailAttachments: [],
        recurring:   null,
        completed:   false,
        completedAt: null,
        completedBy: null,
        createdBy:   user.uid,
        createdAt:   serverTimestamp(),
        updatedAt:   serverTimestamp(),
        updatedBy:   user.uid,
      })
      onClose()
    } catch {
      setError('Failed to create task. Check your connection.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-3xl shadow-xl safe-bottom max-w-2xl mx-auto">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        <div className="px-5 pb-2">
          <h2 className="text-base font-bold text-gray-900 mb-4">New Task</h2>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Title *</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What needs to be done?"
                autoFocus
                className="w-full rounded-xl border border-gray-300 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Client *</label>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="w-full rounded-xl border border-gray-300 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30 bg-white"
              >
                <option value="">— Select client —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {bucketOptions.length > 0 && (
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Bucket</label>
                <select
                  value={bucket}
                  onChange={(e) => setBucket(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-3 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500/30"
                >
                  <option value="">— No bucket —</option>
                  {bucketOptions.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as Task['status'])}
                  className="w-full rounded-xl border border-gray-300 px-3 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500/30"
                >
                  <option value="todo">To Do</option>
                  <option value="inprogress">In Progress</option>
                  <option value="review">Review</option>
                  <option value="done">Done</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as Task['priority'])}
                  className="w-full rounded-xl border border-gray-300 px-3 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500/30"
                >
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Due Date</label>
              <input
                type="date"
                value={dateEnd}
                onChange={(e) => setDateEnd(e.target.value)}
                className="w-full rounded-xl border border-gray-300 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
            )}

            <div className="flex gap-3 pt-1 pb-4">
              <button
                onClick={onClose}
                className="flex-1 rounded-xl border border-gray-300 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 active:scale-95 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 rounded-xl bg-green-500 text-white py-3 text-sm font-semibold hover:bg-green-600 active:scale-95 transition disabled:opacity-50"
              >
                {saving ? 'Creating…' : 'Create Task'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
