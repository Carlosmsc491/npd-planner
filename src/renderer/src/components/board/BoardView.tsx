import { useState, useMemo } from 'react'
import { doc, updateDoc, Timestamp } from 'firebase/firestore'
import BoardColumn from './BoardColumn'
import { BOARD_BUCKETS, getBucketColor } from '../../utils/colorUtils'
import { useDragScroll } from '../../hooks/useDragScroll'
import { updateBoardBucketOrder } from '../../lib/firestore'
import { db } from '../../lib/firebase'
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

  // Cross-column task drag state
  const [crossDrag, setCrossDrag] = useState<{ task: Task; fromBucket: string } | null>(null)
  const [pendingMove, setPendingMove] = useState<{ task: Task; fromBucket: string; toBucket: string } | null>(null)

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

  // ── Cross-column task drag ────────────────────────────────────────────────

  function handleTaskDragStart(task: Task, fromBucket: string) {
    setCrossDrag({ task, fromBucket })
  }

  function handleTaskDragEnd() {
    setCrossDrag(null)
  }

  function handleColumnDropTask(e: React.DragEvent, targetBucket: string) {
    e.preventDefault()
    if (!crossDrag) return
    if (crossDrag.fromBucket === targetBucket) return   // same column — handled by BoardColumn internally
    setPendingMove({ task: crossDrag.task, fromBucket: crossDrag.fromBucket, toBucket: targetBucket })
    setCrossDrag(null)
  }

  async function confirmMove() {
    if (!pendingMove) return
    try {
      await updateDoc(doc(db, 'tasks', pendingMove.task.id), {
        bucket: pendingMove.toBucket,
        updatedAt: Timestamp.now(),
      })
    } catch (err) {
      console.error('Failed to move task:', err)
    }
    setPendingMove(null)
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
    <>
    <div
      ref={scrollRef}
      className="flex gap-4 overflow-x-auto pb-4 px-6 pt-4 h-full cursor-grab"
    >
      {orderedGroups.map(({ key, tasks: groupTasks }) => (
        <div
          key={key}
          draggable={groupBy === 'bucket' && !crossDrag}
          onDragStart={() => handleColumnDragStart(key)}
          onDragOver={(e) => {
            if (crossDrag && crossDrag.fromBucket !== key) {
              e.preventDefault()
            } else {
              handleColumnDragOver(e, key)
            }
          }}
          onDrop={(e) => {
            if (crossDrag && crossDrag.fromBucket !== key) {
              handleColumnDropTask(e, key)
            } else {
              handleColumnDrop(key)
            }
          }}
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
            onTaskDragStart={groupBy === 'bucket' ? handleTaskDragStart : undefined}
            onTaskDragEnd={groupBy === 'bucket' ? handleTaskDragEnd : undefined}
            externalDragActive={groupBy === 'bucket' && crossDrag !== null && crossDrag.fromBucket !== key}
          />
        </div>
      ))}
    </div>

    {/* ── Confirm bucket move dialog ────────────────────────────────────── */}
    {pendingMove && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
            Move task?
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 leading-relaxed">
            <span className="font-medium text-gray-800 dark:text-gray-200">
              "{pendingMove.task.title}"
            </span>
            <br />
            <span className="inline-flex items-center gap-1.5 mt-1.5">
              <span className="rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs font-medium text-gray-600 dark:text-gray-300">
                {pendingMove.fromBucket}
              </span>
              <span className="text-gray-400">→</span>
              <span className="rounded-full bg-green-100 dark:bg-green-900/30 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
                {pendingMove.toBucket}
              </span>
            </span>
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setPendingMove(null)}
              className="rounded-xl px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={confirmMove}
              className="rounded-xl bg-green-600 hover:bg-green-700 px-4 py-2 text-sm font-medium text-white transition-colors"
            >
              Yes, move it
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
