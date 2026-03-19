// src/lib/firestore.ts
// All Firestore read/write operations for NPD Planner
// Every function has try/catch — never let Firestore errors crash silently

import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, setDoc,
  query, where, orderBy, onSnapshot, runTransaction, serverTimestamp,
  Unsubscribe, writeBatch, limit, getCountFromServer
} from 'firebase/firestore'
import { db } from './firebase'
import type {
  AppUser, Board, BoardType, BoardProperty, Task, Client, Label, Comment,
  TaskHistoryEntry, AppNotification, AnnualSummary,
  GlobalSettings, HistoryAction, ConflictData,
  PersonalNote, PersonalTask, QuickLink
} from '../types'

// ─────────────────────────────────────────
// COLLECTION NAMES (single source of truth)
// ─────────────────────────────────────────
export const COLLECTIONS = {
  USERS:        'users',
  BOARDS:       'boards',
  TASKS:        'tasks',
  CLIENTS:      'clients',
  LABELS:       'labels',
  COMMENTS:     'comments',
  HISTORY:      'taskHistory',
  NOTIFICATIONS:'notifications',
  ARCHIVE:      'archive',
  SETTINGS:     'settings',
  USER_PRIVATE: 'userPrivate',
} as const

// ─────────────────────────────────────────
// USERS
// ─────────────────────────────────────────

export async function getUser(uid: string): Promise<AppUser | null> {
  try {
    const snap = await getDoc(doc(db, COLLECTIONS.USERS, uid))
    return snap.exists() ? (snap.data() as AppUser) : null
  } catch (err) {
    console.error('getUser failed:', err)
    return null
  }
}

export async function createUser(uid: string, data: Omit<AppUser, 'uid'>): Promise<void> {
  try {
    const { setDoc } = await import('firebase/firestore')
    await setDoc(doc(db, COLLECTIONS.USERS, uid), { ...data, uid })
  } catch (err) {
    throw new Error(`Failed to create user profile: ${err}`)
  }
}

export function subscribeToUsers(callback: (users: AppUser[]) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, COLLECTIONS.USERS), orderBy('name')),
    (snap) => callback(snap.docs.map(d => d.data() as AppUser)),
    (err) => console.error('subscribeToUsers error:', err)
  )
}

export async function updateUserStatus(uid: string, status: AppUser['status']): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTIONS.USERS, uid), { status })
  } catch (err) {
    throw new Error(`Failed to update user status: ${err}`)
  }
}

export async function updateUserRole(uid: string, role: AppUser['role']): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTIONS.USERS, uid), { role })
  } catch (err) {
    throw new Error(`Failed to update user role: ${err}`)
  }
}

export async function hasAnyAdmin(): Promise<boolean> {
  try {
    const snap = await getDocs(
      query(collection(db, COLLECTIONS.USERS), where('role', 'in', ['owner', 'admin']), limit(1))
    )
    return !snap.empty
  } catch {
    return false
  }
}

export async function updateUserName(uid: string, name: string): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTIONS.USERS, uid), { name })
  } catch (err) {
    throw new Error(`Failed to update user name: ${err}`)
  }
}

// ─────────────────────────────────────────
// BOARDS
// ─────────────────────────────────────────

export function subscribeToBoards(callback: (boards: Board[]) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, COLLECTIONS.BOARDS), orderBy('order')),
    (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Board)),
    (err) => console.error('subscribeToBoards error:', err)
  )
}

export async function createBoard(data: Omit<Board, 'id'>): Promise<string> {
  try {
    const ref = await addDoc(collection(db, COLLECTIONS.BOARDS), data)
    return ref.id
  } catch (err) {
    throw new Error(`Failed to create board: ${err}`)
  }
}

export async function updateBoard(id: string, data: Partial<Omit<Board, 'id'>>): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTIONS.BOARDS, id), data as Record<string, unknown>)
  } catch (err) {
    throw new Error(`Failed to update board: ${err}`)
  }
}

export async function deleteBoard(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, COLLECTIONS.BOARDS, id))
  } catch (err) {
    throw new Error(`Failed to delete board: ${err}`)
  }
}

export async function updateBoardProperties(id: string, customProperties: BoardProperty[]): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTIONS.BOARDS, id), { customProperties })
  } catch (err) {
    throw new Error(`Failed to update board properties: ${err}`)
  }
}

export async function deduplicateDefaultBoards(): Promise<void> {
  try {
    const snap = await getDocs(
      query(collection(db, COLLECTIONS.BOARDS), where('type', 'in', ['planner', 'trips', 'vacations']))
    )
    const byType = new Map<string, typeof snap.docs>()
    for (const d of snap.docs) {
      const type = d.data().type as string
      if (!byType.has(type)) byType.set(type, [])
      byType.get(type)!.push(d)
    }
    const batch = writeBatch(db)
    let hasDeletes = false
    for (const docs of byType.values()) {
      if (docs.length <= 1) continue
      const sorted = [...docs].sort((a, b) => ((a.data().order as number) ?? 99) - ((b.data().order as number) ?? 99))
      for (const d of sorted.slice(1)) {
        batch.delete(d.ref)
        hasDeletes = true
      }
    }
    if (hasDeletes) await batch.commit()
  } catch (err) {
    console.error('deduplicateDefaultBoards failed:', err)
  }
}

export async function seedDefaultBoards(createdByUid: string): Promise<void> {
  try {
    // Check by type — prevents duplicates even if called twice
    const snap = await getDocs(
      query(collection(db, COLLECTIONS.BOARDS), where('type', 'in', ['planner', 'trips', 'vacations']), limit(1))
    )
    if (!snap.empty) return

    const defaults: { name: string; color: string; type: BoardType; order: number }[] = [
      { name: 'Planner',   color: '#1D9E75', type: 'planner',   order: 0 },
      { name: 'Trips',     color: '#378ADD', type: 'trips',     order: 1 },
      { name: 'Vacations', color: '#D4537E', type: 'vacations', order: 2 },
    ]
    for (const board of defaults) {
      await addDoc(collection(db, COLLECTIONS.BOARDS), {
        ...board,
        createdBy: createdByUid,
        createdAt: serverTimestamp(),
      })
    }
  } catch (err) {
    console.error('seedDefaultBoards failed:', err)
  }
}

// ─────────────────────────────────────────
// TASKS
// ─────────────────────────────────────────

export function subscribeToTask(
  taskId: string,
  callback: (task: Task | null) => void
): Unsubscribe {
  return onSnapshot(doc(db, COLLECTIONS.TASKS, taskId), (snap) => {
    if (!snap.exists()) callback(null)
    else callback({ id: snap.id, ...snap.data() } as Task)
  })
}

export function subscribeToTasks(
  boardId: string,
  callback: (tasks: Task[]) => void
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, COLLECTIONS.TASKS),
      where('boardId', '==', boardId)
    ),
    (snap) => {
      const tasks = snap.docs
        .map(d => ({ id: d.id, ...d.data() }) as Task)
        .sort((a, b) => {
          const aTime = a.createdAt?.toMillis?.() ?? 0
          const bTime = b.createdAt?.toMillis?.() ?? 0
          return bTime - aTime
        })
      callback(tasks)
    },
    (err) => console.error('subscribeToTasks error:', err)
  )
}

export function subscribeToAllTasks(
  boardIds: string[],
  callback: (tasks: Task[]) => void
): Unsubscribe {
  if (boardIds.length === 0) {
    callback([])
    return () => {}
  }
  // Firestore 'in' supports max 30 elements
  const ids = boardIds.slice(0, 30)
  return onSnapshot(
    query(collection(db, COLLECTIONS.TASKS), where('boardId', 'in', ids)),
    (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Task)),
    (err) => console.error('subscribeToAllTasks error:', err)
  )
}

export async function createTask(data: Omit<Task, 'id'>): Promise<string> {
  try {
    const ref = await addDoc(collection(db, COLLECTIONS.TASKS), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return ref.id
  } catch (err) {
    throw new Error(`Failed to create task: ${err}`)
  }
}

export async function updateTaskField(
  taskId: string,
  field: string,
  value: unknown,
  updatedBy: string,
  updatedByName: string,
  oldValue?: unknown,
  boardType?: string
): Promise<ConflictData | null> {
  try {
    let detectedConflict: ConflictData | null = null
    let taskData: Task | null = null
    let shouldNotifyAssignees = false
    let notificationMessage = ''

    await runTransaction(db, async (transaction) => {
      const taskRef = doc(db, COLLECTIONS.TASKS, taskId)
      const taskSnap = await transaction.get(taskRef)

      if (!taskSnap.exists()) throw new Error('Task not found')

      taskData = taskSnap.data() as Task
      const currentValue = (taskData as unknown as Record<string, unknown>)[field]

      // Conflict detection (last write wins — log only, never block the user)
      if (
        oldValue !== undefined &&
        String(currentValue) !== String(oldValue) &&
        String(currentValue) !== String(value)
      ) {
        detectedConflict = {
          taskId,
          field,
          fieldLabel: field,
          localValue: String(value),
          remoteValue: String(currentValue),
          localUpdatedBy: updatedByName,
          remoteUpdatedBy: taskData.updatedBy ?? 'unknown',
        }
        console.log(`Conflict detected on field "${field}" — last write wins (${updatedByName} overwrites)`)
        // falls through — always write
      }

      // Check if we need to notify assignees about specific field changes
      if (field === 'assignees' && boardType === 'planner') {
        const oldAssignees = (oldValue as string[]) ?? []
        const newAssignees = (value as string[]) ?? []
        const addedAssignees = newAssignees.filter(uid => !oldAssignees.includes(uid))
        
        if (addedAssignees.length > 0) {
          shouldNotifyAssignees = true
          notificationMessage = `${updatedByName} assigned you to a task`
        }
      }

      transaction.update(taskRef, {
        [field]: value,
        updatedAt: serverTimestamp(),
        updatedBy,
      })

      const historyRef = doc(collection(db, COLLECTIONS.HISTORY))
      transaction.set(historyRef, {
        taskId,
        userId: updatedBy,
        userName: updatedByName,
        action: 'updated' as HistoryAction,
        field,
        oldValue: oldValue !== undefined ? String(oldValue) : null,
        newValue: String(value),
        timestamp: serverTimestamp(),
      })
    })

    // Create notifications outside of transaction to avoid affecting the main operation
    if (shouldNotifyAssignees && taskData && boardType === 'planner') {
      const newAssignees = (value as string[]) ?? []
      const oldAssignees = (oldValue as string[]) ?? []
      const addedAssignees = newAssignees.filter(uid => !oldAssignees.includes(uid))
      
      for (const uid of addedAssignees) {
        if (uid === updatedBy) continue // Don't notify the user who made the change
        try {
          await createNotification({
            userId: uid,
            taskId,
            taskTitle: (taskData as Task).title,
            boardId: (taskData as Task).boardId,
            boardType,
            type: 'assigned',
            message: notificationMessage,
            read: false,
            triggeredBy: updatedBy,
            triggeredByName: updatedByName,
          } as any)
        } catch (notifErr) {
          console.error('Failed to create assignment notification:', notifErr)
        }
      }
    }

    return detectedConflict
  } catch (err) {
    throw new Error(`Failed to update task field "${field}": ${err}`)
  }
}

export async function completeTask(
  taskId: string,
  userId: string,
  userName: string,
  boardType?: string
): Promise<void> {
  try {
    let taskData: Task | null = null

    await runTransaction(db, async (transaction) => {
      const taskRef = doc(db, COLLECTIONS.TASKS, taskId)
      const taskSnap = await transaction.get(taskRef)
      
      if (taskSnap.exists()) {
        taskData = taskSnap.data() as Task
      }

      transaction.update(taskRef, {
        completed: true,
        completedAt: serverTimestamp(),
        completedBy: userId,
        updatedAt: serverTimestamp(),
        updatedBy: userId,
      })

      const historyRef = doc(collection(db, COLLECTIONS.HISTORY))
      transaction.set(historyRef, {
        taskId,
        userId,
        userName,
        action: 'completed' as HistoryAction,
        field: null,
        oldValue: null,
        newValue: null,
        timestamp: serverTimestamp(),
      })
    })

    // Notify assignees about task completion (only for planner boards)
    if (taskData && boardType === 'planner' && (taskData as Task).assignees?.length > 0) {
      for (const assigneeUid of (taskData as Task).assignees!) {
        if (assigneeUid === userId) continue // Don't notify the completer
        try {
          await createNotification({
            userId: assigneeUid,
            taskId,
            taskTitle: (taskData as Task).title,
            boardId: (taskData as Task).boardId,
            boardType,
            type: 'completed',
            message: `${userName} completed a task`,
            read: false,
            triggeredBy: userId,
            triggeredByName: userName,
          } as any)
        } catch (notifErr) {
          console.error('Failed to create completion notification:', notifErr)
        }
      }
    }
  } catch (err) {
    throw new Error(`Failed to complete task: ${err}`)
  }
}

export async function deleteTask(
  taskId: string,
  userId: string,
  userName: string
): Promise<void> {
  try {
    const batch = writeBatch(db)

    // Delete task
    batch.delete(doc(db, COLLECTIONS.TASKS, taskId))

    // Log deletion in history
    const historyRef = doc(collection(db, COLLECTIONS.HISTORY))
    batch.set(historyRef, {
      taskId,
      userId,
      userName,
      action: 'deleted' as HistoryAction,
      field: null,
      oldValue: null,
      newValue: null,
      timestamp: serverTimestamp(),
    })

    await batch.commit()
  } catch (err) {
    throw new Error(`Failed to delete task: ${err}`)
  }
}

export async function duplicateTask(task: Task, newTitle: string): Promise<string> {
  try {
    const { id, createdAt, updatedAt, completedAt, completedBy, ...rest } = task
    const ref = await addDoc(collection(db, COLLECTIONS.TASKS), {
      ...rest,
      title: newTitle,
      completed: false,
      completedAt: null,
      completedBy: null,
      dateStart: null,
      dateEnd: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return ref.id
  } catch (err) {
    throw new Error(`Failed to duplicate task: ${err}`)
  }
}

// ─────────────────────────────────────────
// CLIENTS
// ─────────────────────────────────────────

export function subscribeToClients(callback: (clients: Client[]) => void): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, COLLECTIONS.CLIENTS),
      where('active', '==', true),
      orderBy('name')
    ),
    (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Client)),
    (err) => console.error('subscribeToClients error:', err)
  )
}

export function subscribeToAllClients(callback: (clients: Client[]) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, COLLECTIONS.CLIENTS), orderBy('name')),
    (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Client)),
    (err) => console.error('subscribeToAllClients error:', err)
  )
}

export async function deleteClient(id: string): Promise<void> {
  try {
    // Check if client has any tasks before deleting
    const taskCount = await getClientTaskCount(id)
    if (taskCount > 0) {
      throw new Error('Cannot delete client with existing tasks')
    }
    await deleteDoc(doc(db, COLLECTIONS.CLIENTS, id))
  } catch (err) {
    throw new Error(`Failed to delete client: ${err}`)
  }
}

export async function getClientTaskCount(clientId: string): Promise<number> {
  try {
    const q = query(collection(db, COLLECTIONS.TASKS), where('clientId', '==', clientId))
    const snapshot = await getCountFromServer(q)
    return snapshot.data().count
  } catch (err) {
    console.error('getClientTaskCount failed:', err)
    return 0
  }
}

export async function createClient(name: string, createdBy: string): Promise<string> {
  try {
    const ref = await addDoc(collection(db, COLLECTIONS.CLIENTS), {
      name: name.trim(),
      active: true,
      createdBy,
      createdAt: serverTimestamp(),
    })
    return ref.id
  } catch (err) {
    throw new Error(`Failed to create client: ${err}`)
  }
}

export async function updateClient(id: string, data: Partial<Client>): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTIONS.CLIENTS, id), data)
  } catch (err) {
    throw new Error(`Failed to update client: ${err}`)
  }
}

// ─────────────────────────────────────────
// LABELS
// ─────────────────────────────────────────

export function subscribeToLabels(callback: (labels: Label[]) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, COLLECTIONS.LABELS), orderBy('name')),
    (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Label)),
    (err) => console.error('subscribeToLabels error:', err)
  )
}

export async function createLabel(data: Omit<Label, 'id' | 'createdAt'>): Promise<string> {
  try {
    const ref = await addDoc(collection(db, COLLECTIONS.LABELS), {
      ...data,
      createdAt: serverTimestamp(),
    })
    return ref.id
  } catch (err) {
    throw new Error(`Failed to create label: ${err}`)
  }
}

export async function updateLabel(id: string, data: Partial<Label>): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTIONS.LABELS, id), data)
  } catch (err) {
    throw new Error(`Failed to update label: ${err}`)
  }
}

export async function deleteLabel(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, COLLECTIONS.LABELS, id))
  } catch (err) {
    throw new Error(`Failed to delete label: ${err}`)
  }
}

export async function getLabelTaskCount(labelId: string): Promise<number> {
  try {
    // Labels are stored in an array on tasks, so we need to query where labelIds contains the labelId
    const q = query(collection(db, COLLECTIONS.TASKS), where('labelIds', 'array-contains', labelId))
    const snapshot = await getCountFromServer(q)
    return snapshot.data().count
  } catch (err) {
    console.error('getLabelTaskCount failed:', err)
    return 0
  }
}

// ─────────────────────────────────────────
// COMMENTS
// ─────────────────────────────────────────

export function subscribeToComments(
  taskId: string,
  callback: (comments: Comment[]) => void
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, COLLECTIONS.COMMENTS),
      where('taskId', '==', taskId),
      orderBy('createdAt', 'asc')
    ),
    (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Comment)),
    (err) => console.error('subscribeToComments error:', err)
  )
}

export function subscribeToCommentsForBoards(
  boardIds: string[],
  callback: (comments: Comment[]) => void
): Unsubscribe {
  if (boardIds.length === 0) {
    callback([])
    return () => {}
  }
  // First get all tasks for these boards
  const ids = boardIds.slice(0, 30)
  return onSnapshot(
    query(collection(db, COLLECTIONS.TASKS), where('boardId', 'in', ids)),
    (taskSnap) => {
      const taskIds = taskSnap.docs.map(d => d.id)
      if (taskIds.length === 0) {
        callback([])
        return
      }
      // Firestore 'in' supports max 30 elements, split if needed
      const batches: string[][] = []
      for (let i = 0; i < taskIds.length; i += 30) {
        batches.push(taskIds.slice(i, i + 30))
      }
      
      const unsubscribers: Unsubscribe[] = []
      const allComments: Comment[] = []
      let completedCount = 0

      batches.forEach((batchIds) => {
        const unsub = onSnapshot(
          query(
            collection(db, COLLECTIONS.COMMENTS),
            where('taskId', 'in', batchIds),
            orderBy('createdAt', 'desc')
          ),
          (snap) => {
            const comments = snap.docs.map(d => ({ id: d.id, ...d.data() }) as Comment)
            // Merge results
            allComments.push(...comments)
            completedCount++
            if (completedCount >= batches.length) {
              // Remove duplicates and sort
              const unique = Array.from(new Map(allComments.map(c => [c.id, c])).values())
                .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())
              callback(unique.slice(0, 100)) // Limit to 100 most recent
            }
          },
          (err) => console.error('subscribeToCommentsForBoards error:', err)
        )
        unsubscribers.push(unsub)
      })

      return () => unsubscribers.forEach(unsub => unsub())
    },
    (err) => console.error('subscribeToCommentsForBoards error:', err)
  )
}

export async function addComment(data: Omit<Comment, 'id' | 'editedAt'>): Promise<string> {
  try {
    const ref = await addDoc(collection(db, COLLECTIONS.COMMENTS), {
      ...data,
      editedAt: null,
      createdAt: serverTimestamp(),
    })
    return ref.id
  } catch (err) {
    throw new Error(`Failed to add comment: ${err}`)
  }
}

// ─────────────────────────────────────────
// TASK HISTORY
// ─────────────────────────────────────────

export function subscribeToTaskHistory(
  taskId: string,
  callback: (history: TaskHistoryEntry[]) => void
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, COLLECTIONS.HISTORY),
      where('taskId', '==', taskId),
      orderBy('timestamp', 'asc')
    ),
    (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }) as TaskHistoryEntry)),
    (err) => console.error('subscribeToTaskHistory error:', err)
  )
}

// ─────────────────────────────────────────
// NOTIFICATIONS
// ─────────────────────────────────────────

export function subscribeToNotifications(
  userId: string,
  callback: (notifs: AppNotification[]) => void
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, COLLECTIONS.NOTIFICATIONS),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(50)
    ),
    (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }) as AppNotification)),
    (err) => console.error('subscribeToNotifications error:', err)
  )
}

export async function markNotificationRead(notifId: string): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTIONS.NOTIFICATIONS, notifId), { read: true })
  } catch (err) {
    console.error('Failed to mark notification read:', err)
  }
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  try {
    const snap = await getDocs(
      query(
        collection(db, COLLECTIONS.NOTIFICATIONS),
        where('userId', '==', userId),
        where('read', '==', false)
      )
    )
    const batch = writeBatch(db)
    snap.docs.forEach(d => batch.update(d.ref, { read: true }))
    await batch.commit()
  } catch (err) {
    console.error('Failed to mark all notifications read:', err)
  }
}

export async function createNotification(data: Omit<AppNotification, 'id'>): Promise<void> {
  try {
    await addDoc(collection(db, COLLECTIONS.NOTIFICATIONS), {
      ...data,
      createdAt: serverTimestamp(),
    })
  } catch (err) {
    console.error('Failed to create notification:', err)
  }
}

// ─────────────────────────────────────────
// ANNUAL ARCHIVE
// ─────────────────────────────────────────

export async function getAnnualSummary(year: number): Promise<AnnualSummary | null> {
  try {
    const snap = await getDoc(doc(db, COLLECTIONS.ARCHIVE, String(year)))
    return snap.exists() ? (snap.data() as AnnualSummary) : null
  } catch (err) {
    console.error('Failed to get annual summary:', err)
    return null
  }
}

export async function saveAnnualSummary(summary: AnnualSummary): Promise<void> {
  try {
    const { setDoc } = await import('firebase/firestore')
    await setDoc(doc(db, COLLECTIONS.ARCHIVE, String(summary.year)), summary)
  } catch (err) {
    throw new Error(`Failed to save annual summary: ${err}`)
  }
}

// ─────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────

export async function getGlobalSettings(): Promise<GlobalSettings | null> {
  try {
    const snap = await getDoc(doc(db, COLLECTIONS.SETTINGS, 'global'))
    return snap.exists() ? (snap.data() as GlobalSettings) : null
  } catch (err) {
    console.error('Failed to get global settings:', err)
    return null
  }
}

// ─────────────────────────────────────────
// USER PREFERENCES
// ─────────────────────────────────────────

export async function updateUserPreferences(
  uid: string,
  prefs: Partial<import('../types').UserPreferences>
): Promise<void> {
  try {
    const updates: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(prefs)) {
      updates[`preferences.${key}`] = value
    }
    await updateDoc(doc(db, COLLECTIONS.USERS, uid), updates)
  } catch (err) {
    console.error('updateUserPreferences failed:', err)
  }
}

// ─────────────────────────────────────────
// TASK ATTACHMENTS
// ─────────────────────────────────────────

export async function updateTaskAttachments(
  taskId: string,
  attachments: import('../types').TaskAttachment[]
): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTIONS.TASKS, taskId), {
      attachments,
      updatedAt: serverTimestamp(),
    })
  } catch (err) {
    throw new Error(`Failed to update attachments: ${err}`)
  }
}

export async function updateAttachmentStatus(
  taskId: string,
  attachmentId: string,
  status: import('../types').AttachmentStatus
): Promise<void> {
  try {
    const taskRef = doc(db, COLLECTIONS.TASKS, taskId)
    const snap = await getDoc(taskRef)
    if (!snap.exists()) return
    const task = snap.data() as import('../types').Task
    const updated = task.attachments.map((a) =>
      a.id === attachmentId ? { ...a, status } : a
    )
    await updateDoc(taskRef, { attachments: updated, updatedAt: serverTimestamp() })
  } catch (err) {
    console.error('updateAttachmentStatus failed:', err)
  }
}

export async function verifyEmergencyKey(inputKey: string): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, COLLECTIONS.SETTINGS, 'emergency'))
    if (!snap.exists()) return false

    const { masterKeyHash } = snap.data() as { masterKeyHash: string }
    const { hashSHA256 } = await import('../utils/hashUtils')
    const inputHash = await hashSHA256(inputKey)
    return inputHash === masterKeyHash
  } catch (err) {
    console.error('Failed to verify emergency key:', err)
    return false
  }
}

// ─────────────────────────────────────────
// MY TASKS (assigned to current user)
// ─────────────────────────────────────────

export function subscribeToMyTasks(
  userId: string,
  callback: (tasks: Task[]) => void
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, COLLECTIONS.TASKS),
      where('assignees', 'array-contains', userId),
      orderBy('dateStart', 'asc')
    ),
    (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Task)),
    (err) => console.error('subscribeToMyTasks error:', err)
  )
}

// ─────────────────────────────────────────
// USER PRIVATE - My Space
// ─────────────────────────────────────────

// Notes
export function subscribeToPersonalNotes(
  userId: string,
  callback: (note: PersonalNote | null) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, COLLECTIONS.USER_PRIVATE, userId, 'notes', 'main'),
    (snap) => {
      if (snap.exists()) {
        callback({ id: snap.id, ...snap.data() } as PersonalNote)
      } else {
        callback(null)
      }
    },
    (err) => console.error('subscribeToPersonalNotes error:', err)
  )
}

export async function updatePersonalNotes(userId: string, content: string): Promise<void> {
  try {
    const { setDoc } = await import('firebase/firestore')
    await setDoc(
      doc(db, COLLECTIONS.USER_PRIVATE, userId, 'notes', 'main'),
      {
        content,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    )
  } catch (err) {
    console.error('updatePersonalNotes failed:', err)
    throw new Error(`Failed to save notes: ${err}`)
  }
}

// Personal Tasks
export function subscribeToPersonalTasks(
  userId: string,
  callback: (tasks: PersonalTask[]) => void
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, COLLECTIONS.USER_PRIVATE, userId, 'tasks'),
      orderBy('createdAt', 'desc')
    ),
    (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }) as PersonalTask)),
    (err) => console.error('subscribeToPersonalTasks error:', err)
  )
}

export async function createPersonalTask(
  userId: string,
  data: Omit<PersonalTask, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  try {
    const ref = await addDoc(
      collection(db, COLLECTIONS.USER_PRIVATE, userId, 'tasks'),
      {
        ...data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }
    )
    return ref.id
  } catch (err) {
    throw new Error(`Failed to create personal task: ${err}`)
  }
}

export async function updatePersonalTask(
  userId: string,
  taskId: string,
  data: Partial<Omit<PersonalTask, 'id'>>
): Promise<void> {
  try {
    await updateDoc(
      doc(db, COLLECTIONS.USER_PRIVATE, userId, 'tasks', taskId),
      {
        ...data,
        updatedAt: serverTimestamp(),
      }
    )
  } catch (err) {
    throw new Error(`Failed to update personal task: ${err}`)
  }
}

export async function deletePersonalTask(userId: string, taskId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, COLLECTIONS.USER_PRIVATE, userId, 'tasks', taskId))
  } catch (err) {
    throw new Error(`Failed to delete personal task: ${err}`)
  }
}

export async function togglePersonalTaskComplete(
  userId: string,
  taskId: string,
  completed: boolean
): Promise<void> {
  try {
    await updateDoc(
      doc(db, COLLECTIONS.USER_PRIVATE, userId, 'tasks', taskId),
      {
        completed,
        completedAt: completed ? serverTimestamp() : null,
        updatedAt: serverTimestamp(),
      }
    )
  } catch (err) {
    throw new Error(`Failed to update task completion: ${err}`)
  }
}

// Quick Links
export function subscribeToQuickLinks(
  userId: string,
  callback: (links: QuickLink[]) => void
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, COLLECTIONS.USER_PRIVATE, userId, 'links'),
      orderBy('createdAt', 'desc')
    ),
    (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }) as QuickLink)),
    (err) => console.error('subscribeToQuickLinks error:', err)
  )
}

export async function createQuickLink(
  userId: string,
  data: Omit<QuickLink, 'id' | 'createdAt'>
): Promise<string> {
  try {
    const ref = await addDoc(
      collection(db, COLLECTIONS.USER_PRIVATE, userId, 'links'),
      {
        ...data,
        createdAt: serverTimestamp(),
      }
    )
    return ref.id
  } catch (err) {
    throw new Error(`Failed to create quick link: ${err}`)
  }
}

export async function deleteQuickLink(userId: string, linkId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, COLLECTIONS.USER_PRIVATE, userId, 'links', linkId))
  } catch (err) {
    throw new Error(`Failed to delete quick link: ${err}`)
  }
}


// ─────────────────────────────────────────
// ARCHIVE SYSTEM
// ─────────────────────────────────────────

/**
 * Count completed tasks older than 12 months that are ready for archiving
 */
export async function getOldTasksToArchive(): Promise<number> {
  try {
    const { Timestamp: FBTimestamp } = await import('firebase/firestore')
    const twelveMonthsAgo = new Date()
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)
    
    const snap = await getDocs(
      query(
        collection(db, COLLECTIONS.TASKS),
        where('completed', '==', true),
        where('completedAt', '<', FBTimestamp.fromDate(twelveMonthsAgo))
      )
    )
    return snap.size
  } catch (err) {
    console.error('getOldTasksToArchive failed:', err)
    return 0
  }
}

/**
 * Archive completed tasks older than 12 months
 * Returns the number of tasks archived
 */
export async function archiveOldTasks(): Promise<number> {
  try {
    const { Timestamp: FBTimestamp } = await import('firebase/firestore')
    const twelveMonthsAgo = new Date()
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)
    
    // Get old completed tasks
    const snap = await getDocs(
      query(
        collection(db, COLLECTIONS.TASKS),
        where('completed', '==', true),
        where('completedAt', '<', FBTimestamp.fromDate(twelveMonthsAgo))
      )
    )
    
    if (snap.empty) return 0
    
    const tasks = snap.docs.map(d => ({ id: d.id, ...d.data() } as Task))
    const year = new Date().getFullYear()
    
    // Calculate summary stats
    const summary = {
      totalTasks: tasks.length,
      byBoard: {} as Record<string, number>,
      byClient: {} as Record<string, number>,
      byAssignee: {} as Record<string, number>,
      byMonth: Array(12).fill(0),
    }
    
    tasks.forEach(task => {
      // By board
      summary.byBoard[task.boardId] = (summary.byBoard[task.boardId] || 0) + 1
      
      // By client
      if (task.clientId) {
        summary.byClient[task.clientId] = (summary.byClient[task.clientId] || 0) + 1
      }
      
      // By assignee
      task.assignees?.forEach(uid => {
        summary.byAssignee[uid] = (summary.byAssignee[uid] || 0) + 1
      })
      
      // By month
      if (task.completedAt) {
        const month = task.completedAt.toDate().getMonth()
        summary.byMonth[month]++
      }
    })
    
    // Create archive document
    const archiveRef = doc(db, COLLECTIONS.ARCHIVE, year.toString())
    await setDoc(
      archiveRef,
      {
        year,
        generatedAt: serverTimestamp(),
        summary,
        taskCount: tasks.length,
      },
      { merge: true }
    )
    
    // Move tasks to archivedTasks subcollection and delete from tasks
    const batch = writeBatch(db)
    
    for (const task of tasks) {
      // Add to archivedTasks
      const archivedRef = doc(db, COLLECTIONS.ARCHIVE, year.toString(), 'archivedTasks', task.id)
      batch.set(archivedRef, {
        ...task,
        archivedAt: serverTimestamp(),
      })
      
      // Delete from tasks
      const taskRef = doc(db, COLLECTIONS.TASKS, task.id)
      batch.delete(taskRef)
    }
    
    await batch.commit()
    
    return tasks.length
  } catch (err) {
    console.error('archiveOldTasks failed:', err)
    throw new Error(`Failed to archive tasks: ${err}`)
  }
}




// ─── ARCHIVE QUERIES ─────────────────────────────────────────────────────────

export function subscribeToArchive(
  callback: (archives: AnnualSummary[]) => void
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, COLLECTIONS.ARCHIVE),
      orderBy('year', 'desc')
    ),
    (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }) as AnnualSummary)),
    (err) => console.error('subscribeToArchive error:', err)
  )
}

export async function getArchiveByYear(year: number): Promise<AnnualSummary | null> {
  try {
    const snap = await getDoc(doc(db, COLLECTIONS.ARCHIVE, year.toString()))
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as AnnualSummary) : null
  } catch (err) {
    console.error('getArchiveByYear failed:', err)
    return null
  }
}
