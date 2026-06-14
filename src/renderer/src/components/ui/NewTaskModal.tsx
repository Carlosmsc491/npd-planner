import { useState, useEffect, useCallback } from 'react'
import { Timestamp } from 'firebase/firestore'
import { createTask, createDivision, subscribeToUsers } from '../../lib/firestore'
import { useAuthStore } from '../../store/authStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useDivisions } from '../../hooks/useDivisions'
import { BOARD_BUCKETS } from '../../utils/colorUtils'
import { toFirestoreDate } from '../../utils/dateUtils'
import { DynamicIcon } from '../../utils/propertyUtils'
import { CustomFieldInput } from '../settings/BoardTemplateEditor'
import type { Board, TaskStatus, TaskPriority, AppUser, BoardProperty } from '../../types'

interface Props {
  board: Board
  defaultBucket?: string
  defaultDate?: Date
  onClose: () => void
  onCreated?: (taskId: string) => void
}

// Builtin properties that need special-cased rendering (not generic CustomFieldInput)
const SPECIAL_BUILTINS = new Set([
  'builtin-client',
  'builtin-status',
  'builtin-assignees',
  'builtin-bucket',
  'builtin-priority',
  'builtin-date',
])

export default function NewTaskModal({ board, defaultBucket, defaultDate, onClose, onCreated }: Props) {
  const { user } = useAuthStore()
  const { clients, setClients } = useSettingsStore()
  const isPersonBoard = board.type === 'trips' || board.type === 'vacations'

  // ── Base required fields ──────────────────────────────────────────────────
  const [title, setTitle] = useState('')

  // Client (planner)
  const [clientId, setClientId] = useState('')
  const [newClientName, setNewClientName] = useState('')
  const [showNewClient, setShowNewClient] = useState(false)
  const [divisionId, setDivisionId] = useState('')
  const [newDivisionName, setNewDivisionName] = useState('')
  const [showNewDivision, setShowNewDivision] = useState(false)

  // Person (trips / vacations)
  const [personId, setPersonId] = useState('')
  const [users, setUsers] = useState<AppUser[]>([])

  // Bucket & priority (builtins with special UI)
  // Person boards (trips/vacations) start at "Pending" — the natural initial status
  const [bucket, setBucket] = useState(defaultBucket ?? (isPersonBoard ? 'Pending' : ''))
  const [priority, setPriority] = useState<TaskPriority>('normal')

  // Date (builtin-date)
  const [dateStart, setDateStart] = useState(defaultDate ? defaultDate.toISOString().split('T')[0] : '')
  const [dateEnd, setDateEnd] = useState(defaultDate ? defaultDate.toISOString().split('T')[0] : '')

  // All other custom / non-special-builtin fields
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, unknown>>({})

  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const { divisions } = useDivisions(clientId)

  useEffect(() => {
    if (!isPersonBoard) return
    const unsub = subscribeToUsers(setUsers)
    return unsub
  }, [isPersonBoard])

  // ── Sorted properties from the board template ─────────────────────────────
  const properties: BoardProperty[] = (board.customProperties ?? [])
    .slice()
    .sort((a, b) => a.order - b.order)

  // Has date property in template?
  const hasDateProp = properties.some(p => p.id === 'builtin-date')

  // Person boards: only active users are selectable, and we render exactly ONE
  // Person picker bound to personId (templates vary — the person field may be
  // builtin-client, builtin-assignees, or a custom person-type property).
  const activeUsers = users.filter(u => u.status === 'active')
  const personFieldIds = isPersonBoard
    ? properties
        .filter(p => p.id === 'builtin-client' || p.id === 'builtin-assignees' || p.type === 'person')
        .map(p => p.id)
    : []
  const primaryPersonFieldId = personFieldIds[0]

  const setField = useCallback((id: string, value: unknown) => {
    setCustomFieldValues(prev => ({ ...prev, [id]: value }))
  }, [])

  // ── Client creation ───────────────────────────────────────────────────────
  async function handleCreateClient() {
    if (!newClientName.trim() || !user) return
    const { createClient } = await import('../../lib/firestore')
    const id = await createClient(newClientName.trim(), user.uid)
    const newClient: import('../../types').Client = {
      id,
      name: newClientName.trim(),
      active: true,
      createdBy: user.uid,
      createdAt: Timestamp.now() as unknown as import('firebase/firestore').Timestamp,
    }
    setClients([...clients, newClient].sort((a, b) => a.name.localeCompare(b.name)))
    setClientId(id)
    setDivisionId('')
    setNewClientName('')
    setShowNewClient(false)
  }

  async function handleCreateDivision() {
    if (!newDivisionName.trim() || !clientId || !user) return
    const id = await createDivision({
      clientId,
      name: newDivisionName.trim().toUpperCase(),
      active: true,
      createdBy: user.uid,
    })
    setDivisionId(id)
    setNewDivisionName('')
    setShowNewDivision(false)
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('Title is required'); return }
    if (!isPersonBoard && !clientId) { setError('Client is required'); return }
    if (isPersonBoard && !personId) { setError('Person is required'); return }
    if (!bucket.trim()) { setError('Bucket is required'); return }
    if (isPersonBoard && !dateStart) {
      setError(board.type === 'trips' ? 'Trip dates are required' : 'Vacation dates are required'); return
    }
    if (!user) return

    setSaving(true)
    try {
      const now = Timestamp.now()
      const startTs = dateStart ? toFirestoreDate(new Date(dateStart + 'T12:00:00')) : (defaultDate ? toFirestoreDate(defaultDate) : null)
      const endTs   = dateEnd   ? toFirestoreDate(new Date(dateEnd   + 'T12:00:00')) : startTs

      // Separate custom fields from builtin overrides stored in customFieldValues
      const customFields: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(customFieldValues)) {
        if (!SPECIAL_BUILTINS.has(k)) customFields[k] = v
      }

      const id = await createTask({
        boardId:    board.id,
        title:      title.trim(),
        clientId:   isPersonBoard ? '' : clientId,
        divisionId: isPersonBoard ? null : (divisionId || null),
        bucket,
        status:     'todo' as TaskStatus,
        priority,
        assignees:  isPersonBoard && personId ? [personId] : [],
        labelIds:   [],
        dateStart:  startTs,
        dateEnd:    endTs,
        description: '',
        notes:      '',
        poNumber:   '',
        poNumbers:  [],
        poEntries:  [],
        sharePointFolderName: null,
        awbs:       [],
        subtasks:   [],
        attachments: [],
        emailAttachments: [],
        recurring:  null,
        completed:  false,
        completedAt: null,
        completedBy: null,
        createdBy:  user.uid,
        updatedBy:  user.uid,
        createdAt:  now,
        updatedAt:  now,
        customFields: Object.keys(customFields).length > 0 ? customFields : null,
      })
      onCreated?.(id)
      onClose()
    } catch {
      setError('Failed to create task. Try again.')
    } finally {
      setSaving(false)
    }
  }

  // ── Render a single property field ───────────────────────────────────────
  function renderPropertyField(prop: BoardProperty) {
    // Person boards: render a single Person picker (active users only), bound to
    // personId so validation + assignees work. Supersedes builtin-client /
    // builtin-assignees / custom person fields, and dedupes if several exist.
    if (isPersonBoard && personFieldIds.includes(prop.id)) {
      if (prop.id !== primaryPersonFieldId) return null
      return (
        <div key={prop.id}>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Person *</label>
          <select value={personId} onChange={e => setPersonId(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-green-500"
          >
            <option value="">— Select person —</option>
            {activeUsers.map(u => <option key={u.uid} value={u.uid}>{u.name}</option>)}
          </select>
        </div>
      )
    }

    // Skip status — tasks always start as 'todo'
    if (prop.id === 'builtin-status') return null

    // Client field (planner)
    if (prop.id === 'builtin-client') {
      if (isPersonBoard) return null
      return (
        <div key={prop.id}>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            {prop.name} {prop.required !== false ? '*' : ''}
          </label>
          {showNewClient ? (
            <div className="flex gap-2">
              <input autoFocus value={newClientName} onChange={e => setNewClientName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateClient() } if (e.key === 'Escape') setShowNewClient(false) }}
                placeholder="New client name"
                className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-green-500"
              />
              <button type="button" onClick={handleCreateClient} className="rounded-lg bg-green-500 px-3 py-2 text-sm font-medium text-white hover:bg-green-600">Add</button>
              <button type="button" onClick={() => setShowNewClient(false)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-500">Cancel</button>
            </div>
          ) : (
            <select value={clientId} onChange={e => {
              if (e.target.value === '__new__') { setShowNewClient(true) }
              else { setClientId(e.target.value); setDivisionId('') }
            }}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-green-500"
            >
              <option value="">— Select client —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              <option value="__new__">+ New Client</option>
            </select>
          )}
          {/* Division — appears once client is selected */}
          {clientId && (
            <div className="mt-2">
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Division</label>
              {showNewDivision ? (
                <div className="flex gap-2">
                  <input autoFocus value={newDivisionName} onChange={e => setNewDivisionName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateDivision() } if (e.key === 'Escape') setShowNewDivision(false) }}
                    placeholder="New division name"
                    className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-green-500"
                  />
                  <button type="button" onClick={handleCreateDivision} className="rounded-lg bg-green-500 px-3 py-2 text-sm font-medium text-white hover:bg-green-600">Add</button>
                  <button type="button" onClick={() => setShowNewDivision(false)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-500">Cancel</button>
                </div>
              ) : (
                <select value={divisionId} onChange={e => { if (e.target.value === '__new__') setShowNewDivision(true); else setDivisionId(e.target.value) }}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-green-500"
                >
                  <option value="">— Select division —</option>
                  {divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  <option value="__new__">+ New Division</option>
                </select>
              )}
            </div>
          )}
        </div>
      )
    }

    // Person field (trips / vacations)
    if (prop.id === 'builtin-assignees') {
      if (!isPersonBoard) return null
      return (
        <div key={prop.id}>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Person *</label>
          <select value={personId} onChange={e => setPersonId(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-green-500"
          >
            <option value="">— Select person —</option>
            {users.filter(u => u.status === 'active').map(u => <option key={u.uid} value={u.uid}>{u.name}</option>)}
          </select>
        </div>
      )
    }

    // Bucket
    if (prop.id === 'builtin-bucket') {
      const bucketOpts = prop.options?.map(o => o.label) ?? BOARD_BUCKETS[board.type] ?? []
      // Person boards have a fixed set of statuses → show a clear dropdown.
      if (isPersonBoard) {
        return (
          <div key={prop.id}>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{prop.name} *</label>
            <select
              value={bucket}
              onChange={e => setBucket(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-green-500"
            >
              <option value="">— Select —</option>
              {bucketOpts.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
        )
      }
      // Planner/custom: free-text with suggestions so new buckets can be typed.
      return (
        <div key={prop.id}>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{prop.name} *</label>
          <input
            type="text"
            list={`buckets-${board.id}`}
            value={bucket}
            onChange={e => setBucket(e.target.value)}
            placeholder="Select or type a bucket"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-green-500"
          />
          <datalist id={`buckets-${board.id}`}>
            {bucketOpts.map(b => <option key={b} value={b} />)}
          </datalist>
        </div>
      )
    }

    // Priority
    if (prop.id === 'builtin-priority') {
      return (
        <div key={prop.id}>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{prop.name}</label>
          <div className="flex gap-2">
            {(prop.options ?? [{ id: 'normal', label: 'Normal' }, { id: 'high', label: 'High' }]).map(opt => (
              <button type="button" key={opt.id}
                onClick={() => setPriority((opt.label.toLowerCase() === 'high' ? 'high' : 'normal') as TaskPriority)}
                className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
                  priority === (opt.label.toLowerCase() === 'high' ? 'high' : 'normal')
                    ? (opt.label.toLowerCase() === 'high' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300')
                    : 'border border-gray-200 text-gray-400 hover:bg-gray-50 dark:border-gray-600'
                }`}
              >
                {opt.label.toLowerCase() === 'high' ? '! High' : 'Normal'}
              </button>
            ))}
          </div>
        </div>
      )
    }

    // Date range (builtin-date)
    if (prop.id === 'builtin-date') {
      return (
        <div key={prop.id}>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{prop.name}</label>
          <div className="flex items-center gap-2">
            <input type="date" value={dateStart} onChange={e => { setDateStart(e.target.value); if (!dateEnd) setDateEnd(e.target.value) }}
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-green-500"
            />
            <span className="text-gray-400 text-xs shrink-0">→</span>
            <input type="date" value={dateEnd} min={dateStart} onChange={e => setDateEnd(e.target.value)}
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-green-500"
            />
          </div>
        </div>
      )
    }

    // All other properties (custom fields + unrecognized builtins like builtin-type, builtin-awb, builtin-po, builtin-notes…)
    return (
      <div key={prop.id}>
        <label className="flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          <DynamicIcon name={prop.icon} size={12} className="text-gray-400" />
          {prop.name}{prop.required ? ' *' : ''}
        </label>
        <CustomFieldInput
          prop={prop}
          value={customFieldValues[prop.id]}
          users={users}
          onChange={v => setField(prop.id, v)}
        />
      </div>
    )
  }

  // ── If board has no customProperties, fall back to hardcoded layout ────────
  const hasTemplate = properties.length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl dark:bg-gray-800 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold text-gray-900 dark:text-white">New Task</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title — always first */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Title *</label>
            <input
              autoFocus
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Task title"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-green-500"
            />
          </div>

          {hasTemplate ? (
            // Template-driven fields
            properties.map(prop => renderPropertyField(prop))
          ) : (
            // Fallback hardcoded layout (board has no customProperties yet)
            <>
              {isPersonBoard ? (
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Person *</label>
                  <select value={personId} onChange={e => setPersonId(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-green-500"
                  >
                    <option value="">— Select person —</option>
                    {users.filter(u => u.status === 'active').map(u => <option key={u.uid} value={u.uid}>{u.name}</option>)}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Client *</label>
                  {showNewClient ? (
                    <div className="flex gap-2">
                      <input autoFocus value={newClientName} onChange={e => setNewClientName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateClient() } if (e.key === 'Escape') setShowNewClient(false) }}
                        placeholder="New client name"
                        className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-green-500"
                      />
                      <button type="button" onClick={handleCreateClient} className="rounded-lg bg-green-500 px-3 py-2 text-sm font-medium text-white hover:bg-green-600">Add</button>
                      <button type="button" onClick={() => setShowNewClient(false)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-500">Cancel</button>
                    </div>
                  ) : (
                    <select value={clientId} onChange={e => {
                      if (e.target.value === '__new__') setShowNewClient(true)
                      else { setClientId(e.target.value); setDivisionId('') }
                    }}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-green-500"
                    >
                      <option value="">— Select client —</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      <option value="__new__">+ New Client</option>
                    </select>
                  )}
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Bucket *</label>
                <input type="text" list={`buckets-${board.id}`} value={bucket} onChange={e => setBucket(e.target.value)}
                  placeholder="Select or type a bucket"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-green-500"
                />
                <datalist id={`buckets-${board.id}`}>
                  {(BOARD_BUCKETS[board.type] ?? []).map(b => <option key={b} value={b} />)}
                </datalist>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Priority</label>
                <div className="flex gap-2">
                  {(['normal', 'high'] as TaskPriority[]).map(p => (
                    <button type="button" key={p} onClick={() => setPriority(p)}
                      className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${priority === p ? (p === 'high' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300') : 'border border-gray-200 text-gray-400 hover:bg-gray-50 dark:border-gray-600'}`}
                    >{p === 'high' ? '! High' : 'Normal'}</button>
                  ))}
                </div>
              </div>
              {/* Date — always shown for person boards (trips/vacations are date-based);
                  for planner fallback only when a calendar date was clicked */}
              {(isPersonBoard || (defaultDate && !hasDateProp)) && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {isPersonBoard ? (board.type === 'trips' ? 'Trip dates *' : 'Vacation dates *') : 'Date'}
                  </label>
                  <div className="flex items-center gap-2">
                    <input type="date" value={dateStart} onChange={e => { setDateStart(e.target.value); if (!dateEnd) setDateEnd(e.target.value) }}
                      className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-green-500"
                    />
                    <span className="text-gray-400 text-xs shrink-0">→</span>
                    <input type="date" value={dateEnd} min={dateStart} onChange={e => setDateEnd(e.target.value)}
                      className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-green-500"
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-200 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
            >
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
