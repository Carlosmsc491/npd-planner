// src/main/ipc/emailHandlers.ts
// IPC handler for parsing Outlook .msg / .eml files and copying to SharePoint

import { ipcMain } from 'electron'
import { join } from 'path'
import { mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'fs'
import MsgReader from '@kenjiuno/msgreader'
import { decompressRTF } from '@kenjiuno/decompressrtf'
import { simpleParser } from 'mailparser'

// ── Windows-1252 decoding for RTF \'xx escapes ────────────────────────────────
// Codes 0x80–0x9F differ between cp1252 and Unicode (smart quotes, dashes, €).
// Decoding them with fromCharCode produces invisible control chars (shown as �).
const CP1252_MAP: Record<number, string> = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…',
  0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰', 0x8A: 'Š',
  0x8B: '‹', 0x8C: 'Œ', 0x8E: 'Ž', 0x91: '‘', 0x92: '’',
  0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—',
  0x98: '˜', 0x99: '™', 0x9A: 'š', 0x9B: '›', 0x9C: 'œ',
  0x9E: 'ž', 0x9F: 'Ÿ',
}

function decodeCp1252(code: number): string {
  return CP1252_MAP[code] ?? String.fromCharCode(code)
}

// RTF destination groups whose content must never appear as body text.
// {\fonttbl...} leaking is what shows "Arial; Courier New; Symbol;..." in the viewer.
const RTF_SKIP_DESTINATIONS = new Set([
  'fonttbl', 'colortbl', 'stylesheet', 'info', 'generator', 'pict', 'object',
  'themedata', 'colorschememapping', 'latentstyles', 'datastore', 'listtable',
  'listoverridetable', 'rsidtbl', 'xmlnstbl', 'mmathPr', 'pgptbl', 'filetbl',
])

// ── RTF parser ────────────────────────────────────────────────────────────────
// asHtml=true: Outlook \fromhtml1 RTF → reconstruct the embedded HTML from
//   {\*\htmltag<n>} blocks plus the \htmlrtf0 text-fallback sections.
// asHtml=false: any RTF → plain readable text (htmltag groups are HTML source,
//   so they are discarded; \par becomes a newline).
//
// Three failure modes of the previous version, all fixed here:
//   1. {\fonttbl}/{\colortbl} group content leaked into the output as text.
//   2. Content inside {\*\htmltag} groups was copied verbatim, so RTF control
//      words like \par embedded in those groups appeared literally as "\par".
//   3. \'9x escapes decoded as raw charcodes → control chars instead of ’ “ ” –.
function parseRtf(rtfStr: string, asHtml: boolean): string {
  const BS = '\\'
  const output: string[] = []
  let i = 0
  let depth = 0
  let htmlMode = true        // \htmlrtf toggles text-fallback suppression
  let skipDepth = -1         // >=0 → inside a destination group being discarded
  let htmltagDepth = -1      // >=0 → inside a {\*\htmltag} group (emit raw HTML source)
  let ucSkip = 1             // \ucN — fallback chars to skip after \uN
  let pendingUcSkip = 0      // chars still to swallow after a \uN escape

  const emitting = (): boolean => skipDepth === -1 && (htmltagDepth !== -1 || htmlMode)

  const emit = (s: string): void => {
    if (pendingUcSkip > 0) { pendingUcSkip--; return }
    if (emitting()) output.push(s)
  }

  while (i < rtfStr.length) {
    const ch = rtfStr[i]

    if (ch === '{') {
      depth++
      // Peek the destination control word right after the brace
      const rest = rtfStr.slice(i + 1, i + 40)
      const starMatch = rest.match(/^\\\*\\([a-zA-Z]+)/)
      const plainMatch = rest.match(/^\\([a-zA-Z]+)/)
      if (skipDepth === -1) {
        if (starMatch && (starMatch[1] !== 'htmltag' || !asHtml)) {
          // Unknown \* destination — RTF spec says ignore entirely.
          // In text mode htmltag groups are HTML source, not text → also skip.
          skipDepth = depth
        } else if (starMatch && starMatch[1] === 'htmltag' && htmltagDepth === -1) {
          htmltagDepth = depth
        } else if (!starMatch && plainMatch && RTF_SKIP_DESTINATIONS.has(plainMatch[1])) {
          skipDepth = depth
        }
      }
      i++; continue
    }

    if (ch === '}') {
      if (depth === skipDepth) skipDepth = -1
      if (depth === htmltagDepth) htmltagDepth = -1
      depth--
      i++; continue
    }

    if (ch === BS) {
      i++
      if (i >= rtfStr.length) break
      const next = rtfStr[i]
      // Escaped literals
      if (next === BS) { emit(BS); i++; continue }
      if (next === '{') { emit('{'); i++; continue }
      if (next === '}') { emit('}'); i++; continue }
      if (next === '*') { i++; continue }
      if (next === '-' || next === '|' || next === ':') { i++; continue }
      if (next === '~') { emit(asHtml ? '&nbsp;' : ' '); i++; continue }
      if (next === '_') { emit('-'); i++; continue }
      if (next === "'") {
        const hex = rtfStr.substring(i + 1, i + 3)
        const code = parseInt(hex, 16)
        i += 3
        if (isNaN(code)) continue
        if (pendingUcSkip > 0) { pendingUcSkip--; continue }
        if (!emitting()) continue
        if (code === 0xa0) output.push(asHtml ? '&nbsp;' : ' ')
        else output.push(decodeCp1252(code))
        continue
      }

      // Control word: \word or \wordN or \word-N
      let word = ''
      while (i < rtfStr.length && /[a-zA-Z]/.test(rtfStr[i])) { word += rtfStr[i]; i++ }
      let param = ''
      if (i < rtfStr.length && (rtfStr[i] === '-' || /[\d]/.test(rtfStr[i]))) {
        if (rtfStr[i] === '-') { param += '-'; i++ }
        while (i < rtfStr.length && /[\d]/.test(rtfStr[i])) { param += rtfStr[i]; i++ }
      }
      if (i < rtfStr.length && rtfStr[i] === ' ') i++

      if (word === 'htmlrtf') { htmlMode = (param === '0'); continue }
      if (word === 'uc') { ucSkip = param ? parseInt(param, 10) : 1; continue }
      if (word === 'u' && param) {
        let code = parseInt(param, 10)
        if (code < 0) code += 65536
        if (emitting()) output.push(asHtml ? `&#${code};` : String.fromCodePoint(code))
        pendingUcSkip = ucSkip
        continue
      }
      if (word === 'bin' && param) {
        // Binary blob — skip raw bytes entirely
        i += Math.max(0, parseInt(param, 10))
        continue
      }
      if (word === 'par' || word === 'line') {
        // Inside htmltag groups \par encodes a source-code newline (HTML collapses
        // whitespace, so '\n' is safe); in text fallback it is a visual break.
        if (htmltagDepth !== -1 || !asHtml) emit('\n')
        else emit('<br>')
        continue
      }
      if (word === 'tab') { emit(htmltagDepth !== -1 || !asHtml ? '\t' : '&nbsp;&nbsp;&nbsp;'); continue }
      // All other control words (\f0, \cf1, \fs20, ...) carry no text — drop them
      continue
    }

    if (ch !== '\r' && ch !== '\n') emit(ch)
    else if (htmltagDepth !== -1) emit('\n')
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
  // Full RTF document — use the real parser so header groups (fonttbl, colortbl)
  // don't leak as text and \'xx escapes decode correctly
  if (text.includes('{\\rtf')) {
    return parseRtf(text, false)
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }
  return text
    // Turn \par / \line into line breaks (preserve paragraph structure)
    .replace(/\\par\b[ \t]*/gi, '\n')
    .replace(/\\line\b[ \t]*/gi, '\n')
    .replace(/\\tab\b[ \t]*/gi, '\t')
    // Strip remaining control words (\word or \word123)
    .replace(/\\[a-zA-Z]+\d*[ \t]?/g, '')
    // Strip literal \\ escapes; decode hex chars as Windows-1252
    .replace(/\\\\/g, '\\')
    .replace(/\\'([0-9a-fA-F]{2})/g, (_m, h: string) => decodeCp1252(parseInt(h, 16)))
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
  // Snippet must be plain readable text: strip HTML tags AND RTF control words
  // (raw .msg bodies are sometimes RTF), then collapse whitespace.
  const bodySnippet = stripRtfControlWords(body.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)

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
            const extracted = parseRtf(rtfStr, true)
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
