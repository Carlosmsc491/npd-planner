import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Timestamp } from 'firebase/firestore'
import {
  User, Calendar, CircleDot, Zap, Users, Tag,
  Layers, Plane, Hash, StickyNote, Maximize2, ChevronDown,
} from 'lucide-react'
import { updateTaskField, createNotification } from '../../lib/firestore'
import { useAuthStore } from '../../store/authStore'
import { useTaskStore } from '../../store/taskStore'
import { useSettingsStore } from '../../store/settingsStore'
import { STATUS_STYLES, BOARD_COLORS, BOARD_BUCKETS, getInitials, getInitialsColor } from '../../utils/colorUtils'
import SubtaskList from './SubtaskList'
import ActivityLog from './ActivityLog'
import CommentSection from './CommentSection'
import AttachmentPanel from './AttachmentPanel'
import ConflictDialog from '../ui/ConflictDialog'
import { CustomFieldInput } from '../settings/BoardTemplateEditor'
import type { Task, AppUser, Board, TaskStatus, TaskPriority, ConflictData } from '../../types'

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

type Tab = 'details' | 'activity' | 'comments'

export default function TaskPage({ task, board, users, onClose, onDelete, onRecurring, onDuplicate, isFullPage }: Props) {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { setSelectedTask } = useTaskStore()
  const { clients, labels } = useSettingsStore()
  const [activeTab, setActiveTab] = useState<Tab>('details')
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(task.title)
  const [newClientName, setNewClientName] = useState('')
  const [showNewClient, setShowNewClient] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [pendingConflict, setPendingConflict] = useState<{ conflict: ConflictData; rawValue: unknown } | null>(null)
  const [labelPickerOpen, setLabelPickerOpen] = useState(false)
  const [bucketOpen, setBucketOpen] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setTitleDraft(task.title) }, [task.title])
  useEffect(() => { if (editingTitle) titleRef.current?.focus() }, [editingTitle])

  const statusStyle = STATUS_STYLES[task.status]

  // Bucket options with colors (from board.customProperties Bucket property, or BOARD_BUCKETS fallback)
  const bucketOptions = useMemo(() => {
    const bucketProp = board?.customProperties?.find(
      (p) => p.id === 'builtin-bucket' || p.name === 'Bucket'
    )
    if (bucketProp?.options && bucketProp.options.length > 0) return bucketProp.options
    return (BOARD_BUCKETS[board?.type ?? ''] ?? []).map((b) => ({ id: b, label: b, color: '#9CA3AF' }))
  }, [board])
  const extraBucket = task.bucket && !bucketOptions.find((o) => o.label === task.bucket) ? task.bucket : null
  const selectedBucket = bucketOptions.find((o) => o.label === task.bucket)

  async function save(field: string, value: unknown, old?: unknown) {
    if (!user) return
    const conflict = await updateTaskField(task.id, field, value, user.uid, user.name, old)
    if (conflict) setPendingConflict({ conflict, rawValue: value })
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

    // Notify newly assigned user
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

  function dateToInputValue(ts: Timestamp | null): string {
    if (!ts) return ''
    return ts.toDate().toISOString().slice(0, 10)
  }

  async function handleDateChange(field: 'dateStart' | 'dateEnd', value: string) {
    const ts = value ? Timestamp.fromDate(new Date(value + 'T00:00:00')) : null
    await save(field, ts, task[field])
  }

  async function saveCustomField(propId: string, value: unknown) {
    const current = task.customFields ?? {}
    await save('customFields', { ...current, [propId]: value }, current)
  }

  return (
    <div className="flex h-full flex-col bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-start justify-between px-6 pt-5 pb-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-start gap-2 flex-1 min-w-0 pr-2">
          {/* Expand button (panel mode only) */}
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
                style={{ backgroundColor: BOARD_COLORS[board.type] ?? board.color }}
              >
                {board.name}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {/* 3-dot menu */}
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

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 px-6">
        {(['details', 'activity', 'comments'] as Tab[]).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`capitalize px-1 py-2.5 text-sm font-medium mr-5 border-b-2 -mb-px transition-colors ${activeTab === tab ? 'border-green-500 text-green-600 dark:text-green-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}
          >{tab}</button>
        ))}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

        {/* ── DETAILS TAB ── */}
        {activeTab === 'details' && (
          <>
            <PropRow icon={<User size={14} />} label="Client">
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

            <PropRow icon={<CircleDot size={14} />} label="Status">
              <select value={task.status} onChange={(e) => save('status', e.target.value as TaskStatus, task.status)}
                className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:outline-none focus:border-green-500"
                style={{ color: statusStyle?.text, backgroundColor: statusStyle?.bg }}
              >
                {Object.entries(STATUS_STYLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </PropRow>

            <PropRow icon={<Zap size={14} />} label="Priority">
              <div className="flex gap-2">
                {(['normal', 'high'] as TaskPriority[]).map((p) => (
                  <button key={p} onClick={() => save('priority', p, task.priority)}
                    className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${task.priority === p ? (p === 'high' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300') : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                  >{p === 'high' ? '! High' : 'Normal'}</button>
                ))}
              </div>
            </PropRow>

            <PropRow icon={<Calendar size={14} />} label="Date">
              <div className="flex items-center gap-2 flex-1">
                <input type="date" value={dateToInputValue(task.dateStart)} onChange={(e) => handleDateChange('dateStart', e.target.value)}
                  className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:outline-none focus:border-green-500" />
                <span className="text-gray-400 text-xs">→</span>
                <input type="date" value={dateToInputValue(task.dateEnd)} onChange={(e) => handleDateChange('dateEnd', e.target.value)}
                  className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:outline-none focus:border-green-500" />
              </div>
            </PropRow>

            <PropRow icon={<Users size={14} />} label="Assigned To">
              <div className="flex flex-wrap gap-1.5">
                {users.map((u) => {
                  const assigned = task.assignees.includes(u.uid)
                  return (
                    <button key={u.uid} onClick={() => toggleAssignee(u.uid)} title={u.name}
                      className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs transition-colors border ${assigned ? 'border-green-500 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 dark:border-green-600' : 'border-gray-200 text-gray-500 hover:border-gray-300 dark:border-gray-700 dark:text-gray-400'}`}
                    >
                      <div className="h-4 w-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white" style={{ backgroundColor: getInitialsColor(u.name) }}>
                        {getInitials(u.name)}
                      </div>
                      {u.name.split(' ')[0]}
                    </button>
                  )
                })}
              </div>
            </PropRow>

            <PropRow icon={<Tag size={14} />} label="Labels">
              <div className="relative flex flex-wrap gap-1.5 flex-1">
                {/* Selected label pills */}
                {(task.labelIds ?? []).map((lid) => {
                  const l = labels.find((x) => x.id === lid)
                  if (!l) return null
                  return (
                    <button
                      key={l.id}
                      onClick={() => toggleLabel(l.id)}
                      title="Click to remove"
                      className="rounded-full px-2.5 py-0.5 text-xs font-semibold transition-opacity hover:opacity-75"
                      style={{ backgroundColor: l.color, color: l.textColor }}
                    >
                      {l.name}
                    </button>
                  )
                })}
                {/* Add label button */}
                <button
                  onClick={() => setLabelPickerOpen((v) => !v)}
                  className="rounded-full border border-dashed border-gray-300 dark:border-gray-600 px-2.5 py-0.5 text-xs text-gray-400 hover:border-green-500 hover:text-green-600 dark:hover:border-green-600 dark:hover:text-green-400 transition-colors"
                >
                  {labelPickerOpen ? '✕' : '+ label'}
                </button>
                {/* Dropdown picker */}
                {labelPickerOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setLabelPickerOpen(false)} />
                    <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
                      {labels.length === 0 ? (
                        <p className="px-3 py-3 text-xs text-gray-400">No labels yet — create them in Settings</p>
                      ) : (
                        labels.map((l) => {
                          const active = (task.labelIds ?? []).includes(l.id)
                          return (
                            <button
                              key={l.id}
                              onClick={() => { toggleLabel(l.id) }}
                              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                              <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                              <span className="flex-1 text-gray-700 dark:text-gray-300">{l.name}</span>
                              {active && (
                                <svg className="h-3.5 w-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </button>
                          )
                        })
                      )}
                    </div>
                  </>
                )}
              </div>
            </PropRow>

            <PropRow icon={<Layers size={14} />} label="Bucket">
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
                      <button
                        onClick={() => { save('bucket', '', task.bucket); setBucketOpen(false) }}
                        className="w-full px-3 py-2 text-left text-xs text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        — No bucket —
                      </button>
                      {bucketOptions.map((opt) => (
                        <button
                          key={opt.id}
                          onClick={() => { save('bucket', opt.label, task.bucket); setBucketOpen(false) }}
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
                        <button
                          onClick={() => { save('bucket', extraBucket, task.bucket); setBucketOpen(false) }}
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

            <PropRow icon={<Plane size={14} />} label="AWB">
              <input type="text" defaultValue={task.awbNumber}
                onBlur={(e) => { if (e.target.value !== task.awbNumber) save('awbNumber', e.target.value, task.awbNumber) }}
                className="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:outline-none focus:border-green-500"
                placeholder="AWB number"
              />
            </PropRow>

            <PropRow icon={<Hash size={14} />} label="P.O. / Order #">
              <input type="text" defaultValue={task.poNumber}
                onBlur={(e) => { if (e.target.value !== task.poNumber) save('poNumber', e.target.value, task.poNumber) }}
                className="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:outline-none focus:border-green-500"
                placeholder="PO number"
              />
            </PropRow>

            <PropRow icon={<StickyNote size={14} />} label="Notes">
              <textarea defaultValue={task.notes}
                onBlur={(e) => { if (e.target.value !== task.notes) save('notes', e.target.value, task.notes) }}
                rows={3}
                className="flex-1 resize-none rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:outline-none focus:border-green-500"
                placeholder="Add notes…"
              />
            </PropRow>

            {/* Custom properties */}
            {(board?.customProperties?.length ?? 0) > 0 && (
              <>
                <div className="border-t border-gray-100 dark:border-gray-800" />
                {board!.customProperties!.map((prop) => (
                  <CustomFieldInput
                    key={prop.id}
                    prop={prop}
                    value={(task.customFields ?? {})[prop.id]}
                    users={users}
                    onChange={(val) => saveCustomField(prop.id, val)}
                  />
                ))}
              </>
            )}

            {/* Divider */}
            <div className="border-t border-gray-100 dark:border-gray-800" />

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
        )}

        {/* ── ACTIVITY TAB ── */}
        {activeTab === 'activity' && <ActivityLog taskId={task.id} />}

        {/* ── COMMENTS TAB ── */}
        {activeTab === 'comments' && (
          <CommentSection
            taskId={task.id}
            taskTitle={task.title}
            boardId={task.boardId}
            boardType={board?.type ?? 'planner'}
            assignees={task.assignees}
          />
        )}
      </div>

      {pendingConflict && (
        <ConflictDialog
          conflict={pendingConflict.conflict}
          onKeepMine={async () => {
            if (user) await updateTaskField(task.id, pendingConflict.conflict.field, pendingConflict.rawValue, user.uid, user.name)
            setPendingConflict(null)
          }}
          onUseTheirs={() => setPendingConflict(null)}
        />
      )}
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
