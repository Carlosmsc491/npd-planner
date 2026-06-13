import { useMemo, useState } from 'react'
import { doc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuthStore } from '../store/authStore'
import type { Board, Task, Client, Label, AppUser } from '../types'
import { STATUS_COLORS, STATUS_LABELS, BOARD_BUCKETS, getBucketColor, getInitials, getInitialsColor } from '../types'
import { buildSharePointUrl } from '../sharepoint'

interface Props {
  task: Task
  board: Board
  client?: Client
  clients: Record<string, Client>
  labels: Record<string, Label>
  users: Record<string, AppUser>
  canEdit: boolean
  onClose: () => void
}

// Firestore Timestamp → "yyyy-mm-dd" for <input type=date> (local, no TZ shift)
function toDateInput(ts: Timestamp | null | undefined): string {
  if (!ts) return ''
  const d = ts.toDate()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function TaskDetailModal({ task, board, client, clients, labels, users, canEdit, onClose }: Props) {
  const { user } = useAuthStore()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const status = STATUS_COLORS[task.status]
  const bucketColor = getBucketColor(task.bucket, board) ?? '#9CA3AF'

  const dueStr = useMemo(() => {
    if (!task.dateEnd) return null
    return task.dateEnd.toDate().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  }, [task.dateEnd])

  const overdue = !!task.dateEnd && task.status !== 'done' && task.dateEnd.toDate() < new Date()

  const taskLabels = (task.labelIds ?? []).map((id) => labels[id]).filter(Boolean) as Label[]
  const assignees = (task.assignees ?? []).map((uid) => users[uid]).filter(Boolean) as AppUser[]

  const pos = useMemo(() => {
    if (task.poEntries?.length) return task.poEntries.map((p) => p.boxes ? `${p.number} (${p.boxes} boxes)` : p.number)
    return [task.poNumber, ...(task.poNumbers ?? [])].filter(Boolean) as string[]
  }, [task])

  const subtaskDone = task.subtasks?.filter((s) => s.completed).length ?? 0
  const subtaskTotal = task.subtasks?.length ?? 0
  const attachments = task.attachments ?? []
  const emails = task.emailAttachments ?? []

  const descText = useMemo(() => {
    if (!task.description) return ''
    const tmp = document.createElement('div')
    tmp.innerHTML = task.description
    return (tmp.textContent || tmp.innerText || '').trim()
  }, [task.description])

  // ── Edit form ──────────────────────────────────────────────────────────────
  const bucketOptions = useMemo(() => {
    const prop = board.customProperties?.find((p) => p.id === 'builtin-bucket' || p.name === 'Bucket')
    if (prop?.options?.length) return prop.options.map((o) => o.label)
    return BOARD_BUCKETS[board.type] ?? []
  }, [board])

  const clientList = useMemo(
    () => Object.values(clients).filter((c) => c.active).sort((a, b) => a.name.localeCompare(b.name)),
    [clients]
  )

  const [form, setForm] = useState(() => ({
    title:     task.title,
    notes:     task.notes ?? '',
    status:    task.status,
    priority:  task.priority,
    bucket:    task.bucket ?? '',
    clientId:  task.clientId ?? '',
    dateStart: toDateInput(task.dateStart),
    dateEnd:   toDateInput(task.dateEnd),
  }))

  function startEdit() {
    setForm({
      title:     task.title,
      notes:     task.notes ?? '',
      status:    task.status,
      priority:  task.priority,
      bucket:    task.bucket ?? '',
      clientId:  task.clientId ?? '',
      dateStart: toDateInput(task.dateStart),
      dateEnd:   toDateInput(task.dateEnd),
    })
    setError('')
    setEditing(true)
  }

  function setField<K extends keyof typeof form>(key: K, val: typeof form[K]) {
    setForm((prev) => ({ ...prev, [key]: val }))
  }

  async function handleSave() {
    if (!form.title.trim()) { setError('Title is required'); return }
    if (!form.clientId)     { setError('Client is required'); return }
    if (bucketOptions.length > 0 && !form.bucket) { setError('Bucket is required'); return }
    if (!user) { setError('Not signed in'); return }

    setSaving(true)
    setError('')
    try {
      await updateDoc(doc(db, 'tasks', task.id), {
        title:     form.title.trim(),
        notes:     form.notes,
        status:    form.status,
        priority:  form.priority,
        bucket:    form.bucket,
        clientId:  form.clientId,
        dateStart: form.dateStart ? Timestamp.fromDate(new Date(form.dateStart + 'T12:00:00')) : null,
        dateEnd:   form.dateEnd ? Timestamp.fromDate(new Date(form.dateEnd + 'T12:00:00')) : null,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      })
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={editing ? undefined : onClose} />

      <div className="fixed inset-x-0 bottom-0 top-12 z-50 bg-white rounded-t-3xl shadow-xl flex flex-col max-w-2xl mx-auto safe-bottom overflow-hidden">
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        {editing ? (
          /* ── EDIT MODE ──────────────────────────────────────────────── */
          <>
            <div className="px-5 pb-3 border-b border-gray-100 shrink-0 flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900">Edit Task</h2>
              <button onClick={() => setEditing(false)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" /></svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <EditField label="Title *">
                <input value={form.title} onChange={(e) => setField('title', e.target.value)} className={INPUT} />
              </EditField>

              <EditField label="Client *">
                <select value={form.clientId} onChange={(e) => setField('clientId', e.target.value)} className={INPUT}>
                  <option value="">— Select client —</option>
                  {clientList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </EditField>

              {bucketOptions.length > 0 && (
                <EditField label="Bucket *">
                  <select value={form.bucket} onChange={(e) => setField('bucket', e.target.value)} className={INPUT}>
                    <option value="">— Select bucket —</option>
                    {bucketOptions.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </EditField>
              )}

              <div className="grid grid-cols-2 gap-3">
                <EditField label="Status">
                  <select value={form.status} onChange={(e) => setField('status', e.target.value as Task['status'])} className={INPUT}>
                    <option value="todo">To Do</option>
                    <option value="inprogress">In Progress</option>
                    <option value="review">Review</option>
                    <option value="done">Done</option>
                  </select>
                </EditField>
                <EditField label="Priority">
                  <select value={form.priority} onChange={(e) => setField('priority', e.target.value as Task['priority'])} className={INPUT}>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                  </select>
                </EditField>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <EditField label="Start date">
                  <input type="date" value={form.dateStart} onChange={(e) => setField('dateStart', e.target.value)} className={INPUT} />
                </EditField>
                <EditField label="Due date">
                  <input type="date" value={form.dateEnd} min={form.dateStart} onChange={(e) => setField('dateEnd', e.target.value)} className={INPUT} />
                </EditField>
              </div>

              <EditField label="Notes">
                <textarea value={form.notes} onChange={(e) => setField('notes', e.target.value)} rows={5} className={`${INPUT} resize-none`} />
              </EditField>

              {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
            </div>

            <div className="px-5 py-3 border-t border-gray-100 shrink-0 flex gap-3">
              <button onClick={() => setEditing(false)} className="flex-1 rounded-xl border border-gray-300 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 active:scale-95 transition">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving} className="flex-1 rounded-xl bg-green-500 text-white py-2.5 text-sm font-semibold hover:bg-green-600 active:scale-95 transition disabled:opacity-50">
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </>
        ) : (
          /* ── VIEW MODE ──────────────────────────────────────────────── */
          <>
            <div className="px-5 pb-3 border-b border-gray-100 shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: bucketColor }} />
                    <span className="text-xs font-bold uppercase tracking-wide text-gray-500">{task.bucket || 'No bucket'}</span>
                    {task.priority === 'high' && (
                      <span className="text-[10px] font-bold uppercase text-red-600 bg-red-50 px-1.5 py-0.5 rounded">High</span>
                    )}
                  </div>
                  <h2 className="text-lg font-bold text-gray-900 leading-tight">{task.title}</h2>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {canEdit && (
                    <button onClick={startEdit} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-green-600" title="Edit">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                        <path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  )}
                  <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" /></svg>
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <Meta label="Status">
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: status.bg, color: status.text }}>
                    {STATUS_LABELS[task.status]}
                  </span>
                </Meta>
                <Meta label="Client">
                  <span className="text-sm text-gray-900 font-medium uppercase">{client?.name ?? '—'}</span>
                </Meta>
                {dueStr && (
                  <Meta label="Due date">
                    <span className={`text-sm font-medium ${overdue ? 'text-red-500' : 'text-gray-900'}`}>
                      {overdue ? '⚠ ' : ''}{dueStr}
                    </span>
                  </Meta>
                )}
                {assignees.length > 0 && (
                  <Meta label="Assignees">
                    <div className="flex flex-wrap gap-1">
                      {assignees.map((a) => (
                        <span key={a.uid} className="flex items-center gap-1 text-xs text-gray-700">
                          <span className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ backgroundColor: getInitialsColor(a.name) }}>
                            {getInitials(a.name)}
                          </span>
                          {a.name}
                        </span>
                      ))}
                    </div>
                  </Meta>
                )}
              </div>

              {taskLabels.length > 0 && (
                <Section title="Labels">
                  <div className="flex flex-wrap gap-1.5">
                    {taskLabels.map((l) => (
                      <span key={l.id} className="text-xs font-medium px-2 py-1 rounded uppercase leading-none" style={{ backgroundColor: l.color, color: l.textColor }}>
                        {l.name}
                      </span>
                    ))}
                  </div>
                </Section>
              )}

              {(task.notes?.trim() || descText) && (
                <Section title="Notes">
                  <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{task.notes?.trim() || descText}</p>
                </Section>
              )}

              {pos.length > 0 && (
                <Section title="PO / Order numbers">
                  <div className="flex flex-wrap gap-1.5">
                    {pos.map((p, i) => (
                      <span key={i} className="text-xs font-mono bg-gray-100 text-gray-700 px-2 py-1 rounded">{p}</span>
                    ))}
                  </div>
                </Section>
              )}

              {(task.awbs?.length ?? 0) > 0 && (
                <Section title="AWB tracking">
                  <div className="space-y-1.5">
                    {task.awbs!.map((a) => (
                      <div key={a.id} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-semibold text-gray-800">{a.number}</span>
                          {a.carrier && <span className="text-gray-500">{a.carrier}</span>}
                        </div>
                        {(a.eta || a.ata) && (
                          <div className="flex gap-3 mt-1 text-gray-500">
                            {a.eta && <span>ETA: {a.eta}</span>}
                            {a.ata && <span className="text-green-600 font-medium">ATA: {a.ata}</span>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {subtaskTotal > 0 && (
                <Section title={`Subtasks · ${subtaskDone}/${subtaskTotal}`}>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-2">
                    <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${(subtaskDone / subtaskTotal) * 100}%` }} />
                  </div>
                  <div className="space-y-1">
                    {task.subtasks!.map((s) => (
                      <div key={s.id} className="flex items-center gap-2 text-sm">
                        <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${s.completed ? 'bg-green-500 border-green-500' : 'border-gray-300'}`}>
                          {s.completed && (
                            <svg viewBox="0 0 12 12" fill="none" className="w-2.5 h-2.5"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          )}
                        </span>
                        <span className={s.completed ? 'text-gray-400 line-through' : 'text-gray-700'}>{s.title}</span>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {attachments.length > 0 && (
                <Section title={`Attachments · ${attachments.length}`}>
                  <div className="space-y-1.5">
                    {attachments.map((att) => (
                      <a
                        key={att.id}
                        href={buildSharePointUrl(att.sharePointRelativePath)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 hover:border-green-300 hover:bg-green-50 active:scale-[0.99] transition group"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4 text-gray-400 group-hover:text-green-600 shrink-0">
                          <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-800 group-hover:text-green-700 truncate">{att.name}</p>
                          {att.uploadedByName && <p className="text-[10px] text-gray-400">by {att.uploadedByName}</p>}
                        </div>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-gray-300 group-hover:text-green-600 shrink-0">
                          <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </a>
                    ))}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-2 flex items-start gap-1.5">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 shrink-0 mt-0.5"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" strokeLinecap="round" /></svg>
                    Opens in SharePoint Online — sign in with your Elite Flower account.
                  </p>
                </Section>
              )}

              {emails.length > 0 && (
                <Section title={`Emails · ${emails.length}`}>
                  <div className="space-y-2">
                    {emails.map((em) => (
                      <div key={em.id} className="rounded-lg border border-gray-100 bg-gray-50 overflow-hidden">
                        <a
                          href={buildSharePointUrl(em.msgRelativePath)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-start gap-2 px-3 py-2 hover:bg-green-50 active:scale-[0.99] transition group"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4 text-gray-400 group-hover:text-green-600 shrink-0 mt-0.5">
                            <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 7l-10 6L2 7" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-800 group-hover:text-green-700 font-medium truncate">{em.subject || '(no subject)'}</p>
                            {em.from && <p className="text-[10px] text-gray-400 truncate">from {em.from}</p>}
                          </div>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-gray-300 group-hover:text-green-600 shrink-0 mt-0.5">
                            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </a>
                        {em.innerAttachments?.length > 0 && (
                          <div className="border-t border-gray-100 px-3 py-1.5 space-y-1">
                            {em.innerAttachments.map((inner) => (
                              <a
                                key={inner.id}
                                href={buildSharePointUrl(inner.sharePointRelativePath)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-green-700 pl-5"
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3 h-3 shrink-0">
                                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                <span className="truncate">{inner.name}</span>
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </Section>
              )}
            </div>
          </>
        )}
      </div>
    </>
  )
}

const INPUT =
  'w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-500/30'

function EditField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-600 mb-1 block">{label}</label>
      {children}
    </div>
  )
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{label}</p>
      {children}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">{title}</p>
      {children}
    </div>
  )
}
