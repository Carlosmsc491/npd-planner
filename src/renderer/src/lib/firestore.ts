// src/lib/firestore.ts
// All Firestore read/write operations for NPD Planner
// Every function has try/catch — never let Firestore errors crash silently

import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, setDoc,
  query, where, orderBy, onSnapshot, runTransaction, serverTimestamp,
  Unsubscribe, writeBatch, limit, getCountFromServer, Timestamp, arrayUnion
} from 'firebase/firestore'
import { db } from './firebase'
import type {
  AppUser, Board, BoardType, BoardProperty, Task, Client, Division, Label, Comment,
  TaskHistoryEntry, AppNotification, AnnualSummary,
  GlobalSettings, HistoryAction, ConflictData,
  PersonalNote, PersonalTask, QuickLink, TrashQueueItem, TrashItemStatus,
  AttachmentStatus, AreaPermissions, DateType, PendingApproval, CapturedPhoto
} from '../types'

// ─────────────────────────────────────────
// COLLECTION NAMES (single source of truth)
// ─────────────────────────────────────────
export const COLLECTIONS = {
  USERS:              'users',
  BOARDS:             'boards',
  TASKS:              'tasks',
  CLIENTS:            'clients',
  DIVISIONS:          'divisions',
  LABELS:             'labels',
  DATE_TYPES:         'dateTypes',
  COMMENTS:           'comments',
  HISTORY:            'taskHistory',
  NOTIFICATIONS:      'notifications',
  ARCHIVE:            'archive',
  SETTINGS:           'settings',
  USER_PRIVATE:       'userPrivate',
  TRASH:              'trashQueue',
  HISTORICAL_TASKS:   'historicalTasks',
  IMPORT_BATCHES:     'importBatches',
  PENDING_APPROVALS:  'pendingApprovals',
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

export async function createUser(uid: string, data: Omit<AppUser, 'uid'>): Promise<AppUser> {
  try {
    const { setDoc } = await import('firebase/firestore')
    const userData = { ...data, uid }
    await setDoc(doc(db, COLLECTIONS.USERS, uid), userData)
    return userData as AppUser
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

export async function updateUserPhotographerFlag(uid: string, isPhotographer: boolean): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTIONS.USERS, uid), { isPhotographer })
  } catch (err) {
    throw new Error(`Failed to update photographer flag: ${err}`)
  }
}

export async function updateUserAreaPermissions(
  uid: string,
  areaPermissions: AreaPermissions
): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTIONS.USERS, uid), {
      areaPermissions,
      updatedAt: serverTimestamp(),
    })
  } catch (err) {
    throw new Error(`Failed to update area permissions: ${err}`)
  }
}

export async function getDefaultPermissions(): Promise<AreaPermissions | null> {
  try {
    const snap = await getDoc(doc(db, COLLECTIONS.SETTINGS, 'defaultPermissions'))
    if (snap.exists()) {
      const data = snap.data()
      return (data.areaPermissions as AreaPermissions) ?? null
    }
    return null
  } catch (err) {
    console.error('getDefaultPermissions failed:', err)
    return null
  }
}

export async function saveDefaultPermissions(
  areaPermissions: AreaPermissions
): Promise<void> {
  try {
    await setDoc(doc(db, COLLECTIONS.SETTINGS, 'defaultPermissions'), {
      areaPermissions,
      updatedAt: serverTimestamp(),
    })
  } catch (err) {
    throw new Error(`Failed to save default permissions: ${err}`)
  }
}

export async function hasAnyAdmin(): Promise<boolean> {
  try {
    // Read the public bootstrap document — readable without authentication.
    // This avoids the permission error that occurs when querying `users` before login.
    const bootstrapSnap = await getDoc(doc(db, COLLECTIONS.SETTINGS, 'appBootstrap'))
    if (bootstrapSnap.exists()) {
      return bootstrapSnap.data()?.initialized === true
    }
    // Document doesn't exist → no owner registered yet → this is the first user.
    return false
  } catch {
    // Fail-safe: if we still can't read, assume admins exist → force awaiting approval.
    return true
  }
}

export async function markAppInitialized(): Promise<void> {
  try {
    await setDoc(doc(db, COLLECTIONS.SETTINGS, 'appBootstrap'), { initialized: true })
  } catch (err) {
    console.error('Failed to write appBootstrap:', err)
  }
}

export async function updateUserName(uid: string, name: string): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTIONS.USERS, uid), { name })
  } catch (err) {
    throw new Error(`Failed to update user name: ${err}`)
  }
}

export async function notifyAdminsOfPendingUser(newUser: AppUser): Promise<void> {
  try {
    // Find all active owners and admins
    const adminsSnapshot = await getDocs(
      query(
        collection(db, COLLECTIONS.USERS),
        where('role', 'in', ['owner', 'admin']),
        where('status', '==', 'active')
      )
    )

    // Create notification for each admin
    const notifications = adminsSnapshot.docs.map(adminDoc => {
      const adminId = adminDoc.id
      return createNotification({
        userId: adminId,
        type: 'new_user_pending',
        message: `${newUser.name} (${newUser.email}) has registered and is awaiting approval`,
        read: false,
        triggeredBy: newUser.uid,
        triggeredByName: newUser.name,
      } as Omit<AppNotification, 'id'>)
    })

    await Promise.all(notifications)
  } catch (err) {
    console.error('Failed to notify admins of pending user:', err)
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
    // Firestore rejects undefined values — strip them from every property object
    const sanitized = customProperties.map((p) => {
      const clean: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(p)) {
        if (v !== undefined) clean[k] = v
      }
      if (Array.isArray(clean.options)) {
        clean.options = (clean.options as Record<string, unknown>[]).map((opt) => {
          const o: Record<string, unknown> = {}
          for (const [k, v] of Object.entries(opt)) {
            if (v !== undefined) o[k] = v
          }
          return o
        })
      }
      return clean
    })
    await updateDoc(doc(db, COLLECTIONS.BOARDS, id), { customProperties: sanitized })
  } catch (err) {
    throw new Error(`Failed to update board properties: ${err}`)
  }
}

export async function updateBoardBucketOrder(
  boardId: string,
  bucketOrder: string[]
): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTIONS.BOARDS, boardId), { bucketOrder })
  } catch (err) {
    throw new Error(`Failed to update bucket order: ${err}`)
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
  return onSnapshot(
    doc(db, COLLECTIONS.TASKS, taskId),
    (snap) => {
      if (!snap.exists()) callback(null)
      else callback({ id: snap.id, ...snap.data() } as Task)
    },
    (err) => console.error('subscribeToTask error:', err)
  )
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
        .map(d => {
          const data = d.data()
          return {
            id: d.id,
            ...data,
            emailAttachments: (data['emailAttachments'] ?? []) as import('../types').EmailAttachment[],
          } as Task
        })
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

      // Notify on significant field changes for planner boards
      if (boardType === 'planner' && taskData.assignees?.length > 0) {
        const fieldLabels: Record<string, string> = {
          status: 'Status',
          priority: 'Priority',
          dateStart: 'Start date',
          dateEnd: 'Due date',
          bucket: 'Column'
        }

        if (field in fieldLabels && oldValue !== undefined) {
          shouldNotifyAssignees = true
          const fieldLabel = fieldLabels[field]
          const oldValStr = String(oldValue ?? '—')
          const newValStr = String(value ?? '—')
          notificationMessage = `${updatedByName} changed ${fieldLabel}: ${oldValStr} → ${newValStr}`
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
      // Type assertion needed because TypeScript narrows taskData incorrectly
      const t = taskData as Task
      // Determine who should be notified based on field type
      let uidsToNotify: string[] = []
      
      if (field === 'assignees') {
        // For assignee changes, only notify newly added assignees
        const newAssignees = (value as string[]) ?? []
        const oldAssignees = (oldValue as string[]) ?? []
        uidsToNotify = newAssignees.filter(uid => !oldAssignees.includes(uid))
      } else {
        // For other significant field changes, notify all current assignees
        uidsToNotify = t.assignees ?? []
      }
      
      for (const uid of uidsToNotify) {
        if (uid === updatedBy) continue // Don't notify the user who made the change
        try {
          await createNotification({
            userId: uid,
            taskId,
            taskTitle: t.title,
            boardId: t.boardId,
            boardType,
            type: field === 'assignees' ? 'assigned' : 'updated',
            message: notificationMessage,
            read: false,
            triggeredBy: updatedBy,
            triggeredByName: updatedByName,
          } as Omit<AppNotification, 'id'>)
        } catch (notifErr) {
          console.error('Failed to create notification:', notifErr)
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
          } as Omit<AppNotification, 'id'>)
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
// DIVISIONS
// ─────────────────────────────────────────

export function subscribeToDivisions(
  clientId: string,
  callback: (divisions: Division[]) => void
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, COLLECTIONS.DIVISIONS),
      where('clientId', '==', clientId),
      where('active', '==', true),
      orderBy('name')
    ),
    (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Division)),
    (err) => console.error('subscribeToDivisions error:', err)
  )
}

export function subscribeToAllDivisions(callback: (divisions: Division[]) => void): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, COLLECTIONS.DIVISIONS),
      where('active', '==', true),
      orderBy('name')
    ),
    (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Division)),
    (err) => console.error('subscribeToAllDivisions error:', err)
  )
}

export async function createDivision(
  data: Omit<Division, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  try {
    const ref = await addDoc(collection(db, COLLECTIONS.DIVISIONS), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return ref.id
  } catch (err) {
    throw new Error(`Failed to create division: ${err}`)
  }
}

export async function updateDivision(
  id: string,
  data: Partial<Pick<Division, 'name' | 'active'>>
): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTIONS.DIVISIONS, id), {
      ...data,
      updatedAt: serverTimestamp(),
    })
  } catch (err) {
    throw new Error(`Failed to update division: ${err}`)
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

export async function getComments(taskId: string): Promise<Comment[]> {
  try {
    const snap = await getDocs(query(
      collection(db, COLLECTIONS.COMMENTS),
      where('taskId', '==', taskId),
      orderBy('createdAt', 'asc')
    ))
    return snap.docs.map(d => ({ id: d.id, ...d.data() }) as Comment)
  } catch { return [] }
}

export async function getTaskHistory(taskId: string): Promise<TaskHistoryEntry[]> {
  try {
    const snap = await getDocs(query(
      collection(db, COLLECTIONS.HISTORY),
      where('taskId', '==', taskId),
      orderBy('timestamp', 'asc')
    ))
    return snap.docs.map(d => ({ id: d.id, ...d.data() }) as TaskHistoryEntry)
  } catch { return [] }
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

export async function updateGlobalSettings(
  changes: Partial<GlobalSettings>
): Promise<void> {
  try {
    await setDoc(
      doc(db, COLLECTIONS.SETTINGS, 'global'),
      changes,
      { merge: true }
    )
  } catch (err) {
    console.error('Failed to update global settings:', err)
    throw err
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
// PHOTO CAPTURE MODULE
// ─────────────────────────────────────────

const RECIPE_PROJECTS = 'recipeProjects'
const RECIPE_FILES    = 'recipeFiles'

export async function updateRecipePhotoStatus(
  recipeId: string,
  status: 'pending' | 'in_progress' | 'complete' | 'selected'
): Promise<void> {
  try {
    // recipeId is the full file.id compound key: "{projectId}::{encoded_path}"
    const projectId = recipeId.substring(0, recipeId.indexOf('::'))
    await updateDoc(doc(db, RECIPE_PROJECTS, projectId, RECIPE_FILES, recipeId), {
      photoStatus: status,
      updatedAt: serverTimestamp(),
    })
  } catch (err) {
    console.error('updateRecipePhotoStatus failed:', err)
    throw err
  }
}

export async function updateRecipePhotoSelections(
  recipeId: string,
  updatedPhotos: CapturedPhoto[],
  status: 'complete' | 'selected'
): Promise<void> {
  try {
    const projectId = recipeId.substring(0, recipeId.indexOf('::'))
    await updateDoc(doc(db, RECIPE_PROJECTS, projectId, RECIPE_FILES, recipeId), {
      capturedPhotos: updatedPhotos,
      photoStatus: status,
      updatedAt: serverTimestamp(),
    })
  } catch (err) {
    console.error('updateRecipePhotoSelections failed:', err)
    throw err
  }
}

export async function deleteCapturedPhoto(
  recipeId: string,
  remainingPhotos: CapturedPhoto[],
): Promise<void> {
  try {
    const projectId = recipeId.substring(0, recipeId.indexOf('::'))
    const newStatus = remainingPhotos.length === 0
      ? 'pending'
      : remainingPhotos.some(p => p.isSelected) ? 'selected' : 'in_progress'
    await updateDoc(doc(db, RECIPE_PROJECTS, projectId, RECIPE_FILES, recipeId), {
      capturedPhotos: remainingPhotos,
      photoStatus: newStatus,
      updatedAt: serverTimestamp(),
    })
  } catch (err) {
    console.error('deleteCapturedPhoto failed:', err)
    throw err
  }
}

export async function addCapturedPhoto(
  recipeId: string,
  photo: CapturedPhoto
): Promise<void> {
  try {
    const projectId = recipeId.substring(0, recipeId.indexOf('::'))
    await updateDoc(doc(db, RECIPE_PROJECTS, projectId, RECIPE_FILES, recipeId), {
      capturedPhotos: arrayUnion(photo),
      photoStatus: 'in_progress',
      updatedAt: serverTimestamp(),
    })
  } catch (err) {
    console.error('addCapturedPhoto failed:', err)
    throw err
  }
}

export async function updateRecipeReadyPaths(
  recipeId: string,
  pngPath: string,
  jpgPath: string,
  userId: string
): Promise<void> {
  try {
    const projectId = recipeId.substring(0, recipeId.indexOf('::'))
    await updateDoc(doc(db, RECIPE_PROJECTS, projectId, RECIPE_FILES, recipeId), {
      readyPngPath:       pngPath,
      readyJpgPath:       jpgPath,
      readyProcessedAt:   serverTimestamp(),
      readyProcessedBy:   userId,
      photoStatus:        'ready',
      updatedAt:          serverTimestamp(),
    })
  } catch (err) {
    console.error('updateRecipeReadyPaths failed:', err)
    throw err
  }
}

export async function updateRecipeCleanedPaths(
  recipeId: string,
  cleanedPaths: string[],
  status: 'needs_retouch' | 'done' | null,
  userId: string
): Promise<void> {
  try {
    const projectId = recipeId.substring(0, recipeId.indexOf('::'))
    await updateDoc(doc(db, RECIPE_PROJECTS, projectId, RECIPE_FILES, recipeId), {
      cleanedPhotoPaths:    cleanedPaths,
      cleanedPhotoStatus:   status,
      cleanedPhotoDroppedAt: serverTimestamp(),
      updatedBy:            userId,
      updatedAt:            serverTimestamp(),
    })
  } catch (err) {
    console.error('updateRecipeCleanedPaths failed:', err)
    throw err
  }
}

export async function updateRecipeExcelInserted(
  recipeId: string,
  userId: string
): Promise<void> {
  try {
    const projectId = recipeId.substring(0, recipeId.indexOf('::'))
    await updateDoc(doc(db, RECIPE_PROJECTS, projectId, RECIPE_FILES, recipeId), {
      excelInsertedAt: serverTimestamp(),
      excelInsertedBy: userId,
      updatedAt:       serverTimestamp(),
    })
  } catch (err) {
    console.error('updateRecipeExcelInserted failed:', err)
    throw err
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

// ─────────────────────────────────────────
// TRASH QUEUE (Soft delete with recovery)
// ─────────────────────────────────────────

export async function moveTaskToTrash(
  task: Task,
  sharePointFolderPath: string,
  deletedBy: string,
  deletedByName: string,
  retentionDays: number
): Promise<void> {
  try {
    const batch = writeBatch(db)
    const now = serverTimestamp()
    const scheduledDeleteAt = new Timestamp(
      Math.floor(Date.now() / 1000) + (retentionDays * 24 * 60 * 60),
      0
    )

    // Create trash queue item
    const trashRef = doc(collection(db, COLLECTIONS.TRASH))
    const trashItem: Omit<TrashQueueItem, 'id'> = {
      taskId: task.id,
      taskTitle: task.title,
      boardId: task.boardId,
      boardName: '', // Will be populated by caller
      clientName: '', // Will be populated by caller
      sharePointFolderPath,
      deletedBy,
      deletedByName,
      deletedAt: now as unknown as Timestamp,
      scheduledDeleteAt,
      status: 'pending',
      taskData: {
        title: task.title,
        description: task.description ?? null,
        clientId: task.clientId,
        boardId: task.boardId,
        assignees: task.assignees,
        labelIds: task.labelIds,
        status: task.status,
        priority: task.priority,
        bucket: task.bucket,
        dateStart: task.dateStart ?? null,
        dateEnd: task.dateEnd ?? null,
        poNumber: task.poNumber ?? null,
        poNumbers: task.poNumbers ?? null,
        awbs: task.awbs ?? null,
        subtasks: task.subtasks ?? [],
        recurring: task.recurring ?? null,
        customFields: task.customFields ?? null,
      },
      attachments: task.attachments.map(a => ({
        id: a.id,
        name: a.name,
        relativePath: a.sharePointRelativePath,
        sizeBytes: a.sizeBytes,
        mimeType: a.mimeType,
      })),
    }
    batch.set(trashRef, { ...trashItem, id: trashRef.id })

    // Delete the original task
    batch.delete(doc(db, COLLECTIONS.TASKS, task.id))

    // Log in history
    const historyRef = doc(collection(db, COLLECTIONS.HISTORY))
    batch.set(historyRef, {
      taskId: task.id,
      userId: deletedBy,
      userName: deletedByName,
      action: 'deleted' as HistoryAction,
      field: null,
      oldValue: null,
      newValue: null,
      timestamp: now,
    })

    await batch.commit()
  } catch (err) {
    throw new Error(`Failed to move task to trash: ${err}`)
  }
}

export async function restoreTaskFromTrash(trashId: string): Promise<void> {
  try {
    const trashRef = doc(db, COLLECTIONS.TRASH, trashId)
    const trashSnap = await getDoc(trashRef)
    
    if (!trashSnap.exists()) {
      throw new Error('Trash item not found')
    }
    
    const trashItem = trashSnap.data() as TrashQueueItem
    
    if (trashItem.status !== 'pending') {
      throw new Error('Task cannot be restored')
    }

    const batch = writeBatch(db)

    // Recreate the task
    const taskRef = doc(db, COLLECTIONS.TASKS, trashItem.taskId)
    const restoredTask: Task = {
      id: trashItem.taskId,
      ...trashItem.taskData,
      emailAttachments: [],
      attachments: trashItem.attachments.map(a => ({
        id: a.id,
        name: a.name,
        sharePointRelativePath: a.relativePath,
        uploadedBy: trashItem.deletedBy,
        uploadedAt: trashItem.deletedAt,
        status: 'synced' as AttachmentStatus,
        sizeBytes: a.sizeBytes,
        mimeType: a.mimeType,
      })),
      notes: '',
      completed: false,
      completedAt: null,
      completedBy: null,
      createdBy: trashItem.deletedBy,
      createdAt: serverTimestamp() as unknown as Timestamp,
      updatedAt: serverTimestamp() as unknown as Timestamp,
      updatedBy: trashItem.deletedBy,
    }
    
    batch.set(taskRef, restoredTask)

    // Mark trash item as restored
    batch.update(trashRef, { 
      status: 'restored',
      restoredAt: serverTimestamp(),
    })

    await batch.commit()
  } catch (err) {
    throw new Error(`Failed to restore task: ${err}`)
  }
}

export async function permanentDeleteTrashItem(trashId: string): Promise<string | null> {
  try {
    const trashRef = doc(db, COLLECTIONS.TRASH, trashId)
    const trashSnap = await getDoc(trashRef)
    
    if (!trashSnap.exists()) {
      return null
    }
    
    const trashItem = trashSnap.data() as TrashQueueItem
    
    if (trashItem.status !== 'pending') {
      return null
    }

    // Update status to deleted
    await updateDoc(trashRef, { status: 'deleted' })
    
    return trashItem.sharePointFolderPath
  } catch (err) {
    console.error('Failed to permanent delete trash item:', err)
    throw new Error(`Failed to permanent delete: ${err}`)
  }
}

export function subscribeToTrashQueue(
  callback: (items: TrashQueueItem[]) => void
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, COLLECTIONS.TRASH),
      where('status', 'in', ['pending', 'failed'])
    ),
    (snap) => {
      const items = snap.docs
        .map(d => ({ ...d.data(), id: d.id }) as TrashQueueItem)
        .sort((a, b) => b.deletedAt.toMillis() - a.deletedAt.toMillis())
      callback(items)
    },
    (err) => console.error('subscribeToTrashQueue error:', err)
  )
}

export async function getTrashItemsDueForDeletion(): Promise<TrashQueueItem[]> {
  try {
    const now = Timestamp.now()
    const snap = await getDocs(
      query(
        collection(db, COLLECTIONS.TRASH),
        where('status', '==', 'pending'),
        where('scheduledDeleteAt', '<=', now)
      )
    )
    return snap.docs.map(d => ({ ...d.data(), id: d.id }) as TrashQueueItem)
  } catch (err) {
    console.error('Failed to get trash items due for deletion:', err)
    return []
  }
}

export async function updateTrashItemStatus(
  trashId: string, 
  status: TrashItemStatus
): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTIONS.TRASH, trashId), { status })
  } catch (err) {
    console.error('Failed to update trash item status:', err)
  }
}

// ─────────────────────────────────────────
// HISTORICAL TASKS (Microsoft Planner Import)
// ─────────────────────────────────────────

import type { HistoricalTask, ImportBatch } from '../types'

export async function createHistoricalTasks(tasks: HistoricalTask[]): Promise<void> {
  try {
    const batch = writeBatch(db)
    for (const task of tasks) {
      // Use the provided ID (generated by nanoid) instead of auto-generating one
      const ref = doc(db, COLLECTIONS.HISTORICAL_TASKS, task.id)
      batch.set(ref, task)
    }
    await batch.commit()
  } catch (err) {
    throw new Error(`Failed to create historical tasks: ${err}`)
  }
}

export async function createImportBatch(batch: Omit<ImportBatch, 'id'>): Promise<string> {
  try {
    const ref = await addDoc(collection(db, COLLECTIONS.IMPORT_BATCHES), batch)
    return ref.id
  } catch (err) {
    throw new Error(`Failed to create import batch: ${err}`)
  }
}

export async function getHistoricalTasks(
  filters: { year?: number; clientId?: string; importBatchId?: string } = {}
): Promise<HistoricalTask[]> {
  try {
    const constraints: ReturnType<typeof where>[] = []
    
    if (filters.year !== undefined) {
      constraints.push(where('year', '==', filters.year))
    }
    if (filters.clientId !== undefined) {
      constraints.push(where('clientId', '==', filters.clientId))
    }
    if (filters.importBatchId !== undefined) {
      constraints.push(where('importBatchId', '==', filters.importBatchId))
    }
    
    // Try with ordering first (requires composite index)
    try {
      const snap = await getDocs(
        query(
          collection(db, COLLECTIONS.HISTORICAL_TASKS),
          ...constraints,
          orderBy('createdAt', 'desc')
        )
      )
      return snap.docs.map(d => ({ id: d.id, ...d.data() }) as HistoricalTask)
    } catch (indexErr: unknown) {
      // If index error, fallback to query without ordering
      const errMsg = String((indexErr as { message?: string }).message || '')
      if (errMsg.includes('index')) {
        console.warn('Firestore index missing, fetching without order. Create index at:', errMsg)
        const snap = await getDocs(
          query(
            collection(db, COLLECTIONS.HISTORICAL_TASKS),
            ...constraints
          )
        )
        // Sort client-side as fallback
        const tasks = snap.docs.map(d => ({ id: d.id, ...d.data() }) as HistoricalTask)
        return tasks.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())
      }
      throw indexErr
    }
  } catch (err) {
    console.error('getHistoricalTasks failed:', err)
    return []
  }
}

export async function getImportBatches(): Promise<ImportBatch[]> {
  try {
    const snap = await getDocs(
      query(
        collection(db, COLLECTIONS.IMPORT_BATCHES),
        orderBy('importedAt', 'desc')
      )
    )
    return snap.docs.map(d => ({ id: d.id, ...d.data() }) as ImportBatch)
  } catch (err) {
    console.error('getImportBatches failed:', err)
    return []
  }
}

export async function deleteImportBatch(batchId: string): Promise<void> {
  try {
    const batch = writeBatch(db)
    
    // Delete all tasks associated with this batch
    const tasksSnap = await getDocs(
      query(
        collection(db, COLLECTIONS.HISTORICAL_TASKS),
        where('importBatchId', '==', batchId)
      )
    )
    tasksSnap.docs.forEach(d => batch.delete(d.ref))
    
    // Delete the batch document
    batch.delete(doc(db, COLLECTIONS.IMPORT_BATCHES, batchId))
    
    await batch.commit()
  } catch (err) {
    throw new Error(`Failed to delete import batch: ${err}`)
  }
}

// ─────────────────────────────────────────
// DATE TYPES
// ─────────────────────────────────────────

const DEFAULT_DATE_TYPES: Omit<DateType, 'id' | 'createdAt'>[] = [
  { key: 'preparation', label: 'Preparation', icon: 'Hammer',  color: '#639922', order: 0 },
  { key: 'ship',        label: 'Ship date',   icon: 'Truck',   color: '#185FA5', order: 1 },
  { key: 'set_up',      label: 'Set up',      icon: 'Wrench',  color: '#534AB7', order: 2 },
  { key: 'show_day',    label: 'Show day',    icon: 'Star',    color: '#BA7517', order: 3 },
]

export async function seedDefaultDateTypes(): Promise<void> {
  try {
    const col = collection(db, COLLECTIONS.DATE_TYPES)
    const snap = await getDocs(col)
    if (!snap.empty) return   // already seeded
    const batch = writeBatch(db)
    for (const dt of DEFAULT_DATE_TYPES) {
      const ref = doc(col)
      batch.set(ref, { ...dt, createdAt: serverTimestamp() })
    }
    await batch.commit()
  } catch (err) {
    console.error('seedDefaultDateTypes failed:', err)
    // Don't throw - this is non-critical
  }
}

export function subscribeToDateTypes(
  callback: (types: DateType[]) => void
): Unsubscribe {
  const col = collection(db, COLLECTIONS.DATE_TYPES)
  const q = query(col, orderBy('order', 'asc'))
  
  let unsubscribeCalled = false
  let unsub: Unsubscribe | undefined
  
  // Delay subscription slightly to avoid race conditions during rapid mount/unmount
  const timeoutId = setTimeout(() => {
    if (unsubscribeCalled) return
    
    try {
      unsub = onSnapshot(q, (snap) => {
        if (unsubscribeCalled) return
        try {
          const types = snap.docs.map((d) => ({ id: d.id, ...d.data() } as DateType))
          callback(types)
        } catch (err) {
          console.error('subscribeToDateTypes callback error:', err)
        }
      }, (err) => {
        // Silently ignore internal Firestore errors during unmount
        if (err.message?.includes('INTERNAL ASSERTION FAILED')) return
        console.error('subscribeToDateTypes error:', err)
      })
    } catch (err) {
      console.error('Failed to create dateTypes subscription:', err)
    }
  }, 10)
  
  return () => {
    unsubscribeCalled = true
    clearTimeout(timeoutId)
    // Delay unsubscribe to avoid Firestore internal error
    setTimeout(() => {
      if (unsub) {
        try {
          unsub()
        } catch (err) {
          // Ignore errors during unsubscribe
        }
      }
    }, 50)
  }
}

export async function createDateType(
  data: Omit<DateType, 'id' | 'createdAt'>
): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTIONS.DATE_TYPES), {
    ...data,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateDateType(
  id: string,
  data: Partial<Pick<DateType, 'label' | 'icon' | 'color' | 'order'>>
): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS.DATE_TYPES, id), data)
}

export async function deleteDateType(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.DATE_TYPES, id))
}

// ─────────────────────────────────────────
// PENDING APPROVALS
// ─────────────────────────────────────────

export async function createPendingApproval(
  uid: string,
  displayName: string,
  email: string
): Promise<void> {
  await setDoc(doc(db, COLLECTIONS.PENDING_APPROVALS, uid), {
    uid,
    displayName,
    email,
    registeredAt: serverTimestamp(),
    reviewingBy: null,
  })
}

export async function deletePendingApproval(uid: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.PENDING_APPROVALS, uid))
}

export async function setReviewingBy(
  uid: string,
  reviewerUid: string | null
): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS.PENDING_APPROVALS, uid), { reviewingBy: reviewerUid })
}

export function subscribePendingApprovals(
  callback: (approvals: PendingApproval[]) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, COLLECTIONS.PENDING_APPROVALS),
    (snap) => {
      const approvals = snap.docs.map((d) => d.data() as PendingApproval)
      callback(approvals)
    },
    (err) => console.warn('subscribePendingApprovals error (requires admin):', err)
  )
}

// ─────────────────────────────────────────
// USER APPROVAL / REJECTION
// ─────────────────────────────────────────

export async function approveUser(
  uid: string,
  role: 'member' | 'admin',
  areaPermissions: AreaPermissions
): Promise<void> {
  await Promise.all([
    updateDoc(doc(db, COLLECTIONS.USERS, uid), {
      status: 'active',
      role,
      areaPermissions,
    }),
    deletePendingApproval(uid),
  ])
}

export async function rejectUser(uid: string): Promise<void> {
  await Promise.all([
    updateDoc(doc(db, COLLECTIONS.USERS, uid), { status: 'rejected' }),
    deletePendingApproval(uid),
  ])
}

export async function updateAreaPermissions(
  uid: string,
  areaPermissions: AreaPermissions
): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS.USERS, uid), { areaPermissions })
}

// ─────────────────────────────────────────
// CRASH REPORTS
// Flow: save to Firestore (temp) → notify owners → save locally → delete from Firestore
// ─────────────────────────────────────────

const CRASH_REPORTS = 'crashReports'

export async function saveCrashReport(
  report: Omit<import('../types').CrashReport, 'id' | 'timestamp'>
): Promise<string> {
  const docRef = await addDoc(collection(db, CRASH_REPORTS), {
    ...report,
    timestamp: serverTimestamp(),
  })
  return docRef.id
}

export async function deleteCrashReport(id: string): Promise<void> {
  await deleteDoc(doc(db, CRASH_REPORTS, id))
}

/** Creates a notification for every active owner so they know about the crash. */
export async function notifyOwnersCrashReport(
  message: string,
  triggeredBy: string,
  triggeredByName: string
): Promise<void> {
  const q = query(
    collection(db, COLLECTIONS.USERS),
    where('role', '==', 'owner'),
    where('status', '==', 'active')
  )
  const snap = await getDocs(q)
  if (snap.empty) return

  const batch = writeBatch(db)
  snap.docs.forEach(userDoc => {
    const notifRef = doc(collection(db, COLLECTIONS.NOTIFICATIONS))
    batch.set(notifRef, {
      userId: userDoc.id,
      type: 'crash_report',
      message,
      read: false,
      createdAt: serverTimestamp(),
      triggeredBy,
      triggeredByName,
    })
  })
  await batch.commit()
}
