import { useEffect, useState } from 'react'
import { subscribeToTaskHistory } from '../../lib/firestore'
import { formatRelativeTime } from '../../utils/dateUtils'
import { getInitials, getInitialsColor } from '../../utils/colorUtils'
import type { TaskHistoryEntry } from '../../types'

interface Props {
  taskId: string
}

function describeEntry(entry: TaskHistoryEntry): string {
  switch (entry.action) {
    case 'created':   return 'created this task'
    case 'completed': return 'completed this task'
    case 'reopened':  return 're-opened this task'
    case 'deleted':   return 'deleted this task'
    case 'assigned':  return `assigned ${entry.newValue ?? ''}`
    case 'unassigned': return `unassigned ${entry.oldValue ?? ''}`
    case 'file_added': return `attached ${entry.newValue ?? 'a file'}`
    case 'updated':
      if (!entry.field) return 'updated this task'
      if (entry.oldValue && entry.newValue)
        return `changed ${entry.field} from "${entry.oldValue}" → "${entry.newValue}"`
      if (entry.newValue)
        return `set ${entry.field} to "${entry.newValue}"`
      return `cleared ${entry.field}`
    default:
      return 'updated this task'
  }
}

export default function ActivityLog({ taskId }: Props) {
  const [entries, setEntries] = useState<TaskHistoryEntry[]>([])

  useEffect(() => {
    const unsub = subscribeToTaskHistory(taskId, setEntries)
    return unsub
  }, [taskId])

  if (entries.length === 0) {
    return <p className="text-xs text-gray-400 dark:text-gray-500">No activity yet.</p>
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <div key={entry.id} className="flex items-start gap-2.5">
          <div
            className="mt-0.5 h-6 w-6 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
            style={{ backgroundColor: getInitialsColor(entry.userName) }}
          >
            {getInitials(entry.userName)}
          </div>
          <div>
            <p className="text-xs text-gray-700 dark:text-gray-300">
              <span className="font-medium">{entry.userName}</span>{' '}
              {describeEntry(entry)}
            </p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
              {formatRelativeTime(entry.timestamp)}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
