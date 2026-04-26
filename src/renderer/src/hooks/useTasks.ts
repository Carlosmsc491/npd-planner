import { useEffect, useCallback, useRef } from 'react'
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
import { useBoardStore } from '../store/boardStore'
import { useSettingsStore } from '../store/settingsStore'
import { Timestamp } from 'firebase/firestore'
import type { Task, RecurringConfig, BoardType } from '../types'
import { syncTaskToSharePoint } from '../lib/sharepointTemplates'
import { generateAndSaveTaskReport } from '../utils/taskReportSaver'

export function useTasks(boardId: string | undefined, boardType?: string) {
  const { tasks, setTasks, selectedTask, setSelectedTask, setToast } = useTaskStore()
  const { user } = useAuthStore()
  const { boards } = useBoardStore()
  const { clients, labels } = useSettingsStore()

  useEffect(() => {
    if (!boardId) { setTasks([]); return }
    const unsub = subscribeToTasks(boardId, setTasks)
    return unsub
  }, [boardId, setTasks])

  const completingRef = useRef(new Set<string>())

  const complete = useCallback(async (task: Task) => {
    if (!user) return
    if (completingRef.current.has(task.id)) return  // prevent double-fire
    completingRef.current.add(task.id)

    try {
      if (task.completed) {
        // ── UNCOMPLETE: toggle back to active ──
        await updateTaskField(task.id, 'completed', false, user.uid, user.name, true, boardType)
        await updateTaskField(task.id, 'completedAt', null, user.uid, user.name, task.completedAt, boardType)
        await updateTaskField(task.id, 'completedBy', null, user.uid, user.name, task.completedBy, boardType)
      } else {

        // ── COMPLETE ──
        const snapshot = { ...task }
        await completeTask(task.id, user.uid, user.name, boardType)

        // Auto-create next recurring instance
        if (task.recurring?.enabled && task.recurring.nextDate) {
          const next = task.recurring.nextDate.toDate()
          const freq = task.recurring.frequency
          let newDate: Date
          if (freq === 'daily')        newDate = new Date(next.setDate(next.getDate() + 1))
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

        // Auto-generate SharePoint report (non-blocking)
        const sharePointPath = localStorage.getItem('npd_sharepoint_path') ?? user.preferences?.sharePointPath ?? ''
        if (sharePointPath) {
          const board = boards.find(b => b.id === snapshot.boardId) ?? null
          const taskLabels = labels.filter(l => (snapshot.labelIds ?? []).includes(l.id))
          const client = clients.find(c => c.id === snapshot.clientId) ?? null
          generateAndSaveTaskReport(snapshot, sharePointPath, client?.name ?? 'Unknown', {
            client, board, labels: taskLabels, users: [],
          }).catch(() => { /* non-blocking — report failure is silent */ })
        }

        setToast({
          id: `undo-${task.id}`,
          message: `Completed: ${task.title}`,
          type: 'info',
          undoAction: async () => {
            try {
              await updateTaskField(task.id, 'completed', false, user.uid, user.name, true, boardType)
              await updateTaskField(task.id, 'completedAt', null, user.uid, user.name, snapshot.completedAt, boardType)
              await updateTaskField(task.id, 'completedBy', null, user.uid, user.name, snapshot.completedBy, boardType)
            } catch {
              setToast({ id: `undo-err-${task.id}`, message: 'Could not undo — check your connection', type: 'error', duration: 5000 })
            }
          },
          duration: 5000,
        })
      }
    } catch {
      setToast({ id: `complete-err-${task.id}`, message: `Failed to update task. Check your connection.`, type: 'error', duration: 5000 })
    } finally {
      setTimeout(() => completingRef.current.delete(task.id), 2000)
    }
  }, [user, setToast, boardType])

  const remove = useCallback(async (task: Task) => {
    if (!user) return
    const isAdmin = user.role === 'admin' || user.role === 'owner'
    if (!isAdmin && task.createdBy !== user.uid) return  // silently block — UI should already hide Delete

    const retentionDays = user.preferences?.trashRetentionDays ?? 30
    const year = task.createdAt?.toDate?.()?.getFullYear?.() ?? new Date().getFullYear()
    const sharePointRoot = localStorage.getItem('npd_sharepoint_path') ?? ''
    const safeTitle = task.title.replace(/[<>:"/\\|?*]/g, '_').substring(0, 80)
    const sharePointFolderPath = sharePointRoot
      ? `${sharePointRoot}/REPORTS (NPD-SECURE)/${year}/unknown/${safeTitle}`
      : ''

    try {
      await moveTaskToTrash(task, sharePointFolderPath, user.uid, user.name, retentionDays)
      setToast({
        id: `undo-delete-${task.id}`,
        message: `Moved to trash: ${task.title}`,
        type: 'warning',
        undoAction: async () => {
          setToast({
            id: `undo-info-${task.id}`,
            message: 'Go to Settings > Trash to restore this task',
            type: 'info',
            duration: 5000,
          })
        },
        duration: 5000,
      })
    } catch (err) {
      console.error('moveTaskToTrash failed:', err)
      setToast({
        id: `delete-error-${task.id}`,
        message: `Failed to delete task: ${task.title}`,
        type: 'error',
        duration: 5000,
      })
    }
  }, [user, setToast])

  const duplicate = useCallback(async (task: Task): Promise<string | undefined> => {
    try {
      const newId = await duplicateTask(task, `Copy of ${task.title}`)
      return newId
    } catch {
      setToast({ id: `dup-err-${task.id}`, message: 'Failed to duplicate task. Check your connection.', type: 'error', duration: 5000 })
      return undefined
    }
  }, [setToast])

  const setRecurring = useCallback(async (task: Task, config: RecurringConfig) => {
    if (!user) return
    try {
      await updateTaskField(task.id, 'recurring', config, user.uid, user.name, task.recurring, boardType)
    } catch {
      setToast({ id: `rec-err-${task.id}`, message: 'Failed to save recurring config. Check your connection.', type: 'error', duration: 5000 })
    }
  }, [user, boardType, setToast])

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
