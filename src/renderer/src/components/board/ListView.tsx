import { formatDate } from '../../utils/dateUtils'
import { STATUS_STYLES } from '../../utils/colorUtils'
import { getInitials, getInitialsColor } from '../../utils/colorUtils'
import { useBoardStore } from '../../store/boardStore'
import type { Task, Client, Label, AppUser, GroupByField } from '../../types'

interface Props {
  tasks: Task[]
  clients: Client[]
  labels: Label[]
  users: AppUser[]
  groupBy: GroupByField
  onComplete: (task: Task) => void
  onOpen: (task: Task) => void
}

function getGroupKey(task: Task, groupBy: GroupByField, clients: Client[], users: AppUser[]): string {
  switch (groupBy) {
    case 'bucket':   return task.bucket || 'No bucket'
    case 'client':   return clients.find((c) => c.id === task.clientId)?.name ?? 'No client'
    case 'assignee': {
      if (!task.assignees.length) return 'Unassigned'
      return users.find((u) => u.uid === task.assignees[0])?.name ?? 'Unknown'
    }
    case 'status':   return task.status
    case 'priority': return task.priority === 'high' ? 'High Priority' : 'Normal'
    case 'date':     return task.dateEnd ? formatDate(task.dateEnd) : 'No date'
    default:         return 'Other'
  }
}

export default function ListView({ tasks, clients, labels, users, groupBy, onComplete, onOpen }: Props) {
  const { showCompleted, toggleShowCompleted } = useBoardStore()

  const groupMap = new Map<string, Task[]>()
  for (const task of tasks) {
    const key = getGroupKey(task, groupBy, clients, users)
    if (!groupMap.has(key)) groupMap.set(key, [])
    groupMap.get(key)!.push(task)
  }
  const groups = Array.from(groupMap.entries())

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-sm text-gray-400">No tasks yet</p>
      </div>
    )
  }

  return (
    <div className="px-6 pt-4 pb-8">
      {groups.map(([groupKey, groupTasks]) => {
        const active = groupTasks.filter((t) => !t.completed)
        const completed = groupTasks.filter((t) => t.completed)
        const isShowingCompleted = showCompleted[groupKey] ?? false
        const visible = isShowingCompleted ? [...active, ...completed] : active

        return (
          <div key={groupKey} className="mb-6">
            {/* Group header */}
            <div className="mb-1 flex items-center gap-2 py-1.5 border-b border-gray-200 dark:border-gray-700">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {groupKey}
              </span>
              <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                {active.length}
              </span>
            </div>

            {/* Table */}
            <table className="w-full">
              <thead>
                <tr className="text-[11px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  <th className="w-5 py-1 pr-3 text-left" />
                  <th className="py-1 pr-4 text-left">Title</th>
                  <th className="py-1 pr-4 text-left hidden md:table-cell">Client</th>
                  <th className="py-1 pr-4 text-left hidden lg:table-cell">Date</th>
                  <th className="py-1 pr-4 text-left hidden lg:table-cell">Assigned</th>
                  <th className="py-1 pr-4 text-left hidden md:table-cell">Status</th>
                  <th className="py-1 text-left">Labels</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((task) => {
                  const client = clients.find((c) => c.id === task.clientId)
                  const taskLabels = labels.filter((l) => task.labelIds.includes(l.id))
                  const assignees = users.filter((u) => task.assignees.includes(u.uid))
                  const statusStyle = STATUS_STYLES[task.status]

                  return (
                    <tr
                      key={task.id}
                      onClick={() => onOpen(task)}
                      className={`group cursor-pointer border-b border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50 transition-colors ${
                        task.completed ? 'opacity-40' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-2 pr-3">
                        <button
                          onClick={(e) => { e.stopPropagation(); onComplete(task) }}
                          className={`flex h-4 w-4 items-center justify-center rounded-full border-2 transition-colors ${
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
                      </td>

                      {/* Title */}
                      <td className="py-2 pr-4">
                        <span className={`text-sm font-medium text-gray-900 dark:text-white ${task.completed ? 'line-through' : ''}`}>
                          {task.title}
                        </span>
                        {task.priority === 'high' && (
                          <span className="ml-1.5 text-xs font-bold text-red-500">!</span>
                        )}
                      </td>

                      {/* Client */}
                      <td className="py-2 pr-4 hidden md:table-cell">
                        <span className="text-xs text-gray-500 dark:text-gray-400">{client?.name ?? '—'}</span>
                      </td>

                      {/* Date */}
                      <td className="py-2 pr-4 hidden lg:table-cell">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {formatDate(task.dateEnd ?? task.dateStart) || '—'}
                        </span>
                      </td>

                      {/* Assigned */}
                      <td className="py-2 pr-4 hidden lg:table-cell">
                        <div className="flex -space-x-1">
                          {assignees.slice(0, 3).map((u) => (
                            <div
                              key={u.uid}
                              title={u.name}
                              className="h-5 w-5 rounded-full border border-white dark:border-gray-900 flex items-center justify-center text-[9px] font-bold text-white"
                              style={{ backgroundColor: getInitialsColor(u.name) }}
                            >
                              {getInitials(u.name)}
                            </div>
                          ))}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-2 pr-4 hidden md:table-cell">
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                          style={{ backgroundColor: statusStyle?.bg, color: statusStyle?.text }}
                        >
                          {statusStyle?.label ?? task.status}
                        </span>
                      </td>

                      {/* Labels */}
                      <td className="py-2">
                        <div className="flex flex-wrap gap-1">
                          {taskLabels.map((l) => (
                            <span
                              key={l.id}
                              className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                              style={{ backgroundColor: l.color, color: l.textColor }}
                            >
                              {l.name}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Show completed toggle */}
            {completed.length > 0 && (
              <button
                onClick={() => toggleShowCompleted(groupKey)}
                className="mt-2 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                {isShowingCompleted
                  ? `Hide completed (${completed.length})`
                  : `Show completed (${completed.length})`}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
