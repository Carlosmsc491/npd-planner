import { useState, useEffect, useCallback } from 'react'
import { Timestamp } from 'firebase/firestore'
import { createTask, createDivision, subscribeToActiveUsers } from '../../lib/firestore'
import { useAuthStore } from '../../store/authStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useDivisions } from '../../hooks/useDivisions'
import { toFirestoreDate } from '../../utils/dateUtils'
import { DynamicIcon } from '../../utils/propertyUtils'
import { CustomFieldInput } from '../settings/BoardTemplateEditor'
import { normalizeBoardProperties, pickCustomFields } from '../../lib/boardProperties'
import { getInitials, getInitialsColor } from '../../utils/colorUtils'
import type { Board, TaskStatus, TaskPriority, AppUser, BoardProperty } from '../../types'

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
  const isPersonBoard = board.type === 'trips' || board.type === 'vacations'

  // Template, normalized so every property is bind-aware (rename/reorder/custom
  // and missing bind all handled). This is the single code path — no fallback.
  const properties: BoardProperty[] = normalizeBoardProperties(board)

  // ── Field state ─────────────────────────────────────────────────────────
  const [title, setTitle] = useState('')
  const [clientId, setClientId] = useState('')
  const [divisionId, setDivisionId] = useState('')
  const [newClientName, setNewClientName] = useState('')
  const [showNewClient, setShowNewClient] = useState(false)
  const [newDivisionName, setNewDivisionName] = useState('')
  const [showNewDivision, setShowNewDivision] = useState(false)
  const [assignees, setAssignees] = useState<string[]>([])
  const [bucket, setBucket] = useState(defaultBucket ?? (isPersonBoard ? 'Pending' : ''))
  const [priority, setPriority] = useState<TaskPriority>('normal')
  const [dateStart, setDateStart] = useState(defaultDate ? defaultDate.toISOString().split('T')[0] : '')
  const [dateEnd, setDateEnd] = useState(defaultDate ? defaultDate.toISOString().split('T')[0] : '')
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, unknown>>({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const [users, setUsers] = useState<AppUser[]>([])
  const { divisions } = useDivisions(clientId)

  useEffect(() => subscribeToActiveUsers(setUsers), [])
  const activeUsers = users.filter(u => u.status === 'active')

  const setField = useCallback((id: string, value: unknown) => {
    setCustomFieldValues(prev => ({ ...prev, [id]: value }))
  }, [])

  // Which binds appear in this template (drives validation + payload)
  const hasBind = (b: string) => properties.some(p => p.bind === b)

  // ── Client / division inline creation ────────────────────────────────────
  async function handleCreateClient() {
    if (!newClientName.trim() || !user) return
    const { createClient } = await import('../../lib/firestore')
    const id = await createClient(newClientName.trim(), user.uid)
    setClients([...clients, {
      id, name: newClientName.trim(), active: true, createdBy: user.uid,
      createdAt: Timestamp.now() as unknown as import('firebase/firestore').Timestamp,
    }].sort((a, b) => a.name.localeCompare(b.name)))
    setClientId(id); setDivisionId(''); setNewClientName(''); setShowNewClient(false)
  }

  async function handleCreateDivision() {
    if (!newDivisionName.trim() || !clientId || !user) return
    const id = await createDivision({
      clientId, name: newDivisionName.trim().toUpperCase(), active: true, createdBy: user.uid,
    })
    setDivisionId(id); setNewDivisionName(''); setShowNewDivision(false)
  }

  function toggleAssignee(uid: string) {
    setAssignees(prev => prev.includes(uid) ? prev.filter(x => x !== uid) : [...prev, uid])
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('Title is required'); return }
    if (hasBind('clientId') && !clientId) { setError('Client is required'); return }
    if (hasBind('assignees') && isPersonBoard && assignees.length === 0) { setError('Person is required'); return }
    if (hasBind('bucket') && !bucket.trim()) { setError('Bucket is required'); return }
    if (hasBind('dates') && isPersonBoard && !dateStart) {
      setError(board.type === 'trips' ? 'Trip dates are required' : 'Vacation dates are required'); return
    }
    // Generic required custom/unbound props
    for (const p of properties) {
      if (!p.required || p.bind || p.type === 'section') continue
      const v = customFieldValues[p.id]
      if (v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) {
        setError(`${p.name} is required`); return
      }
    }
    if (!user) return

    setSaving(true)
    try {
      const now = Timestamp.now()
      const startTs = dateStart ? toFirestoreDate(new Date(dateStart + 'T12:00:00')) : (defaultDate ? toFirestoreDate(defaultDate) : null)
      const endTs   = dateEnd   ? toFirestoreDate(new Date(dateEnd   + 'T12:00:00')) : startTs
      const customFields = pickCustomFields(properties, customFieldValues)

      const id = await createTask({
        boardId:    board.id,
        title:      title.trim(),
        clientId:   hasBind('clientId') ? clientId : '',
        divisionId: hasBind('clientId') ? (divisionId || null) : null,
        bucket,
        status:     'todo' as TaskStatus,
        priority,
        assignees,
        labelIds:   [],
        dateStart:  startTs,
        dateEnd:    endTs,
        description: '',
        notes:      typeof customFieldValues['__notes__'] === 'string' ? customFieldValues['__notes__'] as string : '',
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

  // ── Render a field by BIND/TYPE (never by literal id) ─────────────────────
  const LABEL = 'block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1'
  const INPUT = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-green-500'

  function renderField(prop: BoardProperty) {
    if (prop.hidden) return null
    // Section heading / page break
    if (prop.type === 'section') {
      return (
        <div key={prop.id} className="flex items-center gap-2 pt-2">
          <span className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">{prop.name}</span>
          <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
        </div>
      )
    }

    // Status is always 'todo' at creation — skip
    if (prop.bind === 'status') return null
    // These are managed in the task detail, not at creation
    if (prop.bind === 'labelIds' || prop.bind === 'taskDates' || prop.bind === 'poEntries' ||
        prop.bind === 'awbs' || prop.bind === 'description' || prop.bind === 'followUps' ||
        prop.bind === 'attachments') return null

    // Client (+ division) — planner/custom
    if (prop.bind === 'clientId') {
      return (
        <div key={prop.id}>
          <label className={LABEL}>{prop.name} {prop.required !== false ? '*' : ''}</label>
          {showNewClient ? (
            <div className="flex gap-2">
              <input autoFocus value={newClientName} onChange={e => setNewClientName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateClient() } if (e.key === 'Escape') setShowNewClient(false) }}
                placeholder="New client name" className={`flex-1 ${INPUT}`} />
              <button type="button" onClick={handleCreateClient} className="rounded-lg bg-green-500 px-3 py-2 text-sm font-medium text-white hover:bg-green-600">Add</button>
              <button type="button" onClick={() => setShowNewClient(false)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-500">Cancel</button>
            </div>
          ) : (
            <select value={clientId} onChange={e => { if (e.target.value === '__new__') setShowNewClient(true); else { setClientId(e.target.value); setDivisionId('') } }} className={INPUT}>
              <option value="">— Select client —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              <option value="__new__">+ New Client</option>
            </select>
          )}
          {clientId && (
            <div className="mt-2">
              <label className={LABEL}>Division</label>
              {showNewDivision ? (
                <div className="flex gap-2">
                  <input autoFocus value={newDivisionName} onChange={e => setNewDivisionName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateDivision() } if (e.key === 'Escape') setShowNewDivision(false) }}
                    placeholder="New division name" className={`flex-1 ${INPUT}`} />
                  <button type="button" onClick={handleCreateDivision} className="rounded-lg bg-green-500 px-3 py-2 text-sm font-medium text-white hover:bg-green-600">Add</button>
                  <button type="button" onClick={() => setShowNewDivision(false)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-500">Cancel</button>
                </div>
              ) : (
                <select value={divisionId} onChange={e => { if (e.target.value === '__new__') setShowNewDivision(true); else setDivisionId(e.target.value) }} className={INPUT}>
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

    // Assignees / Person
    if (prop.bind === 'assignees') {
      if (isPersonBoard) {
        // Single person picker (active users only)
        return (
          <div key={prop.id}>
            <label className={LABEL}>Person *</label>
            <select value={assignees[0] ?? ''} onChange={e => setAssignees(e.target.value ? [e.target.value] : [])} className={INPUT}>
              <option value="">— Select person —</option>
              {activeUsers.map(u => <option key={u.uid} value={u.uid}>{u.name}</option>)}
            </select>
          </div>
        )
      }
      // Multi assignees (optional)
      return (
        <div key={prop.id}>
          <label className={LABEL}>{prop.name}</label>
          <div className="flex flex-wrap gap-1.5 items-center">
            {assignees.map(uid => {
              const u = activeUsers.find(x => x.uid === uid); if (!u) return null
              return (
                <span key={uid} className="inline-flex items-center gap-1.5 rounded-full border border-green-500 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 dark:bg-green-900/20 dark:text-green-400">
                  <span className="h-4 w-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ backgroundColor: getInitialsColor(u.name) }}>{getInitials(u.name)}</span>
                  {u.name}
                  <button type="button" onClick={() => toggleAssignee(uid)} className="text-green-600 hover:text-green-800">✕</button>
                </span>
              )
            })}
            <select value="" onChange={e => { if (e.target.value) toggleAssignee(e.target.value) }} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1 text-xs text-gray-500 focus:outline-none focus:border-green-500">
              <option value="">+ Add</option>
              {activeUsers.filter(u => !assignees.includes(u.uid)).map(u => <option key={u.uid} value={u.uid}>{u.name}</option>)}
            </select>
          </div>
        </div>
      )
    }

    // Bucket
    if (prop.bind === 'bucket') {
      const opts = prop.options?.map(o => o.label) ?? []
      if (isPersonBoard) {
        return (
          <div key={prop.id}>
            <label className={LABEL}>{prop.name} *</label>
            <select value={bucket} onChange={e => setBucket(e.target.value)} className={INPUT}>
              <option value="">— Select —</option>
              {opts.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
        )
      }
      return (
        <div key={prop.id}>
          <label className={LABEL}>{prop.name} *</label>
          <input type="text" list={`buckets-${board.id}`} value={bucket} onChange={e => setBucket(e.target.value)} placeholder="Select or type a bucket" className={INPUT} />
          <datalist id={`buckets-${board.id}`}>{opts.map(b => <option key={b} value={b} />)}</datalist>
        </div>
      )
    }

    // Priority
    if (prop.bind === 'priority') {
      const opts = prop.options ?? [{ id: 'normal', label: 'Normal', color: '' }, { id: 'high', label: 'High', color: '' }]
      return (
        <div key={prop.id}>
          <label className={LABEL}>{prop.name}</label>
          <div className="flex gap-2">
            {opts.map(opt => {
              const isHigh = opt.label.toLowerCase() === 'high' || opt.label.toLowerCase() === 'urgent'
              const val: TaskPriority = isHigh ? 'high' : 'normal'
              return (
                <button type="button" key={opt.id} onClick={() => setPriority(val)}
                  className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
                    priority === val
                      ? (isHigh ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300')
                      : 'border border-gray-200 text-gray-400 hover:bg-gray-50 dark:border-gray-600'
                  }`}>
                  {isHigh ? '! High' : 'Normal'}
                </button>
              )
            })}
          </div>
        </div>
      )
    }

    // Task date range (the board's main Date — bind 'dates'). Custom date props
    // fall through to the generic input and keep their own value in customFields.
    if (prop.bind === 'dates') {
      const dateLabel = isPersonBoard ? (board.type === 'trips' ? 'Trip dates *' : 'Vacation dates *') : prop.name
      return (
        <div key={prop.id}>
          <label className={LABEL}>{dateLabel}</label>
          <div className="flex items-center gap-2">
            <input type="date" value={dateStart} onChange={e => { setDateStart(e.target.value); if (!dateEnd) setDateEnd(e.target.value) }} className={`flex-1 ${INPUT}`} />
            <span className="text-gray-400 text-xs shrink-0">→</span>
            <input type="date" value={dateEnd} min={dateStart} onChange={e => setDateEnd(e.target.value)} className={`flex-1 ${INPUT}`} />
          </div>
        </div>
      )
    }

    // Notes (bind 'notes') — plain textarea stored in task.notes
    if (prop.bind === 'notes') {
      return (
        <div key={prop.id}>
          <label className={LABEL}>{prop.name}</label>
          <textarea
            value={typeof customFieldValues['__notes__'] === 'string' ? customFieldValues['__notes__'] as string : ''}
            onChange={e => setField('__notes__', e.target.value)}
            rows={3} className={`${INPUT} resize-none`} />
        </div>
      )
    }

    // Everything else (custom / unbound builtins like builtin-type) → generic input
    return (
      <div key={prop.id}>
        <label className="flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          <DynamicIcon name={prop.icon} size={12} className="text-gray-400" />
          {prop.name}{prop.required ? ' *' : ''}
        </label>
        <CustomFieldInput prop={prop} value={customFieldValues[prop.id]} users={users} onChange={v => setField(prop.id, v)} />
      </div>
    )
  }

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
          <div>
            <label className={LABEL}>Title *</label>
            <input autoFocus type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Task title" className={INPUT} />
          </div>

          {properties.map(prop => renderField(prop))}

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-200 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 rounded-lg bg-green-500 py-2 text-sm font-semibold text-white hover:bg-green-600 disabled:opacity-50 transition-colors">
              {saving ? 'Creating…' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
