// Talks to Firestore + Storage for Field Check visits, and owns the
// offline retry loop (task E: "encola la visita si no hay red; reintenta al
// recuperar conexion").
//
// submitVisit() and retryQueuedVisits() share the exact same
// uploadAllAndWrite() code path — a fresh submit is just "an item that
// happens to succeed on the first try without ever touching IndexedDB".
// That keeps the Firestore payload shape defined in exactly one place.

import { doc, setDoc, Timestamp } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../firebase'
import type { FieldPhoto, FieldVisitSection } from '../types'
import type { QueuedVisit } from './fieldCheckDb'
import { enqueueVisit, listQueuedVisits, removeQueuedVisit, updateQueuedVisit } from './fieldCheckDb'

// Mirrors the desktop SharePoint attachment retry-queue cadence (CLAUDE.md
// Phase 6: "Retry queue (every 30 seconds) for failed copies") for consistency.
const RETRY_INTERVAL_MS = 30_000

export type SubmitOutcome = 'sent' | 'queued'

async function uploadPhoto(
  visitId: string,
  sectionKey: string,
  photoId: string,
  blob: Blob,
  width: number,
  height: number
): Promise<FieldPhoto> {
  const path = `fieldVisits/${visitId}/${sectionKey}/${photoId}.jpg`
  const storageRef = ref(storage, path)
  await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' })
  const remoteUrl = await getDownloadURL(storageRef)
  return {
    gscPhotoId: photoId,
    remoteUrl,
    localPath: null,
    downloadedAt: null,
    width,
    height,
  }
}

async function uploadAllAndWrite(item: QueuedVisit): Promise<void> {
  const sections: FieldVisitSection[] = []
  for (const s of item.sections) {
    const photos: FieldPhoto[] = []
    for (const p of s.photos) {
      // Sequential, not Promise.all — deliberate. Uploads on a merchandiser's
      // mobile data connection are the failure mode this whole queue exists
      // for; keeping concurrency low avoids stalling every upload on the
      // slowest one and makes partial progress on retry more predictable.
      photos.push(await uploadPhoto(item.visitId, s.key, p.photoId, p.blob, p.width, p.height))
    }
    sections.push({
      key: s.key,
      label: s.label,
      notes: s.notes,
      parsedPrices: s.parsedPrices as FieldVisitSection['parsedPrices'],
      photos,
    })
  }

  await setDoc(doc(db, 'fieldVisits', item.visitId), {
    missionId: item.base.missionId,
    missionName: item.base.missionName,
    placeId: item.base.placeId,
    customPlaceId: item.base.customPlaceId,
    placeName: item.base.placeName,
    userUid: item.base.userUid,
    userEmail: item.base.userEmail,
    userLabel: item.base.userLabel,
    completedAt: Timestamp.fromMillis(item.base.completedAt),
    distanceMiles: item.base.distanceMiles,
    flags: item.base.flags,
    sections,
    syncedAt: Timestamp.now(),
  })
}

/**
 * Try to submit right now. Any failure — offline, a Storage upload error, a
 * rules rejection — parks the visit (photos included) in the IndexedDB
 * outbox instead of losing the merchandiser's work, and returns 'queued' so
 * the UI can say so honestly instead of claiming success.
 */
export async function submitVisit(item: QueuedVisit): Promise<SubmitOutcome> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    await enqueueVisit(item)
    return 'queued'
  }
  try {
    await uploadAllAndWrite(item)
    return 'sent'
  } catch (err) {
    await enqueueVisit({
      ...item,
      attempts: item.attempts + 1,
      lastError: err instanceof Error ? err.message : String(err),
    })
    return 'queued'
  }
}

/** Retries every visit currently parked in the outbox. Safe to call often — a no-op when the queue is empty. */
export async function retryQueuedVisits(): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return
  const items = await listQueuedVisits()
  for (const item of items) {
    try {
      await uploadAllAndWrite(item)
      await removeQueuedVisit(item.queueId)
    } catch (err) {
      await updateQueuedVisit({
        ...item,
        attempts: item.attempts + 1,
        lastError: err instanceof Error ? err.message : String(err),
      })
    }
  }
}

let retryTimer: ReturnType<typeof setInterval> | null = null

/** Wires up online-event + periodic outbox retry for the session. Call once per active login (see App.tsx). */
export function startFieldCheckSyncLoop(): () => void {
  const kick = () => {
    retryQueuedVisits().catch(() => {
      // retryQueuedVisits already records lastError per item; nothing else to do here
    })
  }
  window.addEventListener('online', kick)
  retryTimer = setInterval(kick, RETRY_INTERVAL_MS)
  kick() // catch up on anything left over from a previous session

  return () => {
    window.removeEventListener('online', kick)
    if (retryTimer) clearInterval(retryTimer)
    retryTimer = null
  }
}
