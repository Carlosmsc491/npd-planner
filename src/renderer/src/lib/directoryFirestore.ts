// src/renderer/src/lib/directoryFirestore.ts
// Firestore operations for the Directory module (contacts + custom columns)

import {
  collection,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  Unsubscribe,
  query,
  orderBy,
} from 'firebase/firestore'
import { db } from './firebase'
import type { DirectoryContact, DirectorySettings, DirectoryColumnDef } from '../types'

const CONTACTS = 'directoryContacts'
const DIR_SETTINGS = 'directorySettings'
const DIR_SETTINGS_DOC = 'columns'

// ─── Contacts ────────────────────────────────────────────────────────────────

export function subscribeToDirectoryContacts(
  callback: (contacts: DirectoryContact[]) => void
): Unsubscribe {
  return onSnapshot(
    query(collection(db, CONTACTS), orderBy('lastName'), orderBy('firstName')),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as DirectoryContact))),
    (err) => console.error('subscribeToDirectoryContacts error:', err)
  )
}

export async function createDirectoryContact(
  data: Omit<DirectoryContact, 'id' | 'createdAt' | 'updatedAt'>,
  uid: string
): Promise<string> {
  try {
    const ref = await addDoc(collection(db, CONTACTS), {
      ...data,
      createdAt: serverTimestamp(),
      createdBy: uid,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    })
    return ref.id
  } catch (err) {
    throw new Error(`Failed to create contact: ${err}`)
  }
}

export async function updateDirectoryContact(
  id: string,
  updates: Partial<Omit<DirectoryContact, 'id' | 'createdAt' | 'createdBy'>>,
  uid: string
): Promise<void> {
  try {
    await updateDoc(doc(db, CONTACTS, id), {
      ...updates,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    })
  } catch (err) {
    throw new Error(`Failed to update contact: ${err}`)
  }
}

export async function deleteDirectoryContact(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, CONTACTS, id))
  } catch (err) {
    throw new Error(`Failed to delete contact: ${err}`)
  }
}

// ─── Custom Column Definitions ────────────────────────────────────────────────

export async function getDirectorySettings(): Promise<DirectorySettings | null> {
  try {
    const snap = await getDoc(doc(db, DIR_SETTINGS, DIR_SETTINGS_DOC))
    return snap.exists() ? (snap.data() as DirectorySettings) : null
  } catch (err) {
    console.error('getDirectorySettings error:', err)
    return null
  }
}

export function subscribeToDirectorySettings(
  callback: (settings: DirectorySettings | null) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, DIR_SETTINGS, DIR_SETTINGS_DOC),
    (snap) => callback(snap.exists() ? (snap.data() as DirectorySettings) : null),
    (err) => console.error('subscribeToDirectorySettings error:', err)
  )
}

export async function saveDirectoryColumns(
  columns: DirectoryColumnDef[],
  uid: string
): Promise<void> {
  try {
    await updateDoc(doc(db, DIR_SETTINGS, DIR_SETTINGS_DOC), {
      columns,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    })
  } catch {
    // doc may not exist yet — use setDoc via import
    const { setDoc } = await import('firebase/firestore')
    await setDoc(doc(db, DIR_SETTINGS, DIR_SETTINGS_DOC), {
      columns,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    })
  }
}
