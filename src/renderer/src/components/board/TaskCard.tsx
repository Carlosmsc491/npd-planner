import { useState, useRef, useEffect } from 'react'
import { formatDate, isOverdue } from '../../utils/dateUtils'
import { getInitials, getInitialsColor, getBucketColor } from '../../utils/colorUtils'
import { generateAndSaveTaskReport } from '../../utils/taskReportSaver'
import { useTaskStore } from '../../store/taskStore'
import type { Task, Client, Label, AppUser, Board } from '../../types'

interface Props {
  task: Task
  clients: Client[]
  labels: Label[]
  users: AppUser[]
  board?: Board | null
  onComplete: (task: Task) => void
  onOpen: (task: Task) => void
  onDuplicate: (task: Task) => void
  onRecurring: (task: Task) => void
  onDelete: (task: Task) => void
}

export default function TaskCard({
  task, clients, labels, users, board,
  onComplete, onOpen, onDuplicate, onRecurring, onDelete,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const { setToast } = useTaskStore()

  async function handleGenerateReport() {
    setMenuOpen(false)
    const sharePointPath = localStorage.getItem('npd_sharepoint_path') ?? ''
    if (!sharePointPath) {
      setToast({ id: 'report-no-sp', message: 'SharePoint path not set. Configure it in Settings.', type: 'error', duration: 4000 })
      return
    }
    const taskLabels = labels.filter(l => (task.labelIds ?? []).includes(l.id))
    const client = clients.find(c => c.id === task.clientId) ?? null
    const result = await generateAndSaveTaskReport(task, sharePointPath, client?.name ?? 'Unknown', {
      client, board: board ?? null, labels: taskLabels, users,
    })
    if (result.success) {
      setToast({ id: `report-ok-${task.id}`, message: 'Report saved to SharePoint ✓', type: 'success', duration: 3000 })
    } else {
      setToast({ id: `report-err-${task.id}`, message: `Report failed: ${result.error ?? 'unknown error'}`, type: 'error', duration: 5000 })
    }
  }

  const client = clients.find((c) => c.id === task.clientId)
  const taskLabels = labels.filter((l) => (task.labelIds ?? []).includes(l.id))
  const assigneeUsers = users.filter((u) => task.assignees.includes(u.uid))
  const overdue = !task.completed && isOverdue(task.dateEnd)
  const bucketColor = getBucketColor(task.bucket, board)
  const displayProp = board?.customProperties?.find((p) => p.display)
  const displayValue = displayProp ? String((task.customFields ?? {})[displayProp.id] ?? '') : ''

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    if (menuOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  return (
    <div
      data-no-drag-scroll
      className={`group relative rounded-xl border bg-white px-3 py-2.5 shadow-sm hover:shadow-md transition-all cursor-pointer dark:bg-gray-800 dark:border-gray-700 ${
        task.completed ? 'opacity-40' : 'border-gray-200'
      }`}
      onClick={() => onOpen(task)}
    >
      {/* Labels */}
      {taskLabels.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {taskLabels.map((l) => (
            <span
              key={l.id}
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{ backgroundColor: l.color, color: l.textColor }}
            >
              {l.name}
            </span>
          ))}
        </div>
      )}

      {/* Title row */}
      <div className="flex items-start gap-2">
        {/* Checkbox */}
        <button
          onClick={(e) => { e.stopPropagation(); onComplete(task) }}
          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
            task.completed
              ? 'border-green-500 bg-green-500'
              : 'border-gray-300 hover:border-green-400 dark:border-gray-500'
          }`}
        >
          {task.completed && (
            <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>

        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium leading-snug text-gray-900 dark:text-white ${task.completed ? 'line-through' : ''}`}>
            {task.title}
          </p>
          {displayValue && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{displayValue}</p>
          )}
          {client && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">{client.name}</p>
          )}
        </div>

        {/* 3-dot menu */}
        <div ref={menuRef} className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="hidden group-hover:flex items-center justify-center h-6 w-6 rounded-md text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
            </svg>
          </button>
          {menuOpen && (
            <div className="absolute right-0 z-30 mt-1 w-40 rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
              {[
                { label: 'Duplicate', action: () => { onDuplicate(task); setMenuOpen(false) } },
                { label: 'Make Recurring', action: () => { onRecurring(task); setMenuOpen(false) } },
                { label: 'Generate Report', action: handleGenerateReport },
                { label: 'Delete', danger: true, action: () => { onDelete(task); setMenuOpen(false) } },
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={item.action}
                  className={`w-full px-3 py-2 text-left text-sm transition-colors first:rounded-t-xl last:rounded-b-xl ${
                    item.danger
                      ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20'
                      : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bucket pill */}
      {task.bucket && (
        <div className="mt-1.5 mb-0.5">
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={bucketColor
              ? { backgroundColor: bucketColor + '22', color: bucketColor, border: `1px solid ${bucketColor}55` }
              : { backgroundColor: '#f3f4f6', color: '#6b7280' }}
          >
            {task.bucket}
          </span>
        </div>
      )}

      {/* AWB summary (Planner board only) */}
      {board?.type === 'planner' && task.awbs && task.awbs.length > 0 && (
        <div className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-gray-500 mt-1">
          <span>✈</span>
          <span>{task.awbs.length} AWB{task.awbs.length !== 1 ? 's' : ''}</span>
          <span>·</span>
          <span>{task.awbs.reduce((s, a) => s + (a.boxes || 0), 0)} boxes</span>
          {task.awbs.some(a => a.etaChanged) && (
            <span className="ml-1 px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
              ⚠ ETA changed
            </span>
          )}
        </div>
      )}

      {/* Footer row */}
      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {/* Date badge */}
          {(task.dateStart || task.dateEnd) && (
            <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
              overdue
                ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
            }`}>
              {formatDate(task.dateEnd ?? task.dateStart)}
            </span>
          )}

          {/* Priority */}
          {task.priority === 'high' && (
            <span className="text-[10px] font-bold text-red-500">!</span>
          )}

          {/* Attachments */}
          {task.attachments.length > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              {task.attachments.length}
            </span>
          )}

          {/* Subtasks progress */}
          {task.subtasks.length > 0 && (
            <span className="text-[10px] text-gray-400">
              {task.subtasks.filter((s) => s.completed).length}/{task.subtasks.length}
            </span>
          )}
        </div>

        {/* Assignee avatars */}
        <div className="flex -space-x-1">
          {assigneeUsers.slice(0, 3).map((u) => (
            <div
              key={u.uid}
              title={u.name}
              className="h-5 w-5 rounded-full border-2 border-white dark:border-gray-800 flex items-center justify-center text-[9px] font-bold text-white"
              style={{ backgroundColor: getInitialsColor(u.name) }}
            >
              {getInitials(u.name)}
            </div>
          ))}
          {assigneeUsers.length > 3 && (
            <div className="h-5 w-5 rounded-full border-2 border-white dark:border-gray-800 bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-[9px] font-bold text-gray-600 dark:text-gray-300">
              +{assigneeUsers.length - 3}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
