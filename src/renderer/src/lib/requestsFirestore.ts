// src/renderer/src/lib/requestsFirestore.ts
// Firestore operations for sample requests (teams → NPD pipeline).
// Creating a request atomically creates its linked task in the NPD Planner
// board (same batch) — the request is the team-facing view, the task is the
// NPD-facing view.

import {
  collection, doc, getDoc, getDocs, query, where, orderBy, limit, onSnapshot,
  serverTimestamp, writeBatch, updateDoc, arrayUnion, deleteDoc, Timestamp,
  Unsubscribe,
} from 'firebase/firestore'
import { db } from './firebase'
import { createNotification } from './firestore'
import { requestParticipantUids, newRequestRecipients } from './requestNotifications'
import type {
  AppNotification, AppUser, Board, NotificationType, SampleRequest,
  SampleRequestComment, SampleRequestEvent, SampleRequestEventType,
  SampleRequestStatus, Task, Team,
} from '../types'
import { SAMPLE_REQUEST_STATUS_LABELS } from '../types'

export const REQUEST_COLLECTIONS = {
  SAMPLE_REQUESTS: 'sampleRequests',
  EVENTS:          'events',     // subcollection of each request
  COMMENTS:        'comments',   // subcollection of each request
} as const

function eventsCol(requestId: string) {
  return collection(db, REQUEST_COLLECTIONS.SAMPLE_REQUESTS, requestId, REQUEST_COLLECTIONS.EVENTS)
}

function commentsCol(requestId: string) {
  return collection(db, REQUEST_COLLECTIONS.SAMPLE_REQUESTS, requestId, REQUEST_COLLECTIONS.COMMENTS)
}

// ─────────────────────────────────────────
// IN-APP NOTIFICATIONS
// ─────────────────────────────────────────

/** Fan-out one in-app notification per recipient. Failures are logged, never
 *  thrown — a notification must not break the main write. */
async function notifyUids(
  uids: string[],
  requestId: string,
  type: NotificationType,
  message: string,
  actor: AppUser
): Promise<void> {
  for (const uid of uids) {
    try {
      await createNotification({
        userId: uid,
        requestId,
        type,
        message,
        read: false,
        triggeredBy: actor.uid,
        triggeredByName: actor.name,
      } as Omit<AppNotification, 'id'>)
    } catch (err) {
      console.error('request notification failed:', err)
    }
  }
}

/** NPD admins/owners — recipients for newly filed requests. */
async function getAdminUids(): Promise<string[]> {
  try {
    const snap = await getDocs(
      query(collection(db, 'users'), where('role', 'in', ['admin', 'owner']))
    )
    return snap.docs.map((d) => d.id)
  } catch (err) {
    console.error('getAdminUids failed:', err)
    return []
  }
}

// ─────────────────────────────────────────
// CREATE (request + linked Planner task)
// ─────────────────────────────────────────

export interface NewSampleRequestInput {
  team: Team
  bucket: string
  title: string
  description: string
  needByDate: Timestamp | null
  shipDate: Timestamp | null
}

/** Finds the NPD Planner board (type 'planner'). */
async function getPlannerBoard(): Promise<Board> {
  const snap = await getDocs(
    query(collection(db, 'boards'), where('type', '==', 'planner'), limit(1))
  )
  if (snap.empty) throw new Error('No Planner board found — cannot link the request')
  return { ...(snap.docs[0].data() as Omit<Board, 'id'>), id: snap.docs[0].id }
}

/**
 * Creates the sample request AND its linked task in one batch. The task lands
 * in the Planner board under the team's client and the chosen bucket, carrying
 * sourceTeamId/sourceRequestId so rules authorize the team-side create.
 */
export async function createSampleRequest(
  input: NewSampleRequestInput,
  creator: AppUser
): Promise<string> {
  try {
    const board = await getPlannerBoard()
    const requestRef = doc(collection(db, REQUEST_COLLECTIONS.SAMPLE_REQUESTS))
    const taskRef = doc(collection(db, 'tasks'))

    const task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'> = {
      boardId: board.id,
      title: input.title,
      clientId: input.team.clientId ?? '',
      status: 'todo',
      priority: 'normal',
      assignees: [],
      labelIds: [],
      bucket: input.bucket,
      dateStart: null,
      dateEnd: input.needByDate,
      description: input.description,
      notes: '',
      poNumber: '',
      poNumbers: [],
      poEntries: [],
      awbs: [],
      subtasks: [],
      sharePointFolderName: null,
      attachments: [],
      emailAttachments: [],
      recurring: null,
      completed: false,
      completedAt: null,
      completedBy: null,
      sourceTeamId: input.team.id,
      sourceRequestId: requestRef.id,
      createdBy: creator.uid,
      updatedBy: creator.uid,
    }

    const request: Omit<SampleRequest, 'id' | 'createdAt' | 'updatedAt'> = {
      teamId: input.team.id,
      teamName: input.team.name,
      clientId: input.team.clientId,
      bucket: input.bucket,
      title: input.title,
      description: input.description,
      needByDate: input.needByDate,
      shipDate: input.shipDate,
      status: 'submitted',
      createdBy: creator.uid,
      createdByName: creator.name,
      assignedManagers: [],
      helpers: [],
      orderNumber: '',
      farmInfo: '',
      awbNumber: '',
      eta: '',
      linkedTaskId: taskRef.id,
      updatedBy: creator.uid,
    }

    const batch = writeBatch(db)
    batch.set(requestRef, { ...request, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
    batch.set(taskRef, { ...task, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
    batch.set(doc(eventsCol(requestRef.id)), {
      type: 'created' satisfies SampleRequestEventType,
      message: `Request submitted by ${creator.name} (${input.bucket})`,
      userId: creator.uid,
      userName: creator.name,
      createdAt: serverTimestamp(),
    })
    await batch.commit()

    // NPD triages the incoming queue — notify admins/owners
    const admins = await getAdminUids()
    await notifyUids(
      newRequestRecipients(admins, creator.uid),
      requestRef.id,
      'updated',
      `New sample request from ${input.team.name}: "${input.title}"`,
      creator
    )
    return requestRef.id
  } catch (err) {
    throw new Error(`Failed to create sample request: ${err}`)
  }
}

// ─────────────────────────────────────────
// UPDATES (+ append-only event trail)
// ─────────────────────────────────────────

async function logEvent(
  requestId: string,
  type: SampleRequestEventType,
  message: string,
  actor: AppUser
): Promise<void> {
  const batch = writeBatch(db)
  batch.set(doc(eventsCol(requestId)), {
    type, message, userId: actor.uid, userName: actor.name, createdAt: serverTimestamp(),
  })
  await batch.commit()
}

export async function updateRequestStatus(
  req: SampleRequest,
  status: SampleRequestStatus,
  actor: AppUser
): Promise<void> {
  try {
    await updateDoc(doc(db, REQUEST_COLLECTIONS.SAMPLE_REQUESTS, req.id), {
      status, updatedAt: serverTimestamp(), updatedBy: actor.uid,
    })
    const message = `${actor.name} moved the request to ${SAMPLE_REQUEST_STATUS_LABELS[status]}`
    await logEvent(req.id, 'status_change', message, actor)
    await notifyUids(
      requestParticipantUids(req, actor.uid),
      req.id,
      status === 'completed' ? 'completed' : 'updated',
      `"${req.title}": ${message}`,
      actor
    )
  } catch (err) {
    throw new Error(`Failed to update request status: ${err}`)
  }
}

/** Logistics fields filled by account managers (order, farm, AWB, ETA). */
export async function updateRequestLogistics(
  req: SampleRequest,
  changes: Partial<Pick<SampleRequest, 'orderNumber' | 'farmInfo' | 'awbNumber' | 'eta'>>,
  actor: AppUser
): Promise<void> {
  try {
    await updateDoc(doc(db, REQUEST_COLLECTIONS.SAMPLE_REQUESTS, req.id), {
      ...changes, updatedAt: serverTimestamp(), updatedBy: actor.uid,
    })
    const fields = Object.keys(changes).join(', ')
    await logEvent(req.id, 'field_update', `${actor.name} updated ${fields}`, actor)
    await notifyUids(
      requestParticipantUids(req, actor.uid),
      req.id,
      'updated',
      `"${req.title}": ${actor.name} updated logistics (${fields})`,
      actor
    )
  } catch (err) {
    throw new Error(`Failed to update request logistics: ${err}`)
  }
}

/** Core fields editable by the creator while status is 'submitted'. */
export async function updateRequestCore(
  requestId: string,
  changes: Partial<Pick<SampleRequest, 'title' | 'description' | 'bucket' | 'needByDate' | 'shipDate'>>,
  actor: AppUser
): Promise<void> {
  try {
    await updateDoc(doc(db, REQUEST_COLLECTIONS.SAMPLE_REQUESTS, requestId), {
      ...changes, updatedAt: serverTimestamp(), updatedBy: actor.uid,
    })
    await logEvent(requestId, 'field_update', `${actor.name} edited the request details`, actor)
  } catch (err) {
    throw new Error(`Failed to update request: ${err}`)
  }
}

export async function assignRequestManager(
  req: SampleRequest,
  managerUid: string,
  managerName: string,
  actor: AppUser
): Promise<void> {
  try {
    await updateDoc(doc(db, REQUEST_COLLECTIONS.SAMPLE_REQUESTS, req.id), {
      assignedManagers: arrayUnion(managerUid),
      updatedAt: serverTimestamp(),
      updatedBy: actor.uid,
    })
    await logEvent(req.id, 'assignment', `${actor.name} assigned ${managerName} as account manager`, actor)
    await notifyUids([managerUid], req.id, 'assigned',
      `${actor.name} assigned you to "${req.title}" (${req.teamName})`, actor)
  } catch (err) {
    throw new Error(`Failed to assign manager: ${err}`)
  }
}

// ─────────────────────────────────────────
// COMMENTS
// ─────────────────────────────────────────

export async function addRequestComment(
  req: SampleRequest,
  text: string,
  actor: AppUser
): Promise<void> {
  try {
    const batch = writeBatch(db)
    batch.set(doc(commentsCol(req.id)), {
      authorId: actor.uid,
      authorName: actor.name,
      text,
      createdAt: serverTimestamp(),
    })
    await batch.commit()
    await notifyUids(
      requestParticipantUids(req, actor.uid),
      req.id,
      'comment',
      `${actor.name} commented on "${req.title}"`,
      actor
    )
  } catch (err) {
    throw new Error(`Failed to add comment: ${err}`)
  }
}

export async function deleteRequestComment(requestId: string, commentId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, REQUEST_COLLECTIONS.SAMPLE_REQUESTS, requestId, REQUEST_COLLECTIONS.COMMENTS, commentId))
  } catch (err) {
    throw new Error(`Failed to delete comment: ${err}`)
  }
}

export function subscribeToRequestComments(
  requestId: string,
  callback: (comments: SampleRequestComment[]) => void
): Unsubscribe {
  return onSnapshot(
    query(commentsCol(requestId), orderBy('createdAt', 'asc')),
    (snap) => callback(snap.docs.map((d) => ({ ...(d.data() as Omit<SampleRequestComment, 'id'>), id: d.id }))),
    (err) => console.error('subscribeToRequestComments error:', err)
  )
}

/** Emails for the manual update email (creator + assigned managers). */
export async function getRequestParticipantEmails(req: SampleRequest): Promise<string[]> {
  try {
    const uids = [...new Set([req.createdBy, ...req.assignedManagers])].slice(0, 10)
    if (uids.length === 0) return []
    const snap = await getDocs(query(collection(db, 'users'), where('uid', 'in', uids)))
    return snap.docs.map((d) => (d.data() as AppUser).email)
  } catch (err) {
    console.error('getRequestParticipantEmails failed:', err)
    return []
  }
}

// ─────────────────────────────────────────
// TASK → REQUEST SYNC
// ─────────────────────────────────────────

/**
 * Closes the loop: when NPD completes the linked Planner task, the request
 * moves to 'completed', the timeline records it and everyone involved gets
 * notified (this is the "report copy" signal to the sales person).
 * Called from completeTask() via dynamic import — never throws.
 */
export async function completeLinkedRequest(requestId: string, actor: AppUser): Promise<void> {
  try {
    const snap = await getDoc(doc(db, REQUEST_COLLECTIONS.SAMPLE_REQUESTS, requestId))
    if (!snap.exists()) return
    const req = { ...(snap.data() as Omit<SampleRequest, 'id'>), id: snap.id }
    if (req.status === 'completed' || req.status === 'cancelled') return

    await updateDoc(snap.ref, {
      status: 'completed' satisfies SampleRequestStatus,
      updatedAt: serverTimestamp(),
      updatedBy: actor.uid,
    })
    await logEvent(requestId, 'status_change',
      `NPD completed the task — request finished by ${actor.name}`, actor)
    await notifyUids(
      requestParticipantUids(req, actor.uid),
      requestId,
      'completed',
      `"${req.title}" is completed — open Requests to see the full follow-up`,
      actor
    )
  } catch (err) {
    // Sync must never break task completion (e.g. non-admin completer)
    console.error('completeLinkedRequest failed:', err)
  }
}

// ─────────────────────────────────────────
// SUBSCRIPTIONS (all scoped — free-tier quota)
// ─────────────────────────────────────────

function mapRequests(docs: { id: string; data: () => unknown }[]): SampleRequest[] {
  return docs.map((d) => ({ ...(d.data() as Omit<SampleRequest, 'id'>), id: d.id }))
}

/** NPD admin view: everything, newest first. */
export function subscribeToAllRequests(callback: (reqs: SampleRequest[]) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, REQUEST_COLLECTIONS.SAMPLE_REQUESTS), orderBy('createdAt', 'desc')),
    (snap) => callback(mapRequests(snap.docs)),
    (err) => console.error('subscribeToAllRequests error:', err)
  )
}

/** Sales view: requests I created. */
export function subscribeToMyRequests(
  uid: string,
  callback: (reqs: SampleRequest[]) => void
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, REQUEST_COLLECTIONS.SAMPLE_REQUESTS),
      where('createdBy', '==', uid),
      orderBy('createdAt', 'desc')
    ),
    (snap) => callback(mapRequests(snap.docs)),
    (err) => console.error('subscribeToMyRequests error:', err)
  )
}

/** Account manager / helper view: requests assigned to me. */
export function subscribeToAssignedRequests(
  uid: string,
  callback: (reqs: SampleRequest[]) => void
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, REQUEST_COLLECTIONS.SAMPLE_REQUESTS),
      where('assignedManagers', 'array-contains', uid),
      orderBy('createdAt', 'desc')
    ),
    (snap) => callback(mapRequests(snap.docs)),
    (err) => console.error('subscribeToAssignedRequests error:', err)
  )
}

/** Event timeline for one open request (detail view only — unsubscribe on close). */
export function subscribeToRequestEvents(
  requestId: string,
  callback: (events: SampleRequestEvent[]) => void
): Unsubscribe {
  return onSnapshot(
    query(eventsCol(requestId), orderBy('createdAt', 'asc')),
    (snap) => callback(snap.docs.map((d) => ({ ...(d.data() as Omit<SampleRequestEvent, 'id'>), id: d.id }))),
    (err) => console.error('subscribeToRequestEvents error:', err)
  )
}
