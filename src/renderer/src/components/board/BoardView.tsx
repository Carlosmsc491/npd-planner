import { useState, useMemo } from 'react'
import BoardColumn from './BoardColumn'
import { BOARD_BUCKETS, getBucketColor } from '../../utils/colorUtils'
import { useDragScroll } from '../../hooks/useDragScroll'
import { updateBoardBucketOrder } from '../../lib/firestore'
import type { Task, Client, Label, AppUser, GroupByField, BoardType, Board } from '../../types'

interface Props {
  tasks: Task[]
  clients: Client[]
  labels: Label[]
  users: AppUser[]
  groupBy: GroupByField
  boardType?: BoardType
  board?: Board | null
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
        if (diffDays < 0)       key = 'Overdue'
        else if (diffDays <= 7)  key = 'This week'
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
  tasks, clients, labels, users, groupBy, boardType, board,
  onComplete, onOpen, onDuplicate, onRecurring, onDelete, onAddTask,
}: Props) {
  const scrollRef = useDragScroll()
  const [draggedBucket, setDraggedBucket] = useState<string | null>(null)
  const [dragOverBucket, setDragOverBucket] = useState<string | null>(null)
  const groups = groupTasks(tasks, groupBy, clients, users)

  // When grouping by bucket, ensure default buckets are shown even when empty
  const visibleGroups = groupBy === 'bucket' && boardType
    ? (() => {
        const defaults = BOARD_BUCKETS[boardType] ?? []
        const existingKeys = new Set(groups.map(g => g.key))
        const extra = defaults
          .filter(b => !existingKeys.has(b))
          .map(b => ({ key: b, tasks: [] as Task[] }))
        return [...groups, ...extra]
      })()
    : groups

  // Sort groups by bucketOrder when grouping by bucket
  const orderedGroups = useMemo(() => {
    if (groupBy !== 'bucket' || !board?.bucketOrder) return visibleGroups
    const order = board.bucketOrder
    return [...visibleGroups].sort((a, b) => {
      const idxA = order.indexOf(a.key)
      const idxB = order.indexOf(b.key)
      // Items not in order go to the end
      return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB)
    })
  }, [visibleGroups, groupBy, board?.bucketOrder])

  function handleColumnDragStart(bucketKey: string) {
    setDraggedBucket(bucketKey)
  }

  function handleColumnDragOver(e: React.DragEvent, bucketKey: string) {
    e.preventDefault()
    if (bucketKey !== draggedBucket) {
      setDragOverBucket(bucketKey)
    }
  }

  async function handleColumnDrop(targetBucket: string) {
    if (!draggedBucket || draggedBucket === targetBucket || !board) return

    const currentOrder = orderedGroups.map(g => g.key)
    const fromIdx = currentOrder.indexOf(draggedBucket)
    const toIdx = currentOrder.indexOf(targetBucket)
    if (fromIdx === -1 || toIdx === -1) return

    const newOrder = [...currentOrder]
    newOrder.splice(fromIdx, 1)
    newOrder.splice(toIdx, 0, draggedBucket)

    // Persist to Firestore
    await updateBoardBucketOrder(board.id, newOrder)

    setDraggedBucket(null)
    setDragOverBucket(null)
  }

  function handleColumnDragEnd() {
    setDraggedBucket(null)
    setDragOverBucket(null)
  }

  if (orderedGroups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center py-20">
        <div className="mb-4 text-5xl">📋</div>
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No tasks yet</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Create the first one</p>
      </div>
    )
  }

  return (
    <div
      ref={scrollRef}
      className="flex gap-4 overflow-x-auto pb-4 px-6 pt-4 h-full cursor-grab"
    >
      {orderedGroups.map(({ key, tasks: groupTasks }) => (
        <div
          key={key}
          draggable={groupBy === 'bucket'}
          onDragStart={() => handleColumnDragStart(key)}
          onDragOver={(e) => handleColumnDragOver(e, key)}
          onDrop={() => handleColumnDrop(key)}
          onDragEnd={handleColumnDragEnd}
          className={`transition-transform ${
            dragOverBucket === key ? 'scale-[1.02] ring-2 ring-green-400 ring-opacity-50 rounded-xl' : ''
          } ${draggedBucket === key ? 'opacity-50' : ''}`}
        >
          <BoardColumn
            groupKey={key}
            tasks={groupTasks}
            clients={clients}
            labels={labels}
            users={users}
            board={board}
            bucketColor={groupBy === 'bucket' ? getBucketColor(key, board) : undefined}
            onComplete={onComplete}
            onOpen={onOpen}
            onDuplicate={onDuplicate}
            onRecurring={onRecurring}
            onDelete={onDelete}
            onAddTask={onAddTask}
            isDraggable={groupBy === 'bucket'}
          />
        </div>
      ))}
    </div>
  )
}
