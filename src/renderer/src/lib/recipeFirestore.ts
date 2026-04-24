// src/renderer/src/lib/recipeFirestore.ts
// All Firestore operations for the Recipe Manager module
// Every function has try/catch — never let Firestore errors crash silently

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  setDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  Timestamp,
  Unsubscribe,
  orderBy,
  limit,
} from 'firebase/firestore'
import { db } from './firebase'
import type {
  RecipeProject,
  RecipeFile,
  RecipeFileStatus,
  RecipePresence,
  RecipeSettings,
  CapturedPhoto,
  RecipeNote,
} from '../types'
import {
  DEFAULT_RECIPE_RULE_CELLS as RULE_CELLS_DEFAULTS,
  DEFAULT_RECIPE_DISTRIBUTION as DIST_DEFAULTS,
} from '../types'
import { nanoid } from 'nanoid'

// ─────────────────────────────────────────
// COLLECTION NAMES
// ─────────────────────────────────────────

const RECIPE_PROJECTS   = 'recipeProjects'
const RECIPE_FILES      = 'recipeFiles'
const RECIPE_NOTES      = 'notes'
const RECIPE_PRESENCE   = 'recipePresence'
const RECIPE_SETTINGS   = 'recipeSettings'

// ─────────────────────────────────────────
// PROJECTS
// ─────────────────────────────────────────

export function subscribeToRecipeProjects(
  callback: (projects: RecipeProject[]) => void
): Unsubscribe {
  const q = query(collection(db, RECIPE_PROJECTS))
  return onSnapshot(q, (snap) => {
    const projects = snap.docs.map((d) => ({ id: d.id, ...d.data() } as RecipeProject))
    callback(projects)
  }, (err) => {
    console.error('subscribeToRecipeProjects error:', err)
  })
}

export async function createRecipeProject(
  data: Omit<RecipeProject, 'id' | 'createdAt'>
): Promise<string> {
  try {
    const ref = await addDoc(collection(db, RECIPE_PROJECTS), {
      ...data,
      createdAt: serverTimestamp(),
    })
    return ref.id
  } catch (err) {
    throw new Error(`Failed to create recipe project: ${err}`)
  }
}

export async function updateRecipeProject(
  id: string,
  updates: Partial<Omit<RecipeProject, 'id'>>
): Promise<void> {
  try {
    await updateDoc(doc(db, RECIPE_PROJECTS, id), updates as Record<string, unknown>)
  } catch (err) {
    throw new Error(`Failed to update recipe project: ${err}`)
  }
}

export async function deleteRecipeProject(projectId: string): Promise<void> {
  try {
    // Delete all recipeFiles subcollection docs first
    const filesSnap = await getDocs(collection(db, RECIPE_PROJECTS, projectId, RECIPE_FILES))
    await Promise.all(filesSnap.docs.map((d) => deleteDoc(d.ref)))
    // Then delete the project document
    await deleteDoc(doc(db, RECIPE_PROJECTS, projectId))
  } catch (err) {
    throw new Error(`Failed to delete recipe project: ${err}`)
  }
}

// ─────────────────────────────────────────
// FILES (subcollection of recipeProjects)
// ─────────────────────────────────────────

export function subscribeToRecipeFiles(
  projectId: string,
  callback: (files: RecipeFile[]) => void
): Unsubscribe {
  const q = query(collection(db, RECIPE_PROJECTS, projectId, RECIPE_FILES))
  return onSnapshot(q, (snap) => {
    const files = snap.docs.map((d) => ({ id: d.id, ...d.data() } as RecipeFile))
    callback(files)
  }, (err) => {
    console.error('subscribeToRecipeFiles error:', err)
  })
}

export async function upsertRecipeFile(
  projectId: string,
  fileId: string,
  data: Omit<RecipeFile, 'id'> & { id?: string }
): Promise<void> {
  try {
    await setDoc(
      doc(db, RECIPE_PROJECTS, projectId, RECIPE_FILES, fileId),
      { ...data, updatedAt: serverTimestamp() },
      { merge: true }
    )
  } catch (err) {
    throw new Error(`Failed to upsert recipe file: ${err}`)
  }
}

/**
 * Update fileId, relativePath and displayName when a file is renamed on disk.
 * Finds the doc by querying for fileId === oldFileId, then updates its identity fields.
 */
export async function updateRecipeFileId(
  projectId: string,
  oldFileId: string,
  newFileId: string,
  newRelativePath: string,
  newDisplayName: string
): Promise<void> {
  try {
    const q = query(
      collection(db, RECIPE_PROJECTS, projectId, RECIPE_FILES),
      where('fileId', '==', oldFileId)
    )
    const snap = await getDocs(q)
    if (snap.empty) return   // file was never tracked — nothing to update

    const docRef = snap.docs[0].ref
    await updateDoc(docRef, {
      fileId:       newFileId,
      relativePath: newRelativePath,
      displayName:  newDisplayName,
      updatedAt:    serverTimestamp(),
    })
  } catch (err) {
    throw new Error(`Failed to update recipe file id: ${err}`)
  }
}

/**
 * Migrate a recipe file doc from an old fileId to a new one, preserving ALL data
 * (capturedPhotos, photoStatus, locks, overrides, etc.).
 * Writes the new doc then deletes the old orphan.
 * Used when a rename is detected during filesystem scan.
 */
export async function migrateRecipeFile(
  projectId: string,
  oldFileId: string,
  newFileId: string,
  newData: Omit<RecipeFile, 'id'>
): Promise<void> {
  try {
    await setDoc(
      doc(db, RECIPE_PROJECTS, projectId, RECIPE_FILES, newFileId),
      { ...newData, updatedAt: serverTimestamp() }
    )
    await deleteDoc(doc(db, RECIPE_PROJECTS, projectId, RECIPE_FILES, oldFileId))
  } catch (err) {
    throw new Error(`Failed to migrate recipe file: ${err}`)
  }
}

/**
 * Atomically claim a recipe file lock.
 * Throws Error("Locked by {name}") if already locked by someone else.
 */
export async function claimRecipeFile(
  projectId: string,
  fileId: string,
  userName: string
): Promise<string> {
  const lockToken = nanoid()
  const fileRef = doc(db, RECIPE_PROJECTS, projectId, RECIPE_FILES, fileId)

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(fileRef)
      if (!snap.exists()) throw new Error('Recipe file not found')

      const data = snap.data() as RecipeFile
      const isLocked =
        data.status === 'in_progress' &&
        data.lockHeartbeatAt !== null &&
        data.lockToken !== null

      if (isLocked) {
        // Check if the lock is actually expired before blocking
        const heartbeat = data.lockHeartbeatAt as Timestamp
        const elapsed = Date.now() - heartbeat.toMillis()
        const timeout = 300_000 // 300 seconds
        if (elapsed < timeout) {
          throw new Error(`Locked by ${data.lockedBy}`)
        }
        // Lock has expired — allow reclaim to proceed
      }

      tx.update(fileRef, {
        status:           'in_progress' as RecipeFileStatus,
        lockedBy:         userName,
        lockClaimedAt:    serverTimestamp(),
        lockHeartbeatAt:  serverTimestamp(),
        lockToken,
        version:          (data.version ?? 0) + 1,
        updatedAt:        serverTimestamp(),
      })
    })
    return lockToken
  } catch (err) {
    // Re-throw so the caller can show the message to the user
    throw err
  }
}

export async function unclaimRecipeFile(
  projectId: string,
  fileId: string,
  lockToken: string
): Promise<void> {
  const fileRef = doc(db, RECIPE_PROJECTS, projectId, RECIPE_FILES, fileId)
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(fileRef)
      if (!snap.exists()) return

      const data = snap.data() as RecipeFile
      // Only release if we own the lock
      if (data.lockToken !== lockToken) return

      tx.update(fileRef, {
        status:          'pending' as RecipeFileStatus,
        lockedBy:        null,
        lockClaimedAt:   null,
        lockHeartbeatAt: null,
        lockToken:       null,
        version:         (data.version ?? 0) + 1,
        updatedAt:       serverTimestamp(),
      })
    })
  } catch (err) {
    console.error('unclaimRecipeFile error:', err)
    throw new Error(`Failed to unclaim recipe file: ${err}`)
  }
}

export async function markRecipeDone(
  projectId: string,
  fileId: string,
  userName: string,
  _lockToken: string
): Promise<void> {
  const fileRef = doc(db, RECIPE_PROJECTS, projectId, RECIPE_FILES, fileId)
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(fileRef)
      if (!snap.exists()) throw new Error('Recipe file not found')
      const data = snap.data() as RecipeFile

      tx.update(fileRef, {
        status:          'done' as RecipeFileStatus,
        doneBy:          userName,
        doneAt:          serverTimestamp(),
        lockedBy:        null,
        lockClaimedAt:   null,
        lockHeartbeatAt: null,
        lockToken:       null,
        version:         (data.version ?? 0) + 1,
        updatedAt:       serverTimestamp(),
      })
    })
  } catch (err) {
    throw new Error(`Failed to mark recipe done: ${err}`)
  }
}

export async function reopenRecipeFile(
  projectId: string,
  fileId: string
): Promise<void> {
  const fileRef = doc(db, RECIPE_PROJECTS, projectId, RECIPE_FILES, fileId)
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(fileRef)
      if (!snap.exists()) throw new Error('Recipe file not found')
      const data = snap.data() as RecipeFile

      tx.update(fileRef, {
        status:          'pending' as RecipeFileStatus,
        doneBy:          null,
        doneAt:          null,
        lockedBy:        null,
        lockClaimedAt:   null,
        lockHeartbeatAt: null,
        lockToken:       null,
        version:         (data.version ?? 0) + 1,
        updatedAt:       serverTimestamp(),
      })
    })
  } catch (err) {
    throw new Error(`Failed to reopen recipe file: ${err}`)
  }
}

export async function forceUnlockRecipeFile(
  projectId: string,
  fileId: string
): Promise<void> {
  try {
    const fileRef = doc(
      db,
      RECIPE_PROJECTS, projectId,
      RECIPE_FILES, fileId
    )
    await updateDoc(fileRef, {
      status: 'pending',
      lockedBy: null,
      lockClaimedAt: null,
      lockHeartbeatAt: null,
      lockToken: null,
      updatedAt: serverTimestamp(),
    })
  } catch (err) {
    throw new Error(`Failed to force unlock: ${err}`)
  }
}

export async function updateRecipeHeartbeat(
  projectId: string,
  fileId: string,
  lockToken: string
): Promise<void> {
  const fileRef = doc(db, RECIPE_PROJECTS, projectId, RECIPE_FILES, fileId)
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(fileRef)
      if (!snap.exists()) return
      const data = snap.data() as RecipeFile
      // Only update heartbeat if we still own the lock
      if (data.lockToken !== lockToken) return
      tx.update(fileRef, { lockHeartbeatAt: serverTimestamp() })
    })
  } catch (err) {
    // Heartbeat failures are non-fatal — log only
    console.error('updateRecipeHeartbeat error:', err)
  }
}

/**
 * Check all files in a project and mark expired locks as lock_expired.
 * A lock is expired if lockHeartbeatAt is older than 300 seconds.
 */
export async function checkAndExpireLocks(
  projectId: string,
  lockTimeoutSeconds: number = 300
): Promise<void> {
  try {
    const snap = await getDocs(
      collection(db, RECIPE_PROJECTS, projectId, RECIPE_FILES)
    )
    const now = Date.now()
    const expiredIds: string[] = []

    snap.docs.forEach((d) => {
      const data = d.data() as RecipeFile
      if (data.status === 'in_progress' && data.lockHeartbeatAt) {
        const heartbeat = data.lockHeartbeatAt as Timestamp
        const elapsed = now - heartbeat.toMillis()
        if (elapsed > lockTimeoutSeconds * 1000) {
          expiredIds.push(d.id)
        }
      }
    })

    await Promise.all(
      expiredIds.map((id) =>
        updateDoc(doc(db, RECIPE_PROJECTS, projectId, RECIPE_FILES, id), {
          status: 'lock_expired' as RecipeFileStatus,
          updatedAt: serverTimestamp(),
        })
      )
    )
  } catch (err) {
    console.error('checkAndExpireLocks error:', err)
  }
}

// ─────────────────────────────────────────
// PRESENCE (subcollection of recipeProjects)
// ─────────────────────────────────────────

export async function updatePresence(
  projectId: string,
  userId: string,
  userName: string
): Promise<void> {
  try {
    await setDoc(
      doc(db, RECIPE_PROJECTS, projectId, RECIPE_PRESENCE, userId),
      {
        projectId,
        userId,
        userName,
        lastSeenAt: serverTimestamp(),
      },
      { merge: true }
    )
  } catch (err) {
    console.error('updatePresence error:', err)
  }
}

export async function removePresence(
  projectId: string,
  userId: string
): Promise<void> {
  try {
    await deleteDoc(doc(db, RECIPE_PROJECTS, projectId, RECIPE_PRESENCE, userId))
  } catch (err) {
    console.error('removePresence error:', err)
  }
}

export function subscribeToRecipePresence(
  projectId: string,
  callback: (presence: RecipePresence[]) => void
): Unsubscribe {
  const q = query(collection(db, RECIPE_PROJECTS, projectId, RECIPE_PRESENCE))
  return onSnapshot(q, (snap) => {
    const presence = snap.docs.map((d) => d.data() as RecipePresence)
    callback(presence)
  }, (err) => {
    console.error('subscribeToRecipePresence error:', err)
  })
}

// ─────────────────────────────────────────
// SETTINGS (per user)
// ─────────────────────────────────────────

export async function getRecipeSettings(userId: string): Promise<RecipeSettings | null> {
  try {
    const snap = await getDoc(doc(db, RECIPE_SETTINGS, userId))
    return snap.exists() ? (snap.data() as RecipeSettings) : null
  } catch (err) {
    console.error('getRecipeSettings error:', err)
    return null
  }
}

export async function saveRecipeSettings(
  userId: string,
  settings: RecipeSettings
): Promise<void> {
  try {
    await setDoc(doc(db, RECIPE_SETTINGS, userId), settings)
  } catch (err) {
    throw new Error(`Failed to save recipe settings: ${err}`)
  }
}

/** Creates default settings for a new user and saves them. */
export async function initDefaultRecipeSettings(userId: string): Promise<RecipeSettings> {
  const defaults: RecipeSettings = {
    userId,
    ruleCells: { ...RULE_CELLS_DEFAULTS },
    holidayMap: {
      VALENTINE: "VALENTINE'S DAY",
      EASTER:    'EASTER',
      MOTHER:    "MOTHER'S DAY",
      FALL:      'FALL COLORS',
      XMAS:      'XMAS COLORS',
      CHRISTMAS: 'XMAS COLORS',
      EVERYDAY:  'EVERYDAY',
    },
    sleeveByPrice: {},
    sleeveByStems: {},
    distributionDefaults: { ...DIST_DEFAULTS },
    lockTimeoutSeconds: 300,
  }
  await saveRecipeSettings(userId, defaults)
  return defaults
}

// ─────────────────────────────────────────
// PROJECT SETTINGS (shared by team)
// ─────────────────────────────────────────

export async function getRecipeProjectSettings(
  projectId: string
): Promise<import('../types').RecipeProjectSettings | null> {
  try {
    const snap = await getDoc(
      doc(db, RECIPE_PROJECTS, projectId, 'settings', 'main')
    )
    return snap.exists() ? (snap.data() as import('../types').RecipeProjectSettings) : null
  } catch (err) {
    throw new Error(`Failed to get project settings: ${err}`)
  }
}

export async function saveRecipeProjectSettings(
  projectId: string,
  settings: import('../types').RecipeProjectSettings
): Promise<void> {
  try {
    await setDoc(
      doc(db, RECIPE_PROJECTS, projectId, 'settings', 'main'),
      settings
    )
  } catch (err) {
    throw new Error(`Failed to save project settings: ${err}`)
  }
}

export async function initDefaultRecipeProjectSettings(
  projectId: string
): Promise<import('../types').RecipeProjectSettings> {
  const settings: import('../types').RecipeProjectSettings = {
    ruleCells: { ...RULE_CELLS_DEFAULTS },
    holidayMap: {
      VALENTINE: "VALENTINE'S DAY",
      EASTER:    'EASTER',
      MOTHER:    "MOTHER'S DAY",
      FALL:      'FALL COLORS',
      XMAS:      'XMAS COLORS',
      CHRISTMAS: 'XMAS COLORS',
      EVERYDAY:  'EVERYDAY',
    },
    sleeveByPrice: {},
    sleeveByStems: {},
  }
  await saveRecipeProjectSettings(projectId, settings)
  return settings
}

export async function assignRecipeFile(
  projectId: string,
  fileId: string,
  assignedTo: string | null,
  assignedToName: string | null
): Promise<void> {
  try {
    const fileRef = doc(
      db,
      RECIPE_PROJECTS, projectId,
      RECIPE_FILES, fileId
    )
    await updateDoc(fileRef, {
      assignedTo,
      assignedToName,
      updatedAt: serverTimestamp(),
    })
  } catch (err) {
    throw new Error(`Failed to assign recipe: ${err}`)
  }
}

// ─────────────────────────────────────────
// ACTIVITY FEED (persistent)
// ─────────────────────────────────────────

const RECIPE_ACTIVITY = 'activity'

export async function addRecipeActivity(
  projectId: string,
  event: Omit<import('../types').RecipeActivityEvent, 'id' | 'createdAt'>
): Promise<void> {
  try {
    await addDoc(
      collection(db, RECIPE_PROJECTS, projectId, RECIPE_ACTIVITY),
      { ...event, createdAt: serverTimestamp() }
    )
  } catch (err) {
    // No lanzar error — la actividad es secundaria, no debe romper el flujo
    console.error('Failed to log activity:', err)
  }
}

export function subscribeToRecipeActivity(
  projectId: string,
  callback: (events: import('../types').RecipeActivityEvent[]) => void
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, RECIPE_PROJECTS, projectId, RECIPE_ACTIVITY),
      orderBy('createdAt', 'desc'),
      limit(50)
    ),
    snap => callback(
      snap.docs.map(d => ({ id: d.id, ...d.data() }) as import('../types').RecipeActivityEvent)
    ),
    err => console.error('subscribeToRecipeActivity error:', err)
  )
}

/**
 * Find a recipe file doc by its stable recipeUid field.
 * Returns null if not found.
 */
export async function findRecipeFileByUid(
  projectId: string,
  recipeUid: string
): Promise<RecipeFile | null> {
  try {
    const q = query(
      collection(db, RECIPE_PROJECTS, projectId, RECIPE_FILES),
      where('recipeUid', '==', recipeUid)
    )
    const snap = await getDocs(q)
    if (snap.empty) return null
    return { id: snap.docs[0].id, ...snap.docs[0].data() } as RecipeFile
  } catch (err) {
    console.error('findRecipeFileByUid error:', err)
    return null
  }
}

/**
 * Backfill a stable recipeUid onto an existing doc that was created before
 * the UUID system was introduced (legacy files).
 */
export async function writeRecipeUid(
  projectId: string,
  fileId: string,
  recipeUid: string
): Promise<void> {
  try {
    await updateDoc(
      doc(db, RECIPE_PROJECTS, projectId, RECIPE_FILES, fileId),
      { recipeUid, updatedAt: serverTimestamp() }
    )
  } catch (err) {
    console.error('writeRecipeUid error:', err)
  }
}

/**
 * Atomically update all fields that change when a recipe is renamed:
 * - identity fields (fileId, relativePath, displayName)
 * - capturedPhotos array with new filenames / paths
 * - readyPngPath / readyJpgPath
 * Writes a new doc at newFileId, deletes the old one.
 */
export async function updateRecipeAfterRename(
  projectId: string,
  oldFileId: string,
  updates: {
    newFileId: string
    newRelativePath: string
    newDisplayName: string
    updatedPhotos: CapturedPhoto[]
    newReadyPngPath: string | null
    newReadyJpgPath: string | null
  }
): Promise<void> {
  try {
    const oldRef = doc(db, RECIPE_PROJECTS, projectId, RECIPE_FILES, oldFileId)
    const oldSnap = await getDoc(oldRef)
    if (!oldSnap.exists()) throw new Error('Recipe file not found')

    const existing = oldSnap.data() as RecipeFile
    const newData: Omit<RecipeFile, 'id'> = {
      ...existing,
      fileId:        updates.newFileId,
      relativePath:  updates.newRelativePath,
      displayName:   updates.newDisplayName,
      capturedPhotos: updates.updatedPhotos,
      readyPngPath:  updates.newReadyPngPath,
      readyJpgPath:  updates.newReadyJpgPath,
    }

    await setDoc(
      doc(db, RECIPE_PROJECTS, projectId, RECIPE_FILES, updates.newFileId),
      { ...newData, updatedAt: serverTimestamp() }
    )
    await deleteDoc(oldRef)
  } catch (err) {
    throw new Error(`updateRecipeAfterRename failed: ${err}`)
  }
}

// ─────────────────────────────────────────
// RECIPE NOTES
// Path: recipeProjects/{projectId}/recipeFiles/{fileId}/notes/{noteId}
// ─────────────────────────────────────────

function notesCol(projectId: string, fileId: string) {
  return collection(db, RECIPE_PROJECTS, projectId, RECIPE_FILES, fileId, RECIPE_NOTES)
}

function noteDoc(projectId: string, fileId: string, noteId: string) {
  return doc(db, RECIPE_PROJECTS, projectId, RECIPE_FILES, fileId, RECIPE_NOTES, noteId)
}

/** Real-time subscription to a recipe's notes, newest first. */
export function subscribeToRecipeNotes(
  projectId: string,
  fileId: string,
  onUpdate: (notes: RecipeNote[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(notesCol(projectId, fileId), orderBy('createdAt', 'desc'))
  return onSnapshot(
    q,
    (snap) => {
      const notes: RecipeNote[] = snap.docs.map((d) => ({ id: d.id, ...d.data() } as RecipeNote))
      onUpdate(notes)
    },
    (err) => {
      console.error('subscribeToRecipeNotes error:', err)
      onError?.(err)
      // Resolve loading so the UI doesn't spin forever
      onUpdate([])
    }
  )
}

/** Post a new note and increment the denormalized activeNotesCount on the RecipeFile doc. */
export async function addRecipeNote(
  projectId: string,
  fileId: string,
  note: Omit<RecipeNote, 'id' | 'createdAt' | 'resolvedAt' | 'resolvedBy' | 'resolvedByName'>
): Promise<void> {
  try {
    await addDoc(notesCol(projectId, fileId), {
      ...note,
      createdAt: serverTimestamp(),
      resolvedAt: null,
      resolvedBy: null,
      resolvedByName: null,
    })
    // Increment denormalized count
    const fileRef = doc(db, RECIPE_PROJECTS, projectId, RECIPE_FILES, fileId)
    const snap = await getDoc(fileRef)
    if (snap.exists()) {
      const current = (snap.data().activeNotesCount as number) ?? 0
      await updateDoc(fileRef, { activeNotesCount: current + 1 })
    }
  } catch (err) {
    throw new Error(`addRecipeNote failed: ${err}`)
  }
}

/** Delete a note (author or admin only — enforced in UI, not here). Decrements count if active. */
export async function deleteRecipeNote(
  projectId: string,
  fileId: string,
  noteId: string,
  wasActive: boolean
): Promise<void> {
  try {
    await deleteDoc(noteDoc(projectId, fileId, noteId))
    if (wasActive) {
      const fileRef = doc(db, RECIPE_PROJECTS, projectId, RECIPE_FILES, fileId)
      const snap = await getDoc(fileRef)
      if (snap.exists()) {
        const current = (snap.data().activeNotesCount as number) ?? 1
        await updateDoc(fileRef, { activeNotesCount: Math.max(0, current - 1) })
      }
    }
  } catch (err) {
    throw new Error(`deleteRecipeNote failed: ${err}`)
  }
}

/** Resolve all active notes on a recipe (Fix Now). Sets activeNotesCount to 0. */
export async function resolveAllRecipeNotes(
  projectId: string,
  fileId: string,
  resolvedBy: string,
  resolvedByName: string
): Promise<void> {
  try {
    const q = query(notesCol(projectId, fileId), where('resolvedAt', '==', null))
    const snap = await getDocs(q)
    const batch = snap.docs.map((d) =>
      updateDoc(noteDoc(projectId, fileId, d.id), {
        resolvedAt: serverTimestamp(),
        resolvedBy,
        resolvedByName,
      })
    )
    await Promise.all(batch)
    // Reset denormalized count
    await updateDoc(
      doc(db, RECIPE_PROJECTS, projectId, RECIPE_FILES, fileId),
      { activeNotesCount: 0 }
    )
  } catch (err) {
    throw new Error(`resolveAllRecipeNotes failed: ${err}`)
  }
}

