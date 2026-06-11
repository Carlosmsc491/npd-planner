// src/renderer/src/lib/emailAttachments.ts
// Firestore helpers for emailAttachments field on tasks

import { doc, updateDoc, arrayUnion, Timestamp } from 'firebase/firestore'
import { db } from './firebase'
import type { EmailAttachment } from '../types'

/**
 * Appends an email attachment atomically (arrayUnion — a concurrent attach can
 * no longer erase this one, and vice versa).
 * Returns false without writing when the same email is already attached, so a
 * double-fired drop or a re-drop doesn't create 2-3 copies.
 */
export async function addEmailAttachment(
  taskId: string,
  currentAttachments: EmailAttachment[],
  newAttachment: EmailAttachment
): Promise<boolean> {
  const isDuplicate = currentAttachments.some((a) =>
    a.msgRelativePath === newAttachment.msgRelativePath ||
    (a.subject === newAttachment.subject &&
      (a.date?.seconds ?? null) === (newAttachment.date?.seconds ?? null))
  )
  if (isDuplicate) return false

  const ref = doc(db, 'tasks', taskId)
  await updateDoc(ref, {
    emailAttachments: arrayUnion(newAttachment),
    updatedAt: Timestamp.now(),
  })
  return true
}

export async function removeEmailAttachment(
  taskId: string,
  currentAttachments: EmailAttachment[],
  attachmentId: string
): Promise<void> {
  const ref = doc(db, 'tasks', taskId)
  await updateDoc(ref, {
    emailAttachments: currentAttachments.filter((a) => a.id !== attachmentId),
    updatedAt: Timestamp.now(),
  })
}

export async function removeInnerAttachment(
  taskId: string,
  currentAttachments: EmailAttachment[],
  emailId: string,
  innerId: string
): Promise<void> {
  const ref = doc(db, 'tasks', taskId)
  await updateDoc(ref, {
    emailAttachments: currentAttachments.map((ea) =>
      ea.id === emailId
        ? { ...ea, innerAttachments: ea.innerAttachments.filter((ia) => ia.id !== innerId) }
        : ea
    ),
    updatedAt: Timestamp.now(),
  })
}
