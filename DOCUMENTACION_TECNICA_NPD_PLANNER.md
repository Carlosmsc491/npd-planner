# DOCUMENTACIÓN TÉCNICA DE PRODUCTO — NPD PLANNER

> **Versión del documento:** 1.3.0  
> **Última actualización:** 2026-04-24  
> **Mantenida por:** Equipo de desarrollo Elite Flower  
> **Audiencia:** Desarrolladores que trabajan en NPD Planner o lo retoman desde cero

---

## TABLA DE CONTENIDOS

1. [Identidad y Propósito](#1-identidad-y-propósito)
2. [Setup del Entorno de Desarrollo](#2-setup-del-entorno-de-desarrollo)
3. [Arquitectura Técnica](#3-arquitectura-técnica)
4. [Base de Datos y Modelo de Datos](#4-base-de-datos-y-modelo-de-datos)
5. [Usuarios, Roles y Permisos](#5-usuarios-roles-y-permisos)
6. [Flujos de Usuario Completos](#6-flujos-de-usuario-completos)
7. [Módulos y Funcionalidades](#7-módulos-y-funcionalidades)
8. [IPC Channels — Referencia Completa](#8-ipc-channels--referencia-completa)
9. [Seguridad](#9-seguridad)
10. [Integraciones Externas](#10-integraciones-externas)
11. [Módulo Photo Capture y Photo Manager](#11-módulo-photo-capture-y-photo-manager)
12. [Módulo Recipe Manager](#12-módulo-recipe-manager)
13. [Compatibilidad Windows / Mac](#13-compatibilidad-windows--mac)
14. [Lógica de Negocio y Reglas](#14-lógica-de-negocio-y-reglas)
15. [Rutas de la Aplicación](#15-rutas-de-la-aplicación)
16. [UI/UX — Design System](#16-uiux--design-system)
17. [Configuraciones y Variables de Entorno](#17-configuraciones-y-variables-de-entorno)
18. [Build y Deploy](#18-build-y-deploy)
19. [Troubleshooting](#19-troubleshooting)
20. [Historial de Decisiones Técnicas (ADR)](#20-historial-de-decisiones-técnicas-adr)
21. [Mantenimiento de esta Documentación](#21-mantenimiento-de-esta-documentación)

---

## 1. IDENTIDAD Y PROPÓSITO

### 1.1 Nombre y Versión

| Campo | Valor |
|---|---|
| Nombre | **NPD Planner** |
| Empresa | **Elite Flower** |
| Versión actual | **1.3.0** |
| Plataforma | Desktop — Windows (.exe) + Mac (.dmg) |
| Distribuido vía | GitHub Releases + electron-updater |

### 1.2 Propósito

NPD Planner es el **hub central de operaciones** para el equipo de Elite Flower, diseñado para:

- **Gestión de tareas** del equipo NPD (New Product Development)
- **Coordinación de viajes** a proveedores y fincas
- **Gestión de vacaciones** sin conflictos con fechas críticas
- **Coordinación de archivos** vía SharePoint local (sin upload a la nube)
- **Seguimiento de AWB** (Air Waybill) con integración automática con Traze
- **Recipe Manager**: generación masiva de archivos Excel de especificación de recetas
- **Photo Manager**: flujo completo de fotografía tethered de recetas (Mac) + gestión de fotos

### 1.3 Restricción de Dominio

**CRÍTICO:** Solo `@eliteflower.com` puede registrarse o hacer login. Esta restricción está implementada en:
- Frontend (validación en formulario de login)
- Firebase Auth rules: `request.auth.token.email.matches('.*@eliteflower\\.com$')`
- Firestore rules en `users` collection

Si alguna vez hay que cambiar el dominio, buscar `eliteflower.com` en: `firestore.rules`, `src/renderer/src/pages/LoginPage.tsx`, `src/shared/constants.ts`, `.env`.

---

## 2. SETUP DEL ENTORNO DE DESARROLLO

### 2.1 Prerequisitos

| Herramienta | Versión mínima | Notas |
|---|---|---|
| Node.js | 18+ | Recomendado: LTS |
| npm | 9+ | Incluido con Node |
| Git | 2.x | — |
| Python 3 | 3.8+ | Para Excel insertion (`pip3 install openpyxl pillow`) |
| gPhoto2 | cualquiera | **Solo Mac** — `brew install gphoto2` |
| Microsoft Excel | cualquiera | **Solo Windows** — para escritura COM de recetas |

### 2.2 Instalación

```bash
git clone <repo>
cd npd-planner
npm install

# Crear .env (nunca commitear)
cp .env.example .env
# Rellenar con credenciales Firebase reales

# Iniciar en modo desarrollo
npm run dev
```

### 2.3 Estructura de .env

```bash
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=elite-planner.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=elite-planner
VITE_FIREBASE_STORAGE_BUCKET=elite-planner.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123:web:abc
VITE_APP_VERSION=1.3.0
VITE_ALLOWED_DOMAIN=eliteflower.com
GH_TOKEN=ghp_...   # Solo para publicar releases
```

> **Regla de oro:** El archivo `.env` NUNCA se commitea. Está en `.gitignore`. Si alguien lo commitea accidentalmente: rotar las credenciales Firebase inmediatamente.

### 2.4 Scripts disponibles

```bash
npm run dev        # Electron + Vite en modo desarrollo (hot reload)
npm run build      # Build producción → dist-electron/
npm run typecheck  # TypeScript sin emitir archivos
npm run lint       # ESLint
```

### 2.5 Deploy de Firestore Rules

Las reglas de seguridad son el archivo `firestore.rules`. **Después de cualquier cambio en ese archivo hay que hacer deploy:**

```bash
firebase deploy --only firestore:rules
```

Si no se deployean, los cambios en el código no tendrán efecto en producción aunque localmente parezca que funciona.

---

## 3. ARQUITECTURA TÉCNICA

### 3.1 Stack Tecnológico

| Capa | Tecnología | Versión | Propósito |
|---|---|---|---|
| Desktop | Electron | ^28 | App de escritorio cross-platform |
| Build tool | electron-vite | ^2.3 | Dev server + build |
| Frontend | React | ^18.3 | UI (sin StrictMode — ver ADR §20.1) |
| Lenguaje | TypeScript | ^5.6 | Strict, sin `any` |
| Routing | react-router-dom | ^6.28 | HashRouter |
| Estilos | Tailwind CSS | ^3.4 | Dark mode via `class` |
| Estado global | Zustand | ^5.0 | Auth, boards, tasks, notifs |
| Database | Firebase Firestore | ^11 | Real-time + offline persistence |
| Auth | Firebase Auth | ^11 | Email/password |
| Calendario | FullCalendar.js | ^6.1 | Day/Week/Month + drag/resize |
| Editor rich text | Tiptap | ^3.20 | Descripción de tareas |
| Charts | Recharts | ^2.13 | Analytics |
| Búsqueda | Fuse.js | ^7.0 | Fuzzy search (Ctrl+K) |
| PDF | jsPDF + html2canvas | — | Exportes anuales |
| PDF preview | pdfjs-dist | ^5.5 | Vista previa de PDFs adjuntos |
| Auto-updater | electron-updater | ^6.3 | Actualizaciones silenciosas |
| Browser automation | Playwright | ^1.58 | Integración Traze |
| File watching | chokidar | ^3 | Detecta fotos nuevas (Photo Manager) |
| IDs únicos | nanoid | ^5.1 | IDs de tareas/comentarios |

### 3.2 Modelo Multi-Proceso Electron

Electron usa dos procesos completamente separados. Nunca pueden llamarse directamente — solo se comunican vía IPC:

```
┌─────────────────────────────────────────────────────────────────┐
│                         MAIN PROCESS                            │
│  (Node.js — acceso total al sistema operativo)                  │
│                                                                 │
│  src/main/index.ts              App entry, ventana, menú        │
│  src/main/updater.ts            electron-updater                │
│  src/main/camera/               CameraManager (gPhoto2)         │
│  src/main/ipc/                  Todos los handlers IPC:         │
│    fileHandlers.ts              File system, SharePoint         │
│    notificationHandlers.ts      Desktop notifications           │
│    cameraHandlers.ts            Cámara tethered                 │
│    excelHandlers.ts             Inserción foto en Excel         │
│    recipeIpcHandlers.ts         Recipe Manager (Excel COM)      │
│    awbIpcHandlers.ts            AWB lookup                      │
│  src/main/services/             Servicios de background:        │
│    trazeIntegrationService.ts   Scheduler descarga Traze        │
│    trazePlaywrightService.ts    Browser automation              │
│    trazeCredentialsService.ts   Almacenamiento seguro creds     │
│    awbLookupService.ts          Procesado CSVs Traze            │
│    errorReporter.ts             Manejo de errores globales      │
└─────────────────────────────────────────────────────────────────┘
            │
            │  IPC (contextBridge — src/preload/index.ts)
            │  Renderer NO puede llamar Node.js directamente
            ▼
┌─────────────────────────────────────────────────────────────────┐
│                       RENDERER PROCESS                          │
│  (Chromium — React App)                                         │
│                                                                 │
│  src/renderer/src/                                              │
│    App.tsx / main.tsx           Router + entry                  │
│    components/                  UI components                   │
│    pages/                       Route-level pages               │
│    hooks/                       Custom React hooks              │
│    store/                       Zustand stores                  │
│    lib/firebase.ts              Firebase init                   │
│    lib/firestore.ts             Operaciones Firestore           │
│    lib/recipeFirestore.ts       Operaciones Firestore (recetas) │
│    types/index.ts               TODAS las interfaces TS         │
└─────────────────────────────────────────────────────────────────┘
            │
            │  Firebase SDK (en renderer)
            ▼
┌─────────────────────────────────────────────────────────────────┐
│                       FIREBASE BACKEND                          │
│  Firestore (database real-time)                                 │
│  Firebase Auth (autenticación)                                  │
│  Security Rules (firestore.rules — hay que deployar)            │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 Preload Bridge

`src/preload/index.ts` es la **única frontera** entre renderer y main. Expone funciones específicas vía `contextBridge.exposeInMainWorld('api', {...})`. El renderer accede a `window.api.*`.

```typescript
// Ejemplo: renderer llama a una función IPC
const result = await window.api.recipe.readCells(filePath, cells)

// Eso internamente hace:
ipcRenderer.invoke('recipe:readCells', filePath, cells)

// Que en main recibe:
ipcMain.handle('recipe:readCells', async (_event, filePath, cells) => { ... })
```

> **Por qué existe el preload:** Seguridad. Sin él, el renderer tendría acceso directo a Node.js y podría ejecutar cualquier código. El preload actúa de whitelist — solo expone lo que está declarado explícitamente.

---

## 4. BASE DE DATOS Y MODELO DE DATOS

### 4.1 Firebase Firestore — Consideraciones

- **Real-time:** Los listeners (`onSnapshot`) se actualizan automáticamente cuando Firestore cambia. No hay polling.
- **Offline persistence:** Habilitada con `persistentLocalCache + persistentMultipleTabManager`. La app funciona sin internet y sincroniza cuando vuelve la conexión.
- **Sin `StrictMode`:** Firebase 12 + `persistentLocalCache` es incompatible con el patrón double-invoke de React StrictMode (ver ADR §20.1). No agregar StrictMode de vuelta.

### 4.2 Colecciones

#### `users`
```typescript
{
  uid: string              // Firebase Auth UID (mismo que document ID)
  email: string            // DEBE terminar en @eliteflower.com
  name: string
  role: 'owner' | 'admin' | 'member' | 'photographer'
  status: 'active' | 'awaiting' | 'suspended'
  createdAt: Timestamp
  lastSeen: Timestamp
  preferences: {
    theme: 'light' | 'dark' | 'system'
    dndEnabled: boolean
    dndStart: string       // "22:00" — Do Not Disturb
    dndEnd: string         // "08:00"
    shortcuts: Record<string, string>   // acción → tecla
    sharePointPath: string // path absoluto carpeta SharePoint local
    calendarView: 'day' | 'week' | 'month'
    defaultBoardView: 'cards' | 'list' | 'gantt' | 'calendar'
    trashRetentionDays: number   // default: 30
  }
}
```

**Notas importantes:**
- El `uid` del documento ES el Firebase Auth UID. No son campos separados.
- El rol `photographer` tiene acceso solo a Recipe Manager + ruta `/capture/:recipeId`.
- `status: 'awaiting'` = usuario registrado pero no aprobado. Ve la pantalla de espera.
- `status: 'suspended'` = acceso revocado. Ve pantalla de acceso denegado.

#### `boards`
```typescript
{
  id: string
  name: string
  color: string            // hex: "#1D9E75"
  type: 'planner' | 'trips' | 'vacations' | 'custom'
  order: number
  createdBy: string        // uid
  createdAt: Timestamp
  customProperties?: BoardProperty[]
  defaultView?: 'cards' | 'list' | 'gantt' | 'calendar'
  icon?: string            // nombre de icono Lucide (solo boards custom)
}
```

**Regla:** Los boards `planner`, `trips`, `vacations` son del sistema — no se pueden borrar. Los `custom` sí.

#### `tasks`
```typescript
{
  id: string
  boardId: string
  title: string
  clientId: string         // REQUERIDO — no se puede crear tarea sin cliente
  status: 'todo' | 'inprogress' | 'review' | 'done'
  priority: 'normal' | 'high'
  assignees: string[]      // array de uids
  labelIds: string[]
  bucket: string           // nombre de columna/grupo
  dateStart: Timestamp | null
  dateEnd: Timestamp | null
  description: string      // HTML (generado por Tiptap)
  notes: string
  poNumber: string
  poNumbers: string[]      // POs adicionales
  awbs: AwbEntry[]
  subtasks: Subtask[]
  attachments: TaskAttachment[]
  recurring: RecurringConfig | null
  completed: boolean
  completedAt: Timestamp | null
  completedBy: string | null   // uid
  customFields?: Record<string, unknown>
  createdBy: string
  createdAt: Timestamp
  updatedAt: Timestamp
  updatedBy: string
}
```

**AwbEntry** (seguimiento de vuelos):
```typescript
{
  id: string
  number: string           // número AWB, ej: "001-12345678"
  boxes: number
  carrier: string | null   // "AA", "DL", etc.
  shipDate: string | null  // "MM/DD/YYYY"
  eta: string | null       // "MM/DD/YYYY" o "MM/DD/YYYY HH:mm"
  ata: string | null       // actual time of arrival
  guia: string | null      // house AWB / tracking local
  etaChanged: boolean      // true si ETA cambió desde última verificación
  lastCheckedAt: Timestamp | null
  etaHistory: EtaHistoryEntry[]
}
```

#### `clients`
```typescript
{
  id: string
  name: string
  active: boolean          // false = aparece en dropdown pero tachado
  createdAt: Timestamp
  createdBy: string
}
```

#### `labels`
```typescript
{
  id: string
  name: string
  color: string            // hex fondo
  textColor: string        // hex texto (calculado automáticamente claro/oscuro)
  boardId: string | null   // null = label global (todos los boards)
  createdAt: Timestamp
}
```

#### `comments`
```typescript
{
  id: string
  taskId: string
  authorId: string
  authorName: string
  text: string
  mentions: string[]       // uids mencionados con @
  createdAt: Timestamp
  editedAt: Timestamp | null
}
```

#### `taskHistory` (append-only — nunca se edita ni borra)
```typescript
{
  id: string
  taskId: string
  userId: string
  userName: string
  action: 'created' | 'updated' | 'completed' | 'reopened' | 'deleted'
        | 'file_added' | 'assigned' | 'unassigned'
  field: string | null     // qué campo cambió (ej: "status", "assignees")
  oldValue: string | null
  newValue: string | null
  timestamp: Timestamp
}
```

#### `notifications`
```typescript
{
  id: string
  userId: string           // uid destinatario
  taskId?: string
  taskTitle?: string
  boardId?: string
  boardType?: 'planner' | 'trips' | 'vacations' | 'custom'
  type: 'assigned' | 'updated' | 'completed' | 'comment'
      | 'mentioned' | 'reopened' | 'new_user_pending'
  message: string
  read: boolean
  createdAt: Timestamp
  triggeredBy: string      // uid de quien causó la notificación
  triggeredByName: string
}
```

#### `archive`
```typescript
{
  id: string               // formato: "2025"
  year: number
  generatedAt: Timestamp
  totalTasks: number
  totalTrips: number
  totalVacations: number
  completionRate: number
  byBoard: Record<string, number>      // boardId → cantidad de tareas
  byClient: Record<string, number>
  byAssignee: Record<string, number>
  byMonth: number[]        // índice 0=Enero, 11=Diciembre
  topClients: Array<{ clientId: string; clientName: string; count: number }>
  topAssignees: Array<{ uid: string; name: string; count: number }>
}
```

#### `settings`
```typescript
// Documento "global"
{
  sharePointVerificationFolder: 'REPORTS (NPD-SECURE)'
  archiveAfterMonths: 12
  notificationsEnabled: boolean
  ssdPhotoPath: string | null        // ruta SSD externo para backup de fotos
  captureWatchPath: string | null    // carpeta vigilada para fotos (Capture One output)
}

// Documento "emergency"
{
  masterKeyHash: string  // SHA-256 del emergency key — NUNCA texto plano
}

// Documento "appBootstrap"
{
  // Creado automáticamente en primer inicio
  // Indica si ya existe un owner (para flujo de primer usuario)
  hasOwner: boolean
}
```

#### `pendingApprovals`
```typescript
{
  uid: string
  email: string
  name: string
  requestedAt: Timestamp
}
```

Documento creado al registrarse. Se elimina al aprobar/rechazar. Admins escuchan con `onSnapshot` → el `ApprovalModal` abre automáticamente cuando llega un nuevo documento.

#### `recipeProjects`
```typescript
{
  id: string
  name: string                // "Albertsons 2nd Half 2027"
  rootPath: string            // ruta absoluta en el filesystem local
  status: 'active' | 'completed' | 'archived'
  createdBy: string           // uid
  createdAt: Timestamp
  config: {
    customerDefault: string         // dropdown D7 en Excel, ej: "PUBLIX"
    holidayDefault: string          // dropdown D6, ej: "EVERYDAY"
    wetPackDefault: boolean         // celda AA40: true="Y", false=""
    wetPackFalseValue: string       // valor cuando wet_pack=false (normalmente "")
    distributionDefault: {          // porcentajes de distribución 0-100
      miami: number
      newJersey: number
      california: number
      chicago: number
      seattle: number
      texas: number
    }
    templatePath: string            // path absoluto al .xlsx template
    sourceMode: 'wizard' | 'import' | 'scratch'
    notes: string
    dueDate: Timestamp | null
  }
}
```

#### Subcolección `recipeProjects/{projectId}/recipeFiles`
```typescript
{
  id: string                  // formato: "{projectId}::{folderName}|{fileName}.xlsx"
  projectId: string
  fileId: string              // igual que id
  relativePath: string        // "{folderName}/{fileName}.xlsx"
  displayName: string         // nombre sin extensión
  price: string               // "$9.99"
  option: string              // "A", "B", "C"
  recipeName: string          // "VALENTINE"
  holidayOverride: string
  customerOverride: string
  wetPackOverride: string     // "Y" | "N" | ""
  boxTypeOverride: string     // celda Z6, ej: "QUARTER " (con trailing space)
  pickNeededOverride: string  // celda AC23: "Y" | "N"
  distributionOverride: Record<string, number>
  status: 'pending' | 'in_progress' | 'done' | 'error'

  // Locking (optimistic concurrency)
  lockedBy: string | null     // uid de quien tiene el archivo abierto
  lockClaimedAt: Timestamp | null
  lockHeartbeatAt: Timestamp | null
  lockToken: string | null

  doneBy: string | null
  doneAt: Timestamp | null
  requiresManualUpdate: boolean  // true si sleeve price no está en SLEEVE_PRICE_MAP
  version: number             // contador para concurrencia optimista
  updatedAt: Timestamp
  assignedTo: string | null
  assignedToName: string | null

  // === Photo Manager (Fase 1–4) ===
  photoStatus: 'pending' | 'in_progress' | 'complete' | 'selected' | 'ready'
  capturedPhotos: CapturedPhoto[]     // fotos capturadas por tethering

  // Fase 3 — READY (procesadas)
  readyPngPath: string | null         // ruta absoluta al PNG retocado
  readyJpgPath: string | null         // ruta absoluta al JPG
  readyProcessedAt: Timestamp | null
  readyProcessedBy: string | null

  // Notas y warnings (desnormalizado para display rápido)
  activeNotesCount: number            // count de notas activas (sin resolver)

  // Cleaned photos (paso intermedio pre-retouch)
  cleanedPhotoPaths: string[]
  cleanedPhotoStatus: 'needs_retouch' | 'done' | null
  cleanedPhotoDroppedAt: Timestamp | null

  // Fase 4 — Excel insertion
  excelInsertedAt: Timestamp | null
  excelInsertedBy: string | null      // uid
}
```

#### Subcolección `recipeProjects/{projectId}/recipeFiles/{fileId}/notes`
```typescript
// RecipeNote
{
  id: string
  projectId: string
  fileId: string
  authorId: string
  authorName: string
  text: string
  createdAt: Timestamp
  resolvedAt: Timestamp | null   // null = nota activa. Resolver = timestamp
  resolvedBy: string | null
}
```

**Reglas especiales:**
- Las notas son **inmutables** — no se pueden editar, solo resolver o borrar
- `update: if false` en Firestore rules
- Solo el autor o un admin puede borrar
- Resolver una nota actualiza `resolvedAt` y `resolvedBy` (eso SÍ es un update sobre el documento de nota? No — resolver usa `updateDoc` sobre el recipeFile para decrementar `activeNotesCount`, y `deleteDoc` / `resolvedAt update` sobre la nota)

#### Subcolección `recipeProjects/{projectId}/recipeActivity`
```typescript
{
  id: string
  projectId: string
  userId: string
  userName: string
  action: string   // "opened", "completed", "assigned", etc.
  fileId: string | null
  fileName: string | null
  timestamp: Timestamp
}
```

#### `recipePresence` (documentos: `{projectId}_{userId}`)
```typescript
{
  projectId: string
  userId: string
  userName: string
  currentFileId: string | null   // archivo actualmente abierto
  lastSeen: Timestamp            // heartbeat — si >2min, se considera offline
}
```

#### Subcolecciones privadas `userPrivate/{userId}/...`
```typescript
// notes/main
{ id: 'main'; content: string; updatedAt: Timestamp }

// tasks/{taskId}
{ id: string; title: string; dueDate: Timestamp | null; completed: boolean; ... }

// quickLinks/{linkId}
{ id: string; title: string; url: string; icon: string /* lucide */; createdAt: Timestamp }
```

---

## 5. USUARIOS, ROLES Y PERMISOS

### 5.1 Jerarquía de Roles

```
owner (más permisos)
  └─ admin
       └─ member
            └─ photographer (subconjunto de member — solo módulo fotos)
```

| Rol | Quién es | Restricciones |
|---|---|---|
| `owner` | Primer usuario registrado (o promovido manualmente) | Ninguna |
| `admin` | Delegado por owner | No puede modificar owners |
| `member` | Usuario estándar | No puede hacer acciones admin |
| `photographer` | Fotógrafo (acceso restringido) | Solo Recipe Manager + `/capture/:recipeId` |

### 5.2 Matriz de Permisos

| Acción | Owner | Admin | Member | Photographer |
|---|---|---|---|---|
| Aprobar/rechazar nuevos usuarios | ✅ | ✅ | ❌ | ❌ |
| Cambiar roles | ✅ | ✅ (no owners) | ❌ | ❌ |
| Suspender usuarios | ✅ | ✅ | ❌ | ❌ |
| Eliminar usuarios | ✅ | ❌ | ❌ | ❌ |
| Crear/editar boards | ✅ | ✅ | ❌ | ❌ |
| Crear/editar/completar tareas | ✅ | ✅ | ✅ | ❌ |
| Crear/editar labels | ✅ | ✅ | ❌ | ❌ |
| Ver Settings | ✅ | ✅ | ❌ | ❌ |
| Ver Analytics | ✅ | ✅ | ❌ | ❌ |
| Recipe Manager (ver/editar) | ✅ | ✅ | ✅ | ✅ |
| Capture Page (`/capture/:id`) | ✅ | ✅ | ✅ | ✅ |

### 5.3 Flujo de Autenticación

```
Usuario abre la app
      │
      ▼
Firebase Auth check
      │
      ├─ No autenticado → /login
      │
      └─ Autenticado → Firestore users/{uid}
               │
               ├─ status: 'awaiting' → /awaiting-approval
               ├─ status: 'suspended' → logout + error
               └─ status: 'active' → /dashboard
```

### 5.4 Flujo de Registro

```
Nuevo usuario → valida @eliteflower.com
      │
      ├─ Sin admins en BD → rol: 'owner', status: 'active' → /dashboard
      │
      └─ Ya hay admins → rol: 'member', status: 'awaiting'
               │
               ├─ Crea doc en pendingApprovals
               ├─ Notifica a admins/owners activos
               └─ Redirige a /awaiting-approval

Admin recibe ApprovalModal automáticamente
      │
      ├─ Aprobar → users/{uid}.status = 'active', delete pendingApprovals/{uid}
      └─ Rechazar → Firebase Auth deleteUser + delete Firestore doc
```

---

## 6. FLUJOS DE USUARIO COMPLETOS

### 6.1 Crear Nueva Tarea

**Inicio:** `+ New Task` en BoardPage, o `+` en celda de calendario.

```
NewTaskModal abre
  ├─ Board pre-seleccionado
  ├─ Client dropdown (activos, alfabético + "+ New Client" al final)
  │     └─ "+ New Client" → modal inline solo con campo Name → auto-selecciona
  ├─ Campos: Title, Client, Assignees, Dates, Priority, Status, Labels, PO, Description
  └─ Submit
        ├─ createTask() en Firestore
        ├─ taskHistory: entry "created"
        └─ Si boardType === 'planner': notificar a assignees
```

### 6.2 Completar una Tarea

```
Click en checkbox de tarea
      │
      ├─ Si es recurring:
      │     └─ Crea nueva instancia con fecha nextDate (hereda todo excepto completado)
      │
      ├─ task.completed = true, completedAt = now, completedBy = uid
      ├─ Mueve al fondo de columna, opacidad 40%
      ├─ Si boardType === 'planner': notifica assignees (excepto quien completó)
      └─ Toast con "Undo" por 5 segundos
            └─ Click Undo → revierte todo lo anterior
```

### 6.3 Integración Traze (AWB Auto-Lookup)

```
App inicia
      │
      ├─ Espera 5 segundos
      └─ startTrazeIntegration(window) [main process]
               │
               └─ Cada hora (7 AM - 6 PM):
                     ├─ Playwright abre navegador headless
                     ├─ Login en plataforma Traze con creds guardadas
                     ├─ Descarga CSV de AWB tracking
                     ├─ Parsea CSV → matchea AWB numbers con tasks
                     └─ Actualiza task.awbs:
                           ├─ carrier, shipDate, eta, ata
                           └─ etaChanged = true si ETA varió
```

### 6.4 Búsqueda Global (Ctrl+K)

Fuse.js indexa en memoria (se actualiza cuando cambian los datos):
- Tasks: `title`, `description`, `poNumber`, `poNumbers[]`, `awbs[].number`
- Clients: `name`
- Comments: `text`

Navegación: flechas ↑↓ + Enter o Click → navega al item. Escape cierra.

---

## 7. MÓDULOS Y FUNCIONALIDADES

### 7.1 Dashboard
- Greeting personalizado según hora del día
- Stats: Active Tasks, Assigned to Me, Overdue, Completed Today
- **Flight Status Panel**: AWBs open tasks con ETA/ATA. Estado calculado: `Scheduled` / `Flying` (< 1h para llegar) / `Arrived`
- Lista "Assigned to Me"

### 7.2 Boards
- **Vistas:** Cards, List, Calendar, Timeline (Gantt)
- **Group By:** bucket, client, assignee, date, status, priority
- **Read-only mode:** usuarios con permiso `view` en esa área no pueden crear/editar/borrar

### 7.3 Task Detail (TaskPage)
- Order Status (PO Numbers + AWBs + Flight tracker)
- Subtasks con progress bar
- Description (Tiptap rich text → guarda HTML)
- Notes (texto plano)
- Attachments (copia a SharePoint local)
- Comments con @mentions (autocompletado de usuarios)
- Activity Log (append-only, generado automáticamente en cada cambio)

### 7.4 My Space
Área privada por usuario:
- **My Tasks:** tareas personales (no Firestore tasks, sino `userPrivate/{uid}/tasks`)
- **My Calendar:** calendario personal
- **Quick Links:** URLs guardadas con ícono Lucide

### 7.5 Settings
Tabs disponibles: Profile, Members, Boards, Clients, Labels, Files, Traze, Photography, Appearance, Notifications, Keyboard, Archive.

### 7.6 Notifications
- **Solo Planner board** genera desktop notifications y sonido
- Trips y Vacations: sin notificaciones desktop (van al centro de notificaciones)
- DND respetado: sin popup ni sonido durante horario configurado
- Centro de notificaciones (campana) recibe todo sin importar DND

---

## 8. IPC CHANNELS — REFERENCIA COMPLETA

Todos los canales IPC están declarados en `src/preload/index.ts` y sus handlers en `src/main/ipc/`.

### 8.1 File & SharePoint

| Canal | Dirección | Parámetros | Retorna |
|---|---|---|---|
| `file:copy` | invoke | `IpcFileRequest` | `IpcFileResponse` |
| `file:select-folder` | invoke | — | `string \| null` |
| `file:select` | invoke | — | `string \| null` |
| `file:read-base64` | invoke | `filePath: string` | `string` (base64) |
| `file:open` | invoke | `filePath: string` | `void` |
| `file:save-text` | invoke | `{ path, content }` | `void` |
| `sharepoint:verify` | invoke | `folderPath: string` | `IpcSharePointVerifyResponse` |
| `sharepoint:resolve-path` | invoke | `{ root, relative }` | `string` |
| `open:external` | invoke | `url: string` | `void` |
| `trash:delete-folder` | invoke | `path: string` | `{ success, error? }` |

**Ejemplo de uso — adjuntar archivo a tarea:**
```typescript
// Renderer
const result = await window.api.copyFile({
  sourcePath: selectedFile,
  destPath: `${spRoot}|||${year}|||${clientName}|||${taskTitle}|||${fileName}`,
  createDirs: true,
})
// El "||| " es el delimitador — main process divide y usa safeJoin()
```

### 8.2 Notifications

| Canal | Dirección | Parámetros | Retorna |
|---|---|---|---|
| `notification:send` | invoke | `{ title, body, taskId }` | `void` |
| `notification:clicked` | event (push) | `taskId: string` | — |

### 8.3 Camera (Mac only)

| Canal | Dirección | Parámetros | Retorna |
|---|---|---|---|
| `camera:check-connection` | invoke | — | `{ connected: boolean, model: string \| null }` |
| `camera:start-tethering` | invoke | `outputDir: string` | `{ success: boolean, error?: string }` |
| `camera:stop-tethering` | invoke | — | `void` |
| `camera:is-tethering` | invoke | — | `boolean` |
| `camera:copy-file` | invoke | `{ src, dest }` | `{ success, error? }` |
| `camera:start-folder-watch` | invoke | `folderPath: string` | `void` |
| `camera:stop-folder-watch` | invoke | — | `void` |
| `camera:status-changed` | event (push) | `CameraStatus` | — |
| `camera:photo-received` | event (push) | `{ tempPath, filename }` | — |
| `camera:log` | event (push) | `string` | — |
| `camera:tethering-error` | event (push) | `string` | — |

> En Windows estos canales existen pero devuelven `false`/error — gPhoto2 no está disponible. El componente `CameraBadge` y los botones de tethering no se muestran en Windows.

### 8.4 Photo Export

| Canal | Dirección | Parámetros | Retorna |
|---|---|---|---|
| `photo:copy-to-selected` | invoke | `{ src, dest }` | `{ success, error? }` |
| `photo:delete-from-selected` | invoke | `filePath: string` | `{ success, error? }` |
| `photo:convert-png-to-jpg` | invoke | `{ pngPath, jpgPath, quality? }` | `{ success, error? }` |
| `photo:save-as` | invoke | `{ entries, destFolder }` | `{ success, errors[] }` |
| `photo:show-save-dialog` | invoke | `defaultFilename: string` | `string \| null` |
| `photo:export-zip` | invoke | `{ entries, destZipPath }` | `{ success, error? }` |

### 8.5 Recipe

| Canal | Parámetros clave | Descripción |
|---|---|---|
| `recipe:readCells` | `(filePath, cells[])` | Lee celdas específicas de un .xlsx via ExcelJS |
| `recipe:writeCells` | `(filePath, cells[])` | Escribe celdas vía PowerShell COM (Mac: AppleScript) |
| `recipe:batchWriteCells` | `(files[{ path, cells[] }])` | Escribe celdas en múltiples .xlsx en UNA sesión Excel |
| `recipe:generateFromTemplate` | `(templatePath, destPath)` | `fs.copyFileSync` — copia template sin abrir Excel |
| `recipe:createFolder` | `(folderPath)` | `fs.mkdirSync({ recursive: true })` |
| `recipe:scanProject` | `(rootPath)` | Escanea carpeta, retorna todos los .xlsx |
| `recipe:openInExcel` | `(filePath)` | `shell.openPath()` — abre con app nativa |
| `recipe:isFileOpen` | `(filePath)` | Detecta lock `~$filename.xlsx` |
| `recipe:listFolder` | `(folderPath)` | Lista archivos + subdirectorios |
| `recipe:deleteItem` | `(path)` | `fs.rmSync` |
| `recipe:renameItem` | `(oldPath, newPath)` | `fs.renameSync` |
| `recipe:batchWriteCells` | `(batch[])` | Una sesión COM para múltiples archivos |
| `recipe:validateProjectFolder` | `(path)` | Verifica `_project/project_config.json` |
| `recipe:parseImportExcel` | `(filePath)` | Parsea Excel de importación (5 cols: A=name, B=SRP, C=BoxType, D=PickNeeded, E=Holiday) |

### 8.6 Excel (Python)

| Canal | Parámetros | Retorna |
|---|---|---|
| `excel:check-dependencies` | — | `{ available: boolean, error?: string }` |
| `excel:insert-photo` | `{ excelPath: string, jpgPath: string }` | `{ success: boolean, error?: string }` |

**Cómo funciona internamente:**
1. Main process ejecuta `python3 resources/scripts/insert_photo.py <excelPath> <jpgPath>`
2. El script usa openpyxl + Pillow para insertar la imagen en `Spec Sheet` celda G8:M35
3. Usa `AbsoluteAnchor` (posición en EMU, independiente de filas/columnas)
4. Escala la imagen preservando aspect ratio, centra dentro del área
5. Elimina imágenes previas en la hoja antes de insertar (evita duplicados en re-inserción)

### 8.7 App & Storage

| Canal | Retorna |
|---|---|
| `app:get-user-data-path` | Path del directorio userData de Electron |
| `app:get-default-template-path` | Path al template Excel bundleado |
| `app:read-file-as-dataurl` | Data URL (base64) de un archivo |
| `app:version` | String de versión de la app |
| `storage:test-write-access` | `{ success: boolean }` — prueba escritura en path |

### 8.8 Traze

| Canal | Descripción |
|---|---|
| `traze:check-auth` | Verifica si hay credenciales guardadas |
| `traze:download-now` | Fuerza descarga inmediata del CSV |
| `traze:get-status` | Estado del proceso de integración |
| `traze:save-credentials` | Guarda usuario/password en secure storage |
| `traze:load-credentials` | Carga credenciales |
| `traze:refresh-csv` | Refresca datos desde último CSV descargado |
| `traze:csv-downloaded` | Evento push: nuevo CSV disponible |
| `traze:needs-login` | Evento push: credenciales inválidas |

---

## 9. SEGURIDAD

### 9.1 Path Traversal — safeJoin()

**Archivo:** `src/main/ipc/fileHandlers.ts:21`

Todos los paths que vienen del renderer pasan por `safeJoin()` antes de operar en el filesystem:

```typescript
function safeJoin(root: string, segments: string[]): string {
  const resolved = path.resolve(path.join(root, ...segments))
  const normalRoot = path.resolve(root)
  // Cualquier intento de salir del root (../../etc/passwd) lanza error
  if (!resolved.startsWith(normalRoot + path.sep) && resolved !== normalRoot) {
    throw new Error(`Path traversal detected: "${resolved}" is outside "${normalRoot}"`)
  }
  return resolved
}
```

**Por qué existe:** Sin esta protección, un atacante podría mandar `relativePath = "../../sensitive_file"` y leer/escribir fuera del directorio SharePoint.

**Cómo se usa en FILE_COPY:**
```typescript
// El renderer manda el path como: root|||segment1|||segment2
const segments = req.destPath.split('|||')
const root = segments[0]
const destPath = safeJoin(root, segments.slice(1))
```

### 9.2 PowerShell Command Injection

**Archivo:** `src/main/ipc/cameraHandlers.ts:182`

El export ZIP en Windows usa PowerShell. Versión insegura (NO hacer así):
```typescript
// MAL — si destZipPath contiene '; rm -rf /' → ejecución arbitraria
spawn('powershell', [`Compress-Archive -Path "${srcGlob}" -DestinationPath "${destZipPath}"`])
```

Versión correcta actual:
```typescript
// BIEN — paths como argumentos separados, nunca interpolados en el string del comando
spawn('powershell', [
  '-NonInteractive', '-NoProfile', '-ExecutionPolicy', 'Bypass',
  '-Command', 'Compress-Archive',
  '-args', srcGlob, destZipPath,
])
```

### 9.3 Notification IPC — Hardening

Cada handler de notificaciones tiene `try/catch` + límite de longitud en strings para prevenir crashes y DoS:

```typescript
ipcMain.handle(IPC.NOTIFICATION_SEND, async (_event, req) => {
  try {
    const title = String(req.title ?? '').slice(0, 200)
    const body  = String(req.body  ?? '').slice(0, 500)
    // ...
  } catch (err) {
    // no relanzar — no crashear el main process
  }
})
```

### 9.4 Firestore Rules — Puntos Clave

```javascript
// appBootstrap: solo se puede crear si hay email @eliteflower.com Y no existe aún
match /settings/appBootstrap {
  allow read: if true;   // necesario para check de primer usuario en login
  allow create: if isAuthenticated() && isEliteFlowerEmail() &&
                   !exists(/databases/$(database)/documents/settings/appBootstrap);
}

// taskHistory: append-only — nadie puede editar ni borrar
match /taskHistory/{historyId} {
  allow read, create: if isActiveUser();
  allow update, delete: if false;
}

// Notes: inmutables — no se editan
match /notes/{noteId} {
  allow read, create: if isActiveUser();
  allow update: if false;
  allow delete: if isActiveUser() &&
    (resource.data.authorId == request.auth.uid || isAdmin());
}
```

### 9.5 Emergency Access

Ruta `/emergency` — no aparece en sidebar, no está documentada en la UI. Permite acceso admin usando un hash SHA-256 de una clave maestra guardada en `settings/emergency.masterKeyHash`. Nunca almacenar la clave en texto plano.

---

## 10. INTEGRACIONES EXTERNAS

### 10.1 Firebase

Inicializado en `src/renderer/src/lib/firebase.ts`. Lee las credenciales de `import.meta.env.VITE_FIREBASE_*`. Nunca hardcodear credenciales.

**Persistencia offline:**
```typescript
// Firebase 12 usa nueva API — NO usar enableIndexedDbPersistence (deprecated)
initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
})
```

### 10.2 Traze Platform (AWB Tracking)

Playwright (headless Chromium) se conecta a la plataforma Traze, hace login con credenciales del usuario, y descarga el CSV de tracking.

**Horario:** Solo entre 7 AM y 6 PM (configurable). Fuera de ese rango no se ejecuta para no consumir recursos.

**Credenciales:** Guardadas en `safeStorage` de Electron (encriptado con la clave del OS). Nunca en texto plano ni en Firestore.

**Si falla el login:** Emite evento `traze:needs-login` → renderer muestra aviso para que el usuario abra la ventana de login manualmente.

### 10.3 SharePoint Local

**Sin API de SharePoint.** La sincronización a la nube la hace el cliente de OneDrive del usuario en segundo plano. La app solo copia archivos al directorio local sincronizado.

**Estructura de paths:**
```
{SharePointRoot}/
└── REPORTS (NPD-SECURE)/
    └── {año}/
        └── {clientName}/
            └── {taskTitle}/
                └── {fileName}
```

**Verificación:** Al configurar la ruta, el app busca la subcarpeta `REPORTS (NPD-SECURE)`. Si no existe, rechaza el path con error.

### 10.4 GitHub Releases (Auto-Updater)

`electron-updater` consulta GitHub Releases del repo configurado en `electron-builder.yml`. Las actualizaciones se descargan en background y se instalan en el siguiente reinicio. El usuario ve "What's New" modal la primera vez que abre la nueva versión.

---

## 11. MÓDULO PHOTO CAPTURE Y PHOTO MANAGER

Este es el módulo más complejo de la app. Está dividido en 4 fases:

```
Fase 1: Capture (tethering con cámara) — Mac only
Fase 2: Photo Manager CAMERA + SELECTED tabs
Fase 3: CLEANED + READY tabs
Fase 4: Excel insertion del JPG en Spec Sheet
```

### 11.1 Arquitectura del Módulo

```
CameraManager (src/main/camera/CameraManager.ts)
  └─ Proceso gPhoto2 (spawn externo, Mac only)
  └─ Watcher chokidar (detecta archivos nuevos)
  └─ EventEmitter → cameraHandlers.ts → IPC → renderer

CapturePage (src/renderer/src/pages/CapturePage.tsx)
  └─ Vista de tethering: preview área, filmstrip, DONE modal
  └─ Copia fotos a: CAMERA/{subfolder}/ + Pictures/{subfolder}/ + SSD (si config)

PhotoManagerView (src/renderer/src/components/recipes/PhotoManagerView.tsx)
  └─ Tab CAMERA: grid de fotos capturadas agrupadas por receta
  └─ Tab SELECTED: fotos marcadas como candidatas (star toggle)
  └─ Tab CLEANED: drop zone para fotos retocadas → promueve a READY
  └─ Tab READY: fotos PNG+JPG listas, con botón "Insertar en Excel"
```

### 11.2 Tipos de Photo Status

```typescript
// En RecipeFile.photoStatus:
'pending'    // Receta sin fotos capturadas aún
'in_progress'// Tethering activo o fotos capturadas, sin marcar como listas
'complete'   // Fotos completadas (se marcó "Done" en CapturePage)
'selected'   // Al menos una foto marcada con star en tab SELECTED
'ready'      // PNG + JPG retocados en tab READY
```

### 11.3 CapturedPhoto Interface

```typescript
interface CapturedPhoto {
  sequence: number           // 1, 2, 3... orden de captura
  filename: string           // "Standard Rose - 1.jpg"
  subfolderName: string      // "Valentines" (carpeta dentro de CAMERA/)
  picturePath: string        // path absoluto en Pictures/
  cameraPath: string         // path absoluto en CAMERA/
  ssdPath: string | null     // path en SSD si está configurado
  capturedAt: Timestamp
  capturedBy: string         // uid
  isSelected: boolean        // true = marcada como candidata
  selectedAt?: Timestamp
  selectedBy?: string        // uid
}
```

### 11.4 Flujo Completo: Fotografiar una Receta

```
1. RecipeProjectPage → botón "Tomar Fotos" en fila de receta
   └─ Verde: pending, Ámbar: in_progress, Deshabilitado: complete

2. Navega a /capture/:recipeId

3. CapturePage:
   ├─ Conecta cámara: window.api.camera.checkConnection()
   ├─ Inicia tethering: window.api.camera.startTethering(outputDir)
   │     └─ outputDir = {projectRoot}/CAMERA/{subfolderName}/
   ├─ Loop: camera:photo-received → preview + filmstrip
   └─ Botón DONE:
         ├─ Para tethering
         ├─ Copia fotos a Pictures/{subfolderName}/
         ├─ Si hay SSD configurado: copia también ahí
         ├─ Guarda CapturedPhoto[] en Firestore (recipeFiles/{id}.capturedPhotos)
         └─ photoStatus = 'complete'

4. Photo Manager → Tab CAMERA:
   ├─ Muestra fotos agrupadas por receta
   ├─ Star toggle → isSelected = true → photoStatus = 'selected'
   └─ Tab SELECTED: fotos con isSelected=true

5. Tab CLEANED:
   ├─ Drop zone: arrastrar PNG/JPG retocados
   ├─ Validación: si la receta tiene notas activas → WarningDialog
   └─ Al aceptar: promueve a READY (guarda path en readyPngPath/readyJpgPath)

6. Tab READY:
   ├─ Grid de recetas con PNG+JPG
   ├─ Botón "Insertar en Excel":
   │     └─ IPC: excel:insert-photo({ excelPath, jpgPath })
   │     └─ Python: insert_photo.py → imagen en Spec Sheet G8:M35
   └─ Botón cambia: azul → spinner → verde ✓ + "Reinsertar"
```

### 11.5 Rol Photographer

Usuario con `role: 'photographer'` ve el sidebar filtrado:
- ✅ Recipe Manager
- ✅ Capture Page (`/capture/:recipeId`)
- ❌ Dashboard, Boards, Calendar, Settings, Analytics, My Tasks, My Space

Si intenta navegar a una ruta no permitida, es redirigido automáticamente a `/recipes`.

### 11.6 Script Python: insert_photo.py

**Ubicación:**
- Desarrollo: `resources/scripts/insert_photo.py`
- Producción (bundleado): `{resourcesPath}/scripts/insert_photo.py`

**Uso desde CLI (para debug):**
```bash
python3 resources/scripts/insert_photo.py /path/to/recipe.xlsx /path/to/photo.jpg
```

**Salida exitosa:** `OK` en stdout, exit 0  
**Error:** mensaje en stderr con prefijo `ERROR:`, exit 1

**Errores comunes y soluciones:**

| Error en stderr | Causa | Solución |
|---|---|---|
| `Missing Python dependency — openpyxl` | openpyxl no instalado | `pip3 install openpyxl pillow` |
| `Excel file is locked` | Archivo abierto en Excel | Cerrar Excel y reintentar |
| `'Spec Sheet' not found` | El .xlsx no tiene esa hoja | Verificar que es el template correcto |
| `Script not found` | Build no copió el script | Revisar `electron-builder.yml` extraResources |

**Lógica de posicionamiento:**
```
1. Suma el ancho de columnas A-F (en píxeles) → x_offset del área G
2. Suma la altura de filas 1-7 → y_offset del área 8
3. Calcula el tamaño del área G8:M35 (cols G-M × filas 8-35)
4. Escala la imagen para que encaje (preserva aspect ratio)
5. Centra dentro del área
6. Inserta con AbsoluteAnchor (posición en EMU — independiente de cambios en cols/filas)
7. Limpia imágenes previas (ws._images = []) antes de insertar
```

---

## 12. MÓDULO RECIPE MANAGER

### 12.1 ¿Qué hace?

Reemplaza el flujo manual de copiar/editar templates Excel de EliteQuote. Permite crear decenas de archivos Excel de especificación de recetas de forma masiva, con valores correctos en las celdas, desde un wizard.

### 12.2 Estructura de Archivos en Disco

```
{projectRootPath}/
├── _project/
│   └── project_config.json      ← config del proyecto (para Import Existing)
├── {FolderName1}/
│   ├── $9.99 A VALENTINE.xlsx
│   ├── $11.99 B VALENTINE.xlsx
│   └── ...
├── {FolderName2}/
│   └── ...
├── CAMERA/                       ← fotos tethered (si se usa Photo Capture)
│   └── {subfolderName}/
│       └── RecipeName - 1.jpg
└── Pictures/                     ← copia permanente de fotos
    └── {subfolderName}/
```

### 12.3 Celdas Excel que se Escriben al Crear

| Celda | Valor | Ejemplo |
|---|---|---|
| `Quote!D3` | Nombre del archivo normalizado | `$9.99 A VALENTINE` |
| `Quote!D6` | Holiday | `VALENTINE'S DAY` |
| `Quote!D7` | Customer | `PUBLIX` |
| `Quote!AA40` | Wet pack | `Y` o `""` |
| `Quote!Z6` | Box type | `QUARTER ` (con trailing space!) |
| `Quote!AC23` | Pick needed | `Y` o `N` |
| `Quote!AB25` | Sleeve price | `0.25` (del SLEEVE_PRICE_MAP) |
| `Spec Sheet!E4` | Nombre del proyecto | `Albertsons 2nd Half 2027` |

> **IMPORTANTE — Trailing spaces:** Los dropdowns de Excel en los templates tienen opciones con espacios exactos. `"QUARTER "` (con espacio) es distinto a `"QUARTER"`. Si se escribe el valor sin el espacio, el dropdown no reconocerá el valor. Siempre copiar el valor exacto incluyendo espacios.

### 12.4 PowerShell COM — Por Qué y Cómo

En Windows, la escritura de celdas en archivos Excel usa **COM Automation** vía PowerShell. Esto es necesario porque:
- Excel tiene dropdowns con listas de validación — ExcelJS (biblioteca Node) no respeta las validaciones al escribir, PowerShell COM sí
- Excel calcula fórmulas automáticamente al guardar vía COM

**El truco de batch:**
```
MAL: Abrir Excel → escribir archivo 1 → cerrar → abrir → escribir archivo 2 → ...
     Problema: RPC_E_CALL_REJECTED (Excel rechaza llamadas cuando está ocupado)

BIEN: Abrir Excel UNA VEZ → escribir archivo 1 → archivo 2 → ... → cerrar
      recipe:batchWriteCells hace exactamente esto
```

**En Mac:** El mismo resultado se logra con AppleScript (osascript). El handler `writeExcelViaAppleScript` solo existe en Mac.

### 12.5 SLEEVE_PRICE_MAP

Mapa de precio → sleeve price (celda `Quote!AB25`):

```typescript
const SLEEVE_PRICE_MAP: Record<string, string> = {
  "$7.99": "0.25",
  "$9.99": "0.25",
  "$11.99": "0.3",
  "$12.99": "0.3",
  "$14.99": "0.35",
  // ... más valores en types/index.ts
}
```

Si el precio de una receta no está en el mapa → `requiresManualUpdate = true` → el desarrollador ve un badge de aviso en esa receta.

### 12.6 Import Existing Project

Para migrar proyectos creados con EliteQuote (la app hermana):

```
1. Click en "▼" del split button → "Import Existing Project"
2. Selector de carpeta nativo
3. IPC: recipe:validateProjectFolder(path)
   └─ Verifica que existe _project/project_config.json
4. Lee config (compatible con snake_case de EliteQuote y camelCase de NPD)
5. Registra en Firestore como recipeProject
6. Navega al proyecto
```

### 12.7 Default Template

Un template Excel (`ELITE QUOTE BOUQUET 2026.xlsx`) está **bundleado en la app** en `resources/templates/`. Al abrir el wizard por primera vez, `WizardStepBasics` auto-rellena el campo de template con ese path, mostrando badge verde "Default". El usuario puede cambiarlo con Browse.

En producción, el path se resuelve con `app:get-default-template-path`:
```typescript
// En main: path.join(app.isPackaged ? process.resourcesPath : 'resources', 'templates', 'ELITE QUOTE BOUQUET 2026.xlsx')
```

---

## 13. COMPATIBILIDAD WINDOWS / MAC

### 13.1 Filosofía: Un Codebase, Guards de Runtime

```typescript
if (process.platform === 'win32') {
  // Código para Windows
} else {
  // Código Mac/Linux — el que ya existe y funciona
  // NO se toca. Solo se agrega el bloque win32.
}
```

### 13.2 Mapa de Diferencias por Plataforma

| Funcionalidad | Windows | Mac |
|---|---|---|
| Cámara tethered (gPhoto2) | No disponible (retorna false/disabled) | gPhoto2 vía `brew install gphoto2` |
| Escritura Excel celdas | PowerShell COM (`recipe:writeCells`) | AppleScript (`osascript`) |
| ZIP export fotos | PowerShell `Compress-Archive` | Comando `zip` |
| Abrir archivo | `shell.openPath()` | `shell.openPath()` |
| Path separador | `\` (pero `path.join()` lo maneja) | `/` |
| Python | Puede llamarse `python` en vez de `python3` | `python3` |
| Menú aplicación | Sin menú (null) | Menú macOS nativo |

### 13.3 Detección de Dependencias por Plataforma

**gPhoto2 (solo Mac):**
```typescript
// CameraManager.ts
async isGphoto2Available(): Promise<boolean> {
  if (process.platform === 'win32') return false  // early return en Windows
  return new Promise((resolve) => {
    const proc = spawn('which', ['gphoto2'])
    proc.on('close', (code) => resolve(code === 0))
    proc.on('error', () => resolve(false))
  })
}
```

**Python3 (cross-platform):**
```typescript
// excelHandlers.ts — NOTA: 'python3' puede no estar disponible en Windows
// En Windows, Python suele instalarse como 'python' o 'py'
// Pendiente de fix: detectar automáticamente el executable correcto
execFile('python3', ['-c', 'import openpyxl, PIL; print("OK")'], ...)
```

> **Para desarrolladores Windows:** Si `excel:check-dependencies` retorna `false`, asegurarse de que Python esté en el PATH. Probar en terminal: `python3 --version` o `python --version`.

### 13.4 Path Handling

**Regla absoluta:** Siempre usar `path.join()`, nunca concatenar con `/` o `\`.

```typescript
// MAL
const dest = sharePointRoot + '/' + year + '/' + clientName

// BIEN
const dest = path.join(sharePointRoot, year, clientName)
```

`path.join()` usa el separador correcto del OS automáticamente.

---

## 14. LÓGICA DE NEGOCIO Y REGLAS

### 14.1 Algoritmo Flight Status

Calcula el estado visual de un AWB en el Flight Status Panel:

```typescript
function computeStatus(eta: string | null, ata: string | null): FlightStatus {
  const now = new Date()
  const etaDate = parseFlightDate(eta)
  const ataDate = parseFlightDate(ata)

  if (ataDate && ataDate <= now) return 'arrived'
  const refDate = ataDate ?? etaDate
  if (!refDate) return 'unknown'

  const diffHours = (refDate.getTime() - now.getTime()) / (1000 * 60 * 60)
  if (diffHours <= 0) return 'arrived'
  if (diffHours <= 1) return 'flying'
  return 'scheduled'
}
// 'flying' = llegará en menos de 1 hora
// 'scheduled' = más de 1 hora para llegar
// 'arrived' = ya llegó (ATA registrado y pasado)
```

### 14.2 Recurring Tasks

Al completar una tarea recurrente:
```
completed = true → crear nueva instancia con nextDate
  ├─ daily:   +1 día
  ├─ weekly:  +7 días
  ├─ monthly: +1 mes
  ├─ yearly:  +1 año
  └─ custom:  siguiente día de semana del array customDays[]
```

La nueva instancia hereda TODO excepto: `completed`, `completedAt`, `completedBy`, `createdAt`, `updatedAt`, `id`.

### 14.3 Simultaneous Edit Merge

```
Usuario A y B editan la misma tarea simultáneamente:
  ├─ Campos DIFERENTES → Firestore transaction merge ambos cambios ✅
  └─ Mismo CAMPO → ConflictDialog:
        "Carlos cambió el título a X"
        "Laura cambió el título a Y"
        └─ Usuario actual elige cuál prevalece
```

### 14.4 Annual Archive

Al iniciar la app (y opcionalmente desde Settings → Archive):
```
1. Busca tasks donde: completed=true AND completedAt < (ahora - 12 meses)
2. Genera documento en archive/{año}: summary con totalTasks, byBoard, byClient, etc.
3. Mueve tasks a archivedTasks sub-collection
4. Solo admins pueden disparar archive manual
```

### 14.5 SharePoint File Copy

El flow de adjuntar archivos a tareas:
```
1. Usuario selecciona archivo
2. Compute destino: safeJoin(root, [year, clientName, taskTitle, fileName])
3. fs.mkdirSync(dir, { recursive: true }) → crea carpetas si no existen
4. fs.copyFileSync(source, dest)
5. Guarda relativePath en task.attachments[].sharePointRelativePath
6. Estado: uploading → synced (OneDrive sincroniza a la nube automáticamente)
7. Si falla: status='error' + retry queue (cada 30 segundos)
```

---

## 15. RUTAS DE LA APLICACIÓN

| Ruta | Componente | Acceso | Notas |
|---|---|---|---|
| `/login` | LoginPage | Público | |
| `/awaiting-approval` | AwaitingApprovalPage | Authenticated | Solo usuarios awaiting |
| `/emergency` | EmergencyPage | Público | Ruta oculta — no en sidebar |
| `/dashboard` | DashboardPage | Active | |
| `/my-tasks` | MyTasksPage | Active | Tareas personales (userPrivate) |
| `/my-space` | MySpacePage | Active | Notas, quick links |
| `/calendar` | CalendarPage | Active | Master Calendar — todos los boards |
| `/analytics` | AnalyticsPage | Admin+ | |
| `/recipes` | RecipeHomePage | Active | Lista de proyectos |
| `/recipes/new` | NewRecipeProjectWizard | Active | Wizard 3 pasos |
| `/recipes/:projectId` | RecipeProjectPage | Active | Detalle de proyecto |
| `/capture/:recipeId` | CapturePage | Active + Photographer | Tethering de cámara |
| `/board/:boardId` | BoardPage | Active | |
| `/task/:taskId` | TaskFullPage | Active | Vista completa de tarea |
| `/settings` | SettingsPage | Admin+ | |
| `/` | redirect | — | → /dashboard |
| `*` | redirect | — | → /login |

---

## 16. UI/UX — DESIGN SYSTEM

### 16.1 Dark Mode

Estrategia `class` de Tailwind. Toggle en Settings → Appearance. Se guarda en `user.preferences.theme`. Clases: `dark:bg-gray-900`, `dark:text-white`, etc.

### 16.2 Paleta de Colores del Sistema

```typescript
// Boards
const BOARD_COLORS = {
  planner:   '#1D9E75',   // Verde esmeralda
  trips:     '#378ADD',   // Azul
  vacations: '#D4537E',   // Rosa
}

// Estados de tarea
const STATUS_COLORS = {
  todo:       { bg: '#F1EFE8', text: '#444441' },  // Gris beige
  inprogress: { bg: '#FAEEDA', text: '#633806' },  // Naranja claro
  review:     { bg: '#E6F1FB', text: '#0C447C' },  // Azul claro
  done:       { bg: '#E1F5EE', text: '#085041' },  // Verde claro
}

// Prioridad
const PRIORITY_COLORS = {
  high:   '#E24B4A',   // Rojo
  normal: '#888780',   // Gris
}
```

### 16.3 Navegación Sidebar

```
Dashboard
My Tasks
My Space [privado]
Master Calendar
─────────────────
Planner      (color: #1D9E75)
Trips        (color: #378ADD)
Vacations    (color: #D4537E)
Custom boards...
─────────────────
Recipes (NPD)
─────────────────
Settings       [Admin+]
Analytics      [Admin+]
```

Usuarios con rol `photographer` solo ven: `Recipes (NPD)`.

### 16.4 Componentes UI Reutilizables

Ubicados en `src/renderer/src/components/ui/`:

| Componente | Propósito |
|---|---|
| `AppLayout.tsx` | Shell principal con sidebar |
| `ProtectedRoute.tsx` | Guard de rutas (verifica auth + rol) |
| `ConnectionStatus.tsx` | Indicador offline/online (esquina inferior) |
| `ConflictDialog.tsx` | Resolución de ediciones simultáneas |
| `UndoToast.tsx` | Toast con botón Undo (5 segundos) |
| `CameraBadge.tsx` | Pill verde/gris estado cámara (sidebar) |
| `NewTaskModal.tsx` | Modal crear tarea |
| `RecurringModal.tsx` | Config tareas recurrentes |
| `ProfileSetupModal.tsx` | Setup inicial de perfil |

---

## 17. CONFIGURACIONES Y VARIABLES DE ENTORNO

```bash
# Firebase (REQUERIDAS)
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=

# App
VITE_APP_VERSION=1.3.0
VITE_ALLOWED_DOMAIN=eliteflower.com

# GitHub (solo para release)
GH_TOKEN=ghp_...
```

**Acceso en código:**
```typescript
// Renderer (Vite)
import.meta.env.VITE_FIREBASE_API_KEY

// Main process — NO tiene acceso a VITE_*
// Las credenciales de Firebase solo van al renderer
```

---

## 18. BUILD Y DEPLOY

### 18.1 Crear Release

```bash
npm run build
# Genera dist-electron/

# Para publicar en GitHub Releases:
GH_TOKEN=ghp_... npm run release
```

### 18.2 electron-builder.yml — Puntos Clave

```yaml
appId: com.eliteflower.npdplanner
productName: NPD Planner

# Archivos extra que se copian a resources/ en producción
extraResources:
  - from: resources/scripts
    to: scripts
  - from: resources/templates
    to: templates

win:
  target: nsis
  icon: resources/icon.ico

mac:
  target: dmg
  icon: resources/icon.icns
  category: public.app-category.productivity

publish:
  provider: github
  owner: eliteflower
  repo: npd-planner
```

Los archivos en `extraResources` se acceden en producción con `process.resourcesPath`.

### 18.3 Verificar Build

```bash
npm run build && npm run typecheck
# Si hay errores TypeScript: NO publicar
```

---

## 19. TROUBLESHOOTING

### 19.1 "Notes no se postean / spinner infinito"

**Causa:** Las reglas de Firestore no tienen la subcolección `notes` declarada.

**Diagnóstico:** Abrir consola de Firestore → Reglas → intentar crear nota manualmente.

**Solución:**
```bash
firebase deploy --only firestore:rules
```

Las reglas están en `firestore.rules`. Después de cualquier cambio hay que deployar.

---

### 19.2 "INTERNAL ASSERTION FAILED (b815/ca9)"

**Causa:** React StrictMode + Firebase 12 `persistentLocalCache`. StrictMode ejecuta efectos dos veces en desarrollo — esto corrompe la inicialización de Firestore.

**Solución:** StrictMode está eliminado de `src/renderer/src/main.tsx` intencionalmente. No volver a agregarlo.

---

### 19.3 "excel:check-dependencies retorna available: false"

**En Mac:**
```bash
pip3 install openpyxl pillow
# Verificar:
python3 -c "import openpyxl, PIL; print('OK')"
```

**En Windows:**
```bash
# Puede que Python sea 'python' en vez de 'python3'
python --version
pip install openpyxl pillow
# Si sigue fallando, verificar que Python está en el PATH del sistema
```

---

### 19.4 "Cámara no detecta fotos / tethering no funciona"

Solo funciona en Mac con gPhoto2 instalado:
```bash
brew install gphoto2

# Verificar cámara conectada:
gphoto2 --auto-detect

# Si aparece la cámara pero no captura, verificar que macOS no está interfiriendo:
pkill -9 -f PTPCamera
pkill -9 -f ptpcamera
```

En Windows: el módulo de cámara está deshabilitado. Los botones de tethering no aparecen.

---

### 19.5 "App no actualiza después de publicar release"

1. Verificar que `electron-builder.yml` tiene la sección `publish` correcta
2. Verificar que el repo GitHub tiene GitHub Releases activado
3. El `GH_TOKEN` necesita permisos `repo` (no solo `read`)
4. La versión en `package.json` debe ser mayor a la instalada

---

### 19.6 "RPC_E_CALL_REJECTED al crear recetas en batch"

**Causa:** Se llamó a `recipe:writeCells` en loop (una llamada COM por archivo) en vez de `recipe:batchWriteCells`.

**Solución:** Usar siempre `recipe:batchWriteCells` para escritura masiva. Abre Excel una sola vez para todos los archivos.

---

### 19.7 "Path traversal detected" en adjuntar archivos

El path enviado al IPC `file:copy` intentó salir del directorio SharePoint root. Verificar que el path se construye con `|||` como delimitador y no contiene `../`.

---

### 19.8 "Usuario no puede hacer login / registrarse"

1. Verificar que el email termina en `@eliteflower.com` exactamente
2. Si el usuario está en status `awaiting`: necesita que un admin lo apruebe desde Settings → Members
3. Si status `suspended`: solo un owner puede reactivarlo

---

### 19.9 Cómo verificar que las Firestore Rules están deployadas

```bash
firebase firestore:rules:get
# Compara con el contenido de firestore.rules local
# Si son diferentes: firebase deploy --only firestore:rules
```

---

## 20. HISTORIAL DE DECISIONES TÉCNICAS (ADR)

### ADR-001: Eliminar React.StrictMode

**Fecha:** 2026-04-24 (v1.3.0)

**Contexto:** Con React StrictMode activo, cada efecto se ejecuta dos veces en desarrollo. Esto causa que la inicialización de Firebase 12 `persistentLocalCache` se ejecute dos veces, causando el error `INTERNAL ASSERTION FAILED: Unexpected state (ID: b815/ca9)`.

**Decisión:** Eliminar `<React.StrictMode>` de `src/renderer/src/main.tsx`.

**Consecuencias:**
- Se pierden los warnings de doble render en desarrollo
- Los efectos de los hooks se ejecutan una sola vez (comportamiento más predecible con Firebase)
- No volver a agregar StrictMode mientras usemos Firebase 12 + persistentLocalCache

**Alternativas consideradas:** Lazy init de Firebase (complejo), usar modo memoria de Firestore (pierde offline), downgrade Firebase 11 (pierde features).

---

### ADR-002: safeJoin() para Prevenir Path Traversal

**Fecha:** 2026-04-24 (v1.3.0)

**Contexto:** El handler `SHAREPOINT_RESOLVE_PATH` recibía paths del renderer sin validación. Un path como `../../etc/passwd` podría leer fuera del directorio SharePoint.

**Decisión:** Implementar `safeJoin()` en `fileHandlers.ts` que valida que el path resultante esté dentro del root permitido.

**Por qué no usar una librería:** La función es simple y el contexto es específico. Agregar dependencia para 7 líneas de código no tiene sentido.

---

### ADR-003: PowerShell COM para Escritura Excel (Windows)

**Contexto:** Necesitábamos escribir celdas en archivos Excel con dropdowns de validación. ExcelJS escribe los valores pero no activa la lógica de validación de Excel. Las fórmulas que dependen de los dropdowns tampoco se recalculan.

**Decisión:** Usar COM Automation vía PowerShell (Windows) y AppleScript (Mac). Esto abre Excel nativo, escribe los valores, y Excel maneja validaciones y recálculo automáticamente.

**Trade-off:** Requiere que Excel esté instalado. En entornos sin Excel, las recetas se crean pero sin los valores de dropdowns.

**Optimización batch:** Para evitar `RPC_E_CALL_REJECTED` (Excel rechaza llamadas múltiples simultáneas), se implementó `batchWriteCells` que abre Excel una sola vez y procesa todos los archivos antes de cerrar.

---

### ADR-004: Python para Inserción de Fotos en Excel (Fase 4)

**Contexto:** Insertar imágenes en celdas específicas de Excel con posición pixel-precisa. ExcelJS no soporta `AbsoluteAnchor`. OpenPyXL (Python) sí.

**Decisión:** Script Python bundleado (`insert_photo.py`) llamado desde el main process via `execFile('python3', ...)`.

**Trade-off:** Requiere Python 3 instalado con openpyxl y Pillow. El app verifica con `excel:check-dependencies` antes de mostrar el botón.

**Por qué no Node.js puro:** No existe librería Node que soporte `AbsoluteAnchor` en xlsx de forma confiable en 2026.

---

### ADR-005: No usar React Query / SWR

**Contexto:** Toda la data viene de Firestore con listeners en tiempo real (`onSnapshot`). React Query y SWR están diseñados para fetch-based APIs (request/response).

**Decisión:** Hooks custom que encapsulan `onSnapshot` + estado local de React. Los hooks retornan el estado y manejan el unsubscribe en cleanup.

```typescript
// Patrón estándar en este proyecto:
useEffect(() => {
  const unsub = onSnapshot(query, (snapshot) => {
    setData(snapshot.docs.map(d => ({ id: d.id, ...d.data() })))
  })
  return unsub  // cleanup automático
}, [dependencies])
```

---

## 21. MANTENIMIENTO DE ESTA DOCUMENTACIÓN

### Cuándo actualizar

| Tipo de cambio | Sección(es) a actualizar |
|---|---|
| Nueva feature / módulo | §7, §6 (flujos), §14 (reglas de negocio) |
| Nueva colección Firestore | §4 |
| Nuevo rol o permiso | §5 |
| Nueva integración externa | §10 |
| Nueva ruta | §15 |
| Nuevo IPC channel | §8 |
| Cambio en variables de entorno | §17 |
| Nuevo componente UI importante | §16 |
| Bug fix con lección aprendida | §19 (troubleshooting) + §20 (ADR si aplica) |
| Decisión técnica relevante | §20 |

### Proceso

1. Escribir el código
2. Actualizar este documento (misma PR, mismo commit idealmente)
3. Actualizar el checklist en `CLAUDE.md`
4. Si hay un ADR nuevo, agregarlo en §20 con fecha

### Convención de versiones

Este documento sigue la versión de la app. Cuando se publique v1.4.0, la primera línea del documento debe actualizarse a `1.4.0` con la fecha correspondiente.

---

> **"La documentación no es lo que dices que hace el código — es lo que el próximo programador necesita saber para no romper lo que ya funciona."**

*Documento generado en v1.3.0 — 2026-04-24*
