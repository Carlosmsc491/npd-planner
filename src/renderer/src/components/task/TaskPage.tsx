import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { onSnapshot, doc } from 'firebase/firestore'
import {
  User, Calendar, CircleDot, Zap, Users, Tag,
  Layers, Maximize2, ChevronDown,
} from 'lucide-react'
import { db } from '../../lib/firebase'
import { updateTaskField, createNotification } from '../../lib/firestore'
import { useAuthStore } from '../../store/authStore'
import { useTaskStore } from '../../store/taskStore'
import { useSettingsStore } from '../../store/settingsStore'
import { STATUS_STYLES, getBoardColor, BOARD_BUCKETS, getInitials, getInitialsColor } from '../../utils/colorUtils'
import { timestampToDateInput, dateStringToTimestamp } from '../../utils/dateUtils'
import SubtaskList from './SubtaskList'
import AttachmentPanel from './AttachmentPanel'
import RichTextEditor from './RichTextEditor'
import DateInput from '../ui/DateInput'
import { CustomFieldInput } from '../settings/BoardTemplateEditor'
import { OrderStatusSection } from './OrderStatusSection'
import { useAwbLookup } from '../../hooks/useAwbLookup'
import type { Task, AppUser, Board, TaskStatus, TaskPriority, AwbEntry } from '../../types'

interface Props {
  task: Task
  board: Board | null
  users: AppUser[]
  onClose: () => void
  onDelete: (task: Task) => void
  onRecurring: (task: Task) => void
  onDuplicate: (task: Task) => void
  isFullPage?: boolean
}

export default function TaskPage({ task: initialTask, board, users, onClose, onDelete, onRecurring, onDuplicate, isFullPage }: Props) {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { setSelectedTask } = useTaskStore()
  const { clients, labels } = useSettingsStore()

  // Live task state — updated by onSnapshot so properties reflect real-time changes
  const [task, setTask] = useState<Task>(initialTask)

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'tasks', initialTask.id), (snap) => {
      if (snap.exists()) setTask({ id: snap.id, ...snap.data() } as Task)
      else setSelectedTask(null)
    })
    return unsub
  }, [initialTask.id, setSelectedTask])
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(task.title)
  const [newClientName, setNewClientName] = useState('')
  const [showNewClient, setShowNewClient] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [bucketOpen, setBucketOpen] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)

  // ── Order Status (AWB + PO) state ────────────────────────────────────────
  const [localAwbs, setLocalAwbs] = useState<AwbEntry[]>(task.awbs ?? [])
  const [localPoNumber, setLocalPoNumber] = useState(task.poNumber ?? '')
  const [localPoNumbers, setLocalPoNumbers] = useState<string[]>(task.poNumbers ?? [])
  const { csvStatus, lookupAwbsInTask } = useAwbLookup()

  // Sync local state when task changes (e.g., Firestore real-time update)
  useEffect(() => { setLocalAwbs(task.awbs ?? []) }, [task.awbs])
  useEffect(() => { setLocalPoNumber(task.poNumber ?? '') }, [task.poNumber])
  useEffect(() => { setLocalPoNumbers(task.poNumbers ?? []) }, [task.poNumbers])

  // Cleanup debounce timeout on unmount
  useEffect(() => {
    return () => {
      if (poSaveTimeoutRef.current) {
        clearTimeout(poSaveTimeoutRef.current)
      }
    }
  }, [])

  // Auto-lookup AWBs when task opens and has AWBs
  useEffect(() => {
    if (task.awbs && task.awbs.length > 0) {
      lookupAwbsInTask(task.id, task.awbs).then(updated => {
        setLocalAwbs(updated)
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id])

  // Re-lookup when a new CSV arrives while this task is open
  const prevDownloadedAt = useRef<string | null>(null)
  useEffect(() => {
    if (!csvStatus.downloadedAt) return
    if (csvStatus.downloadedAt === prevDownloadedAt.current) return
    prevDownloadedAt.current = csvStatus.downloadedAt
    if (localAwbs.length > 0) {
      lookupAwbsInTask(task.id, localAwbs).then(updated => {
        setLocalAwbs(updated)
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [csvStatus.downloadedAt])

  useEffect(() => { setTitleDraft(task.title) }, [task.title])
  useEffect(() => { if (editingTitle) titleRef.current?.focus() }, [editingTitle])

  const statusStyle = STATUS_STYLES[task.status]

  const bucketOptions = useMemo(() => {
    const bucketProp = board?.customProperties?.find(
      (p) => p.id === 'builtin-bucket' || p.name === 'Bucket'
    )
    if (bucketProp?.options && bucketProp.options.length > 0) return bucketProp.options
    return (BOARD_BUCKETS[board?.type ?? ''] ?? []).map((b) => ({ id: b, label: b, color: '#9CA3AF' }))
  }, [board])
  const extraBucket = task.bucket && !bucketOptions.find((o) => o.label === task.bucket) ? task.bucket : null
  const selectedBucket = bucketOptions.find((o) => o.label === task.bucket)

  // Last-write-wins: just save, no conflict dialog
  async function save(field: string, value: unknown, old?: unknown) {
    if (!user) return
    await updateTaskField(task.id, field, value, user.uid, user.name, old, board?.type)
  }

  async function saveTitle() {
    if (titleDraft.trim() && titleDraft !== task.title) {
      await save('title', titleDraft.trim(), task.title)
    }
    setEditingTitle(false)
  }

  async function handleCreateClient() {
    if (!newClientName.trim() || !user) return
    const { createClient } = await import('../../lib/firestore')
    const id = await createClient(newClientName.trim(), user.uid)
    await save('clientId', id, task.clientId)
    setNewClientName('')
    setShowNewClient(false)
  }

  async function toggleLabel(labelId: string) {
    const current = task.labelIds ?? []
    const updated = current.includes(labelId)
      ? current.filter((id) => id !== labelId)
      : [...current, labelId]
    await save('labelIds', updated, current)
  }

  async function toggleAssignee(uid: string) {
    const current = task.assignees ?? []
    const isAdding = !current.includes(uid)
    const updated = isAdding
      ? [...current, uid]
      : current.filter((id) => id !== uid)
    await save('assignees', updated, current)

    if (isAdding && user && uid !== user.uid) {
      const { Timestamp: Ts } = await import('firebase/firestore')
      await createNotification({
        userId: uid,
        taskId: task.id,
        taskTitle: task.title,
        boardId: task.boardId,
        boardType: board?.type ?? 'planner',
        type: 'assigned',
        message: `${user.name} assigned you to a task`,
        read: false,
        triggeredBy: user.uid,
        triggeredByName: user.name,
        createdAt: Ts.now(),
      })
    }
  }

  async function handleDateChange(field: 'dateStart' | 'dateEnd', value: string) {
    const ts = dateStringToTimestamp(value)
    await save(field, ts, task[field])
  }

  async function saveCustomField(propId: string, value: unknown) {
    const current = task.customFields ?? {}
    await save('customFields', { ...current, [propId]: value }, current)
  }

  async function saveDescription(html: string) {
    if (!user) return
    // Description: last write wins, no old value passed — no conflict detection
    await updateTaskField(task.id, 'description', html, user.uid, user.name, undefined, board?.type)
  }

  async function handleAwbsChange(updated: AwbEntry[]) {
    setLocalAwbs(updated)
    await save('awbs', updated, task.awbs)
  }

  // Debounce ref para evitar múltiples guardados
  const poSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function handlePoNumbersChange(numbers: string[]) {
    setLocalPoNumbers(numbers)
    
    // Cancelar guardado anterior si existe
    if (poSaveTimeoutRef.current) {
      clearTimeout(poSaveTimeoutRef.current)
    }
    
    // Debounce: guardar después de 1 segundo de inactividad
    poSaveTimeoutRef.current = setTimeout(() => {
      const firstPo = numbers.find(n => n.trim() !== '') ?? ''
      save('poNumbers', numbers, task.poNumbers ?? [])
      if (firstPo !== task.poNumber) {
        save('poNumber', firstPo, task.poNumber)
        setLocalPoNumber(firstPo)
      }
      poSaveTimeoutRef.current = null
    }, 1000)
  }

  return (
    <div className="flex h-full flex-col bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-start justify-between px-6 pt-5 pb-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-start gap-2 flex-1 min-w-0 pr-2">
          {!isFullPage && (
            <button
              onClick={() => navigate(`/task/${task.id}`)}
              className="mt-1 rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300 transition-colors shrink-0"
              title="Open full page"
            >
              <Maximize2 size={14} />
            </button>
          )}
          <div className="flex-1 min-w-0">
            {editingTitle ? (
              <input
                ref={titleRef}
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') { setEditingTitle(false); setTitleDraft(task.title) } }}
                className="w-full text-xl font-bold text-gray-900 dark:text-white bg-transparent border-b-2 border-green-500 focus:outline-none pb-0.5"
              />
            ) : (
              <h2
                onClick={() => setEditingTitle(true)}
                className={`text-xl font-bold cursor-text hover:text-gray-700 dark:hover:text-gray-300 transition-colors ${task.completed ? 'line-through text-gray-400' : 'text-gray-900 dark:text-white'}`}
              >
                {task.title}
              </h2>
            )}
            {board && (
              <span
                className="mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                style={{ backgroundColor: getBoardColor(board) }}
              >
                {board.name}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
              </svg>
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 z-20 mt-1 w-44 rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
                  {[
                    { label: 'Duplicate', action: () => { onDuplicate(task); setMenuOpen(false) } },
                    { label: 'Make Recurring', action: () => { onRecurring(task); setMenuOpen(false) } },
                    { label: 'Delete', danger: true, action: () => { onDelete(task); setMenuOpen(false); setSelectedTask(null) } },
                  ].map((item) => (
                    <button key={item.label} onClick={item.action}
                      className={`w-full px-3 py-2 text-left text-sm first:rounded-t-xl last:rounded-b-xl transition-colors ${item.danger ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20' : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700'}`}
                    >{item.label}</button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>



      {/* Scrollable content */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-5">

        {/* ── DETAILS ── */}
        <>
            {(board?.customProperties ?? [])
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((prop) => {
                switch (prop.id) {
                  case 'builtin-client':
                    return (
                      <PropRow key={prop.id} icon={<User size={14} />} label={prop.name}>
                        <div className="flex-1">
                          {showNewClient ? (
                            <div className="flex items-center gap-2">
                              <input autoFocus value={newClientName} onChange={(e) => setNewClientName(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateClient(); if (e.key === 'Escape') setShowNewClient(false) }}
                                placeholder="Client name"
                                className="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800 focus:outline-none focus:border-green-500"
                              />
                              <button onClick={handleCreateClient} className="text-xs font-medium text-green-600 hover:text-green-700">Add</button>
                              <button onClick={() => setShowNewClient(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                            </div>
                          ) : (
                            <select value={task.clientId}
                              onChange={(e) => { if (e.target.value === '__new__') setShowNewClient(true); else save('clientId', e.target.value, task.clientId) }}
                              className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:outline-none focus:border-green-500"
                            >
                              <option value="">— Select client —</option>
                              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                              <option value="__new__">+ New Client</option>
                            </select>
                          )}
                        </div>
                      </PropRow>
                    )

                  case 'builtin-status':
                    return (
                      <PropRow key={prop.id} icon={<CircleDot size={14} />} label={prop.name}>
                        <select value={task.status} onChange={(e) => save('status', e.target.value as TaskStatus, task.status)}
                          className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:outline-none focus:border-green-500"
                          style={{ color: statusStyle?.text, backgroundColor: statusStyle?.bg }}
                        >
                          {Object.entries(STATUS_STYLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                      </PropRow>
                    )

                  case 'builtin-priority':
                    return (
                      <PropRow key={prop.id} icon={<Zap size={14} />} label={prop.name}>
                        <div className="flex gap-2">
                          {(['normal', 'high'] as TaskPriority[]).map((p) => (
                            <button key={p} onClick={() => save('priority', p, task.priority)}
                              className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${task.priority === p ? (p === 'high' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300') : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                            >{p === 'high' ? '! High' : 'Normal'}</button>
                          ))}
                        </div>
                      </PropRow>
                    )

                  case 'builtin-date':
                    return (
                      <PropRow key={prop.id} icon={<Calendar size={14} />} label={prop.name}>
                        <div className="flex items-center gap-2 flex-1">
                          <DateInput value={timestampToDateInput(task.dateStart)} onChange={(value) => handleDateChange('dateStart', value)} />
                          <span className="text-gray-400 text-xs">→</span>
                          <DateInput value={timestampToDateInput(task.dateEnd)} onChange={(value) => handleDateChange('dateEnd', value)} />
                        </div>
                      </PropRow>
                    )

                  case 'builtin-assignees':
                    return (
                      <PropRow key={prop.id} icon={<Users size={14} />} label={prop.name}>
                        <div className="flex flex-wrap gap-1.5 items-center">
                          {/* Selected assignees as pills */}
                          {task.assignees.map((uid) => {
                            const u = users.find((user) => user.uid === uid)
                            if (!u) return null
                            return (
                              <span
                                key={uid}
                                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border bg-green-50 text-green-700 border-green-500 dark:bg-green-900/20 dark:text-green-400"
                              >
                                <span
                                  className="h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                                  style={{ backgroundColor: getInitialsColor(u.name) }}
                                >
                                  {getInitials(u.name)}
                                </span>
                                {u.name}
                                <button
                                  onClick={() => toggleAssignee(uid)}
                                  className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300"
                                >
                                  ✕
                                </button>
                              </span>
                            )
                          })}
                          {/* Dropdown for adding assignees */}
                          <select
                            value=""
                            onChange={(e) => {
                              if (e.target.value) {
                                toggleAssignee(e.target.value)
                                e.target.value = ''
                              }
                            }}
                            className="text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-gray-500 focus:outline-none focus:border-green-500"
                          >
                            <option value="">+ Add assignee</option>
                            {users
                              .filter((u) => !task.assignees.includes(u.uid))
                              .map((u) => (
                                <option key={u.uid} value={u.uid}>
                                  {u.name}
                                </option>
                              ))}
                          </select>
                        </div>
                      </PropRow>
                    )

                  case 'builtin-labels':
                    return (
                      <PropRow key={prop.id} icon={<Tag size={14} />} label={prop.name}>
                        <div className="flex flex-wrap gap-1.5 items-center">
                          {/* Selected labels as pills */}
                          {(task.labelIds ?? []).map((lid) => {
                            const l = labels.find((x) => x.id === lid)
                            if (!l) return null
                            return (
                              <span
                                key={l.id}
                                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium"
                                style={{ backgroundColor: l.color, color: l.textColor }}
                              >
                                {l.name}
                                <button
                                  onClick={() => toggleLabel(l.id)}
                                  className="opacity-75 hover:opacity-100"
                                  style={{ color: l.textColor }}
                                >
                                  ✕
                                </button>
                              </span>
                            )
                          })}
                          {/* Dropdown for adding labels */}
                          <select
                            value=""
                            onChange={(e) => {
                              if (e.target.value) {
                                toggleLabel(e.target.value)
                                e.target.value = ''
                              }
                            }}
                            className="text-sm rounded-lg border border-dashed border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-gray-400 focus:outline-none focus:border-green-500"
                          >
                            <option value="">+ label</option>
                            {labels
                              .filter((l) => !(task.labelIds ?? []).includes(l.id))
                              .map((l) => (
                                <option key={l.id} value={l.id}>
                                  {l.name}
                                </option>
                              ))}
                          </select>
                        </div>
                      </PropRow>
                    )

                  case 'builtin-bucket':
                    return (
                      <PropRow key={prop.id} icon={<Layers size={14} />} label={prop.name}>
                        <div className="relative flex-1">
                          <button
                            onClick={() => setBucketOpen((v) => !v)}
                            className="w-full flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
                          >
                            {selectedBucket ? (
                              <>
                                <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: selectedBucket.color }} />
                                <span className="flex-1 text-left text-gray-900 dark:text-white">{selectedBucket.label}</span>
                              </>
                            ) : (
                              <span className="flex-1 text-left text-gray-400">— No bucket —</span>
                            )}
                            <ChevronDown size={12} className="text-gray-400 shrink-0" />
                          </button>
                          {bucketOpen && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setBucketOpen(false)} />
                              <div className="absolute left-0 top-full z-20 mt-1 w-full min-w-[180px] rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
                                <button onClick={() => { save('bucket', '', task.bucket); setBucketOpen(false) }}
                                  className="w-full px-3 py-2 text-left text-xs text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                                >— No bucket —</button>
                                {bucketOptions.map((opt) => (
                                  <button key={opt.id} onClick={() => { save('bucket', opt.label, task.bucket); setBucketOpen(false) }}
                                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-gray-50 dark:hover:bg-gray-700 ${task.bucket === opt.label ? 'bg-gray-50 dark:bg-gray-700/50' : ''}`}
                                  >
                                    <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: opt.color }} />
                                    <span className="flex-1 text-gray-700 dark:text-gray-300">{opt.label}</span>
                                    {task.bucket === opt.label && (
                                      <svg className="h-3.5 w-3.5 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                      </svg>
                                    )}
                                  </button>
                                ))}
                                {extraBucket && (
                                  <button onClick={() => { save('bucket', extraBucket, task.bucket); setBucketOpen(false) }}
                                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
                                  >
                                    <span className="h-3 w-3 rounded-full shrink-0 bg-gray-400" />
                                    <span className="text-gray-700 dark:text-gray-300">{extraBucket}</span>
                                  </button>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </PropRow>
                    )

                  case 'builtin-awb':
                    // For Planner board: render full OrderStatusSection (handles PO + AWBs)
                    // For other boards: render simple AWB text field (not applicable)
                    if (board?.type === 'planner') {
                      return (
                        <div key={prop.id} className="col-span-full">
                          <OrderStatusSection
                            taskId={task.id}
                            poNumber={localPoNumber}
                            poNumbers={localPoNumbers}
                            awbs={localAwbs}
                            onPoNumbersChange={handlePoNumbersChange}
                            onAwbsChange={handleAwbsChange}
                            readonly={false}
                            csvStatus={csvStatus}
                          />
                        </div>
                      )
                    }
                    return null

                  case 'builtin-po':
                    // Planner board: PO is handled inside OrderStatusSection (builtin-awb case above)
                    if (board?.type === 'planner') return null
                    return (
                      <PropRow key={prop.id} icon={<ChevronDown size={14} />} label={prop.name}>
                        <input type="text" defaultValue={task.poNumber}
                          onBlur={(e) => { if (e.target.value !== task.poNumber) save('poNumber', e.target.value, task.poNumber) }}
                          className="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:outline-none focus:border-green-500"
                          placeholder="PO number"
                        />
                      </PropRow>
                    )

                  case 'builtin-notes':
                    // Notes field removed - not needed
                    return null

                  default:
                    return (
                      <CustomFieldInput
                        key={prop.id}
                        prop={prop}
                        value={(task.customFields ?? {})[prop.id]}
                        users={users}
                        onChange={(val) => saveCustomField(prop.id, val)}
                      />
                    )
                }
              })
            }

            {/* Divider */}
            <div className="border-t border-gray-100 dark:border-gray-800" />

            {/* Description — full width rich text */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Description</p>
              <RichTextEditor
                content={task.description ?? ''}
                onBlur={saveDescription}
              />
            </div>

            {/* Subtasks */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">Subtasks</h4>
              <SubtaskList task={task} />
            </div>

            {/* Files */}
            <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">Files</h4>
              <AttachmentPanel task={task} />
            </div>
          </>


      </div>
    </div>
  )
}

function PropRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-1.5 w-5 flex items-center justify-center text-gray-400 dark:text-gray-500 shrink-0">{icon}</span>
      <span className="mt-1.5 w-28 shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  )
}
