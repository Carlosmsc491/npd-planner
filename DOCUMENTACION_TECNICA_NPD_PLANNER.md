# DOCUMENTACIÓN TÉCNICA DE PRODUCTO - NPD PLANNER

## 1. IDENTIDAD Y PROPÓSITO

### 1.1 Nombre Exacto del Producto
**NPD Planner** (versión actual: 1.0.4)

### 1.2 Propósito Fundamental
**NPD Planner** es el **hub central de operaciones** para **Elite Flower**, diseñado para:
- **Gestión de tareas** del equipo de operaciones (NPD = New Product Development)
- **Coordinación de viajes** (trips) para el equipo
- **Gestión de vacaciones** del personal
- **Coordinación de archivos** vía integración con SharePoint local
- **Seguimiento de AWB** (Air Waybill) para logística de flores con integración Traze

### 1.3 Problema que Resuelve
Elite Flower necesitaba un sistema centralizado para:
- Trackear el desarrollo de nuevos productos (POs, AWBs, fechas de entrega)
- Coordinar viajes de equipo a proveedores/fincas
- Gestionar vacaciones sin conflictos con fechas críticas
- Mantener todos los archivos relacionados organizados en SharePoint
- Tener visibilidad en tiempo real del estado de vuelos/logística

### 1.4 Propuesta de Valor Única (UVP)
- **Integración Traze automática**: Descarga CSVs de AWB cada hora vía browser automation
- **SharePoint nativo**: No subida a cloud, sincronización local con estructura automática año/cliente/tarea
- **Notificaciones inteligentes**: Solo Planner board dispara notificaciones desktop (Trips/Vacations no)
- **Dominio restringido**: Solo @eliteflower.com puede acceder (seguridad por diseño)

### 1.5 Sector/Industria Objetivo
- **Industria**: Floricultura / Agricultura de exportación
- **Sub-sector**: New Product Development en flores frescas
- **Empresa**: Elite Flower (productora/exportadora de flores)

### 1.6 Modelo de Negocio
- **B2B Internal**: Aplicación interna de empresa, no comercial
- **Sin monetización**: Herramienta de productividad interna
- **Distribución**: Desktop app (Windows .exe + Mac .dmg) con auto-updater

---

## 2. ARQUITECTURA TÉCNICA

### 2.1 Stack Tecnológico Completo

| Capa | Tecnología | Versión | Propósito |
|------|------------|---------|-----------|
| **Desktop Framework** | Electron | ^25.9.8 | App de escritorio cross-platform |
| **Build Tool** | electron-vite | ^2.3.0 | Dev server y build orchestration |
| **Frontend** | React | ^18.3.1 | UI framework |
| **Language** | TypeScript | ^5.6.3 | Type safety (strict mode, no `any`) |
| **Routing** | react-router-dom | ^6.28.0 | Client-side navigation (HashRouter) |
| **Styling** | Tailwind CSS | ^3.4.14 | Utility-first CSS |
| **State Management** | Zustand | ^5.0.0 | Global state (auth, boards, tasks, notifications) |
| **Database** | Firebase Firestore | ^11.0.0 | Real-time data sync, offline persistence |
| **Authentication** | Firebase Auth | ^11.0.0 | Email/password + domain restriction |
| **Calendar** | FullCalendar.js | ^6.1.15 | Vistas day/week/month + drag/resize |
| **Charts** | Recharts | ^2.13.3 | Analytics dashboard |
| **Rich Text Editor** | Tiptap | ^3.20.4 | Descripciones de tareas con formato |
| **Icons** | Lucide React | ^0.577.0 | Icon library |
| **Search** | Fuse.js | ^7.0.0 | Fuzzy search global (Ctrl+K) |
| **PDF Export** | jsPDF + html2canvas | ^2.5.2 / ^1.4.1 | Reportes anuales |
| **Auto-updater** | electron-updater | ^6.3.9 | Actualizaciones silenciosas |
| **Browser Automation** | Playwright | ^1.58.2 | Integración Traze (descarga CSVs) |
| **PDF Preview** | pdfjs-dist | ^5.5.207 | Visualización de PDFs adjuntos |
| **ID Generation** | nanoid | ^5.1.7 | IDs únicos para tareas/comentarios |

### 2.2 Arquitectura de Sistema

**Modelo Multi-Proceso Electron:**

```
┌─────────────────────────────────────────────────────────┐
│                    MAIN PROCESS                         │
│  (Node.js - acceso completo al sistema)                 │
│  ├─ src/main/index.ts          (Entry point)            │
│  ├─ src/main/updater.ts        (Auto-updater)           │
│  ├─ src/main/ipc/              (IPC Handlers)           │
│  │   ├─ fileHandlers.ts        (File system ops)        │
│  │   ├─ notificationHandlers.ts (Desktop notifications) │
│  │   └─ awbIpcHandlers.ts      (AWB lookup IPC)         │
│  └─ src/main/services/         (Background services)    │
│      ├─ trazeIntegrationService.ts  (Scheduler)         │
│      ├─ trazePlaywrightService.ts   (Browser auto)      │
│      ├─ trazeCredentialsService.ts  (Secure storage)    │
│      ├─ trazeStatusService.ts       (Status tracking)   │
│      ├─ trazePreferencesService.ts  (User prefs)        │
│      ├─ trazeWindowManager.ts       (Window mgmt)       │
│      ├─ awbLookupService.ts         (CSV processing)    │
│      └─ errorReporter.ts            (Error handling)    │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼ IPC (contextBridge)
┌─────────────────────────────────────────────────────────┐
│                   RENDERER PROCESS                      │
│  (Chromium - React App)                                 │
│  ├─ src/renderer/src/                                   │
│  │   ├─ App.tsx            (Router + App shell)         │
│  │   ├─ main.tsx           (React root render)          │
│  │   ├─ components/        (UI Components)              │
│  │   │   ├─ ui/            (Reusable UI)                │
│  │   │   ├─ board/         (Board views)                │
│  │   │   ├─ task/          (Task detail)                │
│  │   │   ├─ notifications/ (Notification UI)            │
│  │   │   ├─ search/        (Global search)              │
│  │   │   ├─ settings/      (Settings panels)            │
│  │   │   ├─ myspace/       (Personal space)             │
│  │   │   └─ dashboard/     (Dashboard widgets)          │
│  │   ├─ pages/             (Route-level pages)          │
│  │   ├─ hooks/             (Custom React hooks)         │
│  │   ├─ store/             (Zustand stores)             │
│  │   ├─ lib/               (Core libraries)             │
│  │   ├─ types/             (TypeScript definitions)     │
│  │   └─ utils/             (Utility functions)          │
│  └─ src/preload/index.ts   (Secure bridge)              │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                   FIREBASE BACKEND                      │
│  ├─ Firestore              (Database real-time)         │
│  ├─ Firebase Auth          (Authentication)             │
│  └─ Security Rules         (firestore.rules)            │
└─────────────────────────────────────────────────────────┘
```

### 2.3 Estructura de Carpetas

```
npd-planner/
├── src/
│   ├── main/                    # Electron main process
│   │   ├── index.ts             # App entry, window creation
│   │   ├── updater.ts           # Auto-updater config
│   │   ├── ipc/                 # IPC handlers
│   │   │   ├── fileHandlers.ts
│   │   │   ├── notificationHandlers.ts
│   │   │   └── awbIpcHandlers.ts
│   │   ├── services/            # Background services
│   │   │   ├── trazeIntegrationService.ts
│   │   │   ├── trazePlaywrightService.ts
│   │   │   ├── trazeCredentialsService.ts
│   │   │   ├── trazeStatusService.ts
│   │   │   ├── trazePreferencesService.ts
│   │   │   ├── trazeWindowManager.ts
│   │   │   ├── awbLookupService.ts
│   │   │   └── errorReporter.ts
│   │   └── utils/
│   │       └── dateRange.ts
│   ├── preload/                 # Electron preload scripts
│   │   ├── index.ts             # API exposure
│   │   └── index.d.ts           # TypeScript declarations
│   ├── renderer/                # React application
│   │   ├── index.html
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── ui/              # Reusable UI
│   │   │   │   ├── AppLayout.tsx
│   │   │   │   ├── NewBoardModal.tsx
│   │   │   │   ├── NewTaskModal.tsx
│   │   │   │   ├── RecurringModal.tsx
│   │   │   │   ├── ConflictDialog.tsx
│   │   │   │   ├── UndoToast.tsx
│   │   │   │   ├── ConnectionStatus.tsx
│   │   │   │   ├── ProfileSetupModal.tsx
│   │   │   │   └── ProtectedRoute.tsx
│   │   │   ├── board/           # Board views
│   │   │   │   ├── BoardView.tsx
│   │   │   │   ├── BoardColumn.tsx
│   │   │   │   ├── TaskCard.tsx
│   │   │   │   ├── ListView.tsx
│   │   │   │   ├── BoardCalendar.tsx
│   │   │   │   ├── GanttView.tsx
│   │   │   │   └── GroupBySelector.tsx
│   │   │   ├── task/            # Task detail
│   │   │   │   ├── TaskPage.tsx
│   │   │   │   ├── TaskFullPage.tsx (página completa)
│   │   │   │   ├── SubtaskList.tsx
│   │   │   │   ├── CommentSection.tsx
│   │   │   │   ├── ActivityLog.tsx
│   │   │   │   ├── AttachmentPanel.tsx
│   │   │   │   ├── RichTextEditor.tsx
│   │   │   │   └── OrderStatusSection.tsx
│   │   │   ├── notifications/   # Notifications
│   │   │   │   ├── NotificationBell.tsx
│   │   │   │   └── NotificationCenter.tsx
│   │   │   ├── search/          # Search
│   │   │   │   └── GlobalSearch.tsx
│   │   │   ├── settings/        # Settings
│   │   │   │   ├── MembersPanel.tsx
│   │   │   │   ├── SharePointSetup.tsx
│   │   │   │   ├── TrazeSettings.tsx
│   │   │   │   ├── BoardTemplateEditor.tsx
│   │   │   │   ├── AddPropertyModal.tsx
│   │   │   │   ├── IconPickerPopover.tsx
│   │   │   │   ├── ClientManager.tsx
│   │   │   │   └── LabelManager.tsx
│   │   │   ├── myspace/         # Personal space
│   │   │   │   ├── PersonalCalendar.tsx
│   │   │   │   ├── PersonalNotes.tsx
│   │   │   │   ├── PersonalTasks.tsx
│   │   │   │   └── QuickLinks.tsx
│   │   │   └── dashboard/       # Dashboard
│   │   │       └── FlightStatusPanel.tsx
│   │   ├── pages/               # Route pages
│   │   │   ├── LoginPage.tsx
│   │   │   ├── AwaitingApprovalPage.tsx
│   │   │   ├── EmergencyPage.tsx
│   │   │   ├── DashboardPage.tsx
│   │   │   ├── BoardPage.tsx
│   │   │   ├── TaskFullPage.tsx
│   │   │   ├── CalendarPage.tsx
│   │   │   ├── AnalyticsPage.tsx
│   │   │   ├── SettingsPage.tsx
│   │   │   ├── MyTasksPage.tsx
│   │   │   └── MySpacePage.tsx
│   │   ├── hooks/               # Custom hooks
│   │   │   ├── useAuth.ts
│   │   │   ├── useBoard.ts
│   │   │   ├── useTasks.ts
│   │   │   ├── useClients.ts
│   │   │   ├── useLabels.ts
│   │   │   ├── useNotifications.ts
│   │   │   ├── useSharePoint.ts
│   │   │   ├── useKeyboardShortcuts.ts
│   │   │   ├── useAwbLookup.ts
│   │   │   ├── useTrazeSettings.ts
│   │   │   ├── useTrazeRefresh.ts
│   │   │   ├── useMySpace.ts
│   │   │   └── useMyTasks.ts
│   │   ├── store/               # Zustand stores
│   │   │   ├── authStore.ts
│   │   │   ├── boardStore.ts
│   │   │   ├── taskStore.ts
│   │   │   ├── notificationStore.ts
│   │   │   └── settingsStore.ts
│   │   ├── lib/                 # Core libraries
│   │   │   ├── firebase.ts      # Firebase init
│   │   │   ├── firestore.ts     # Firestore operations
│   │   │   └── sharepointLocal.ts # SharePoint file ops
│   │   ├── types/               # TypeScript types
│   │   │   └── index.ts
│   │   └── utils/               # Utilities
│   │       ├── dateUtils.ts
│   │       ├── colorUtils.ts
│   │       ├── exportUtils.ts
│   │       ├── hashUtils.ts
│   │       ├── awbUtils.ts
│   │       ├── propertyUtils.tsx
│   │       └── utils.ts
│   ├── shared/                  # Shared constants
│   │   └── constants.ts
│   └── types/                   # Global types
│       └── index.ts
├── resources/                   # Build resources (icons)
├── firestore.rules              # Security rules
├── firestore.indexes.json       # Firestore indexes
├── firebase.json                # Firebase config
├── electron-builder.yml         # Build config
├── electron.vite.config.ts      # Vite config
├── tailwind.config.js           # Tailwind config
└── package.json                 # Dependencies
```

### 2.4 APIs Externas Consumidas

| Servicio | Uso | Datos Intercambiados |
|----------|-----|---------------------|
| **Firebase Auth** | Autenticación de usuarios | Email, password, UID |
| **Firebase Firestore** | Database real-time | Todos los datos de la app |
| **Traze Platform** | Descarga CSV AWB | Login credentials, descarga CSV de tracking |
| **GitHub Releases** | Auto-updater | Versión actual vs nueva, descarga de binarios |
| **SharePoint Local** | Almacenamiento de archivos | Copia local de archivos adjuntos |

### 2.5 APIs Propias Exposadas (IPC Channels)

**File Operations:**
- `file:copy` - Copia archivos al folder SharePoint
- `file:selectFolder` - Selector de carpeta nativo
- `file:select` - Selector de archivo nativo
- `file:readBase64` - Lee archivo como base64 (preview)
- `file:exists` - Verifica existencia de archivo
- `file:open` - Abre archivo con app nativa

**SharePoint:**
- `sharepoint:verify` - Verifica folder REPORTS (NPD-SECURE)
- `sharepoint:resolvePath` - Resuelve path relativo a absoluto

**Notifications:**
- `notification:send` - Envía notificación desktop
- `notification:clicked` - Callback cuando se hace click

**Traze Integration:**
- `traze:check-auth`, `traze:download-now`, `traze:get-status`
- `traze:save-credentials`, `traze:load-credentials`, `traze:has-credentials`, `traze:clear-credentials`
- `traze:get-process-status`, `traze:get-logs`, `traze:clear-logs`, `traze:refresh-csv`
- `traze:get-preferences`, `traze:set-view-browser`
- Eventos: `traze:csv-downloaded`, `traze:csv-error`, `traze:needs-login`, `traze:login-success`

**Recipe Manager:**
- `recipe:readCells` — Lee celdas específicas de un .xlsx vía ExcelJS
- `recipe:writeCells` — Escribe celdas en un .xlsx vía PowerShell COM
- `recipe:batchWriteCells` — Escribe celdas en múltiples .xlsx en UNA sesión Excel (evita RPC_E_CALL_REJECTED)
- `recipe:generateFromTemplate` — Copia template .xlsx a ruta de destino (fs.copyFileSync, sin abrir Excel)
- `recipe:createFolder` — Crea carpeta con recursive:true
- `recipe:scanProject` — Escanea carpeta raíz y retorna todos los .xlsx encontrados
- `recipe:openInExcel` — Abre archivo en Excel nativo (shell.openPath)
- `recipe:isFileOpen` — Verifica si un archivo está bloqueado por Excel
- `recipe:listFolder` — Lista contenido de carpeta (archivos + subdirectorios)
- `recipe:deleteItem` — Elimina archivo o carpeta
- `recipe:renameItem` — Renombra archivo o carpeta
- `recipe:renameFile` — Mueve/renombra archivo .xlsx
- `recipe:createFileFromTemplate` — Copia template a subcarpeta específica
- `recipe:pathExists` — Verifica si existe ruta en el filesystem
- `recipe:createImportTemplate` — Genera template Excel de importación vacío
- `recipe:parseImportExcel` — Parsea Excel de importación (cols: A=name, B=SRP, C=BoxType, D=PickNeeded, E=holiday)
- `recipe:validateProjectFolder` — Valida que una carpeta tiene `_project/project_config.json` (para Import Existing)

---

## 3. BASE DE DATOS Y MODELO DE DATOS

### 3.1 Sistema de Base de Datos
**Firebase Firestore** (Cloud NoSQL Database)
- **Modo**: Real-time con listeners
- **Persistencia offline**: Enabled (enableMultiTabIndexedDbPersistence)
- **Sincronización**: Multi-tab support

### 3.2 Colecciones y Entidades

#### **COLLECTION: `users`**
```typescript
{
  uid: string              // Firebase Auth UID
  email: string            // Must end in @eliteflower.com
  name: string
  role: 'owner' | 'admin' | 'member'
  status: 'active' | 'awaiting' | 'suspended'
  createdAt: Timestamp
  lastSeen: Timestamp
  preferences: {
    theme: 'light' | 'dark' | 'system'
    dndEnabled: boolean
    dndStart: string       // "22:00"
    dndEnd: string         // "08:00"
    shortcuts: Record<string, string>
    sharePointPath: string
    calendarView: 'day' | 'week' | 'month'
    defaultBoardView: 'cards' | 'list' | 'gantt' | 'calendar'
    trashRetentionDays: number  // default: 30
  }
}
```

#### **COLLECTION: `boards`**
```typescript
{
  id: string
  name: string
  color: string            // hex color
  type: 'planner' | 'trips' | 'vacations' | 'custom'
  order: number
  createdBy: string        // uid
  createdAt: Timestamp
  customProperties?: BoardProperty[]
  defaultView?: BoardView
  icon?: string            // lucide icon name for custom boards
}
```

#### **COLLECTION: `tasks`**
```typescript
{
  id: string
  boardId: string
  title: string
  clientId: string         // REQUIRED
  status: 'todo' | 'inprogress' | 'review' | 'done'
  priority: 'normal' | 'high'
  assignees: string[]      // array of uids
  labelIds: string[]       // array of label ids
  bucket: string           // column/group name
  dateStart: Timestamp | null
  dateEnd: Timestamp | null
  description: string      // rich text HTML
  notes: string
  poNumber: string
  poNumbers: string[]      // additional PO/Order numbers
  awbs: AwbEntry[]         // AWB tracking entries
  subtasks: Subtask[]
  attachments: TaskAttachment[]
  recurring: RecurringConfig | null
  completed: boolean
  completedAt: Timestamp | null
  completedBy: string | null
  customFields?: Record<string, unknown>
  createdBy: string
  createdAt: Timestamp
  updatedAt: Timestamp
  updatedBy: string
}
```

**AwbEntry:**
```typescript
{
  id: string
  number: string
  boxes: number
  carrier: string | null
  shipDate: string | null      // "MM/DD/YYYY"
  eta: string | null           // "MM/DD/YYYY" or "MM/DD/YYYY HH:mm"
  ata: string | null           // "MM/DD/YYYY" or "MM/DD/YYYY HH:mm"
  guia: string | null          // house AWB / local tracking
  etaChanged: boolean
  lastCheckedAt: Timestamp | null
  etaHistory: EtaHistoryEntry[]
}
```

#### **COLLECTION: `clients`**
```typescript
{
  id: string
  name: string
  active: boolean
  createdAt: Timestamp
  createdBy: string
}
```

#### **COLLECTION: `labels`**
```typescript
{
  id: string
  name: string
  color: string            // hex background
  textColor: string        // auto-computed
  boardId: string | null   // null = global label
  createdAt: Timestamp
}
```

#### **COLLECTION: `comments`**
```typescript
{
  id: string
  taskId: string
  authorId: string
  authorName: string
  text: string
  mentions: string[]       // uids mentioned with @
  createdAt: Timestamp
  editedAt: Timestamp | null
}
```

#### **COLLECTION: `taskHistory`** (append-only)
```typescript
{
  id: string
  taskId: string
  userId: string
  userName: string
  action: 'created' | 'updated' | 'completed' | 'reopened' | 'deleted' | 'file_added' | 'assigned' | 'unassigned'
  field: string | null
  oldValue: string | null
  newValue: string | null
  timestamp: Timestamp
}
```

#### **COLLECTION: `notifications`**
```typescript
{
  id: string
  userId: string           // recipient uid
  taskId?: string
  taskTitle?: string
  boardId?: string
  boardType?: BoardType
  type: 'assigned' | 'updated' | 'completed' | 'comment' | 'mentioned' | 'reopened' | 'new_user_pending'
  message: string
  read: boolean
  createdAt: Timestamp
  triggeredBy: string
  triggeredByName: string
}
```

#### **COLLECTION: `archive`**
```typescript
{
  id: string               // format: "2025"
  year: number
  generatedAt: Timestamp
  totalTasks: number
  totalTrips: number
  totalVacations: number
  completionRate: number
  byBoard: Record<string, number>
  byClient: Record<string, number>
  byAssignee: Record<string, number>
  byMonth: number[]        // index 0=Jan, 11=Dec
  topClients: Array<{ clientId: string; clientName: string; count: number }>
  topAssignees: Array<{ uid: string; name: string; count: number }>
}
```

#### **COLLECTION: `settings`**
```typescript
// Document: "global"
{
  sharePointVerificationFolder: 'REPORTS (NPD-SECURE)'
  archiveAfterMonths: 12
  notificationsEnabled: boolean
}

// Document: "emergency"
{
  masterKeyHash: string    // SHA-256 hash
}
```

#### **COLLECTION: `recipeProjects`**
```typescript
{
  id: string
  name: string                // nombre del proyecto (ej: "Albertsons 2nd Half 2027")
  rootPath: string            // ruta absoluta en el filesystem local
  status: 'active' | 'completed' | 'archived'
  createdBy: string           // uid
  createdAt: Timestamp
  config: {
    customerDefault: string   // valor de dropdown D7 (ej: "PUBLIX")
    holidayDefault: string    // valor de dropdown D6 (ej: "EVERYDAY")
    wetPackDefault: boolean   // AA40: true="Y", false=""
    wetPackFalseValue: string // valor cuando wet_pack=false (normalmente "")
    distributionDefault: {    // porcentajes de distribución (0-100, se escriben como ratio 0-1 en Excel)
      miami: number
      newJersey: number
      california: number
      chicago: number
      seattle: number
      texas: number
    }
    templatePath: string      // ruta absoluta al .xlsx template
    sourceMode: 'wizard' | 'import' | 'scratch'
    notes: string
    dueDate: Timestamp | null
  }
}
```

#### **SUBCOLLECTION: `recipeProjects/{projectId}/recipeFiles`**
```typescript
{
  id: string                  // formato: "{projectId}::{folderName}|{fileName}.xlsx"
  projectId: string
  fileId: string              // igual que id
  relativePath: string        // formato: "{folderName}/{fileName}.xlsx"
  displayName: string         // nombre del archivo sin extensión
  price: string               // ej: "$9.99"
  option: string              // ej: "A", "B", "C"
  recipeName: string          // ej: "VALENTINE"
  holidayOverride: string     // sobreescribe holidayDefault para este archivo
  customerOverride: string    // sobreescribe customerDefault
  wetPackOverride: string     // "Y" | "N" | ""
  boxTypeOverride: string     // valor para celda Z6 (ej: "QUARTER ", "HALF ELITE")
  pickNeededOverride: string  // valor para celda AC23 ("Y" | "N")
  distributionOverride: Record<string, number>  // sobreescribe distribución
  status: 'pending' | 'in_progress' | 'done' | 'error'
  lockedBy: string | null     // uid de quien tiene el archivo abierto
  lockClaimedAt: Timestamp | null
  lockHeartbeatAt: Timestamp | null
  lockToken: string | null
  doneBy: string | null
  doneAt: Timestamp | null
  requiresManualUpdate: boolean  // true si sleeve price no se encontró en SLEEVE_PRICE_MAP
  version: number             // contador para optimistic concurrency
  updatedAt: Timestamp
  assignedTo: string | null   // uid
  assignedToName: string | null
}
```

#### **SUBCOLLECTION: `recipeProjects/{projectId}/recipeActivity`**
```typescript
{
  id: string
  projectId: string
  userId: string
  userName: string
  action: string              // ej: "opened", "completed", "assigned"
  fileId: string | null
  fileName: string | null
  timestamp: Timestamp
}
```

#### **COLLECTION: `recipePresence`** (documentos: `{projectId}_{userId}`)
```typescript
{
  projectId: string
  userId: string
  userName: string
  currentFileId: string | null
  lastSeen: Timestamp
}
```

#### **SUBCOLLECTION: `userPrivate/{userId}/...`**
```typescript
// notes/main
{
  id: 'main'
  content: string
  updatedAt: Timestamp
}

// tasks/{taskId}
{
  id: string
  title: string
  dueDate: Timestamp | null
  completed: boolean
  completedAt: Timestamp | null
  createdAt: Timestamp
  updatedAt: Timestamp
}

// quickLinks/{linkId}
{
  id: string
  title: string
  url: string
  icon: string  // lucide icon name
  createdAt: Timestamp
}
```

### 3.3 Relaciones entre Entidades

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│    users    │────<│    tasks    │>────│   boards    │
└─────────────┘     └──────┬──────┘     └─────────────┘
                           │
                           >────┐
                    ┌──────────┴──────────┐
                    │      clients        │
                    └─────────────────────┘
                           │
                    ┌──────┴──────┐
                    >             >
            ┌───────────┐  ┌───────────┐
            │ comments  │  │  labels   │
            └───────────┘  └───────────┘
```

---

## 4. USUARIOS, ROLES Y PERMISOS

### 4.1 Tipos de Usuarios/Roles

| Rol | Descripción | Capacidades |
|-----|-------------|-------------|
| **owner** | Primer usuario creado / Super admin | Todo + gestión de otros owners |
| **admin** | Administrador delegado | Todo excepto modificar owners |
| **member** | Usuario estándar | Crear/editar tareas, no admin panels |

### 4.2 Matriz de Permisos

| Acción | Owner | Admin | Member |
|--------|-------|-------|--------|
| **Usuarios** |
| Ver lista de usuarios | ✅ | ✅ | ✅ (solo nombres) |
| Aprobar/rechazar pendientes | ✅ | ✅ | ❌ |
| Cambiar roles | ✅ | ✅ (no owners) | ❌ |
| Suspender usuarios | ✅ | ✅ | ❌ |
| Eliminar usuarios | ✅ | ❌ | ❌ |
| Editar perfil propio | ✅ | ✅ | ✅ (solo name, prefs) |
| **Boards** |
| Crear boards | ✅ | ✅ | ❌ |
| Editar boards | ✅ | ✅ | ❌ |
| Eliminar boards | ✅ | ✅ | ❌ (protegidos: planner/trips/vacations) |
| **Tasks** |
| Crear tareas | ✅ | ✅ | ✅ |
| Editar tareas | ✅ | ✅ | ✅ |
| Eliminar tareas propias | ✅ | ✅ | ✅ |
| Eliminar cualquier tarea | ✅ | ✅ | ❌ |
| **Clients** |
| Crear clients | ✅ | ✅ | ✅ |
| Editar clients | ✅ | ✅ | ✅ |
| Eliminar clients | ✅ | ✅ | ❌ |
| **Labels** |
| Crear/editar labels | ✅ | ✅ | ❌ |
| **Settings** |
| Cambiar config global | ✅ | ✅ | ❌ |
| Archivar tareas viejas | ✅ | ✅ | ❌ |

### 4.3 Autenticación y Autorización

**Flujo de Autenticación:**
1. Firebase Auth con email/password
2. Validación de dominio: `@eliteflower.com` ONLY
3. Verificación de Firestore user document status:
   - `awaiting` → redirige a `/awaiting-approval`
   - `suspended` → error + logout
   - `active` → acceso permitido

**Flujo de Registro:**
1. Validar email termina en `@eliteflower.com`
2. Password mínimo 6 caracteres
3. Check `hasAnyAdmin()`:
   - Si NO hay admins → primer usuario = `owner` + `active`
   - Si hay admins → nuevo usuario = `member` + `awaiting`
4. Notificación a admins de nuevo usuario pendiente

---

## 5. FLUJOS DE USUARIO COMPLETOS

### 5.1 Flujo: Registro y Onboarding

**Punto de Entrada:** `/login` (tab "Create Account")

**Paso a paso:**
1. Usuario ve pantalla de login con tabs "Sign In" / "Create Account"
2. Click en "Create Account"
3. Formulario con campos: First Name, Last Name, Email, Password, Confirm Password
4. Submit → validaciones: Email domain check, Password mínimo 6 chars, Passwords match
5. Firebase Auth crea usuario
6. Determinar rol: si es primer usuario → `owner` + `active`, si no → `member` + `awaiting`
7. Crear documento en `users` collection
8. Si `awaiting`: notificar a todos los admins/owners activos
9. Redirección: `active` → `/dashboard`, `awaiting` → `/awaiting-approval`

### 5.2 Flujo: Crear Nueva Tarea

**Punto de Entrada:** Botón "+ New Task" en BoardPage, Click en "+" en día del calendario

**Paso a paso (NewTaskModal):**
1. Modal se abre con Board pre-seleccionado, Client dropdown (clientes activos ordenados alfabéticamente)
2. Opción "+ New Client" al final del dropdown
3. Campos: Title, Client, Assignees, Date range, Priority, Status, Labels, PO Number, Description
4. Si selecciona "+ New Client": Modal inline para crear client (solo campo Name)
5. Submit → `createTask` en Firestore
6. Historia automática: "created" entry
7. Notificaciones a assignees (solo si boardType === 'planner')

### 5.3 Flujo: Editar Tarea (TaskPage)

**Punto de Entrada:** Click en task card → TaskPage panel lateral

**Campos editables:** Title, Description (TipTap), Client, Assignees, Date range, Priority, Status, Labels, PO Numbers (múltiples), AWBs, Subtasks, Notes, Attachments

**Secciones:** Order Status, Subtasks, Description, Notes, Attachments, Comments, Activity Log

### 5.4 Flujo: Completar Tarea

**Paso a paso:**
1. Click en checkbox
2. Si es recurring y se marca complete: Crear nueva instancia con fecha nextDate
3. Marcar completed = true, completedAt = now, completedBy = current user uid
4. Mover a bottom de columna, Opacidad 40%
5. Si boardType === 'planner': Notificar a assignees (excepto quien completó)
6. Undo toast aparece por 5 segundos

### 5.5 Flujo: Traze Integration (AWB Auto-lookup)

**Horario:** 7 AM - 6 PM, cada 1 hora

**Paso a paso:**
1. App inicia → espera 5 segundos
2. `startTrazeIntegration(window)` en main process
3. `downloadTrazeCSV()` usando Playwright
4. Login con credenciales guardadas (secure storage)
5. Descargar CSV y parsear
6. Matchear AWBs con tasks
7. Actualizar task.awbs con carrier, shipDate, eta, ata, etaChanged detection

### 5.6 Flujo: Global Search (Ctrl+K)

**Indexación con Fuse.js sobre:** Tasks (title, description, poNumber, poNumbers, awbs.number), Clients (name), Comments (text)

**Navegación:** Flechas + Enter, Click para navegar, Escape para cerrar

---

## 6. MÓDULOS Y FUNCIONALIDADES

### 6.1 Módulo: Dashboard
- Greeting personalizado según hora
- Stats grid: Active Tasks, Assigned to Me, Overdue, Completed Today
- Boards quick access
- **Flight Status Panel**: Tabla de AWBs con ETA/ATA (Scheduled/Flying/Arrived)
- Assigned to Me list

### 6.2 Módulo: Boards
**Vistas:** Cards, List, Calendar, Timeline/Gantt
**Group By:** bucket, client, assignee, date, status, priority

### 6.3 Módulo: Task Detail
- Order Status (PO Numbers + AWBs)
- Subtasks (checklist con progress bar)
- Description (TipTap rich text)
- Notes
- Attachments
- Comments (con @mentions)
- Activity Log

### 6.4 Módulo: My Space
**Tabs:** My Tasks, My Calendar, Quick Links

### 6.5 Módulo: Settings
**Tabs:** Profile, Members, Boards, Clients, Labels, Files, Traze, Appearance, Notifications, Keyboard, Archive

### 6.6 Módulo: Recipe Manager (NPD)

Módulo completo para gestión de archivos Excel de recetas NPD. Reemplaza el flujo manual de copiar/editar templates de EliteQuote.

**Ruta:** `/recipes` (home), `/recipes/new` (wizard), `/recipes/:id` (proyecto)

**Componentes principales:**
```
components/recipes/
├── RecipeHomePage.tsx          # Lista de proyectos + split button New/Import
├── RecipeProjectPage.tsx       # Vista de proyecto: lista de recetas, asignación, estado
├── wizard/
│   ├── NewRecipeProjectWizard.tsx   # Wizard multi-paso
│   ├── WizardStepBasics.tsx         # Paso 1: nombre, template, defaults
│   ├── WizardStepStructure.tsx      # Paso 2: estructura de carpetas/recetas
│   └── WizardStepRules.tsx          # Paso 3: distribución, reglas
└── settings/
    └── RecipeSettingsTab.tsx        # Config del proyecto
```

**Flujo: Crear Proyecto Nuevo (Wizard)**
1. Paso 1 (Basics): Nombre del proyecto, ruta base, template .xlsx, cliente default, holiday default, wet pack default
2. Paso 2 (Structure): Importar desde Excel (5 columnas: A=folder, B=SRP, C=BoxType, D=PickNeeded, E=Holiday) o crear manualmente. Resolución de BoxType: `K WET/K BOX/WET → HALF ELITE + wetPack=Y`, `HALF → HALF ELITE`, demás = uppercase
3. Paso 3 (Rules): Distribución por mercado (Miami, NJ, CA, Chicago, Seattle, Texas)
4. Creación: (a) `recipeCreateFolder` por cada carpeta, (b) `recipeGenerateFromTemplate` (fs.copyFileSync) para cada .xlsx, (c) `recipeBatchWriteCells` — UNA sesión PowerShell COM para escribir todas las celdas en todos los archivos

**Celdas que se escriben al crear cada .xlsx:**
| Celda | Valor |
|-------|-------|
| `Quote!D3` | Nombre normalizado del archivo (ej: `$9.99 A VALENTINE`) |
| `Quote!D6` | Holiday override (ej: `VALENTINE'S DAY`) |
| `Quote!D7` | Customer override (ej: `PUBLIX`) |
| `Quote!AA40` | Wet pack flag (`Y` o `""`) |
| `Quote!Z6` | Box type (ej: `QUARTER ` con trailing space) |
| `Quote!AC23` | Pick needed (`Y` o `N`) |
| `Spec Sheet!E4` | Nombre del proyecto |

**PowerShell COM (writeExcelViaCOM):**
- Abre Excel UNA VEZ para todos los archivos → evita `RPC_E_CALL_REJECTED`
- Script envuelto en `try/finally` → Excel siempre cierra aunque haya error
- Los valores del dropdown Excel tienen espacios exactos que hay que respetar (ej: `"QUARTER "` con trailing space, `" NEW CUSTOMER"` con leading space)

**Flujo: Import Existing Project**
1. Click en `▼` del split button → "Import Existing Project"
2. Selector de carpeta nativo
3. `recipe:validateProjectFolder` — verifica que existe `_project/project_config.json`
4. Lee config (compatible con formato EliteQuote snake_case y NPD camelCase)
5. Registra en Firestore y navega al proyecto

**Sleeve Price (SLEEVE_PRICE_MAP en types/index.ts):**
```typescript
// Mapa precio → sleeve price (se escribe en celda AB25)
"$7.99" → "0.25", "$11.99" → "0.3", "$14.99" → "0.35", ...
// Si el precio no está en el mapa: requiresManualUpdate = true
```

**Hooks:**
- `useRecipeFiles.ts` — Suscripción a recipeFiles de Firestore + escaneo del filesystem + merge de ambos

---

## 7. INTERFAZ DE USUARIO (UI/UX)

### 7.1 Design System
**Framework:** Tailwind CSS con custom theme
**Dark Mode:** Estrategia `class`

### 7.2 Color Palette
```typescript
BOARD_COLORS = {
  planner:   '#1D9E75',  // Emerald green
  trips:     '#378ADD',  // Blue  
  vacations: '#D4537E',  // Pink/Rose
}

STATUS_COLORS = {
  todo:       { bg: '#F1EFE8', text: '#444441' },
  inprogress: { bg: '#FAEEDA', text: '#633806' },
  review:     { bg: '#E6F1FB', text: '#0C447C' },
  done:       { bg: '#E1F5EE', text: '#085041' },
}
```

### 7.3 Navegación Principal
```
Sidebar:
├── Dashboard
├── My Tasks
├── My Space [Private]
├── Master Calendar
├── Boards (Planner, Trips, Vacations, Custom...)
├── Settings
└── Analytics [Admin only]
```

---

## 8. LÓGICA DE NEGOCIO Y REGLAS

### 8.1 Algoritmo Flight Status
```typescript
function computeStatus(eta, ata): FlightStatus {
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
```

### 8.2 Reglas de Notificación
- **Solo Planner board** dispara desktop notifications
- **DND Mode**: Silencia notificaciones desktop durante horario configurado
- Tipos: assigned, completed, mentioned, comment, new_user_pending

### 8.3 SharePoint Path Structure
```
{SharePointRoot}/REPORTS (NPD-SECURE)/{year}/{client}/{task}/{file}
```

---

## 9. INTEGRACIONES EXTERNAS

### 9.1 Firebase
- Authentication, Firestore, Security Rules

### 9.2 Traze Platform
- Browser automation con Playwright
- Descarga CSV cada hora (7 AM - 6 PM)
- AWB tracking data

### 9.3 SharePoint Local
- Folder sync (no API)
- Verificación de folder `REPORTS (NPD-SECURE)`
- OneDrive desktop client sync

### 9.4 GitHub Releases
- Auto-updater (electron-updater)

---

## 10. CONFIGURACIONES

### 10.1 Variables de Entorno
```bash
VITE_FIREBASE_API_KEY=
VITE_APP_VERSION=1.0.4
VITE_ALLOWED_DOMAIN=eliteflower.com
VITE_SHAREPOINT_VERIFICATION_FOLDER=REPORTS (NPD-SECURE)
VITE_ARCHIVE_AFTER_MONTHS=12
GH_TOKEN=
```

---

## 11. RUTAS DE LA APLICACIÓN

| Ruta | Componente | Acceso |
|------|------------|--------|
| `/login` | LoginPage | Público |
| `/awaiting-approval` | AwaitingApprovalPage | Authenticated |
| `/emergency` | EmergencyPage | Público |
| `/dashboard` | DashboardPage | Active users |
| `/my-tasks` | MyTasksPage | Active users |
| `/my-space` | MySpacePage | Active users |
| `/board/:boardId` | BoardPage | Active users |
| `/task/:taskId` | TaskFullPage | Active users |
| `/calendar` | CalendarPage | Active users |
| `/analytics` | AnalyticsPage | Admin+ |
| `/settings` | SettingsPage | Active users |
| `/recipes` | RecipeHomePage | Active users |
| `/recipes/new` | NewRecipeProjectWizard | Active users |
| `/recipes/:id` | RecipeProjectPage | Active users |

---

## 12. MANTENIMIENTO DE LA DOCUMENTACIÓN

> **⚠️ IMPORTANTE:** Esta documentación debe mantenerse actualizada.

### Cuándo actualizar este documento:

| Tipo de cambio | Secciones a actualizar |
|----------------|------------------------|
| **Nueva feature** | Módulos (6), Flujos (5), Lógica de negocio (8) |
| **Nueva colección Firestore** | Base de datos (3) |
| **Nuevo rol/permiso** | Usuarios y roles (4) |
| **Nueva integración** | Integraciones (9) |
| **Nueva ruta** | Rutas (11) |
| **Cambio en variables de entorno** | Configuraciones (10) |
| **Nuevo componente UI** | UI/UX (7) |
| **Cambio en reglas de negocio** | Lógica de negocio (8) |

### Proceso de actualización:

1. **Identificar cambios** realizados en el código
2. **Localizar secciones afectadas** en este documento
3. **Actualizar con la misma exhaustividad** del documento original
4. **Agregar nota al changelog** con fecha de actualización
5. **No omitir NADA** — si hay 5 cambios, documentar los 5

### Checklist de verificación:

- [ ] ¿Se agregó una nueva entidad a Firestore? → Actualizar sección 3
- [ ] ¿Se modificó la autenticación? → Actualizar sección 4
- [ ] ¿Hay un nuevo flujo de usuario? → Actualizar sección 5
- [ ] ¿Se agregó un nuevo módulo? → Actualizar sección 6
- [ ] ¿Cambió el color palette o componentes? → Actualizar sección 7
- [ ] ¿Hay nuevas reglas de negocio? → Actualizar sección 8
- [ ] ¿Se agregó una nueva integración? → Actualizar sección 9
- [ ] ¿Se modificó una variable de entorno? → Actualizar sección 10

### Nota para desarrolladores:

> **"La documentación es código."** 
> 
> Si no está documentado, no existe. Mantener esta documentación actualizada es tan importante como mantener el código funcionando. El siguiente equipo (o tú en 6 meses) te lo agradecerá.

---

*Documento generado el 2026-03-20*
*Última actualización: 2026-03-20*
