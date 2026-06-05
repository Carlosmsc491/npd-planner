// src/main/ipc/emailHandlers.ts
// IPC handler for parsing Outlook .msg / .eml files and copying to SharePoint

import { ipcMain } from 'electron'
import { join } from 'path'
import { mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'fs'
import MsgReader from '@kenjiuno/msgreader'
import { decompressRTF } from '@kenjiuno/decompressrtf'
import { simpleParser } from 'mailparser'

// ── RTF \fromhtml1 → HTML extractor ──────────────────────────────────────────
// Outlook stores HTML emails as RTF with the original HTML embedded as
// {\*\htmltag<n>} blocks and plain text in \htmlrtf0 sections.
// This parser reconstructs the original HTML from those markers.
function extractHtmlFromRtf(rtfStr: string): string {
  const BS = '\\'
  const htmltagMark = '{' + BS + '*' + BS + 'htmltag'
  const output: string[] = []
  let i = 0
  let htmlMode = true  // \fromhtml1 starts in HTML mode

  while (i < rtfStr.length) {
    const ch = rtfStr[i]

    if (ch === '{') {
      if (rtfStr.startsWith(htmltagMark, i)) {
        // Skip {\\*\\htmltag<digits> and collect tag content up to }
        let j = i + htmltagMark.length
        while (j < rtfStr.length && /[\d]/.test(rtfStr[j])) j++
        if (rtfStr[j] === ' ') j++
        let content = ''
        while (j < rtfStr.length && rtfStr[j] !== '}') { content += rtfStr[j]; j++ }
        output.push(content)
        i = j + 1
        continue
      }
      i++; continue
    }
    if (ch === '}') { i++; continue }

    if (ch === BS) {
      i++
      if (i >= rtfStr.length) break
      const next = rtfStr[i]
      if (next === '*') { i++; continue }
      if (next === BS) { if (htmlMode) output.push(BS); i++; continue }
      if (next === '{') { if (htmlMode) output.push('{'); i++; continue }
      if (next === '}') { if (htmlMode) output.push('}'); i++; continue }
      if (next === '-' || next === '|') { i++; continue }
      if (next === '~') { if (htmlMode) output.push('&nbsp;'); i++; continue }
      if (next === "'") {
        const hex = rtfStr.substring(i + 1, i + 3)
        const code = parseInt(hex, 16)
        if (!isNaN(code) && htmlMode) {
          if (code === 0xa0) output.push('&nbsp;')
          else if (code >= 0xa0) output.push(`&#${code};`)
          else output.push(String.fromCharCode(code))
        }
        i += 3; continue
      }
      let word = ''
      while (i < rtfStr.length && /[a-zA-Z]/.test(rtfStr[i])) { word += rtfStr[i]; i++ }
      let param = ''
      if (i < rtfStr.length && (rtfStr[i] === '-' || /[\d]/.test(rtfStr[i]))) {
        while (i < rtfStr.length && /[\d]/.test(rtfStr[i])) { param += rtfStr[i]; i++ }
      }
      if (i < rtfStr.length && rtfStr[i] === ' ') i++

      if (word === 'htmlrtf') htmlMode = (param === '0')
      else if ((word === 'par' || word === 'line') && htmlMode) output.push('<br>')
      else if (word === 'tab' && htmlMode) output.push('&nbsp;&nbsp;&nbsp;')
      continue
    }

    if (htmlMode && ch !== '\r') output.push(ch)
    i++
  }
  return output.join('')
}

// ── Strip RTF control words from plain-text body ─────────────────────────────
// msgreader sometimes returns fileData.body as raw RTF (PR_BODY_RTF fallback)
// instead of clean plain text, resulting in \par \pard \fonttbl etc. appearing
// in the viewer. This function strips them out while preserving paragraph breaks.
function stripRtfControlWords(text: string): string {
  // If no backslash-word sequences, nothing to do
  if (!text.includes('\\par') && !text.includes('\\pard') && !text.includes('\\rtf')) {
    return text
  }
  return text
    // Turn \par / \line into line breaks (preserve paragraph structure)
    .replace(/\\par\b[ \t]*/gi, '\n')
    .replace(/\\line\b[ \t]*/gi, '\n')
    .replace(/\\tab\b[ \t]*/gi, '\t')
    // Strip remaining control words (\word or \word123)
    .replace(/\\[a-zA-Z]+\d*[ \t]?/g, '')
    // Strip literal \\ escapes and hex chars
    .replace(/\\\\/g, '\\')
    .replace(/\\'[0-9a-fA-F]{2}/g, '')
    // Strip RTF group braces
    .replace(/[{}]/g, '')
    // Collapse runs of 3+ newlines
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

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

// ── Shared: build the emailAttachment record and write files to SharePoint ─────
interface ParsedEmail {
  from: string
  subject: string
  body: string
  date: Date | null
  attachments: Array<{ fileName: string; content: Buffer }>
}

function buildAndSaveEmailAttachment(
  parsed: ParsedEmail,
  srcFilePath: string | null,
  srcBuffer: Buffer | null,
  sharePointRoot: string,
  year: string,
  clientName: string,
  taskTitle: string,
  fileExt: string,
) {
  const { from, subject, body, date, attachments } = parsed
  const bodySnippet = body.replace(/<[^>]*>/g, '').trim().slice(0, 200)

  const safeClient  = sanitizeName(clientName)
  const safeTask    = sanitizeName(taskTitle)
  const safeSubject = sanitizeName(subject).slice(0, 60)
  const emailFileName = `${safeSubject}${fileExt}`

  const taskFolder     = join(sharePointRoot, year, safeClient, safeTask)
  const emailSubFolder = join(taskFolder, safeSubject)
  const emailDestPath  = join(taskFolder, emailFileName)

  mkdirSync(taskFolder, { recursive: true })
  if (srcFilePath) {
    copyFileSync(srcFilePath, emailDestPath)
  } else if (srcBuffer) {
    writeFileSync(emailDestPath, srcBuffer)
  }

  const innerAttachments: Array<{
    id: string; name: string; sharePointRelativePath: string
    sizeBytes: number | null; mimeType: string | null
  }> = []

  if (attachments.length > 0) {
    mkdirSync(emailSubFolder, { recursive: true })
    for (const att of attachments) {
      if (!att.fileName || !att.content) continue
      try {
        const safeAttName = sanitizeName(att.fileName)
        writeFileSync(join(emailSubFolder, safeAttName), att.content)
        innerAttachments.push({
          id: crypto.randomUUID(),
          name: att.fileName,
          sharePointRelativePath: `${year}/${safeClient}/${safeTask}/${safeSubject}/${safeAttName}`,
          sizeBytes: att.content.byteLength,
          mimeType: getMimeFromExt(att.fileName),
        })
      } catch { /* skip failed attachment */ }
    }
  }

  return {
    id: crypto.randomUUID(),
    type: 'email' as const,
    from,
    subject,
    date: date ? { seconds: Math.floor(date.getTime() / 1000), nanoseconds: 0 } : null,
    bodySnippet,
    msgRelativePath: `${year}/${safeClient}/${safeTask}/${emailFileName}`,
    innerAttachments,
    uploadedBy: '',
    uploadedAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
  }
}

// ── Register IPC handlers ──────────────────────────────────────────────────────
export function registerEmailHandlers(): void {

  // Read a saved .eml file and return full content for in-app viewer
  ipcMain.handle('email:read-eml', async (_event, filePath: string) => {
    try {
      const rawBuf = readFileSync(filePath)
      const mail = await simpleParser(rawBuf)

      const from = mail.from?.text ?? 'Unknown'
      const to = mail.to
        ? (Array.isArray(mail.to) ? mail.to : [mail.to]).map((a) => a.text).join(', ')
        : ''

      return {
        success: true,
        subject: mail.subject ?? '(No subject)',
        from,
        to,
        date: mail.date?.toISOString() ?? null,
        bodyHtml: mail.html || null,
        bodyText: mail.text ?? '',
      }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // Read a saved .msg file and return full content for in-app viewer
  ipcMain.handle('email:read-msg', async (_event, filePath: string) => {
    try {
      const msgBuffer = readFileSync(filePath) as unknown as ArrayBuffer
      const reader = new MsgReader(msgBuffer)
      const fileData = reader.getFileData()
      if (!fileData) return { success: false, error: 'Could not parse .msg file' }

      const from: string = fileData.senderName
        ? `${fileData.senderName} <${fileData.senderEmail ?? ''}>`
        : (fileData.senderEmail ?? 'Unknown')

      const to: string = (fileData.recipients ?? [])
        .map((r: { email?: string; name?: string }) => r.email ?? r.name ?? '')
        .filter(Boolean)
        .join(', ')

      // msgreader returns bodyHtml for HTML-body messages.
      // For RTF-body messages (Outlook default for formatted emails), bodyHtml is null
      // but compressedRtf contains the original HTML embedded as \htmltag markers.
      let bodyHtml: string | null = (fileData.bodyHtml as string | undefined) ?? null
      if (!bodyHtml && fileData.compressedRtf) {
        try {
          const rtfBytes = decompressRTF(Array.from(fileData.compressedRtf as Uint8Array))
          const rtfStr = Buffer.from(rtfBytes).toString('latin1')
          // Only attempt extraction on \fromhtml1 RTF (has embedded HTML)
          if (rtfStr.includes('\\fromhtml1')) {
            const extracted = extractHtmlFromRtf(rtfStr)
            if (extracted.trim().length > 0) bodyHtml = extracted
          }
        } catch (rtfErr) {
          console.warn('[EmailHandler] RTF extraction failed:', rtfErr)
        }
      }
      // fileData.body may contain raw RTF control words when the message was
      // stored as RTF internally — strip them so the viewer shows clean text.
      const rawBodyText = (fileData.body as string | undefined) ?? ''
      const bodyText = stripRtfControlWords(rawBodyText)

      return {
        success: true,
        subject: (fileData.subject as string | undefined) ?? '(No subject)',
        from,
        to,
        date: fileData.messageDeliveryTime ?? null,
        bodyHtml,
        bodyText,
      }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // ── .msg (MAPI) ────────────────────────────────────────────────────────────
  ipcMain.handle('email:parse-and-attach', async (_event, req: {
    msgFilePath: string; sharePointRoot: string; year: string; clientName: string; taskTitle: string
  }) => {
    try {
      const { msgFilePath, sharePointRoot, year, clientName, taskTitle } = req
      const rawBuf = readFileSync(msgFilePath)
      const reader = new MsgReader(rawBuf as unknown as ArrayBuffer)
      const fileData = reader.getFileData()
      if (!fileData) return { success: false, error: 'Could not parse .msg file.' }

      const from: string = fileData.senderName
        ? `${fileData.senderName} <${fileData.senderEmail ?? ''}>`
        : (fileData.senderEmail ?? 'Unknown')

      const atts = (fileData.attachments ?? []).map((att) => {
        const data = reader.getAttachment(att)
        return { fileName: att.fileName ?? '', content: data?.content ? Buffer.from(data.content) : Buffer.alloc(0) }
      }).filter((a) => a.fileName && a.content.byteLength > 0)

      const parsed: ParsedEmail = {
        from,
        subject: (fileData.subject as string | undefined) ?? '(No subject)',
        body: ((fileData.body ?? fileData.bodyHtml ?? '') as string),
        date: fileData.messageDeliveryTime ? new Date(fileData.messageDeliveryTime as string) : null,
        attachments: atts,
      }

      const emailAttachment = buildAndSaveEmailAttachment(parsed, msgFilePath, null, sharePointRoot, year, clientName, taskTitle, '.msg')
      return { success: true, emailAttachment }
    } catch (err) {
      console.error('[EmailHandler] .msg error:', err)
      return { success: false, error: String(err) }
    }
  })

  // ── .eml (RFC 2822 / Internet Message Format) ───────────────────────────────
  ipcMain.handle('email:parse-and-attach-eml', async (_event, req: {
    emlFilePath: string; sharePointRoot: string; year: string; clientName: string; taskTitle: string
  }) => {
    try {
      const { emlFilePath, sharePointRoot, year, clientName, taskTitle } = req
      const rawBuf = readFileSync(emlFilePath)
      const mail = await simpleParser(rawBuf)

      const from = mail.from?.text ?? 'Unknown'
      const atts = (mail.attachments ?? [])
        .filter((a) => a.filename && a.content)
        .map((a) => ({ fileName: a.filename!, content: a.content }))

      const parsed: ParsedEmail = {
        from,
        subject: mail.subject ?? '(No subject)',
        body: mail.html || mail.text || '',
        date: mail.date ?? null,
        attachments: atts,
      }

      const emailAttachment = buildAndSaveEmailAttachment(parsed, emlFilePath, null, sharePointRoot, year, clientName, taskTitle, '.eml')
      return { success: true, emailAttachment }
    } catch (err) {
      console.error('[EmailHandler] .eml error:', err)
      return { success: false, error: String(err) }
    }
  })
}
