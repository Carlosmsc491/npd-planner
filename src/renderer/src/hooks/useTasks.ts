import { useEffect, useCallback } from 'react'
import {
  subscribeToTasks,
  completeTask,
  deleteTask,
  duplicateTask,
  updateTaskField,
  createTask,
} from '../lib/firestore'
import { useTaskStore } from '../store/taskStore'
import { useAuthStore } from '../store/authStore'
import { Timestamp } from 'firebase/firestore'
import type { Task, RecurringConfig } from '../types'

export function useTasks(boardId: string | undefined) {
  const { tasks, setTasks, selectedTask, setSelectedTask, setToast } = useTaskStore()
  const { user } = useAuthStore()

  useEffect(() => {
    if (!boardId) { setTasks([]); return }
    const unsub = subscribeToTasks(boardId, setTasks)
    return unsub
  }, [boardId, setTasks])

  const complete = useCallback(async (task: Task) => {
    if (!user) return
    const snapshot = { ...task }
    await completeTask(task.id, user.uid, user.name)

    // Auto-create next recurring instance
    if (task.recurring?.enabled && task.recurring.nextDate) {
      const next = task.recurring.nextDate.toDate()
      const freq = task.recurring.frequency
      let newDate: Date
      if (freq === 'daily')   newDate = new Date(next.setDate(next.getDate() + 1))
      else if (freq === 'weekly')  newDate = new Date(next.setDate(next.getDate() + 7))
      else if (freq === 'monthly') newDate = new Date(next.setMonth(next.getMonth() + 1))
      else if (freq === 'yearly')  newDate = new Date(next.setFullYear(next.getFullYear() + 1))
      else newDate = next

      const { id: _id, completedAt: _ca, completedBy: _cb, ...rest } = snapshot
      await createTask({
        ...rest,
        completed: false,
        completedAt: null,
        completedBy: null,
        dateStart: Timestamp.fromDate(newDate),
        dateEnd: task.dateEnd
          ? Timestamp.fromDate(
              new Date(newDate.getTime() + (task.dateEnd.toMillis() - (task.dateStart?.toMillis() ?? newDate.getTime())))
            )
          : null,
        recurring: { ...task.recurring, nextDate: Timestamp.fromDate(newDate) },
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      })
    }

    setToast({
      id: `undo-${task.id}`,
      message: `Completed: ${task.title}`,
      type: 'info',
      undoAction: async () => {
        await updateTaskField(task.id, 'completed', false, user.uid, user.name, true)
        await updateTaskField(task.id, 'completedAt', null, user.uid, user.name, snapshot.completedAt)
        await updateTaskField(task.id, 'completedBy', null, user.uid, user.name, snapshot.completedBy)
      },
      duration: 5000,
    })
  }, [user, setToast])

  const remove = useCallback(async (task: Task) => {
    if (!user) return
    const snapshot = { ...task }
    setToast({
      id: `undo-delete-${task.id}`,
      message: `Deleted: ${task.title}`,
      type: 'warning',
      undoAction: async () => {
        const { id: _id, ...data } = snapshot
        await createTask(data)
      },
      duration: 5000,
    })
    await deleteTask(task.id, user.uid, user.name)
  }, [user, setToast])

  const duplicate = useCallback(async (task: Task) => {
    const newId = await duplicateTask(task, `Copy of ${task.title}`)
    return newId
  }, [])

  const setRecurring = useCallback(async (task: Task, config: RecurringConfig) => {
    if (!user) return
    await updateTaskField(task.id, 'recurring', config, user.uid, user.name, task.recurring)
  }, [user])

  return { tasks, selectedTask, setSelectedTask, complete, remove, duplicate, setRecurring }
}
