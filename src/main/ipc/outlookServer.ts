// src/main/ipc/outlookServer.ts
// Local HTTPS server that receives email assignments from the Outlook Add-in.
// Only binds to 127.0.0.1 — inaccessible from other machines on the network.
// Uses a self-signed cert stored in userData; installs it to the Windows
// Trusted Root store on first run so Outlook's WebView trusts it.

import https from 'https'
import http from 'http'
import { ipcMain, BrowserWindow, app } from 'electron'
import { join, extname } from 'path'
import { mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync } from 'fs'
import { execSync } from 'child_process'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const selfsigned = require('selfsigned')

const PORT = 3847
const BOARDS_RESPONSE_TIMEOUT_MS = 5000

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.xml':  'application/xml',
}

// ── Certificate management ────────────────────────────────────────────────────

interface CertPaths {
  dir: string
  certPem: string
  keyPem: string
  certCrt: string  // DER-encoded .crt for certutil import
}

function getCertPaths(): CertPaths {
  const dir = join(app.getPath('userData'), 'outlook-cert')
  return {
    dir,
    certPem: join(dir, 'cert.pem'),
    keyPem:  join(dir, 'key.pem'),
    certCrt: join(dir, 'cert.crt'),
  }
}

function generateAndInstallCert(paths: CertPaths): { cert: string; key: string } {
  mkdirSync(paths.dir, { recursive: true })

  const attrs = [{ name: 'commonName', value: 'localhost' }]
  const pems = selfsigned.generate(attrs, {
    algorithm: 'sha256',
    days: 3650,
    keySize: 2048,
    extensions: [
      { name: 'subjectAltName', altNames: [{ type: 2, value: 'localhost' }] },
      { name: 'basicConstraints', cA: true },
    ],
  }) as { cert: string; private: string }

  writeFileSync(paths.certPem, pems.cert, 'utf-8')
  writeFileSync(paths.keyPem,  pems.private, 'utf-8')
  writeFileSync(paths.certCrt, pems.cert, 'utf-8')

  // Install to current-user Trusted Root so Outlook's WebView2 trusts the cert.
  // Windows may show a one-time confirmation dialog.
  try {
    if (process.platform === 'win32') {
      execSync(`certutil -addstore -user Root "${paths.certCrt}"`, { stdio: 'ignore' })
    }
  } catch (err) {
    console.warn('[OutlookServer] Could not auto-install cert (user may need to trust manually):', err)
  }

  return { cert: pems.cert, key: pems.private }
}

function ensureCert(): { cert: string; key: string } {
  const paths = getCertPaths()
  if (existsSync(paths.certPem) && existsSync(paths.keyPem)) {
    return {
      cert: readFileSync(paths.certPem, 'utf-8'),
      key:  readFileSync(paths.keyPem,  'utf-8'),
    }
  }
  return generateAndInstallCert(paths)
}

// ── Static file serving ───────────────────────────────────────────────────────

function getAddinPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'outlook-addin')
  }
  // Dev: webpack outputs to resources/outlook-addin relative to repo root
  // __dirname = out/main, so ../.. = repo root
  return join(__dirname, '../../resources/outlook-addin')
}

function serveStatic(urlPath: string, res: http.ServerResponse): void {
  const addinDir = getAddinPath()
  const normalized = urlPath === '/' ? '/taskpane.html' : urlPath
  const filePath = join(addinDir, normalized.split('?')[0])

  if (!filePath.startsWith(addinDir)) {
    res.writeHead(403); res.end('Forbidden'); return
  }
  if (!existsSync(filePath)) {
    res.writeHead(404); res.end('Not found'); return
  }

  const mime = MIME[extname(filePath)] ?? 'application/octet-stream'
  res.writeHead(200, { 'Content-Type': mime })
  res.end(readFileSync(filePath))
}

// ── Email payload types ───────────────────────────────────────────────────────

export interface OutlookInnerAttachment {
  name: string
  contentType: string
  sizeBytes: number
  base64Content: string
}

export interface OutlookEmailPayload {
  taskId: string
  sharePointRoot: string
  year: string
  clientName: string
  taskTitle: string
  email: {
    subject: string
    from: string
    dateReceived: string
    bodySnippet: string
    attachments: OutlookInnerAttachment[]
  }
}

function sanitizeName(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '-').replace(/[.\s]+$/g, '').replace(/\s+/g, ' ').trim()
}

async function processEmailPayload(payload: OutlookEmailPayload, mainWindow: BrowserWindow): Promise<void> {
  const { taskId, sharePointRoot, year, clientName, taskTitle, email } = payload
  const safeClient  = sanitizeName(clientName)
  const safeTask    = sanitizeName(taskTitle)
  const safeSubject = sanitizeName(email.subject).slice(0, 60)

  const innerAttachments: Array<{ id: string; name: string; sharePointRelativePath: string; sizeBytes: number | null; mimeType: string | null }> = []

  if (email.attachments.length > 0) {
    const emailSubFolder = join(sharePointRoot, year, safeClient, safeTask, safeSubject)
    mkdirSync(emailSubFolder, { recursive: true })
    for (const att of email.attachments) {
      const safeName = sanitizeName(att.name)
      const destPath = join(emailSubFolder, safeName)
      const buffer = Buffer.from(att.base64Content, 'base64')
      writeFileSync(destPath, buffer)
      innerAttachments.push({
        id: crypto.randomUUID(),
        name: att.name,
        sharePointRelativePath: `${year}/${safeClient}/${safeTask}/${safeSubject}/${safeName}`,
        sizeBytes: buffer.byteLength,
        mimeType: att.contentType || null,
      })
    }
  }

  const emailAttachment = {
    id: crypto.randomUUID(),
    type: 'email' as const,
    from: email.from,
    subject: email.subject,
    date: email.dateReceived
      ? { seconds: Math.floor(new Date(email.dateReceived).getTime() / 1000), nanoseconds: 0 }
      : null,
    bodySnippet: email.bodySnippet.slice(0, 200),
    msgRelativePath: '',
    innerAttachments,
    uploadedBy: '',
    uploadedAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
  }

  mainWindow.webContents.send('outlook:save-email-attachment', { taskId, emailAttachment })
}

// ── Manifest helper ───────────────────────────────────────────────────────────

export function copyManifestToDesktop(): { success: boolean; destPath?: string; error?: string } {
  try {
    const src  = getAddinPath()
    const srcFile = join(src, 'NPD_Planner_Manifest.xml')
    const dest = join(app.getPath('desktop'), 'NPD_Planner_Manifest.xml')
    copyFileSync(srcFile, dest)
    return { success: true, destPath: dest }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

// ── Server ────────────────────────────────────────────────────────────────────

function setCorsHeaders(res: http.ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

function createRequestHandler(mainWindow: BrowserWindow) {
  return (req: http.IncomingMessage, res: http.ServerResponse) => {
    setCorsHeaders(res)

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

    if (req.method === 'GET' && req.url === '/ping') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok', app: 'NPD Planner' }))
      return
    }

    if (req.method === 'GET' && req.url === '/api/boards') {
      let responded = false
      const timeout = setTimeout(() => {
        if (responded) return
        responded = true
        ipcMain.removeAllListeners('outlook:boards-response')
        res.writeHead(503, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'NPD Planner renderer timeout' }))
      }, BOARDS_RESPONSE_TIMEOUT_MS)

      ipcMain.once('outlook:boards-response', (_e, data) => {
        if (responded) return
        responded = true
        clearTimeout(timeout)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(data))
      })
      mainWindow.webContents.send('outlook:get-boards')
      return
    }

    if (req.method === 'POST' && req.url === '/api/assign') {
      let body = ''
      req.on('data', (chunk) => { body += chunk })
      req.on('end', async () => {
        try {
          const payload: OutlookEmailPayload = JSON.parse(body)
          await processEmailPayload(payload, mainWindow)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true }))
        } catch (err) {
          console.error('[OutlookServer] Error:', err)
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, error: String(err) }))
        }
      })
      return
    }

    // Static taskpane files
    if (req.method === 'GET' && req.url) {
      serveStatic(req.url, res)
      return
    }

    res.writeHead(404); res.end('Not found')
  }
}

export function startOutlookServer(mainWindow: BrowserWindow): https.Server {
  const { cert, key } = ensureCert()
  const handler = createRequestHandler(mainWindow)
  const server = https.createServer({ cert, key }, handler)

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[OutlookServer] HTTPS running on https://localhost:${PORT}`)
  })

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[OutlookServer] Port ${PORT} already in use — skipping`)
    } else {
      console.error('[OutlookServer] Error:', err)
    }
  })

  return server
}
