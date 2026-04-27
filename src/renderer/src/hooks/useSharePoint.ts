// src/renderer/src/hooks/useSharePoint.ts
// Manages SharePoint local sync folder path, file attachment, and retry queue

import { useState, useEffect } from 'react'
import { Timestamp } from 'firebase/firestore'
import { useAuthStore } from '../store/authStore'
import { updateUserPreferences, updateTaskAttachments, updateAttachmentStatus } from '../lib/firestore'
import type { Task, TaskAttachment, AttachmentStatus, FileUploadJob } from '../types'

const LS_KEY = 'npd_sharepoint_path'
const RETRY_INTERVAL_MS = 30_000
const MAX_RETRY_COUNT = 5

// ─── Module-level retry queue (persists across renders) ───────────────────────
const retryQueue: FileUploadJob[] = []
let retryTimerStarted = false

function getMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    doc: 'application/msword',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ppt: 'application/vnd.ms-powerpoint',
    csv: 'text/csv',
    txt: 'text/plain',
    zip: 'application/zip',
  }
  return map[ext] ?? 'application/octet-stream'
}

function sanitizeName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').substring(0, 80)
}

async function processRetryQueue(): Promise<void> {
  if (!window.electronAPI) return
  const pending = retryQueue.filter((j) => j.retryCount < MAX_RETRY_COUNT)
  for (const job of pending) {
    try {
      const result = await window.electronAPI.copyFile(job.sourcePath, job.destPath, true)
      if (result.success) {
        // Remove from queue and mark synced in Firestore
        const idx = retryQueue.indexOf(job)
        if (idx !== -1) retryQueue.splice(idx, 1)
        await updateAttachmentStatus(job.taskId, job.attachmentId, 'synced' as AttachmentStatus)
      } else {
        job.retryCount++
      }
    } catch {
      job.retryCount++
    }
  }
  // Remove permanently failed jobs (hit max retries)
  const overLimit = retryQueue.filter((j) => j.retryCount >= MAX_RETRY_COUNT)
  for (const j of overLimit) {
    const idx = retryQueue.indexOf(j)
    if (idx !== -1) retryQueue.splice(idx, 1)
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useSharePoint() {
  const { user } = useAuthStore()
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI

  const [sharePointPath, setSharePointPathState] = useState<string | null>(() =>
    localStorage.getItem(LS_KEY)
  )

  // Sync from Firestore user preferences on mount
  useEffect(() => {
    const prefPath = user?.preferences?.sharePointPath
    if (prefPath && !sharePointPath) {
      localStorage.setItem(LS_KEY, prefPath)
      setSharePointPathState(prefPath)
    }
  }, [user?.preferences?.sharePointPath])  // eslint-disable-line

  // Start retry timer once (module-level, stays alive)
  useEffect(() => {
    if (!isElectron || retryTimerStarted) return
    retryTimerStarted = true
    setInterval(processRetryQueue, RETRY_INTERVAL_MS)
  }, [isElectron])

  async function savePath(newPath: string): Promise<void> {
    localStorage.setItem(LS_KEY, newPath)
    setSharePointPathState(newPath)
    if (user) {
      await updateUserPreferences(user.uid, { sharePointPath: newPath })
    }
  }

  async function setupSharePoint(): Promise<{ success: boolean; error?: string }> {
    if (!isElectron) return { success: false, error: 'File access requires the desktop app.' }

    const folder = await window.electronAPI.selectFolder()
    if (!folder) return { success: false }

    await savePath(folder)
    return { success: true }
  }

  async function clearPath(): Promise<void> {
    localStorage.removeItem(LS_KEY)
    setSharePointPathState(null)
    if (user) await updateUserPreferences(user.uid, { sharePointPath: '' })
  }

  async function attachFile(
    task: Task,
    clientName: string,
    divisionName?: string
  ): Promise<{ success: boolean; attachment?: TaskAttachment; error?: string }> {
    if (!isElectron) return { success: false, error: 'File attachments require the desktop app.' }
    if (!sharePointPath) {
      return {
        success: false,
        error: 'SharePoint folder not configured. Go to Settings → Files to set it up.',
      }
    }
    if (!user) return { success: false, error: 'Not authenticated.' }

    const sourcePath = await window.electronAPI.selectFile()
    if (!sourcePath) return { success: false } // user cancelled

    // Extract filename
    const parts = sourcePath.replace(/\\/g, '/').split('/')
    const fileName = parts[parts.length - 1]

    // Build destination
    const year = new Date().getFullYear().toString()
    const safeClient = sanitizeName(clientName || 'Unknown Client')
    const safeTitle = sanitizeName(task.title)
    const safeDivision = divisionName ? sanitizeName(divisionName) : undefined

    // Use ||| delimiter so main process can path.join safely
    const destPath = safeDivision
      ? [sharePointPath, year, safeClient, safeDivision, safeTitle, fileName].join('|||')
      : [sharePointPath, year, safeClient, safeTitle, fileName].join('|||')
    const relativePath = safeDivision
      ? [year, safeClient, safeDivision, safeTitle, fileName].join('/')
      : [year, safeClient, safeTitle, fileName].join('/')

    const attachment: TaskAttachment = {
      id: crypto.randomUUID(),
      name: fileName,
      sharePointRelativePath: relativePath,
      uploadedBy: user.uid,
      uploadedByName: user.name,
      uploadedAt: Timestamp.now(),
      status: 'uploading',
      sizeBytes: null,
      mimeType: getMimeType(fileName),
    }

    // Optimistically write 'uploading' status
    const optimistic = [...task.attachments, attachment]
    await updateTaskAttachments(task.id, optimistic)

    try {
      const result = await window.electronAPI.copyFile(sourcePath, destPath, true)
      if (result.success) {
        const synced: TaskAttachment = { ...attachment, status: 'synced' }
        await updateTaskAttachments(task.id, optimistic.map((a) => (a.id === attachment.id ? synced : a)))
        return { success: true, attachment: synced }
      } else {
        const errAtt: TaskAttachment = { ...attachment, status: 'error' }
        await updateTaskAttachments(task.id, optimistic.map((a) => (a.id === attachment.id ? errAtt : a)))
        retryQueue.push({ taskId: task.id, attachmentId: attachment.id, sourcePath, destPath, fileName, retryCount: 0, status: 'error' })
        return { success: false, attachment: errAtt, error: result.error ?? 'Copy failed. Retrying in the background.' }
      }
    } catch (err) {
      const errAtt: TaskAttachment = { ...attachment, status: 'error' }
      await updateTaskAttachments(task.id, optimistic.map((a) => (a.id === attachment.id ? errAtt : a)))
      return { success: false, attachment: errAtt, error: String(err) }
    }
  }

  async function removeAttachment(task: Task, attachmentId: string): Promise<void> {
    const updated = task.attachments.filter((a) => a.id !== attachmentId)
    await updateTaskAttachments(task.id, updated)
    // Remove from retry queue
    const idx = retryQueue.findIndex((j) => j.attachmentId === attachmentId)
    if (idx !== -1) retryQueue.splice(idx, 1)
  }

  async function openAttachment(attachment: TaskAttachment): Promise<void> {
    if (!isElectron || !sharePointPath) return
    const absolutePath = await window.electronAPI.resolveSharePointPath(
      sharePointPath,
      attachment.sharePointRelativePath
    )
    await window.electronAPI.openFile(absolutePath)
  }

  async function readAttachmentBase64(attachment: TaskAttachment): Promise<string | null> {
    if (!isElectron || !sharePointPath) return null
    const absolutePath = await window.electronAPI.resolveSharePointPath(
      sharePointPath,
      attachment.sharePointRelativePath
    )
    return window.electronAPI.readFileBase64(absolutePath)
  }

  return {
    sharePointPath,
    isElectron,
    setupSharePoint,
    clearPath,
    attachFile,
    removeAttachment,
    openAttachment,
    readAttachmentBase64,
  }
}
