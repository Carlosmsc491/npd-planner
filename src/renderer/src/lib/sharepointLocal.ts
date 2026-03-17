// src/lib/sharepointLocal.ts
// SharePoint file operations — copies files to local sync folder
// SharePoint then handles cloud sync automatically
// Uses Electron IPC to access the filesystem from the renderer process

import type { FileUploadJob, IpcFileResponse } from '../types'

// Verification subfolder check removed — user selects the NPD-PLANNER root directly

// ─────────────────────────────────────────
// PATH VERIFICATION
// ─────────────────────────────────────────

/**
 * Accepts any selected folder as the SharePoint root.
 * No subfolder verification — user selects the NPD-PLANNER folder directly.
 */
export function verifySharePointPath(_folderPath: string): Promise<{
  valid: boolean
  error?: string
}> {
  return Promise.resolve({ valid: true })
}

// ─────────────────────────────────────────
// DESTINATION PATH BUILDER
// ─────────────────────────────────────────

/**
 * Builds the destination path for a file attachment.
 * Structure: [sharePointRoot]/[year]/[clientName]/[taskTitle]/[fileName]
 *
 * Sanitizes folder names to remove characters not allowed in file paths.
 */
export function buildDestinationPath(
  sharePointRoot: string,
  year: number,
  clientName: string,
  taskTitle: string,
  fileName: string
): string {
  const sanitize = (s: string) =>
    s.replace(/[<>:"/\\|?*]/g, '-').replace(/\s+/g, ' ').trim()

  // Use path segments — Electron main process will join with correct separator
  return [
    sharePointRoot,
    String(year),
    sanitize(clientName),
    sanitize(taskTitle),
    sanitize(fileName),
  ].join('|||')  // delimiter that main process splits on to use path.join()
}

/**
 * Builds a relative path for storage in Firestore.
 * Relative to the SharePoint root (not the full local path).
 */
export function buildRelativePath(
  year: number,
  clientName: string,
  taskTitle: string,
  fileName: string
): string {
  const sanitize = (s: string) =>
    s.replace(/[<>:"/\\|?*]/g, '-').replace(/\s+/g, ' ').trim()

  return `${year}/${sanitize(clientName)}/${sanitize(taskTitle)}/${sanitize(fileName)}`
}

// ─────────────────────────────────────────
// FILE COPY OPERATION
// ─────────────────────────────────────────

/**
 * Copies a file from sourcePath to destPath via Electron IPC.
 * Creates intermediate directories if needed.
 */
export async function copyFileToSharePoint(
  sourcePath: string,
  destPathSegments: string  // the ||| delimited string from buildDestinationPath
): Promise<{ success: boolean; error?: string }> {
  try {
    const result: IpcFileResponse = await window.electronAPI.copyFile(
      sourcePath,
      destPathSegments,
      true
    )

    return result
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

// ─────────────────────────────────────────
// RETRY QUEUE
// ─────────────────────────────────────────

const retryQueue: FileUploadJob[] = []
const MAX_RETRIES = 5
const RETRY_INTERVAL_MS = 30_000  // 30 seconds

let retryInterval: ReturnType<typeof setInterval> | null = null

export function addToRetryQueue(job: FileUploadJob): void {
  retryQueue.push(job)
  if (!retryInterval) {
    startRetryWorker()
  }
}

function startRetryWorker(): void {
  retryInterval = setInterval(async () => {
    if (retryQueue.length === 0) {
      stopRetryWorker()
      return
    }

    const job = retryQueue[0]

    if (job.retryCount >= MAX_RETRIES) {
      retryQueue.shift()  // give up after max retries
      console.error(`File upload failed after ${MAX_RETRIES} attempts:`, job.fileName)
      return
    }

    const result = await copyFileToSharePoint(job.sourcePath, job.destPath)

    if (result.success) {
      retryQueue.shift()
      // Notify the store that this attachment is now synced
      window.dispatchEvent(new CustomEvent('attachment-synced', {
        detail: { taskId: job.taskId, attachmentId: job.attachmentId }
      }))
    } else {
      job.retryCount++
    }
  }, RETRY_INTERVAL_MS)
}

function stopRetryWorker(): void {
  if (retryInterval) {
    clearInterval(retryInterval)
    retryInterval = null
  }
}

// Window.electronAPI types are declared in src/preload/index.d.ts
