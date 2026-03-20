import { useEffect, useCallback } from 'react'
import {
  subscribeToTasks,
  completeTask,
  duplicateTask,
  updateTaskField,
  createTask,
  moveTaskToTrash,
} from '../lib/firestore'
import { useTaskStore } from '../store/taskStore'
import { useAuthStore } from '../store/authStore'
import { Timestamp } from 'firebase/firestore'
import type { Task, RecurringConfig, BoardType } from '../types'
import { syncTaskToSharePoint } from '../lib/sharepointTemplates'

export function useTasks(boardId: string | undefined, boardType?: string) {
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
    await completeTask(task.id, user.uid, user.name, boardType)

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
        await updateTaskField(task.id, 'completed', false, user.uid, user.name, true, boardType)
        await updateTaskField(task.id, 'completedAt', null, user.uid, user.name, snapshot.completedAt, boardType)
        await updateTaskField(task.id, 'completedBy', null, user.uid, user.name, snapshot.completedBy, boardType)
      },
      duration: 5000,
    })
  }, [user, setToast, boardType])

  const remove = useCallback(async (task: Task) => {
    if (!user) return
    
    // Get user's retention period (default 30 days)
    const retentionDays = user.preferences?.trashRetentionDays ?? 30
    
    // Build SharePoint folder path: year/client/taskTitle
    const year = task.createdAt?.toDate?.()?.getFullYear?.() ?? new Date().getFullYear()
    const clientName = 'unknown' // Will be resolved by caller if needed
    const sharePointFolderPath = `${year}/${clientName}/${task.title}`
    
    setToast({
      id: `undo-delete-${task.id}`,
      message: `Moved to trash: ${task.title}`,
      type: 'warning',
      undoAction: async () => {
        // Restore from trash is handled via Settings > Trash
        // This is a simplified undo that just shows a message
        setToast({
          id: `undo-info-${task.id}`,
          message: 'Go to Settings > Trash to restore this task',
          type: 'info',
          duration: 5000,
        })
      },
      duration: 5000,
    })
    
    await moveTaskToTrash(task, sharePointFolderPath, user.uid, user.name, retentionDays)
  }, [user, setToast])

  const duplicate = useCallback(async (task: Task) => {
    const newId = await duplicateTask(task, `Copy of ${task.title}`)
    return newId
  }, [])

  const setRecurring = useCallback(async (task: Task, config: RecurringConfig) => {
    if (!user) return
    await updateTaskField(task.id, 'recurring', config, user.uid, user.name, task.recurring, boardType)
  }, [user, boardType])

  /**
   * Syncs a task to SharePoint by generating an HTML template for trips/vacations.
   * Should be called after creating or updating a task.
   */
  const syncToSharePoint = useCallback(async (
    task: Task,
    personName: string,
    vacationType?: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!boardType || (boardType !== 'trips' && boardType !== 'vacations')) {
      return { success: true } // Only sync trips and vacations
    }

    const result = await syncTaskToSharePoint(
      task,
      boardType as BoardType,
      personName,
      vacationType
    )

    if (!result.success && result.error) {
      console.warn(`[useTasks] SharePoint sync failed for ${boardType}:`, result.error)
      // Don't throw - this is a non-critical operation
    }

    return result
  }, [boardType])

  return { 
    tasks, 
    selectedTask, 
    setSelectedTask, 
    complete, 
    remove, 
    duplicate, 
    setRecurring,
    syncToSharePoint 
  }
}
