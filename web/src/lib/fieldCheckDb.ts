// IndexedDB-backed offline storage for Field Check (task E — no npm
// dependency, native indexedDB API, matching "no new deps in web/").
//
// Two object stores:
//   drafts — one row per in-progress visit form, autosaved while the
//            merchandiser is filling it out (survives closing the tab/app)
//   queue  — a fully-composed visit that failed to submit (offline or a
//            transient error), retried by lib/fieldCheckSync.ts until it lands

const DB_NAME = 'npd-field-check'
const DB_VERSION = 1
const DRAFTS_STORE = 'drafts'
const QUEUE_STORE = 'queue'

export interface DraftPhotoRecord {
  id: string
  blob: Blob
  width: number
  height: number
}

export interface DraftPriceRow {
  id: string
  priceUsd: string
  stemCount: string
  note: string
}

export interface DraftSectionState {
  notes: string
  priceRows: DraftPriceRow[]
  photos: DraftPhotoRecord[]
}

export interface VisitDraft {
  draftId: string // == placeId — one in-progress draft per store at a time
  placeId: string
  placeName: string
  sections: Record<string, DraftSectionState>
  updatedAt: number
}

/** Everything needed to retry a submit: the Firestore payload shape, but photos carry a Blob instead of a remoteUrl yet. */
export interface QueuedVisit {
  queueId: string
  visitId: string
  placeId: string
  placeName: string
  createdAt: number
  attempts: number
  lastError: string | null
  base: {
    missionId: string
    missionName: string
    placeId: string
    customPlaceId: string
    placeName: string
    userUid: string
    userEmail: string
    userLabel: string
    completedAt: number // epoch ms — converted to a Timestamp at write time
    distanceMiles: number
    flags: string[]
  }
  sections: {
    key: string
    label: string
    notes: string
    parsedPrices: unknown[] // CompetitorPrice[] — kept loose to avoid importing types.ts into this low-level module
    photos: { photoId: string; blob: Blob; width: number; height: number }[]
  }[]
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const dbInstance = req.result
      if (!dbInstance.objectStoreNames.contains(DRAFTS_STORE)) {
        dbInstance.createObjectStore(DRAFTS_STORE, { keyPath: 'draftId' })
      }
      if (!dbInstance.objectStoreNames.contains(QUEUE_STORE)) {
        dbInstance.createObjectStore(QUEUE_STORE, { keyPath: 'queueId' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function runTx<T>(storeName: string, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (dbInstance) =>
      new Promise<T>((resolve, reject) => {
        const t = dbInstance.transaction(storeName, mode)
        const store = t.objectStore(storeName)
        const req = run(store)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
  )
}

export async function saveDraft(draft: VisitDraft): Promise<void> {
  await runTx(DRAFTS_STORE, 'readwrite', (s) => s.put(draft))
}

export async function loadDraft(placeId: string): Promise<VisitDraft | undefined> {
  return runTx(DRAFTS_STORE, 'readonly', (s) => s.get(placeId))
}

export async function deleteDraft(placeId: string): Promise<void> {
  await runTx(DRAFTS_STORE, 'readwrite', (s) => s.delete(placeId))
}

export async function enqueueVisit(item: QueuedVisit): Promise<void> {
  await runTx(QUEUE_STORE, 'readwrite', (s) => s.put(item))
}

export async function listQueuedVisits(): Promise<QueuedVisit[]> {
  return runTx(QUEUE_STORE, 'readonly', (s) => s.getAll())
}

export async function removeQueuedVisit(queueId: string): Promise<void> {
  await runTx(QUEUE_STORE, 'readwrite', (s) => s.delete(queueId))
}

export async function updateQueuedVisit(item: QueuedVisit): Promise<void> {
  await runTx(QUEUE_STORE, 'readwrite', (s) => s.put(item))
}

export async function queuedVisitCount(): Promise<number> {
  const all = await listQueuedVisits()
  return all.length
}
