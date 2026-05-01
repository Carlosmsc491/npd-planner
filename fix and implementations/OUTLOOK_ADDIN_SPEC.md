# NPD Planner — Outlook Add-in "Assign to Task"
## Spec completo + Prompts para Claude Code

**Objetivo:** Un botón verde "Assign to NPD Task" en el ribbon de Outlook que permite asignar un email (con todos sus attachments) a un task del NPD Planner directamente desde Outlook, sin guardar archivos manualmente.

---

## Arquitectura general

```
Outlook (ribbon button)
  ↓ clic "Assign to NPD Task"
Panel lateral React (taskpane)
  ↓ Office.js API lee el email seleccionado
  ↓ usuario elige Board → Bucket → Task en dropdowns
  ↓ clic "Assign"
HTTP POST a localhost:3847 (Electron server)
  ↓ Electron recibe email + attachments como base64
  ↓ procesa igual que el handler .msg existente
  ↓ guarda en SharePoint + Firestore
NPD Planner muestra el email en el task
```

---

## Partes que se construyen

### Parte 1 — Outlook Add-in (repo separado o carpeta `/outlook-addin`)
- `manifest.xml` — describe el add-in a Outlook
- `taskpane.html` — entry point del panel
- `src/taskpane/` — React app del panel

### Parte 2 — NPD Planner Electron (cambios en repo existente)
- `src/main/ipc/outlookServer.ts` — HTTP server en localhost:3847
- Integración con el handler de email existente (`emailHandlers.ts`)

---

## Parte 1: El Add-in de Outlook

### Estructura de carpetas

```
/outlook-addin
  manifest.xml
  package.json
  webpack.config.js
  src/
    taskpane/
      index.tsx          ← entry React
      App.tsx            ← componente principal
      components/
        TaskSelector.tsx  ← dropdowns Board → Bucket → Task
        AssignButton.tsx
      styles/
        taskpane.css
  assets/
    icon-16.png
    icon-32.png
    icon-80.png
```

### manifest.xml (contenido clave)

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<OfficeApp xmlns="http://schemas.microsoft.com/office/appforoffice/1.1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:type="MailApp">

  <Id>npd-planner-outlook-addin-001</Id>
  <Version>1.0.0</Version>
  <ProviderName>Elite Flower NPD</ProviderName>
  <DefaultLocale>en-US</DefaultLocale>
  <DisplayName DefaultValue="NPD Planner"/>
  <Description DefaultValue="Assign emails to NPD Planner tasks"/>

  <IconUrl DefaultValue="https://localhost:3000/assets/icon-80.png"/>
  <HighResolutionIconUrl DefaultValue="https://localhost:3000/assets/icon-80.png"/>
  <SupportUrl DefaultValue="https://localhost:3000"/>

  <AppDomains>
    <AppDomain>localhost</AppDomain>
  </AppDomains>

  <Hosts>
    <Host Name="Mailbox"/>
  </Hosts>

  <Requirements>
    <Sets>
      <Set Name="Mailbox" MinVersion="1.1"/>
    </Sets>
  </Requirements>

  <FormSettings>
    <Form xsi:type="ItemRead">
      <DesktopSettings>
        <SourceLocation DefaultValue="https://localhost:3000/taskpane.html"/>
        <RequestedHeight>550</RequestedHeight>
      </DesktopSettings>
    </Form>
  </FormSettings>

  <Permissions>ReadWriteItem</Permissions>
  <Rule xsi:type="RuleCollection" Mode="Or">
    <Rule xsi:type="ItemIs" ItemType="Message" FormType="Read"/>
  </Rule>

  <!-- Ribbon button -->
  <VersionOverrides xmlns="http://schemas.microsoft.com/office/mailappversionoverrides" xsi:type="VersionOverridesV1_0">
    <Hosts>
      <Host xsi:type="MailHost">
        <DesktopFormFactor>
          <ExtensionPoint xsi:type="MessageReadCommandSurface">
            <OfficeTab id="TabDefault">
              <Group id="msgReadGroup">
                <Label resid="GroupLabel"/>
                <Control xsi:type="Button" id="AssignTaskButton">
                  <Label resid="TaskPaneButton.Label"/>
                  <Supertip>
                    <Title resid="TaskPaneButton.Label"/>
                    <Description resid="TaskPaneButton.Tooltip"/>
                  </Supertip>
                  <Icon>
                    <bt:Image size="16" resid="Icon.16x16"/>
                    <bt:Image size="32" resid="Icon.32x32"/>
                    <bt:Image size="80" resid="Icon.80x80"/>
                  </Icon>
                  <Action xsi:type="ShowTaskpane">
                    <SourceLocation resid="Taskpane.Url"/>
                  </Action>
                </Control>
              </Group>
            </OfficeTab>
          </ExtensionPoint>
        </DesktopFormFactor>
      </Host>
    </Hosts>
    <Resources>
      <bt:Images>
        <bt:Image id="Icon.16x16" DefaultValue="https://localhost:3000/assets/icon-16.png"/>
        <bt:Image id="Icon.32x32" DefaultValue="https://localhost:3000/assets/icon-32.png"/>
        <bt:Image id="Icon.80x80" DefaultValue="https://localhost:3000/assets/icon-80.png"/>
      </bt:Images>
      <bt:Urls>
        <bt:Url id="Taskpane.Url" DefaultValue="https://localhost:3000/taskpane.html"/>
      </bt:Urls>
      <bt:ShortStrings>
        <bt:String id="GroupLabel" DefaultValue="NPD Planner"/>
        <bt:String id="TaskPaneButton.Label" DefaultValue="Assign to NPD Task"/>
      </bt:ShortStrings>
      <bt:LongStrings>
        <bt:String id="TaskPaneButton.Tooltip" DefaultValue="Assign this email and its attachments to an NPD Planner task"/>
      </bt:LongStrings>
    </Resources>
  </VersionOverrides>
</OfficeApp>
```

### App.tsx — flujo del panel

```
Estado del panel:
1. LOADING — verifica que NPD Planner esté corriendo (ping a localhost:3847/ping)
2. OFFLINE — muestra mensaje "NPD Planner must be open"
3. READY — muestra dropdowns
4. ASSIGNING — spinner mientras envía
5. SUCCESS — confirmación verde
6. ERROR — mensaje de error

Dropdowns en cascada:
Board → (filtra) → Bucket → (filtra) → Task

Los datos (boards, buckets, tasks) los obtiene via:
GET localhost:3847/api/boards
GET localhost:3847/api/tasks?boardId=X
```

### Office.js — leer el email

```typescript
// En AssignButton.tsx al hacer clic "Assign":

const item = Office.context.mailbox.item

// 1. Metadata del email
const subject = item.subject
const from = `${item.from.displayName} <${item.from.emailAddress}>`
const dateReceived = item.dateTimeCreated.toISOString()

// 2. Body del email
item.body.getAsync(Office.CoercionType.Text, (result) => {
  const bodyText = result.value.slice(0, 200) // snippet
})

// 3. Attachments
item.attachments // array de AttachmentDetails
// Cada attachment tiene: id, name, size, contentType

// 4. Obtener contenido de cada attachment
item.getAttachmentContentAsync(att.id, (result) => {
  // result.value.content = base64 string
  // result.value.format = 'base64'
})
```

### Payload que se envía a Electron

```typescript
interface AssignEmailPayload {
  taskId: string
  email: {
    subject: string
    from: string
    dateReceived: string
    bodySnippet: string
    attachments: Array<{
      name: string
      contentType: string
      sizeBytes: number
      base64Content: string
    }>
  }
}
```

---

## Parte 2: HTTP Server en Electron

### src/main/ipc/outlookServer.ts

```typescript
import http from 'http'
import { BrowserWindow } from 'electron'

const PORT = 3847

export function startOutlookServer(mainWindow: BrowserWindow): void {
  const server = http.createServer((req, res) => {
    // CORS headers — necesarios porque Outlook taskpane corre en origen diferente
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    // GET /ping — health check
    if (req.method === 'GET' && req.url === '/ping') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok', app: 'NPD Planner' }))
      return
    }

    // GET /api/boards — lista de boards con buckets y tasks
    // Lee desde Firestore via el store del renderer (IPC interno)
    if (req.method === 'GET' && req.url === '/api/boards') {
      // Pedir datos al renderer via webContents.send + ipcMain.once
      mainWindow.webContents.send('outlook:get-boards')
      ipcMain.once('outlook:boards-response', (_e, data) => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(data))
      })
      return
    }

    // POST /api/assign — recibe el email y lo procesa
    if (req.method === 'POST' && req.url === '/api/assign') {
      let body = ''
      req.on('data', chunk => { body += chunk })
      req.on('end', async () => {
        try {
          const payload: AssignEmailPayload = JSON.parse(body)
          // Reusar la lógica del emailHandlers existente
          // pero recibiendo base64 en vez de leer desde disco
          await processOutlookEmail(payload, mainWindow)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true }))
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, error: String(err) }))
        }
      })
      return
    }

    res.writeHead(404)
    res.end()
  })

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[OutlookServer] Listening on localhost:${PORT}`)
  })
}
```

### processOutlookEmail

```typescript
async function processOutlookEmail(
  payload: AssignEmailPayload,
  mainWindow: BrowserWindow
): Promise<void> {
  // 1. Obtener SharePoint root path (pedir al renderer)
  // 2. Obtener task info (year, clientName, taskTitle) del taskId
  // 3. Guardar cada attachment de base64 a disco en SharePoint
  // 4. Construir EmailAttachment object (mismo tipo que emailHandlers.ts)
  // 5. Enviar al renderer para guardar en Firestore
  mainWindow.webContents.send('outlook:save-email-attachment', {
    taskId: payload.taskId,
    emailAttachment: constructedEmailAttachment
  })
}
```

### En renderer — escuchar y guardar

```typescript
// En el store o en un useEffect global:
window.electronAPI.onOutlookEmail((taskId, emailAttachment) => {
  // addEmailAttachment(taskId, ..., emailAttachment) — función ya existente
})
```

---

## Configuración de desarrollo

### Dev server del add-in (localhost:3000 con HTTPS)

Office.js requiere HTTPS incluso en desarrollo. Usar `office-addin-dev-certs`:

```bash
cd outlook-addin
npm install -g office-addin-dev-certs
npx office-addin-dev-certs install   # instala certificado self-signed de confianza
npm run dev                          # webpack-dev-server en https://localhost:3000
```

### package.json del add-in

```json
{
  "name": "npd-planner-outlook-addin",
  "version": "1.0.0",
  "scripts": {
    "dev": "webpack serve --mode development",
    "build": "webpack --mode production",
    "start": "office-addin-debugging start manifest.xml"
  },
  "dependencies": {
    "@microsoft/office-js": "^1.1.0",
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  },
  "devDependencies": {
    "@types/office-js": "^1.0.0",
    "office-addin-dev-certs": "^1.0.0",
    "office-addin-debugging": "^1.0.0",
    "typescript": "^5.0.0",
    "webpack": "^5.0.0",
    "webpack-dev-server": "^4.0.0"
  }
}
```

---

## Instalación para usuarios de Elite Flower

Cada usuario hace esto UNA SOLA VEZ:

1. Abrir Outlook
2. Click "More apps" en el ribbon
3. Click "Manage your apps" (abajo izquierda)
4. Click "Upload a custom app" (ícono de upload)
5. Seleccionar `NPD_Planner_Manifest.xml`
6. Listo — aparece el botón verde en el ribbon

**Requisito:** NPD Planner debe estar abierto en la misma PC para que el HTTP server esté activo.

---

---

# PROMPTS PARA CLAUDE CODE

---

## PROMPT OA1 — HTTP Server en Electron (NPD-PLANNER repo)

```
Lee CLAUDE.md, src/main/index.ts, src/main/ipc/emailHandlers.ts completos antes de empezar.

TAREA: Agregar un HTTP server local en el proceso main de Electron que recibe emails desde el Outlook Add-in.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PASO 1 — Crear src/main/ipc/outlookServer.ts
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Crear con el siguiente contenido:

```typescript
// src/main/ipc/outlookServer.ts
// Local HTTP server that receives email assignments from the Outlook Add-in
// Listens on localhost:3847 — only accessible from the same machine

import http from 'http'
import { ipcMain, BrowserWindow } from 'electron'
import { join } from 'path'
import { mkdirSync, writeFileSync } from 'fs'

const PORT = 3847

export interface OutlookAttachment {
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
    attachments: OutlookAttachment[]
  }
}

function setCorsHeaders(res: http.ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

function sanitize(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/[.\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

async function processEmailPayload(
  payload: OutlookEmailPayload,
  mainWindow: BrowserWindow
): Promise<void> {
  const { taskId, sharePointRoot, year, clientName, taskTitle, email } = payload

  const safeClient = sanitize(clientName)
  const safeTask = sanitize(taskTitle)
  const safeSubject = sanitize(email.subject).slice(0, 60)

  const taskFolder = join(sharePointRoot, year, safeClient, safeTask)
  const emailSubFolder = join(taskFolder, safeSubject)

  // Create attachment subfolder if needed
  if (email.attachments.length > 0) {
    mkdirSync(emailSubFolder, { recursive: true })
  }

  // Save each attachment from base64 to disk
  const innerAttachments = email.attachments.map((att) => {
    const safeName = sanitize(att.name)
    const destPath = join(emailSubFolder, safeName)
    const buffer = Buffer.from(att.base64Content, 'base64')
    writeFileSync(destPath, buffer)
    return {
      id: crypto.randomUUID(),
      name: att.name,
      sharePointRelativePath: `${year}/${safeClient}/${safeTask}/${safeSubject}/${safeName}`,
      sizeBytes: buffer.byteLength,
      mimeType: att.contentType || null,
    }
  })

  const emailAttachment = {
    id: crypto.randomUUID(),
    type: 'email' as const,
    from: email.from,
    subject: email.subject,
    date: email.dateReceived
      ? { seconds: Math.floor(new Date(email.dateReceived).getTime() / 1000), nanoseconds: 0 }
      : null,
    bodySnippet: email.bodySnippet.slice(0, 200),
    msgRelativePath: '',  // No .msg file — came from Outlook Add-in directly
    innerAttachments,
    uploadedBy: '',  // renderer fills this
    uploadedAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
    source: 'outlook-addin' as const,
  }

  // Send to renderer to save to Firestore
  mainWindow.webContents.send('outlook:save-email-attachment', {
    taskId,
    emailAttachment,
  })
}

export function startOutlookServer(mainWindow: BrowserWindow): http.Server {
  const server = http.createServer((req, res) => {
    setCorsHeaders(res)

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    // GET /ping — health check from taskpane
    if (req.method === 'GET' && req.url === '/ping') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok', app: 'NPD Planner' }))
      return
    }

    // GET /api/boards — send boards/tasks data to taskpane
    if (req.method === 'GET' && req.url?.startsWith('/api/boards')) {
      mainWindow.webContents.send('outlook:get-boards')
      ipcMain.once('outlook:boards-response', (_e, data) => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(data))
      })
      return
    }

    // POST /api/assign — receive email from Outlook Add-in
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
          console.error('[OutlookServer] Error processing email:', err)
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, error: String(err) }))
        }
      })
      return
    }

    res.writeHead(404)
    res.end('Not found')
  })

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[OutlookServer] Running on http://localhost:${PORT}`)
  })

  server.on('error', (err) => {
    console.error('[OutlookServer] Server error:', err)
  })

  return server
}
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PASO 2 — Iniciar server en src/main/index.ts
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Agregar import:
```typescript
import { startOutlookServer } from './ipc/outlookServer'
```

En la función donde se crea el BrowserWindow, después de que la ventana está lista (en el evento 'ready-to-show' o similar):
```typescript
startOutlookServer(mainWindow)
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PASO 3 — Exponer IPC en preload
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

En src/preload/index.ts agregar al objeto electronAPI:
```typescript
onOutlookEmail: (callback: (taskId: string, emailAttachment: unknown) => void) =>
  ipcRenderer.on('outlook:save-email-attachment', (_e, data) => callback(data.taskId, data.emailAttachment)),

onOutlookGetBoards: (callback: () => void) =>
  ipcRenderer.on('outlook:get-boards', callback),

sendBoardsToOutlook: (data: unknown) =>
  ipcRenderer.send('outlook:boards-response', data),
```

En src/preload/index.d.ts agregar a IElectronAPI:
```typescript
onOutlookEmail: (callback: (taskId: string, emailAttachment: unknown) => void) => void
onOutlookGetBoards: (callback: () => void) => void
sendBoardsToOutlook: (data: unknown) => void
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PASO 4 — Listener en renderer
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Buscar el componente App.tsx o el layout principal del renderer. Agregar en un useEffect que corra una sola vez:

```typescript
useEffect(() => {
  // Recibe email desde Outlook Add-in y lo guarda en Firestore
  window.electronAPI.onOutlookEmail(async (taskId, emailAttachment) => {
    const currentUser = auth.currentUser
    if (!currentUser) return
    
    // Buscar el task actual para obtener sus emailAttachments
    // Usar la función addEmailAttachment ya existente en src/lib/emailAttachments.ts
    const task = /* obtener task por taskId desde el store */
    if (!task) return
    
    const att = {
      ...(emailAttachment as EmailAttachment),
      uploadedBy: currentUser.uid,
    }
    
    await addEmailAttachment(taskId, task.emailAttachments ?? [], att)
  })

  // Responde cuando Outlook pide la lista de boards/tasks
  window.electronAPI.onOutlookGetBoards(() => {
    // Obtener boards y tasks del store actual
    // Formatear como { boards: [{ id, name, buckets: [{ id, name, tasks: [{ id, title }] }] }] }
    const data = buildBoardsDataForOutlook(/* store data */)
    window.electronAPI.sendBoardsToOutlook(data)
  })
}, [])
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VERIFICACIÓN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

npm run typecheck

Verificar que el server arranca: al abrir NPD Planner, en la consola del proceso main debe aparecer:
[OutlookServer] Running on http://localhost:3847

Probar manualmente:
curl http://localhost:3847/ping
→ debe responder: {"status":"ok","app":"NPD Planner"}

Commit: "feat(outlook-addin): local HTTP server for receiving emails from Outlook"
```

---

## PROMPT OA2 — Outlook Add-in React App (repo /outlook-addin)

```
Este prompt crea un repo/carpeta NUEVO llamado outlook-addin.
Es independiente del NPD-PLANNER repo pero se distribuye junto con él.

TAREA: Crear el Outlook Add-in completo — manifest + React taskpane.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PASO 1 — Crear estructura del proyecto
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

```bash
mkdir outlook-addin && cd outlook-addin
npm init -y
npm install react react-dom @microsoft/office-js
npm install -D typescript @types/react @types/react-dom @types/office-js webpack webpack-cli webpack-dev-server babel-loader @babel/core @babel/preset-react @babel/preset-typescript css-loader style-loader html-webpack-plugin office-addin-dev-certs
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PASO 2 — Crear manifest.xml
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Crear manifest.xml en la raíz con el contenido del spec (ver sección manifest.xml arriba).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PASO 3 — Crear src/taskpane/index.tsx
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

```typescript
// src/taskpane/index.tsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/taskpane.css'

Office.onReady(() => {
  const container = document.getElementById('root')!
  createRoot(container).render(<App />)
})
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PASO 4 — Crear src/taskpane/App.tsx
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

El componente principal maneja estos estados:
- `checking` — verificando si NPD Planner está abierto (ping a localhost:3847/ping)
- `offline` — NPD Planner no está abierto
- `loading` — cargando boards/tasks
- `ready` — mostrando dropdowns
- `assigning` — enviando email
- `success` — asignado correctamente
- `error` — error con mensaje

```typescript
// src/taskpane/App.tsx
import React, { useEffect, useState } from 'react'

const API = 'http://localhost:3847'

interface TaskOption { id: string; title: string }
interface BucketOption { id: string; name: string; tasks: TaskOption[] }
interface BoardOption { id: string; name: string; buckets: BucketOption[] }

type AppState = 'checking' | 'offline' | 'loading' | 'ready' | 'assigning' | 'success' | 'error'

export default function App() {
  const [state, setState] = useState<AppState>('checking')
  const [boards, setBoards] = useState<BoardOption[]>([])
  const [selectedBoard, setSelectedBoard] = useState('')
  const [selectedBucket, setSelectedBucket] = useState('')
  const [selectedTask, setSelectedTask] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  // Verificar si NPD Planner está corriendo
  useEffect(() => {
    fetch(`${API}/ping`, { method: 'GET' })
      .then(r => r.json())
      .then(() => {
        setState('loading')
        return fetch(`${API}/api/boards`)
      })
      .then(r => r.json())
      .then((data: { boards: BoardOption[] }) => {
        setBoards(data.boards)
        setState('ready')
      })
      .catch(() => setState('offline'))
  }, [])

  const currentBoard = boards.find(b => b.id === selectedBoard)
  const currentBucket = currentBoard?.buckets.find(b => b.id === selectedBucket)

  const handleAssign = async () => {
    if (!selectedTask) return
    setState('assigning')

    const item = Office.context.mailbox.item!

    try {
      // Obtener body
      const body = await new Promise<string>((resolve) => {
        item.body.getAsync(Office.CoercionType.Text, r => resolve(r.value ?? ''))
      })

      // Obtener contenido de attachments
      const attachments = await Promise.all(
        (item.attachments ?? []).map(async (att) => {
          const content = await new Promise<string>((resolve) => {
            item.getAttachmentContentAsync(att.id, (r) => {
              resolve(r.value?.content ?? '')
            })
          })
          return {
            name: att.name,
            contentType: att.contentType ?? 'application/octet-stream',
            sizeBytes: att.size ?? 0,
            base64Content: content,
          }
        })
      )

      // Obtener SharePoint root y datos del task desde NPD Planner
      // El payload incluye los datos necesarios para que Electron procese el email
      const payload = {
        taskId: selectedTask,
        // sharePointRoot, year, clientName, taskTitle los provee Electron
        // al recibir el taskId, los busca en su store interno
        email: {
          subject: item.subject ?? '(No subject)',
          from: `${item.from?.displayName ?? ''} <${item.from?.emailAddress ?? ''}>`,
          dateReceived: item.dateTimeCreated?.toISOString() ?? new Date().toISOString(),
          bodySnippet: body.trim().slice(0, 200),
          attachments,
        }
      }

      const res = await fetch(`${API}/api/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const result = await res.json()
      if (result.success) {
        setState('success')
      } else {
        throw new Error(result.error)
      }
    } catch (err) {
      setErrorMsg(String(err))
      setState('error')
    }
  }

  // ── UI ──────────────────────────────────────────────────────────────────────

  if (state === 'checking') return (
    <div className="center">
      <div className="spinner"></div>
      <p className="muted">Connecting to NPD Planner...</p>
    </div>
  )

  if (state === 'offline') return (
    <div className="center">
      <div className="icon-offline">!</div>
      <p className="title">NPD Planner is not running</p>
      <p className="muted">Open NPD Planner on this computer, then refresh this panel.</p>
      <button className="btn-secondary" onClick={() => { setState('checking') }}>
        Try again
      </button>
    </div>
  )

  if (state === 'loading') return (
    <div className="center">
      <div className="spinner"></div>
      <p className="muted">Loading boards...</p>
    </div>
  )

  if (state === 'success') return (
    <div className="center success">
      <div className="icon-success">✓</div>
      <p className="title">Email assigned!</p>
      <p className="muted">The email and its attachments were saved to the task.</p>
      <button className="btn-secondary" onClick={() => {
        setSelectedTask(''); setSelectedBucket(''); setSelectedBoard(''); setState('ready')
      }}>
        Assign another
      </button>
    </div>
  )

  if (state === 'error') return (
    <div className="center">
      <p className="title error">Something went wrong</p>
      <p className="muted">{errorMsg}</p>
      <button className="btn-secondary" onClick={() => setState('ready')}>Go back</button>
    </div>
  )

  return (
    <div className="panel">
      <div className="header">
        <div className="logo-dot"></div>
        <span className="header-title">NPD Planner</span>
      </div>

      <p className="section-label">Select destination</p>

      <div className="field">
        <label>Board</label>
        <select value={selectedBoard} onChange={e => {
          setSelectedBoard(e.target.value)
          setSelectedBucket('')
          setSelectedTask('')
        }}>
          <option value="">— Select board —</option>
          {boards.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      {selectedBoard && (
        <div className="field">
          <label>Bucket</label>
          <select value={selectedBucket} onChange={e => {
            setSelectedBucket(e.target.value)
            setSelectedTask('')
          }}>
            <option value="">— Select bucket —</option>
            {currentBoard?.buckets.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      )}

      {selectedBucket && (
        <div className="field">
          <label>Task</label>
          <select value={selectedTask} onChange={e => setSelectedTask(e.target.value)}>
            <option value="">— Select task —</option>
            {currentBucket?.tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        </div>
      )}

      {Office.context.mailbox.item?.attachments?.length > 0 && (
        <div className="attachments-preview">
          <p className="section-label">Attachments included</p>
          {Office.context.mailbox.item.attachments.map(att => (
            <div key={att.id} className="att-row">
              <span className="att-name">{att.name}</span>
            </div>
          ))}
        </div>
      )}

      <button
        className="btn-primary"
        disabled={!selectedTask || state === 'assigning'}
        onClick={handleAssign}
      >
        {state === 'assigning' ? 'Assigning...' : 'Assign to task'}
      </button>
    </div>
  )
}
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PASO 5 — Crear src/taskpane/styles/taskpane.css
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

```css
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; color: #111; background: #fff; }

.panel { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.center { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 20px; gap: 12px; text-align: center; }

.header { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.logo-dot { width: 10px; height: 10px; border-radius: 50%; background: #1D9E75; }
.header-title { font-size: 13px; font-weight: 600; color: #1D9E75; }

.section-label { font-size: 11px; font-weight: 600; color: #888; text-transform: uppercase; letter-spacing: 0.06em; }

.field { display: flex; flex-direction: column; gap: 4px; }
.field label { font-size: 12px; font-weight: 500; color: #555; }
.field select { width: 100%; padding: 7px 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 13px; color: #111; background: #fff; outline: none; }
.field select:focus { border-color: #1D9E75; }

.attachments-preview { background: #f6faf8; border: 1px solid #d4ede5; border-radius: 6px; padding: 10px 12px; }
.att-row { display: flex; align-items: center; gap: 6px; padding: 3px 0; font-size: 12px; color: #555; }
.att-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.btn-primary { width: 100%; padding: 10px; background: #1D9E75; color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; margin-top: 4px; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary:hover:not(:disabled) { background: #178a63; }

.btn-secondary { padding: 8px 16px; background: #fff; color: #555; border: 1px solid #ddd; border-radius: 6px; font-size: 13px; cursor: pointer; }
.btn-secondary:hover { background: #f5f5f5; }

.title { font-size: 15px; font-weight: 600; color: #111; }
.muted { font-size: 13px; color: #888; line-height: 1.5; }
.error { color: #dc2626; }

.icon-success { width: 48px; height: 48px; border-radius: 50%; background: #d1fae5; color: #059669; font-size: 24px; display: flex; align-items: center; justify-content: center; }
.icon-offline { width: 48px; height: 48px; border-radius: 50%; background: #fee2e2; color: #dc2626; font-size: 24px; font-weight: 700; display: flex; align-items: center; justify-content: center; }

.spinner { width: 24px; height: 24px; border: 2px solid #e5e7eb; border-top-color: #1D9E75; border-radius: 50%; animation: spin 0.7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.success .icon-success { margin-bottom: 4px; }
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PASO 6 — Crear taskpane.html
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>NPD Planner</title>
  <script src="https://appsforoffice.microsoft.com/lib/1/hosted/office.js"></script>
</head>
<body>
  <div id="root"></div>
</body>
</html>
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PASO 7 — Certificados HTTPS para desarrollo
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

```bash
npx office-addin-dev-certs install
```

Esto instala un certificado self-signed de confianza para localhost:3000.

Agregar al package.json scripts:
```json
"dev": "webpack serve --mode development --https --cert ./node_modules/office-addin-dev-certs/certs/ca.crt --key ./node_modules/office-addin-dev-certs/certs/localhost.key",
"build": "webpack --mode production"
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VERIFICACIÓN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

npm run dev
→ debe correr en https://localhost:3000 sin errores

Para probar en Outlook:
1. Abrir Outlook
2. More apps → Manage your apps → Upload a custom app → seleccionar manifest.xml
3. Abrir cualquier email → debe aparecer botón "Assign to NPD Task" en el ribbon
4. Click → abre el panel con los dropdowns

Commit: "feat(outlook-addin): React taskpane with board/bucket/task selector"
```

---

## Notas importantes

1. **Office.js attachments limit:** La API `getAttachmentContentAsync` solo funciona para emails en Exchange/Microsoft 365. Para cuentas POP3/IMAP locales, los attachments no están disponibles via API.

2. **El taskId resuelve datos del task:** En el PROMPT OA1, cuando Electron recibe el `taskId`, debe buscar en su store interno el `sharePointRoot`, `year`, `clientName` y `taskTitle` del task. Esto requiere que el listener en el renderer envíe esos datos adicionales junto con el emailAttachment al server. Alternativamente, el payload desde el add-in puede incluir esos datos si el add-in los recibe del endpoint `/api/boards`.

3. **Íconos del add-in:** Crear íconos simples PNG de 16x16, 32x32 y 80x80 con el logo de NPD Planner (el cuadrado verde con N). Guardar en `/outlook-addin/assets/`.

4. **HTTPS en producción:** Para distribución final, el dev server (`localhost:3000`) puede reemplazarse con un bundle estático servido directamente por Electron en el mismo puerto, eliminando la necesidad de mantener el dev server corriendo.
