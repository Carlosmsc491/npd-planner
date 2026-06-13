import { useMemo } from 'react'
import type { Board, Task, Client, Label, AppUser } from '../types'
import { STATUS_COLORS, STATUS_LABELS, getBucketColor, getInitials, getInitialsColor } from '../types'

interface Props {
  task: Task
  board: Board
  client?: Client
  labels: Record<string, Label>
  users: Record<string, AppUser>
  onClose: () => void
}

export default function TaskDetailModal({ task, board, client, labels, users, onClose }: Props) {
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
    const list = [task.poNumber, ...(task.poNumbers ?? [])].filter(Boolean) as string[]
    return list
  }, [task])

  const subtaskDone = task.subtasks?.filter((s) => s.completed).length ?? 0
  const subtaskTotal = task.subtasks?.length ?? 0
  const attachments = task.attachments ?? []

  // Strip HTML tags from rich-text description for a plain-text preview
  const descText = useMemo(() => {
    if (!task.description) return ''
    const tmp = document.createElement('div')
    tmp.innerHTML = task.description
    return (tmp.textContent || tmp.innerText || '').trim()
  }, [task.description])

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="fixed inset-x-0 bottom-0 top-12 z-50 bg-white rounded-t-3xl shadow-xl flex flex-col max-w-2xl mx-auto safe-bottom overflow-hidden">
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        {/* Header */}
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
            <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" /></svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Status + meta grid */}
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

          {/* Labels */}
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

          {/* Notes / description */}
          {(task.notes?.trim() || descText) && (
            <Section title="Notes">
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{task.notes?.trim() || descText}</p>
            </Section>
          )}

          {/* PO numbers */}
          {pos.length > 0 && (
            <Section title="PO / Order numbers">
              <div className="flex flex-wrap gap-1.5">
                {pos.map((p, i) => (
                  <span key={i} className="text-xs font-mono bg-gray-100 text-gray-700 px-2 py-1 rounded">{p}</span>
                ))}
              </div>
            </Section>
          )}

          {/* AWBs */}
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

          {/* Subtasks */}
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

          {/* Attachments — list only (files live in SharePoint, openable from desktop app) */}
          {attachments.length > 0 && (
            <Section title={`Attachments · ${attachments.length}`}>
              <div className="space-y-1.5">
                {attachments.map((att) => (
                  <div key={att.id} className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4 text-gray-400 shrink-0">
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 truncate">{att.name}</p>
                      {att.uploadedByName && <p className="text-[10px] text-gray-400">by {att.uploadedByName}</p>}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-gray-400 mt-2 flex items-start gap-1.5">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 shrink-0 mt-0.5"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" strokeLinecap="round" /></svg>
                Files are stored in SharePoint. Open them from the desktop app to view or download.
              </p>
            </Section>
          )}
        </div>
      </div>
    </>
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
