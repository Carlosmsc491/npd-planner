// src/main/ipc/reportHandlers.ts
// Task PDF report generation — supports embedded attachments and ZIP export

import { ipcMain, BrowserWindow, dialog, shell } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// ── Helpers ──────────────────────────────────────────────────────────────────

function ext(filePath: string): string {
  return path.extname(filePath).toLowerCase().replace('.', '')
}

function isImage(filePath: string): boolean {
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext(filePath))
}

function isPdf(filePath: string): boolean {
  return ext(filePath) === 'pdf'
}

function isExcel(filePath: string): boolean {
  return ['xlsx', 'xls'].includes(ext(filePath))
}

function isWord(filePath: string): boolean {
  return ['docx', 'doc'].includes(ext(filePath))
}

function isEmail(filePath: string): boolean {
  return ['msg', 'eml'].includes(ext(filePath))
}

function fileIconSvg(filePath: string): string {
  const e = ext(filePath)
  if (isImage(filePath)) return '🖼'
  if (isPdf(filePath)) return '📄'
  if (isExcel(filePath)) return '📊'
  if (isWord(filePath)) return '📝'
  if (isEmail(filePath)) return '📧'
  if (e === 'csv') return '📋'
  if (e === 'zip') return '🗜'
  return '📎'
}

// ── Read image as base64 data URL ─────────────────────────────────────────────
function imageToDataUrl(filePath: string): string {
  const e = ext(filePath)
  const mimeMap: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
  }
  const mime = mimeMap[e] ?? 'image/jpeg'
  const buf = fs.readFileSync(filePath)
  return `data:${mime};base64,${buf.toString('base64')}`
}

// ── Capture PDF pages as base64 PNG screenshots ────────────────────────────
async function pdfToImages(pdfPath: string): Promise<string[]> {
  const images: string[] = []
  let win: BrowserWindow | null = null
  try {
    win = new BrowserWindow({
      show: false,
      width: 850,
      height: 1100,
      webPreferences: { offscreen: false },
    })

    // Load the PDF
    await win.loadURL(`file://${pdfPath}`)
    // Give Chromium's built-in PDF viewer a moment to render
    await new Promise(r => setTimeout(r, 1200))

    // Capture page 1 (the visible viewport)
    const img = await win.webContents.capturePage()
    const png = img.toPNG()
    images.push(`data:image/png;base64,${png.toString('base64')}`)
  } catch {
    // If PDF capture fails, return empty (we'll show a placeholder)
  } finally {
    if (win && !win.isDestroyed()) win.destroy()
  }
  return images
}

// ── Excel → HTML tables (all sheets) ──────────────────────────────────────
async function excelToHtml(filePath: string): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const XLSX = require('xlsx') as typeof import('xlsx')
    const workbook = XLSX.readFile(filePath, { type: 'file', cellHTML: false })
    let html = ''
    for (const sheetName of workbook.SheetNames) {
      const ws = workbook.Sheets[sheetName]
      const rows: string[][] = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' }) as string[][]
      if (rows.length === 0) continue

      const tableRows = rows.map((row, ri) => {
        const cells = row.map(cell => {
          const val = cell == null ? '' : String(cell)
          if (ri === 0) return `<th style="background:#1e293b;color:#fff;padding:5px 10px;text-align:left;font-size:12px;white-space:nowrap;">${val}</th>`
          return `<td style="padding:4px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;vertical-align:top;">${val}</td>`
        }).join('')
        const bg = ri % 2 === 0 ? '' : 'background:#f8fafc;'
        return `<tr style="${bg}">${cells}</tr>`
      }).join('')

      html += `
        <div style="margin-bottom:20px;">
          <div style="font-weight:700;font-size:13px;margin-bottom:6px;color:#0f172a;border-bottom:2px solid #1D9E75;padding-bottom:4px;">
            Sheet: ${sheetName}
          </div>
          <div style="overflow-x:auto;">
            <table style="border-collapse:collapse;width:auto;max-width:100%;">${tableRows}</table>
          </div>
        </div>`
    }
    return html || '<p style="color:#888;font-size:12px;">Empty spreadsheet</p>'
  } catch (err) {
    return `<p style="color:#ef4444;font-size:12px;">Could not read Excel file: ${String(err)}</p>`
  }
}

// ── Word → HTML ────────────────────────────────────────────────────────────
async function wordToHtml(filePath: string): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mammoth = require('mammoth') as { convertToHtml(opts: { path: string }): Promise<{ value: string }> }
    const result = await mammoth.convertToHtml({ path: filePath })
    return result.value || '<p style="color:#888;font-size:12px;">Empty document</p>'
  } catch (err) {
    return `<p style="color:#ef4444;font-size:12px;">Could not read Word file: ${String(err)}</p>`
  }
}

// ── Strip RTF control words from plain-text body ─────────────────────────
// Same logic as emailHandlers.ts — keeps paragraph structure, strips \par \pard etc.
function stripRtf(text: string): string {
  if (!text.includes('\\par') && !text.includes('\\pard') && !text.includes('\\rtf')) return text
  return text
    .replace(/\\par\b[ \t]*/gi, '\n')
    .replace(/\\line\b[ \t]*/gi, '\n')
    .replace(/\\tab\b[ \t]*/gi, '\t')
    .replace(/\\[a-zA-Z]+\d*[ \t]?/g, '')
    .replace(/\\\\/g, '\\')
    .replace(/\\'[0-9a-fA-F]{2}/g, '')
    .replace(/[{}]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Convert plain text to simple HTML — preserves paragraphs, escapes HTML
function textToHtml(text: string): string {
  const clean = stripRtf(text)
  return clean
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .split(/\n\n+/)
    .map(para => `<p style="margin:4px 0;font-size:13px;line-height:1.5;">${para.replace(/\n/g, '<br>')}</p>`)
    .join('\n')
}

// ── Email (.msg / .eml) → HTML ─────────────────────────────────────────────
async function emailToHtml(filePath: string): Promise<string> {
  try {
    if (ext(filePath) === 'msg') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const MsgReader = require('@kenjiuno/msgreader').default as new (buf: ArrayBuffer) => { getFileData(): Record<string, unknown>; }
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { decompressRTF } = require('@kenjiuno/decompressrtf') as { decompressRTF(arr: number[]): Uint8Array }

      const buf = fs.readFileSync(filePath)
      const reader = new MsgReader(buf.buffer as ArrayBuffer)
      const d = reader.getFileData()
      const from = d.senderName ? `${d.senderName} <${d.senderEmail ?? ''}>` : String(d.senderEmail ?? 'Unknown')
      const subject = String(d.subject ?? '(No subject)')
      const date = d.messageDeliveryTime ? new Date(d.messageDeliveryTime as string).toLocaleString() : ''
      const to = ((d.recipients as { email?: string; name?: string }[]) ?? []).map(r => r.email ?? r.name ?? '').filter(Boolean).join(', ')

      let bodyHtml = String(d.bodyHtml ?? '')
      if (!bodyHtml && d.compressedRtf) {
        try {
          const rtfBytes = decompressRTF(Array.from(d.compressedRtf as Uint8Array))
          const rtfStr = Buffer.from(rtfBytes).toString('latin1')
          if (rtfStr.includes('\\fromhtml1')) {
            // simple extraction of htmltag blocks
            const chunks: string[] = []
            const mark = '{\\*\\htmltag'
            let i = 0
            while (i < rtfStr.length) {
              const idx = rtfStr.indexOf(mark, i)
              if (idx === -1) break
              let j = idx + mark.length
              while (j < rtfStr.length && /\d/.test(rtfStr[j])) j++
              if (rtfStr[j] === ' ') j++
              let tag = ''
              while (j < rtfStr.length && rtfStr[j] !== '}') { tag += rtfStr[j]; j++ }
              chunks.push(tag)
              i = j + 1
            }
            bodyHtml = chunks.join('')
          }
        } catch { /* ignore */ }
      }

      const meta = `
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px 14px;margin-bottom:12px;font-size:12px;">
          <div><strong>From:</strong> ${from}</div>
          ${to ? `<div><strong>To:</strong> ${to}</div>` : ''}
          ${date ? `<div><strong>Date:</strong> ${date}</div>` : ''}
          <div><strong>Subject:</strong> ${subject}</div>
        </div>`

      // Strip broken CID/inline image tags from Outlook HTML — they won't render in PDF
      const cleanBodyHtml = bodyHtml
        ? bodyHtml
            .replace(/<img[^>]+src=["']cid:[^"']*["'][^>]*>/gi, '') // remove cid: images
            .replace(/<img[^>]+>/gi, '')  // remove any remaining broken img tags
        : ''

      const bodyContent = cleanBodyHtml || textToHtml(String(d.body ?? ''))
      return meta + `<div style="font-family:sans-serif;">${bodyContent}</div>`
    } else {
      // .eml
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { simpleParser } = require('mailparser') as { simpleParser(buf: Buffer): Promise<{ from?: { text: string }; to?: { text: string } | { text: string }[]; subject?: string; date?: Date; html?: string; text?: string }> }
      const raw = fs.readFileSync(filePath)
      const mail = await simpleParser(raw)
      const from = mail.from?.text ?? 'Unknown'
      const to = Array.isArray(mail.to) ? mail.to.map(a => a.text).join(', ') : (mail.to?.text ?? '')
      const meta = `
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px 14px;margin-bottom:12px;font-size:12px;">
          <div><strong>From:</strong> ${from}</div>
          ${to ? `<div><strong>To:</strong> ${to}</div>` : ''}
          ${mail.date ? `<div><strong>Date:</strong> ${mail.date.toLocaleString()}</div>` : ''}
          ${mail.subject ? `<div><strong>Subject:</strong> ${mail.subject}</div>` : ''}
        </div>`
      return meta + (mail.html || `<pre style="font-size:13px;white-space:pre-wrap;">${mail.text ?? ''}</pre>`)
    }
  } catch (err) {
    return `<p style="color:#ef4444;font-size:12px;">Could not read email: ${String(err)}</p>`
  }
}

// ── Progress event type ───────────────────────────────────────────────────
export interface ReportProgress {
  percent: number        // 0–100
  step: string           // short label e.g. "Excel"
  message: string        // full description shown to user
  current: number        // attachment index (1-based)
  total: number          // total attachments
}

// ── Build one attachment page ─────────────────────────────────────────────
async function buildAttachmentPage(
  name: string,
  absPath: string,
  index: number,
  onProgress?: (p: Omit<ReportProgress, 'current' | 'total'>) => void
): Promise<string> {
  const fileExists = fs.existsSync(absPath)
  const pageBreak = index > 0 ? '<div style="page-break-before:always;"></div>' : ''
  const header = `
    <div style="padding:16px 24px 12px;background:#f8fafc;border-bottom:2px solid #e2e8f0;">
      <div style="font-size:18px;margin-bottom:4px;">${fileIconSvg(name)}</div>
      <div style="font-weight:700;font-size:15px;color:#0f172a;">${name}</div>
      <div style="font-size:11px;color:#94a3b8;margin-top:2px;">${absPath}</div>
    </div>
    <div style="padding:16px 24px;">`

  const footer = `</div>`

  if (!fileExists) {
    return `${pageBreak}<div style="font-family:sans-serif;font-size:13px;">${header}<p style="color:#ef4444;">File not found: ${absPath}</p>${footer}</div>`
  }

  let content = ''

  if (isImage(absPath)) {
    onProgress?.({ percent: 0, step: 'Image', message: `Embedding image: ${name}` })
    try {
      const dataUrl = imageToDataUrl(absPath)
      content = `<img src="${dataUrl}" style="max-width:100%;max-height:900px;height:auto;display:block;margin:0 auto;" />`
    } catch { content = '<p style="color:#ef4444;font-size:12px;">Could not load image.</p>' }
  } else if (isPdf(absPath)) {
    onProgress?.({ percent: 0, step: 'PDF', message: `Rendering PDF: ${name}` })
    const pages = await pdfToImages(absPath)
    if (pages.length > 0) {
      content = pages.map(p => `<img src="${p}" style="max-width:100%;height:auto;display:block;margin:0 auto 8px;" />`).join('')
    } else {
      content = `<p style="color:#64748b;font-size:13px;">📄 PDF file — open in a PDF viewer to see content.<br><em>${absPath}</em></p>`
    }
  } else if (isExcel(absPath)) {
    onProgress?.({ percent: 0, step: 'Excel', message: `Reading spreadsheet: ${name}` })
    content = await excelToHtml(absPath)
  } else if (isWord(absPath)) {
    onProgress?.({ percent: 0, step: 'Word', message: `Reading document: ${name}` })
    content = await wordToHtml(absPath)
  } else if (isEmail(absPath)) {
    onProgress?.({ percent: 0, step: 'Email', message: `Parsing email: ${name}` })
    content = await emailToHtml(absPath)
  } else {
    // generic — show file info
    let size = ''
    try { size = `${(fs.statSync(absPath).size / 1024).toFixed(1)} KB` } catch { /* ignore */ }
    content = `
      <div style="display:flex;align-items:center;gap:16px;padding:20px;background:#f8fafc;border-radius:8px;border:1px dashed #cbd5e1;">
        <span style="font-size:40px;">${fileIconSvg(absPath)}</span>
        <div>
          <div style="font-weight:700;font-size:14px;">${name}</div>
          ${size ? `<div style="font-size:12px;color:#64748b;">Size: ${size}</div>` : ''}
          <div style="font-size:12px;color:#94a3b8;margin-top:4px;">Open the original file to view content.</div>
        </div>
      </div>`
  }

  return `${pageBreak}<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">${header}${content}${footer}</div>`
}

// ── Render HTML → PDF via hidden BrowserWindow ─────────────────────────────
async function htmlToPdf(htmlContent: string, outputPath: string): Promise<void> {
  let tmpHtml: string | null = null
  let win: BrowserWindow | null = null
  try {
    tmpHtml = path.join(os.tmpdir(), `npd-report-${Date.now()}.html`)
    fs.writeFileSync(tmpHtml, htmlContent, 'utf-8')

    win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
    await win.loadFile(tmpHtml)

    const buf = await win.webContents.printToPDF({
      pageSize: 'Letter',
      printBackground: true,
      margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
    })
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, buf)
  } finally {
    if (win && !win.isDestroyed()) win.destroy()
    if (tmpHtml) try { fs.unlinkSync(tmpHtml) } catch { /* best-effort */ }
  }
}

// ── ZIP helper (cross-platform, no extra deps) ──────────────────────────────
async function createZip(entries: { srcPath: string; archivePath: string }[], destZipPath: string): Promise<void> {
  const { execFile, exec } = await import('child_process')
  const { promisify } = await import('util')
  const execFileP = promisify(execFile)
  const execP = promisify(exec)

  // Stage files in a temp folder first
  const tmpDir = path.join(os.tmpdir(), `npd-zip-${Date.now()}`)
  fs.mkdirSync(tmpDir, { recursive: true })

  for (const e of entries) {
    const dest = path.join(tmpDir, e.archivePath)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(e.srcPath, dest)
  }

  fs.mkdirSync(path.dirname(destZipPath), { recursive: true })

  if (process.platform === 'win32') {
    // PowerShell Compress-Archive
    const src = tmpDir.replace(/\\/g, '\\\\')
    const dst = destZipPath.replace(/\\/g, '\\\\')
    await execP(`powershell -NoProfile -Command "Compress-Archive -Path '${src}\\*' -DestinationPath '${dst}' -Force"`)
  } else {
    await execFileP('zip', ['-r', destZipPath, '.'], { cwd: tmpDir })
  }

  // Cleanup temp dir
  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
}

// ── IPC interface ─────────────────────────────────────────────────────────
interface ReportRequest {
  summaryHtml: string         // cover page HTML (already generated by renderer)
  includeAttachments: boolean // Mode A: embed in PDF | Mode B: separate
  attachments: Array<{        // regular file attachments
    name: string
    absPath: string
    group?: string            // type section label (Photos, Emails, PDF Documents…)
  }>
  emailAttachments: Array<{   // email files
    name: string
    absPath: string
    group?: string
  }>
  outputPdfPath: string       // absolute path to save PDF
}

interface ReportResult {
  success: boolean
  pdfPath?: string
  error?: string
}

interface ZipRequest {
  pdfPath: string
  attachments: Array<{ name: string; absPath: string }>
  emailAttachments: Array<{ name: string; absPath: string }>
  destZipPath: string
}

// ── Register handlers ─────────────────────────────────────────────────────
export function registerReportHandlers(): void {

  // Generate the full PDF report
  ipcMain.handle('task:generate-report', async (event, req: ReportRequest): Promise<ReportResult> => {
    // Helper: send progress to renderer
    const emit = (p: ReportProgress) => {
      try { event.sender.send('task:report-progress', p) } catch { /* window may have closed */ }
    }

    try {
      let fullHtml = req.summaryHtml
      const allAttachments = req.includeAttachments
        ? [...req.attachments, ...req.emailAttachments]
        : []
      const total = allAttachments.length

      emit({ percent: 5, step: 'Summary', message: 'Building cover page…', current: 0, total })

      if (req.includeAttachments && total > 0) {
        // Track completion count for live progress updates
        let doneCount = 0

        // Process attachments in parallel — up to 4 at a time (avoids too many
        // hidden BrowserWindows for PDF screenshots while still saving time)
        const CONCURRENCY = 4
        const results: (string | null)[] = new Array(allAttachments.length).fill(null)

        async function processOne(i: number) {
          const a = allAttachments[i]
          if (!a.absPath || !fs.existsSync(a.absPath)) {
            results[i] = ''
            return
          }
          const basePercent = 10 + Math.round((i / total) * 75)
          emit({ percent: basePercent, step: 'Processing', message: `Processing: ${a.name}`, current: i + 1, total })

          const page = await buildAttachmentPage(a.name, a.absPath, i + 1, ({ step, message }) => {
            emit({ percent: basePercent, step, message, current: i + 1, total })
          })
          results[i] = page
          doneCount++
          emit({
            percent: 10 + Math.round((doneCount / total) * 75),
            step: 'Done',
            message: `Processed ${doneCount} of ${total}: ${a.name}`,
            current: doneCount,
            total,
          })
        }

        // Run with limited concurrency
        for (let start = 0; start < allAttachments.length; start += CONCURRENCY) {
          const batch = allAttachments.slice(start, start + CONCURRENCY).map((_, j) => processOne(start + j))
          await Promise.all(batch)
        }

        // Stitch pages in order, inserting a full-page section divider every
        // time the type group changes (Photos → Emails → PDF Documents → …)
        let attachmentPages = ''
        let lastGroup = ''
        for (let i = 0; i < allAttachments.length; i++) {
          const page = results[i]
          if (!page) continue
          const group = allAttachments[i].group ?? ''
          if (group && group !== lastGroup) {
            const count = allAttachments.filter(a => a.group === group && results[allAttachments.indexOf(a)]).length
            attachmentPages += `
              <div style="page-break-before:always;page-break-after:always;display:flex;flex-direction:column;align-items:center;justify-content:center;height:9.5in;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
                <div style="font-size:11px;letter-spacing:.3em;color:#94a3b8;text-transform:uppercase;margin-bottom:12px;">Attachments</div>
                <div style="font-size:34px;font-weight:800;color:#0f172a;">${group}</div>
                <div style="margin-top:10px;font-size:13px;color:#64748b;">${count} file${count !== 1 ? 's' : ''}</div>
                <div style="margin-top:18px;width:60px;height:4px;border-radius:2px;background:#1D9E75;"></div>
              </div>`
            lastGroup = group
          }
          attachmentPages += page
        }
        if (attachmentPages) {
          fullHtml = fullHtml.replace('</body>', `${attachmentPages}</body>`)
        }
      }

      emit({ percent: 88, step: 'PDF', message: 'Rendering PDF…', current: total, total })
      await htmlToPdf(fullHtml, req.outputPdfPath)
      emit({ percent: 100, step: 'Done', message: 'Report saved!', current: total, total })

      return { success: true, pdfPath: req.outputPdfPath }
    } catch (err) {
      console.error('[ReportHandlers] generate-report failed:', err)
      return { success: false, error: String(err) }
    }
  })

  // Create a ZIP with PDF + separate attachment files (Mode B)
  ipcMain.handle('task:create-report-zip', async (_event, req: ZipRequest): Promise<{ success: boolean; zipPath?: string; error?: string }> => {
    try {
      const entries: { srcPath: string; archivePath: string }[] = []

      // PDF goes at root of ZIP
      if (fs.existsSync(req.pdfPath)) {
        entries.push({ srcPath: req.pdfPath, archivePath: path.basename(req.pdfPath) })
      }

      // Attachments go in /Attachments/ subfolder
      for (const a of [...req.attachments, ...req.emailAttachments]) {
        if (a.absPath && fs.existsSync(a.absPath)) {
          entries.push({ srcPath: a.absPath, archivePath: `Attachments/${a.name}` })
        }
      }

      if (entries.length === 0) {
        return { success: false, error: 'No files to include in ZIP.' }
      }

      await createZip(entries, req.destZipPath)
      return { success: true, zipPath: req.destZipPath }
    } catch (err) {
      console.error('[ReportHandlers] create-report-zip failed:', err)
      return { success: false, error: String(err) }
    }
  })

  // Open save-as dialog for ZIP
  ipcMain.handle('task:save-report-dialog', async (event, opts: { defaultName: string; type: 'pdf' | 'zip' }): Promise<string | null> => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null
    const ext2 = opts.type === 'zip' ? 'zip' : 'pdf'
    const result = await dialog.showSaveDialog(win, {
      title: `Save Report ${opts.type.toUpperCase()}`,
      defaultPath: opts.defaultName,
      filters: [{ name: opts.type.toUpperCase(), extensions: [ext2] }],
    })
    return result.canceled ? null : result.filePath ?? null
  })

  // Reveal in Finder/Explorer (reuses shell)
  ipcMain.handle('task:open-report', async (_event, filePath: string): Promise<void> => {
    await shell.openPath(filePath)
  })
}
