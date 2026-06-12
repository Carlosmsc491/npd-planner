// src/renderer/src/lib/requestsFirestore.ts
// Firestore operations for sample requests (teams → NPD pipeline).
// Creating a request atomically creates its linked task in the NPD Planner
// board (same batch) — the request is the team-facing view, the task is the
// NPD-facing view.

import {
  collection, doc, getDocs, query, where, orderBy, limit, onSnapshot,
  serverTimestamp, writeBatch, updateDoc, arrayUnion, Timestamp,
  Unsubscribe,
} from 'firebase/firestore'
import { db } from './firebase'
import type {
  AppUser, Board, SampleRequest, SampleRequestEvent, SampleRequestEventType,
  SampleRequestStatus, Task, Team,
} from '../types'
import { SAMPLE_REQUEST_STATUS_LABELS } from '../types'

export const REQUEST_COLLECTIONS = {
  SAMPLE_REQUESTS: 'sampleRequests',
  EVENTS:          'events',   // subcollection of each request
} as const

function eventsCol(requestId: string) {
  return collection(db, REQUEST_COLLECTIONS.SAMPLE_REQUESTS, requestId, REQUEST_COLLECTIONS.EVENTS)
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
  requestId: string,
  status: SampleRequestStatus,
  actor: AppUser
): Promise<void> {
  try {
    await updateDoc(doc(db, REQUEST_COLLECTIONS.SAMPLE_REQUESTS, requestId), {
      status, updatedAt: serverTimestamp(), updatedBy: actor.uid,
    })
    await logEvent(requestId, 'status_change',
      `${actor.name} moved the request to ${SAMPLE_REQUEST_STATUS_LABELS[status]}`, actor)
  } catch (err) {
    throw new Error(`Failed to update request status: ${err}`)
  }
}

/** Logistics fields filled by account managers (order, farm, AWB, ETA). */
export async function updateRequestLogistics(
  requestId: string,
  changes: Partial<Pick<SampleRequest, 'orderNumber' | 'farmInfo' | 'awbNumber' | 'eta'>>,
  actor: AppUser
): Promise<void> {
  try {
    await updateDoc(doc(db, REQUEST_COLLECTIONS.SAMPLE_REQUESTS, requestId), {
      ...changes, updatedAt: serverTimestamp(), updatedBy: actor.uid,
    })
    const fields = Object.keys(changes).join(', ')
    await logEvent(requestId, 'field_update', `${actor.name} updated ${fields}`, actor)
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
  requestId: string,
  managerUid: string,
  managerName: string,
  actor: AppUser
): Promise<void> {
  try {
    await updateDoc(doc(db, REQUEST_COLLECTIONS.SAMPLE_REQUESTS, requestId), {
      assignedManagers: arrayUnion(managerUid),
      updatedAt: serverTimestamp(),
      updatedBy: actor.uid,
    })
    await logEvent(requestId, 'assignment', `${actor.name} assigned ${managerName} as account manager`, actor)
  } catch (err) {
    throw new Error(`Failed to assign manager: ${err}`)
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
