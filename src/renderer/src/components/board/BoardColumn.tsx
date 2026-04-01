import { useState, useMemo } from 'react'
import { doc, updateDoc, Timestamp } from 'firebase/firestore'
import { GripVertical } from 'lucide-react'
import TaskCard from './TaskCard'
import { db } from '../../lib/firebase'
import type { Task, Client, Label, AppUser, Board } from '../../types'
import { useBoardStore } from '../../store/boardStore'

interface Props {
  groupKey: string
  tasks: Task[]
  clients: Client[]
  labels: Label[]
  users: AppUser[]
  board?: Board | null
  bucketColor?: string
  onComplete: (task: Task) => void
  onOpen: (task: Task) => void
  onDuplicate: (task: Task) => void
  onRecurring: (task: Task) => void
  onDelete: (task: Task) => void
  onAddTask: (bucket: string) => void
  isDraggable?: boolean
  // Cross-column drag
  onTaskDragStart?: (task: Task, fromBucket: string) => void
  onTaskDragEnd?: () => void
  externalDragActive?: boolean  // a task from another bucket is being dragged
}

export default function BoardColumn({
  groupKey, tasks, clients, labels, users, board, bucketColor,
  onComplete, onOpen, onDuplicate, onRecurring, onDelete, onAddTask,
  isDraggable, onTaskDragStart, onTaskDragEnd, externalDragActive,
}: Props) {
  const { showCompleted, toggleShowCompleted } = useBoardStore()
  const isShowingCompleted = showCompleted[groupKey] ?? false
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null)
  const [dragOverPosition, setDragOverPosition] = useState<'above' | 'below' | null>(null)
  const [externalDragOver, setExternalDragOver] = useState(false)

  const active = tasks.filter((t) => !t.completed)
  const completed = tasks.filter((t) => t.completed)

  // Sort tasks by sortOrder (fallback to createdAt)
  const sortedActive = useMemo(() => {
    return [...active].sort((a, b) => {
      const orderA = a.sortOrder ?? a.createdAt?.toMillis() ?? 0
      const orderB = b.sortOrder ?? b.createdAt?.toMillis() ?? 0
      return orderA - orderB
    })
  }, [active])

  const sortedCompleted = useMemo(() => {
    return [...completed].sort((a, b) => {
      const orderA = a.sortOrder ?? a.createdAt?.toMillis() ?? 0
      const orderB = b.sortOrder ?? b.createdAt?.toMillis() ?? 0
      return orderA - orderB
    })
  }, [completed])

  const visible = isShowingCompleted ? [...sortedActive, ...sortedCompleted] : sortedActive

  async function handleTaskDrop(targetTaskId: string) {
    if (!draggedTaskId || draggedTaskId === targetTaskId) return

    const targetIdx = visible.findIndex(t => t.id === targetTaskId)
    if (targetIdx === -1) return

    // Calculate new sortOrder
    let newOrder: number

    if (dragOverPosition === 'above') {
      if (targetIdx === 0) {
        // Dropping before first item
        newOrder = (visible[0].sortOrder ?? visible[0].createdAt?.toMillis() ?? 0) - 1000
      } else {
        // Between previous and target
        const prev = visible[targetIdx - 1]
        const target = visible[targetIdx]
        const prevOrder = prev.sortOrder ?? prev.createdAt?.toMillis() ?? 0
        const targetOrder = target.sortOrder ?? target.createdAt?.toMillis() ?? 0
        newOrder = (prevOrder + targetOrder) / 2
      }
    } else {
      if (targetIdx === visible.length - 1) {
        // Dropping after last item
        const last = visible[visible.length - 1]
        newOrder = (last.sortOrder ?? last.createdAt?.toMillis() ?? 0) + 1000
      } else {
        // Between target and next
        const target = visible[targetIdx]
        const next = visible[targetIdx + 1]
        const targetOrder = target.sortOrder ?? target.createdAt?.toMillis() ?? 0
        const nextOrder = next.sortOrder ?? next.createdAt?.toMillis() ?? 0
        newOrder = (targetOrder + nextOrder) / 2
      }
    }

    // Persist to Firestore
    try {
      await updateDoc(doc(db, 'tasks', draggedTaskId), {
        sortOrder: newOrder,
        updatedAt: Timestamp.now(),
      })
    } catch (err) {
      console.error('Failed to reorder task:', err)
    }

    setDraggedTaskId(null)
    setDragOverTaskId(null)
    setDragOverPosition(null)
  }

  return (
    <div className="flex w-[280px] shrink-0 flex-col">
      {/* Column header */}
      <div className="mb-2 flex items-center justify-between px-1 group/header">
        <div className="flex items-center gap-2">
          {isDraggable && (
            <GripVertical
              size={12}
              className="text-gray-300 opacity-0 group-hover/header:opacity-100 cursor-grab transition-opacity shrink-0"
            />
          )}
          {bucketColor && (
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: bucketColor }} />
          )}
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            {groupKey}
          </h3>
          <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-400">
            {active.length}
          </span>
        </div>
        <button
          onClick={() => onAddTask(groupKey)}
          className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200 transition-colors"
          title="Add task"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* Task cards */}
      <div
        className={`flex flex-col gap-2 flex-1 rounded-xl transition-all ${
          externalDragActive && externalDragOver
            ? 'ring-2 ring-green-400 bg-green-50/40 dark:bg-green-900/10'
            : ''
        }`}
        onDragOver={(e) => {
          if (!externalDragActive) return
          e.preventDefault()
          e.stopPropagation()
          setExternalDragOver(true)
        }}
        onDragLeave={(e) => {
          // Only clear if leaving the column container itself
          if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
            setExternalDragOver(false)
          }
        }}
        onDrop={(e) => {
          if (!externalDragActive) return
          e.preventDefault()
          e.stopPropagation()
          setExternalDragOver(false)
          // BoardView listens for this via the wrapper div — nothing to do here,
          // the drop is handled at BoardView level via onDrop on the column wrapper
        }}
      >
        {visible.length === 0 && (
          <button
            onClick={() => onAddTask(groupKey)}
            className="rounded-xl border-2 border-dashed border-gray-200 py-4 text-xs text-gray-400 hover:border-gray-300 hover:text-gray-500 dark:border-gray-700 dark:hover:border-gray-600 transition-colors"
          >
            + Add task
          </button>
        )}
        {visible.map((task) => (
          <div
            key={task.id}
            draggable
            onDragStart={(e) => {
              e.stopPropagation()  // prevent column drag from activating
              e.dataTransfer.effectAllowed = 'move'
              setDraggedTaskId(task.id)
              onTaskDragStart?.(task, groupKey)
            }}
            onDragOver={(e) => {
              e.preventDefault()
              e.stopPropagation()
              e.dataTransfer.dropEffect = 'move'
              // Determine if cursor is in top half or bottom half of card
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
              const midY = rect.top + rect.height / 2
              setDragOverTaskId(task.id)
              setDragOverPosition(e.clientY < midY ? 'above' : 'below')
            }}
            onDragLeave={() => {
              setDragOverTaskId(null)
              setDragOverPosition(null)
            }}
            onDrop={() => handleTaskDrop(task.id)}
            onDragEnd={() => {
              setDraggedTaskId(null)
              setDragOverTaskId(null)
              setDragOverPosition(null)
              onTaskDragEnd?.()
            }}
            className={`transition-all ${
              draggedTaskId === task.id ? 'opacity-40 scale-95' : ''
            }`}
          >
            {/* Drop indicator line above */}
            {dragOverTaskId === task.id && dragOverPosition === 'above' && (
              <div className="h-0.5 bg-green-500 rounded-full -mt-1 mb-1" />
            )}

            <TaskCard
              task={task}
              clients={clients}
              labels={labels}
              users={users}
              board={board}
              onComplete={onComplete}
              onOpen={onOpen}
              onDuplicate={onDuplicate}
              onRecurring={onRecurring}
              onDelete={onDelete}
            />

            {/* Drop indicator line below */}
            {dragOverTaskId === task.id && dragOverPosition === 'below' && (
              <div className="h-0.5 bg-green-500 rounded-full mt-1 -mb-1" />
            )}
          </div>
        ))}

        {/* Show completed toggle */}
        {completed.length > 0 && (
          <button
            onClick={() => toggleShowCompleted(groupKey)}
            className="mt-1 rounded-lg py-1.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors text-left px-1"
          >
            {isShowingCompleted
              ? `Hide completed (${completed.length})`
              : `Show completed (${completed.length})`}
          </button>
        )}

        {/* External drag drop zone hint */}
        {externalDragActive && externalDragOver && (
          <div className="mt-1 rounded-xl border-2 border-dashed border-green-400 py-3 text-center text-xs font-medium text-green-600 dark:text-green-400">
            Drop to move here
          </div>
        )}
      </div>
    </div>
  )
}
