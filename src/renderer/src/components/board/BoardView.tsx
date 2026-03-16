import BoardColumn from './BoardColumn'
import type { Task, Client, Label, AppUser, GroupByField } from '../../types'

interface Props {
  tasks: Task[]
  clients: Client[]
  labels: Label[]
  users: AppUser[]
  groupBy: GroupByField
  onComplete: (task: Task) => void
  onOpen: (task: Task) => void
  onDuplicate: (task: Task) => void
  onRecurring: (task: Task) => void
  onDelete: (task: Task) => void
  onAddTask: (bucket: string) => void
}

function groupTasks(
  tasks: Task[],
  groupBy: GroupByField,
  clients: Client[],
  users: AppUser[]
): { key: string; tasks: Task[] }[] {
  const map = new Map<string, Task[]>()

  for (const task of tasks) {
    let key: string
    switch (groupBy) {
      case 'bucket':
        key = task.bucket || 'No bucket'
        break
      case 'client': {
        const c = clients.find((cl) => cl.id === task.clientId)
        key = c?.name ?? 'No client'
        break
      }
      case 'assignee': {
        if (task.assignees.length === 0) { key = 'Unassigned'; break }
        const u = users.find((us) => us.uid === task.assignees[0])
        key = u?.name ?? 'Unknown'
        break
      }
      case 'status':
        key = task.status
        break
      case 'priority':
        key = task.priority === 'high' ? 'High Priority' : 'Normal'
        break
      case 'date': {
        if (!task.dateEnd) { key = 'No date'; break }
        const d = task.dateEnd.toDate()
        const now = new Date()
        const diffDays = Math.ceil((d.getTime() - now.getTime()) / 86400000)
        if (diffDays < 0)      key = 'Overdue'
        else if (diffDays <= 7) key = 'This week'
        else if (diffDays <= 14) key = 'Next week'
        else key = 'Later'
        break
      }
      default:
        key = 'Other'
    }
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(task)
  }

  return Array.from(map.entries()).map(([key, tasks]) => ({ key, tasks }))
}

export default function BoardView({
  tasks, clients, labels, users, groupBy,
  onComplete, onOpen, onDuplicate, onRecurring, onDelete, onAddTask,
}: Props) {
  const groups = groupTasks(tasks, groupBy, clients, users)

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center py-20">
        <div className="mb-4 text-5xl">📋</div>
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No tasks yet</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          Create the first one
        </p>
      </div>
    )
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 px-6 pt-4 h-full">
      {groups.map(({ key, tasks: groupTasks }) => (
        <BoardColumn
          key={key}
          groupKey={key}
          tasks={groupTasks}
          clients={clients}
          labels={labels}
          users={users}
          onComplete={onComplete}
          onOpen={onOpen}
          onDuplicate={onDuplicate}
          onRecurring={onRecurring}
          onDelete={onDelete}
          onAddTask={onAddTask}
        />
      ))}
    </div>
  )
}
