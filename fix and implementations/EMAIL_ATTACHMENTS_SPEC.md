# Email Attachments Feature — NPD Planner
## Spec + Claude Code Prompts

**Feature:** Soporte de correos de Outlook como attachments en tasks  
**Objetivo:** Al arrastrar un `.msg` (o seleccionar uno con el file picker) desde Outlook a un task, se parsea el correo completo, se copia a SharePoint junto con todos sus archivos adjuntos internos, y se muestra en la UI como una tarjeta de email expandible.

---

## Arquitectura

### Flujo completo

```
Usuario arrastra .msg al AttachmentPanel
  ↓
Renderer detecta drop → llama IPC: email:parse-and-attach
  ↓
Main process (Node.js):
  1. Lee el .msg con @kenjiuno/msgreader
  2. Extrae: from, subject, date, body, attachments[]
  3. Copia el .msg a SharePoint → 2026/ClientName/TaskTitle/email.msg
  4. Por cada inner attachment:
     → Copia a SharePoint → 2026/ClientName/TaskTitle/[email-subject]/[filename]
  ↓
Renderer recibe EmailAttachment object
  ↓
Firestore: guarda EmailAttachment en task.emailAttachments[]
  ↓
UI muestra EmailAttachmentCard colapsable
```

### Estructura en SharePoint

```
2026 / NombreCliente / TituloTask /
  ├── RE_Aprobacion_PO5421.msg           ← el correo completo
  └── RE_Aprobacion_PO5421/              ← carpeta con adjuntos extraídos
        ├── artwork_v3.pdf
        ├── mockup_front.jpg
        └── spec_sheet.xlsx
```

---

## Tipos Firestore nuevos

```typescript
// Agregar a src/types/index.ts

export interface EmailInnerAttachment {
  id: string
  name: string
  sharePointRelativePath: string
  sizeBytes: number | null
  mimeType: string | null
}

export interface EmailAttachment {
  id: string
  type: 'email'                          // discriminator
  from: string                           // ej: "John Smith <john@client.com>"
  subject: string
  date: Timestamp | null
  bodySnippet: string                    // primeros 200 chars del body
  msgRelativePath: string                // ruta relativa del .msg en SharePoint
  innerAttachments: EmailInnerAttachment[]
  uploadedBy: string                     // uid
  uploadedAt: Timestamp
}
```

```typescript
// Modificar Task en src/types/index.ts
export interface Task {
  // ... campos existentes ...
  attachments: TaskAttachment[]
  emailAttachments: EmailAttachment[]    // ← NUEVO campo
  // ...
}
```

---

## IPC Channel nuevo

**Channel:** `email:parse-and-attach`

**Request:**
```typescript
interface EmailParseRequest {
  msgFilePath: string          // ruta absoluta al .msg
  sharePointRoot: string       // ruta raíz del SharePoint del usuario
  year: string                 // "2026"
  clientName: string           // nombre del cliente (sanitizado)
  taskTitle: string            // título del task (sanitizado)
}
```

**Response:**
```typescript
interface EmailParseResponse {
  success: boolean
  emailAttachment?: EmailAttachment   // el objeto a guardar en Firestore
  error?: string
}
```

---

## Librerías npm a instalar (en el proyecto NPD Planner)

```bash
npm install @kenjiuno/msgreader
```

> **Nota:** `@kenjiuno/msgreader` corre solo en Node.js (main process). Nunca importar en renderer.  
> No requiere COM ni Outlook instalado — lee el binario `.msg` directamente.  
> Soporte `.eml` se puede agregar después con `mailparser` si se necesita.

---

## Componente UI: EmailAttachmentCard

```
┌─────────────────────────────────────────────────────────────┐
│ 📧  RE: Aprobación arte PO#5421                  [⌄]  [🗑] │
│     john@client.com  •  Mar 15, 2026                        │
│     "Adjunto los archivos finales para su aprobación..."    │
│                                                             │
│  ├─ 📄 artwork_v3.pdf                           [↗ Abrir]  │
│  ├─ 🖼  mockup_front.jpg                        [↗ Abrir]  │
│  └─ 📊 spec_sheet.xlsx                         [↗ Abrir]   │
└─────────────────────────────────────────────────────────────┘
```

- Por defecto expandido si tiene inner attachments
- Botón `[⌄]` colapsa/expande la lista de inner attachments
- Botón `[🗑]` elimina el emailAttachment de Firestore (no borra SharePoint)
- Cada inner attachment tiene botón `[↗ Abrir]` que llama `electronAPI.openFile(absolutePath)`
- Color de acento: `#1D9E75` (brand green)

---

## Zona de Drop en AttachmentPanel

Agregar zona de drop visible en `AttachmentPanel.tsx`:

```
┌─────────────────────────────────────────────────────────────┐
│  📎 Attach file    📧 Drop email from Outlook               │
│                                                             │
│  ┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐   │
│  │   Drag .msg file here or click "Attach file"        │   │
│  └─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘   │
└─────────────────────────────────────────────────────────────┘
```

- La zona acepta drag & drop de archivos normales Y de `.msg`
- Cuando detecta `.msg` → usa el nuevo handler de email
- Cuando detecta otro tipo → usa el handler existente de archivos
- File picker también acepta `.msg` (agregar al filtro de extensiones)

---

## Migración Firestore

El campo `emailAttachments` es nuevo. Para tasks existentes que no lo tienen:

```typescript
// En el hook/store que lee tasks, normalizar:
const normalizedTask = {
  ...taskData,
  emailAttachments: taskData.emailAttachments ?? []
}
```

No se necesita migración masiva — el campo ausente se trata como array vacío.

---

## Archivos a modificar/crear

| Archivo | Acción |
|---------|--------|
| `src/types/index.ts` | Agregar `EmailInnerAttachment`, `EmailAttachment`, campo `emailAttachments` en `Task` |
| `src/main/ipc/emailHandlers.ts` | NUEVO — handler IPC `email:parse-and-attach` |
| `src/main/index.ts` | Registrar `registerEmailHandlers()` |
| `src/preload/index.ts` | Exponer `parseAndAttachEmail` al renderer |
| `src/preload/index.d.ts` | Agregar tipo a `IElectronAPI` |
| `src/renderer/src/components/task/AttachmentPanel.tsx` | Drag & drop zone + llamada al nuevo handler |
| `src/renderer/src/components/task/EmailAttachmentCard.tsx` | NUEVO componente |
| `src/lib/emailAttachments.ts` | NUEVO — helpers Firestore para emailAttachments |

---

---

# PROMPTS PARA CLAUDE CODE

---

## PROMPT E1 — Tipos + IPC Handler (main process)

```
Lee CLAUDE.md y src/types/index.ts completos antes de empezar.

TAREA: Implementar el backend del feature "Email Attachments" — parseo de .msg y copia a SharePoint.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PASO 1 — Instalar dependencia
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

npm install @kenjiuno/msgreader

Verificar que quedó en package.json dependencies.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PASO 2 — Agregar tipos a src/types/index.ts
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Agregar DESPUÉS de la definición de TaskAttachment:

```typescript
export interface EmailInnerAttachment {
  id: string
  name: string
  sharePointRelativePath: string
  sizeBytes: number | null
  mimeType: string | null
}

export interface EmailAttachment {
  id: string
  type: 'email'
  from: string
  subject: string
  date: Timestamp | null
  bodySnippet: string
  msgRelativePath: string
  innerAttachments: EmailInnerAttachment[]
  uploadedBy: string
  uploadedAt: Timestamp
}
```

En la interfaz Task, agregar después de `attachments: TaskAttachment[]`:

```typescript
emailAttachments: EmailAttachment[]
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PASO 3 — Crear src/main/ipc/emailHandlers.ts
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Crear el archivo con el siguiente contenido EXACTO:

```typescript
// src/main/ipc/emailHandlers.ts
// IPC handler for parsing Outlook .msg files and copying to SharePoint

import { ipcMain } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs'
import { copyFileSync, statSync } from 'fs'
import MsgReader from '@kenjiuno/msgreader'

// ── Sanitize folder/file names (same logic as sharepointLocal) ──────────────
function sanitizeName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/[.\s]+$/g, '')
    .replace(/[[\]]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Get MIME type from extension ─────────────────────────────────────────────
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
      const msgBuffer = readFileSync(msgFilePath)
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
      const body: string = fileData.body ?? fileData.bodyHTML ?? ''
      const bodySnippet: string = body.replace(/<[^>]*>/g, '').trim().slice(0, 200)
      const msgDate: Date | null = fileData.messageDeliveryTime
        ? new Date(fileData.messageDeliveryTime)
        : null

      // Build SharePoint paths
      const safeClient = sanitizeName(clientName)
      const safeTask = sanitizeName(taskTitle)
      const safeSubject = sanitizeName(subject).slice(0, 60)
      const msgFileName = `${safeSubject}.msg`

      const taskFolder = join(sharePointRoot, year, safeClient, safeTask)
      const emailSubFolder = join(taskFolder, safeSubject)

      // Create directories
      mkdirSync(taskFolder, { recursive: true })

      // Copy .msg file
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
            // Continue with other attachments
          }
        }
      }

      const msgRelativePath = `${year}/${safeClient}/${safeTask}/${msgFileName}`

      const emailAttachment = {
        id: crypto.randomUUID(),
        type: 'email' as const,
        from,
        subject,
        date: msgDate ? { seconds: Math.floor(msgDate.getTime() / 1000), nanoseconds: 0 } : null,
        bodySnippet,
        msgRelativePath,
        innerAttachments,
        uploadedBy: '',  // renderer will fill this with current user uid
        uploadedAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
      }

      return { success: true, emailAttachment }

    } catch (err) {
      console.error('[EmailHandler] Error:', err)
      return { success: false, error: String(err) }
    }
  })
}
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PASO 4 — Registrar handler en src/main/index.ts
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Agregar el import:
```typescript
import { registerEmailHandlers } from './ipc/emailHandlers'
```

Agregar la llamada junto a los otros registerXxxHandlers() en la función de setup:
```typescript
registerEmailHandlers()
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PASO 5 — Exponer en preload
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

En src/preload/index.ts, agregar al objeto electronAPI:
```typescript
parseAndAttachEmail: (req: {
  msgFilePath: string
  sharePointRoot: string
  year: string
  clientName: string
  taskTitle: string
}) => ipcRenderer.invoke('email:parse-and-attach', req),
```

Agregar 'email:parse-and-attach' al array INVOKE_CHANNELS si existe allowlist.

En src/preload/index.d.ts, agregar a IElectronAPI:
```typescript
parseAndAttachEmail: (req: {
  msgFilePath: string
  sharePointRoot: string
  year: string
  clientName: string
  taskTitle: string
}) => Promise<{ success: boolean; emailAttachment?: unknown; error?: string }>
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PASO 6 — Normalización de tasks existentes
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Buscar donde se transforman los documentos Firestore a objetos Task (probablemente en el store o en hooks de Firestore). Agregar normalización:

```typescript
emailAttachments: (data.emailAttachments ?? []) as EmailAttachment[]
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VERIFICACIÓN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

npm run typecheck

No debe haber errores TypeScript.

Commit: "feat(email-attachments): types + IPC handler for .msg parsing"
```

---

## PROMPT E2 — Firestore helpers + UI EmailAttachmentCard + AttachmentPanel update

```
Lee CLAUDE.md, src/types/index.ts, src/renderer/src/components/task/AttachmentPanel.tsx completos antes de empezar.

TAREA: Implementar la UI del feature "Email Attachments".

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PASO 1 — Crear src/lib/emailAttachments.ts
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

```typescript
// src/lib/emailAttachments.ts
// Firestore helpers for emailAttachments field on tasks

import { doc, updateDoc, Timestamp } from 'firebase/firestore'
import { db } from './firebase'
import type { Task, EmailAttachment } from '../types'

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
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PASO 2 — Crear src/renderer/src/components/task/EmailAttachmentCard.tsx
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Crear componente con:

Props:
```typescript
interface Props {
  attachment: EmailAttachment
  sharePointRoot: string | null
  onRemove: (id: string) => void
}
```

Comportamiento:
- Estado local `expanded: boolean` (default true si hay inner attachments)
- Header: icono de sobre (Mail de lucide-react), subject en bold, from + date en texto pequeño, bodySnippet en gris itálica (1 línea truncada)
- Botón chevron arriba/abajo para colapsar/expandir inner attachments
- Botón trash para onRemove (con confirm dialog inline: "¿Eliminar este correo del task? Los archivos en SharePoint no se borrarán." con botones "Cancelar" y "Eliminar")
- Lista de inner attachments: cada uno muestra icono de tipo de archivo (reusa la función getFileIcon del AttachmentPanel), nombre del archivo, botón "Open" que llama electronAPI.openFile con la ruta absoluta (sharePointRoot + '/' + innerAtt.sharePointRelativePath)
- Si no tiene inner attachments: mostrar "No attachments in this email"
- Diseño coherente con las AttachmentRow existentes en AttachmentPanel
- Colores: usar bg-blue-50/dark:bg-blue-900/10 para distinguirlos de los file attachments
- Border izquierdo azul: border-l-4 border-blue-400

Formato de fecha: si attachment.date existe, mostrar como "MMM DD, YYYY" usando toLocaleDateString().

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PASO 3 — Actualizar AttachmentPanel.tsx
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

3a. Agregar zona de drag & drop

En el componente, agregar handlers:
```typescript
const handleDrop = useCallback(async (e: React.DragEvent) => {
  e.preventDefault()
  setDragOver(false)
  
  const files = Array.from(e.dataTransfer.files)
  if (files.length === 0) return
  
  for (const file of files) {
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext === 'msg') {
      await handleEmailAttach(file.path)
    } else {
      // archivo normal — usar lógica existente
      await handleAttachFromPath(file.path)
    }
  }
}, [])

const [dragOver, setDragOver] = useState(false)
```

Agregar al contenedor principal del panel:
```tsx
onDrop={handleDrop}
onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
onDragLeave={() => setDragOver(false)}
className={`... ${dragOver ? 'ring-2 ring-green-400 ring-inset' : ''}`}
```

3b. Agregar función handleEmailAttach:

```typescript
const handleEmailAttach = async (filePath: string) => {
  if (!isElectron || !sharePointPath || !user) return
  
  setAttaching(true)
  setFeedback(null)
  
  try {
    const clientName = /* obtener clientName igual que en el attach existente */
    const result = await window.electronAPI.parseAndAttachEmail({
      msgFilePath: filePath,
      sharePointRoot: sharePointPath,
      year: new Date().getFullYear().toString(),
      clientName,
      taskTitle: task.title,
    })
    
    if (!result.success || !result.emailAttachment) {
      setFeedback({ type: 'error', message: result.error ?? 'Failed to process email.' })
      return
    }
    
    // Fill in uploadedBy with current user
    const emailAtt = {
      ...result.emailAttachment,
      uploadedBy: user.uid,
      uploadedAt: Timestamp.now(),
      date: result.emailAttachment.date
        ? new Timestamp(result.emailAttachment.date.seconds, result.emailAttachment.date.nanoseconds)
        : null,
    } as EmailAttachment
    
    await addEmailAttachment(task.id, task.emailAttachments ?? [], emailAtt)
    setFeedback({ type: 'success', message: `Email "${emailAtt.subject}" attached with ${emailAtt.innerAttachments.length} file(s).` })
  } catch (err) {
    setFeedback({ type: 'error', message: String(err) })
  } finally {
    setAttaching(false)
  }
}
```

3c. Agregar botón "Attach email (.msg)" junto al botón "Attach file" existente:
```tsx
<button
  onClick={async () => {
    const filePath = await window.electronAPI.selectFile()
    if (filePath && filePath.endsWith('.msg')) {
      await handleEmailAttach(filePath)
    }
  }}
  className="mt-2 flex items-center gap-2 rounded-lg border border-dashed border-blue-300 px-3 py-2 text-xs font-medium text-blue-500 transition-colors hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-60 dark:border-blue-700 dark:text-blue-400 dark:hover:border-blue-500 dark:hover:bg-blue-900/20"
>
  <Mail size={13} />
  Attach email (.msg)
</button>
```

3d. Renderizar EmailAttachmentCard debajo de los file attachments:
```tsx
{/* Email attachments */}
{(task.emailAttachments ?? []).length > 0 && (
  <div className="mt-3 space-y-2">
    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
      Emails
    </p>
    {(task.emailAttachments ?? []).map((ea) => (
      <EmailAttachmentCard
        key={ea.id}
        attachment={ea}
        sharePointRoot={sharePointPath}
        onRemove={(id) => removeEmailAttachment(task.id, task.emailAttachments ?? [], id)}
      />
    ))}
  </div>
)}
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VERIFICACIÓN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

npm run typecheck

No debe haber errores TypeScript.

Commit: "feat(email-attachments): UI card + drag-drop + Firestore helpers"
```

---

## PROMPT E3 — Actualizar CLAUDE.md y DOCUMENTACION_TECNICA_NPD_PLANNER.md

```
Lee CLAUDE.md y DOCUMENTACION_TECNICA_NPD_PLANNER.md completos antes de empezar.

TAREA: Documentar el feature de Email Attachments en los archivos de documentación.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PASO 1 — CLAUDE.md
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

En la sección de dependencias/librerías, agregar:
- @kenjiuno/msgreader — Parseo de archivos .msg de Outlook (main process only)

En la sección de features completados, agregar:
- [x] Email attachments — arrastrar .msg desde Outlook copia el correo + todos sus adjuntos a SharePoint y los muestra como tarjeta expandible en el task

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PASO 2 — DOCUMENTACION_TECNICA_NPD_PLANNER.md
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Agregar sección en el área de Task/Attachments:

**Email Attachments**
- Tipo: EmailAttachment (discriminado por `type: 'email'`)
- Almacenamiento: metadata en Firestore (task.emailAttachments[]), archivos en SharePoint
- Parseo: @kenjiuno/msgreader en main process vía IPC channel 'email:parse-and-attach'
- Estructura SharePoint: año/cliente/task/[subject].msg + año/cliente/task/[subject]/[adjuntos]
- UI: EmailAttachmentCard con lista colapsable de inner attachments
- Drag & drop: AttachmentPanel detecta extensión .msg y enruta al handler de email

Commit: "docs: document email attachments feature"
```

---

## Notas importantes para la implementación

1. **`@kenjiuno/msgreader` API:** El método `reader.getAttachment(att)` devuelve `{ content: Uint8Array }`. Usar `Buffer.from(attData.content)` para escribir con `writeFileSync`.

2. **`file.path` en Electron:** En Electron, `e.dataTransfer.files[i].path` devuelve la ruta absoluta del archivo en el sistema de archivos. Esto funciona porque Electron parchea la File API del browser para incluir esta propiedad.

3. **selectFile en preload:** Si el IPC `selectFile` actual no filtra por `.msg`, hay que o bien agregar un filtro opcional al handler, o simplemente verificar la extensión en el renderer antes de llamar a handleEmailAttach.

4. **Timestamps Firestore:** El IPC devuelve timestamps como `{ seconds, nanoseconds }` plain objects (no instancias de Firestore Timestamp). En el renderer convertir con `new Timestamp(seconds, nanoseconds)` antes de guardar en Firestore.

5. **Sin migración masiva:** `emailAttachments` es un campo nuevo. Tasks existentes sin este campo se normalizan con `?? []` en el store/hook que lee tasks de Firestore.
