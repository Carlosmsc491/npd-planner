// src/renderer/src/lib/emailAttachments.ts
// Firestore helpers for emailAttachments field on tasks

import { doc, updateDoc, Timestamp } from 'firebase/firestore'
import { db } from './firebase'
import type { EmailAttachment } from '../types'

export async function addEmailAttachment(
  taskId: string,
  currentAttachments: EmailAttachment[],
  newAttachment: EmailAttachment
): Promise<void> {
  const ref = doc(db, 'tasks', taskId)
  await updateDoc(ref, {
    emailAttachments: [...currentAttachments, newAttachment],
    updatedAt: Timestamp.now(),
  })
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
