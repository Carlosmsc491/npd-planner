// src/main/ipc/emailHandlers.ts
// IPC handler for parsing Outlook .msg files and copying to SharePoint

import { ipcMain } from 'electron'
import { join } from 'path'
import { mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'fs'
import MsgReader from '@kenjiuno/msgreader'

// ── Sanitize folder/file names ───────────────────────────────────────────────
function sanitizeName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/[.\s]+$/g, '')
    .replace(/[[\]]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── MIME type from extension ──────────────────────────────────────────────────
function getMimeFromExt(filename: string): string | null {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    doc: 'application/msword',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    csv: 'text/csv',
    txt: 'text/plain',
    msg: 'application/vnd.ms-outlook',
  }
  return map[ext] ?? null
}

// ── Register IPC handler ──────────────────────────────────────────────────────
export function registerEmailHandlers(): void {
  ipcMain.handle('email:parse-and-attach', async (_event, req: {
    msgFilePath: string
    sharePointRoot: string
    year: string
    clientName: string
    taskTitle: string
  }) => {
    try {
      const { msgFilePath, sharePointRoot, year, clientName, taskTitle } = req

      // Read and parse .msg
      const msgBuffer = readFileSync(msgFilePath) as unknown as ArrayBuffer
      const reader = new MsgReader(msgBuffer)
      const fileData = reader.getFileData()

      if (!fileData) {
        return { success: false, error: 'Could not parse .msg file.' }
      }

      // Extract metadata
      const from: string = fileData.senderName
        ? `${fileData.senderName} <${fileData.senderEmail ?? ''}>`
        : (fileData.senderEmail ?? 'Unknown')
      const subject: string = fileData.subject ?? '(No subject)'
      const body: string = (fileData.body ?? fileData.bodyHtml ?? '') as string
      const bodySnippet: string = body.replace(/<[^>]*>/g, '').trim().slice(0, 200)
      const msgDate: Date | null = fileData.messageDeliveryTime
        ? new Date(fileData.messageDeliveryTime as string)
        : null

      // Build SharePoint paths
      const safeClient = sanitizeName(clientName)
      const safeTask = sanitizeName(taskTitle)
      const safeSubject = sanitizeName(subject).slice(0, 60)
      const msgFileName = `${safeSubject}.msg`

      const taskFolder = join(sharePointRoot, year, safeClient, safeTask)
      const emailSubFolder = join(taskFolder, safeSubject)

      // Create task folder and copy .msg
      mkdirSync(taskFolder, { recursive: true })
      const msgDestPath = join(taskFolder, msgFileName)
      copyFileSync(msgFilePath, msgDestPath)

      // Process inner attachments
      const innerAttachments: Array<{
        id: string
        name: string
        sharePointRelativePath: string
        sizeBytes: number | null
        mimeType: string | null
      }> = []

      const attachments = fileData.attachments ?? []

      if (attachments.length > 0) {
        mkdirSync(emailSubFolder, { recursive: true })

        for (const att of attachments) {
          if (!att.fileName) continue

          try {
            const attData = reader.getAttachment(att)
            if (!attData?.content) continue

            const safeAttName = sanitizeName(att.fileName)
            const attDestPath = join(emailSubFolder, safeAttName)
            writeFileSync(attDestPath, Buffer.from(attData.content))

            const relativePath = `${year}/${safeClient}/${safeTask}/${safeSubject}/${safeAttName}`

            innerAttachments.push({
              id: crypto.randomUUID(),
              name: att.fileName,
              sharePointRelativePath: relativePath,
              sizeBytes: attData.content.byteLength,
              mimeType: getMimeFromExt(att.fileName),
            })
          } catch (attErr) {
            console.error(`[EmailHandler] Failed to extract attachment ${att.fileName}:`, attErr)
          }
        }
      }

      const msgRelativePath = `${year}/${safeClient}/${safeTask}/${msgFileName}`

      const emailAttachment = {
        id: crypto.randomUUID(),
        type: 'email' as const,
        from,
        subject,
        date: msgDate
          ? { seconds: Math.floor(msgDate.getTime() / 1000), nanoseconds: 0 }
          : null,
        bodySnippet,
        msgRelativePath,
        innerAttachments,
        uploadedBy: '',  // renderer fills this with current user uid
        uploadedAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
      }

      return { success: true, emailAttachment }

    } catch (err) {
      console.error('[EmailHandler] Error:', err)
      return { success: false, error: String(err) }
    }
  })
}
