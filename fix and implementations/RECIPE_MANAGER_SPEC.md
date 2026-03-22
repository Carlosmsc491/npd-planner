# Recipe Manager — Especificación Técnica
## Módulo EliteQuote portado a NPD Planner

**Fecha:** 2026-03-22
**Versión objetivo:** NPD Planner v1.2.0
**Repo destino:** https://github.com/Carlosmsc491/NPD-PLANNER
**Repo fuente (referencia):** https://github.com/Carlosmsc491/EliteQuote

> ⚠️ IMPORTANTE: Todo el trabajo se hace EN EL REPO DE NPD-PLANNER.
> EliteQuote queda como referencia de lógica de negocio — NO se toca su código.

---

## 1. RESUMEN EJECUTIVO

Recipe Manager es un nuevo módulo dentro de NPD Planner que porta toda la
funcionalidad de EliteQuote al stack Electron + React + TypeScript + Firebase.

**Qué hace este módulo:**
- Gestión de proyectos NPD de recetas florales (Excel files por proyecto)
- Bloqueo colaborativo en tiempo real (claim/unclaim/lock expirado)
- Validación automática de recetas según reglas de negocio
- Generación masiva de archivos Excel desde plantillas maestras
- Tracking de estado por archivo: Pending → In Progress → Done
- Presencia de usuarios en tiempo real (quién está online en cada proyecto)

---

## 2. STACK TECNOLÓGICO (hereda de NPD Planner)

| Capa | Tecnología | Notas |
|------|-----------|-------|
| Desktop | Electron ^25.9.8 | Ya instalado |
| Frontend | React 18 + TypeScript | Ya instalado |
| Styling | Tailwind CSS | Ya instalado |
| Database | Firebase Firestore | Reemplaza Supabase PostgreSQL |
| Auth | Firebase Auth @eliteflower.com | Ya existe en NPD Planner |
| Realtime | Firebase onSnapshot | Reemplaza Supabase WebSocket |
| Excel Read | exceljs (npm, nuevo) | Reemplaza openpyxl |
| Excel Open | shell.openPath() vía IPC | Reemplaza win32com |
| File system | path.join() + IPC existente | Ya existe en NPD Planner |
| Icons | Lucide React | Ya instalado |

**Dependencia nueva a instalar:**
```bash
npm install exceljs
```

---

## 3. ARQUITECTURA DEL MÓDULO

### 3.1 Rutas nuevas en App.tsx

```
/recipes                    → RecipeHomePage (lista de proyectos NPD)
/recipes/:projectId         → RecipeProjectPage (ventana de proyecto)
/recipes/:projectId/wizard  → NewRecipeProjectWizard
```

### 3.2 Estructura de carpetas nueva

```
src/renderer/src/
├── components/
│   └── recipes/
│       ├── RecipeHomePage.tsx          ← Lista de proyectos
│       ├── RecipeProjectPage.tsx       ← Ventana de proyecto
│       ├── RecipeFolderSection.tsx     ← Sección colapsable de carpeta
│       ├── RecipeRowItem.tsx           ← Fila individual de receta
│       ├── RecipeDetailPanel.tsx       ← Panel lateral: acciones
│       ├── RecipeProgressCard.tsx      ← Tarjeta de métricas (Total/Done/In Progress/Pending)
│       ├── RecipeActivityFeed.tsx      ← Feed de actividad realtime
│       ├── RecipeValidationDialog.tsx  ← Diálogo de revisión de cambios sugeridos
│       ├── wizard/
│       │   ├── NewProjectWizard.tsx    ← Wizard 3 pasos
│       │   ├── WizardStepBasics.tsx    ← Paso 1: nombre, carpeta, template, modo
│       │   ├── WizardStepRules.tsx     ← Paso 2: customer, holiday, wet pack, distribución
│       │   └── WizardStepStructure.tsx ← Paso 3: árbol de carpetas y recetas
│       └── settings/
│           └── RecipeSettingsTab.tsx   ← Tab de configuración: celdas, holidays, sleeve
├── hooks/
│   ├── useRecipeProjects.ts    ← CRUD de proyectos NPD
│   ├── useRecipeFiles.ts       ← Archivos + estado por proyecto
│   └── useRecipeLock.ts        ← Claim/unclaim/lock/heartbeat
├── store/
│   └── recipeStore.ts          ← Zustand: proyecto activo, archivos, presencia
├── lib/
│   ├── recipeFirestore.ts      ← Todas las ops Firestore para Recipe Manager
│   └── recipeExcel.ts          ← Lectura/escritura Excel vía exceljs + IPC
└── utils/
    ├── recipeValidation.ts     ← Puerto de ValidationService de EliteQuote
    ├── recipeNaming.ts         ← Normalización de nombres de recetas
    └── recipeDistribution.ts   ← Validación de distribución por DC
```

### 3.3 Sidebar de NPD Planner

Agregar sección nueva en AppLayout.tsx:

```
PLANIFICACIÓN
  📅 Dashboard
  📋 Boards
  🗓 Calendar
  ✈️ Trips

RECETAS NPD          ← NUEVA SECCIÓN
  🌸 Proyectos NPD
  ⚙️ Configuración
```

---

## 4. BASE DE DATOS — FIRESTORE

### 4.1 Colecciones nuevas

#### `recipeProjects` (colección)
```typescript
interface RecipeProject {
  id: string                    // Firestore doc ID
  name: string                  // "Valentine's Day 2026"
  rootPath: string              // Ruta absoluta local del proyecto
  createdAt: Timestamp
  createdBy: string             // uid del usuario
  status: 'active' | 'completed' | 'archived'
  config: RecipeProjectConfig
}

interface RecipeProjectConfig {
  customerDefault: string       // "OPEN DESIGN" | "WALMART" | etc.
  holidayDefault: string        // "EVERYDAY" | "VALENTINE'S DAY" | etc.
  wetPackDefault: boolean
  wetPackFalseValue: string     // "N"
  distributionDefault: RecipeDistribution
  templatePath: string          // Ruta al MASTER_TEMPLATE.xlsx
  sourceMode: 'from_scratch' | 'import'
  notes: string
}

interface RecipeDistribution {
  miami: number         // 0-100
  newJersey: number
  california: number
  chicago: number
  seattle: number
  texas: number
}
```

#### `recipeFiles` (subcolección de recipeProjects)
```typescript
interface RecipeFile {
  id: string                    // Firestore doc ID
  projectId: string
  fileId: string                // "{projectId}::{relativePath}"
  relativePath: string          // "Valentine/$12.99 A VALENTINE.xlsx"
  displayName: string           // "$12.99 A VALENTINE"
  price: string                 // "$12.99"
  option: string                // "A" | "B" | "C" | ""
  recipeName: string            // "VALENTINE"
  holidayOverride: string
  customerOverride: string
  wetPackOverride: string       // "Y" | "N"
  distributionOverride: RecipeDistribution
  status: RecipeFileStatus
  lockedBy: string | null       // nombre de usuario
  lockClaimedAt: Timestamp | null
  lockHeartbeatAt: Timestamp | null
  lockToken: string | null
  doneBy: string | null
  doneAt: Timestamp | null
  requiresManualUpdate: boolean
  version: number               // se incrementa en cada update
  updatedAt: Timestamp
}

type RecipeFileStatus = 'pending' | 'in_progress' | 'lock_expired' | 'done'
```

#### `recipePresence` (subcolección de recipeProjects)
```typescript
interface RecipePresence {
  projectId: string
  userId: string                // uid de Firebase Auth
  userName: string              // nombre display
  lastSeenAt: Timestamp
}
```

#### `recipeSettings` (colección, doc por usuario)
```typescript
interface RecipeSettings {
  userId: string
  ruleCells: RecipeRuleCells
  holidayMap: Record<string, string>    // keyword → valor holiday
  sleeveByPrice: Record<string, number> // "$12.99" → sleeve price
  sleeveByStems: Record<string, number> // "12" → sleeve price
  distributionDefaults: RecipeDistribution
  lockTimeoutSeconds: number            // default 300
}

interface RecipeRuleCells {
  recipeName: string      // "D3"
  holiday: string         // "D6"
  customer: string        // "D7"
  dryPackSuggested: string  // "Z9"
  dryPackActual: string     // "AA9"
  wetPackFlag: string       // "AA40"
  wetPackSuggested: string  // "AA45"
  wetPackActual: string     // "AB45"
  sleevePrice: string       // "AB25"
  sleeveFlag: string        // "AC25"
  stemCount: string         // "K3"
  distributionStart: string // "AI15" (AI15:AI20 para los 6 DCs)
}
```

### 4.2 Reglas de seguridad Firestore (agregar a firestore.rules)

```javascript
match /recipeProjects/{projectId} {
  allow read, write: if isActiveUser();

  match /recipeFiles/{fileId} {
    allow read: if isActiveUser();
    allow write: if isActiveUser();
  }

  match /recipePresence/{userId} {
    allow read: if isActiveUser();
    allow write: if request.auth.uid == userId || isAdmin();
  }
}

match /recipeSettings/{userId} {
  allow read, write: if request.auth.uid == userId || isAdmin();
}
```

---

## 5. LÓGICA DE NEGOCIO — PORTS DESDE ELITEQUOTE

### 5.1 recipeValidation.ts — Puerto de ValidationService

```typescript
// Puerto directo de services/validation_service.py de EliteQuote

export interface ValidationChange {
  field: string           // "Recipe Name" | "Holiday" | "Sleeve Price" | etc.
  cell: string            // "D3" | "D6" | etc.
  currentValue: string
  suggestedValue: string
  autoApply: boolean      // true = se aplica automáticamente, false = requiere revisión
  type: 'error' | 'warning' | 'info'
}

export interface ValidationResult {
  valid: boolean
  changes: ValidationChange[]
  requiresManualUpdate: boolean
}

// Reglas a portar (de EliteQuote validation_service.py):
// 1. Recipe Name Format: normalizar a "$PRECIO OPCION NOMBRE" en mayúsculas
// 2. Holiday Detection: detectar holiday del nombre → auto-corregir celda holiday
// 3. Dry Pack Sync: Z9 → AA9
// 4. Wet Pack Sync: AA45 → AB45
// 5. Sleeve Price: precio → sleeve_map → AB25
// 6. Sleeve Flag: si sleeve price > 0, AC25 = "Y"
// 7. Wet Pack Enforcement: si proyecto requiere wet pack, AA40 = "Y"
// 8. Miami Override: si Miami=100%, demás DCs = 0%
// 9. Distribution Over 100%: suma no puede exceder 100%
// 10. Customer Enforcement: D7 debe coincidir con customer del proyecto
// 11. Final File Naming: renombrar a "{RECIPE_NAME} DONE BY {USER}.xlsx"
```

### 5.2 recipeNaming.ts — Puerto de algoritmo de normalización

```typescript
// Puerto de services/recipe_service.py normalizeRecipeName()
//
// Input:  "12.99 a valentine's day"
// Output: "$12.99 A VALENTINE"
//
// Algoritmo:
// 1. Tokenizar por espacios
// 2. Buscar token de precio (regex: /^\$?\d+(?:\.\d{1,2})?$/)
// 3. Buscar token de opción (A, B, C) inmediatamente después del precio
// 4. Resto = nombre (remover apostrofes y "DAY" si viene de holiday)
// 5. Formato: "${precio} {opcion} {nombre}".toUpperCase()
```

### 5.3 Lock System — Puerto de LockService

```typescript
// Puerto de services/lock_service.py
// Usa Firestore transactions (ya disponibles en NPD Planner) en lugar de Supabase

// Claim atómico: usa runTransaction de Firestore
// Si el archivo ya está locked → lanzar error con "Locked by {user}"
// Heartbeat: cada 15 segundos mientras el archivo esté claimed
// Expiry: si lockHeartbeatAt > 300 segundos → estado LOCK_EXPIRED
// Cualquier usuario puede reclamar un lock expirado
```

### 5.4 Excel Operations — recipeExcel.ts

```typescript
// Usa exceljs (npm install exceljs) en el main process vía IPC
// NO usa win32com ni openpyxl (ambos son Python)

// IPC handlers nuevos a agregar:
// recipe:readExcelCell(filePath, cell) → valor de celda
// recipe:writeExcelCell(filePath, cell, value) → escribe celda
// recipe:writeBatch(filePath, changes: {cell, value}[]) → escribe múltiples celdas
// recipe:openFile(filePath) → shell.openPath() para abrir en Excel
// recipe:generateFromTemplate(templatePath, outputPath, recipeData) → genera archivo desde plantilla
// recipe:renameFile(oldPath, newPath) → renombra archivo y actualiza tracker

// Celdas críticas (configurables en RecipeSettings):
// D3 = Recipe Name
// D6 = Holiday
// D7 = Customer
// Z9 = Dry Pack Suggested
// AA9 = Dry Pack Actual
// AA40 = Wet Pack Flag
// AA45 = Wet Pack Suggested
// AB45 = Wet Pack Actual
// AB25 = Sleeve Price
// AC25 = Sleeve Flag
// K3 = Stem Count
// AI15:AI20 = Distribution DCs (miami, NJ, CA, chicago, seattle, texas)
```

---

## 6. FLUJOS DE USUARIO COMPLETOS

### 6.1 Flujo: Home de Proyectos NPD (/recipes)

```
RecipeHomePage
├── Header: "Proyectos NPD" + botón "Nuevo Proyecto"
├── Filtros: All | In Progress | Completed | Archived
├── Búsqueda en tiempo real por nombre de proyecto
├── Tabla de proyectos:
│   Columnas: Nombre, Ubicación, Recetas, Progreso, Última actualización
│   Click → navegar a /recipes/:projectId
└── Estado vacío: "No hay proyectos NPD. Crea el primero."
```

### 6.2 Flujo: Ventana de Proyecto (/recipes/:projectId)

```
RecipeProjectPage
├── Header: nombre del proyecto + "Files & Folders" button
├── Indicador de usuarios online (presence)
├── Tarjetas de resumen: Total | Done | In Progress | Pending
├── Barra de progreso global
├── Panel izquierdo: lista de carpetas colapsables
│   └── RecipeFolderSection por cada subcarpeta
│       └── RecipeRowItem por cada archivo .xlsx
│           Estados visuales:
│           - Pending: gris
│           - In Progress (own lock): amarillo + nombre de usuario
│           - In Progress (other lock): rojo + "Locked by {user}" + botones disabled
│           - Lock Expired: naranja + "Lock expired, reclaim available"
│           - Done: verde + checkmark + nombre de quien lo completó
├── Panel derecho: RecipeDetailPanel
│   └── Según estado del archivo seleccionado:
│       Pending → botón "Claim Recipe"
│       In Progress (own) → botones "Open in Excel" + "Mark Done" + "Unclaim"
│       In Progress (other) → mensaje "Locked by {user}" (sin botones de acción)
│       Lock Expired → botón "Reclaim"
│       Done → botón "Reopen" (vuelve a Pending)
└── RecipeActivityFeed: feed realtime de cambios en el proyecto
```

### 6.3 Flujo: Mark Done

```
1. Usuario hace click "Mark Done"
2. FASE PREPARE:
   - Verificar que el archivo .xlsx no esté abierto en Excel
     (intentar abrir con exceljs — si falla, mostrar "Close Excel first")
   - Leer celdas críticas del archivo con exceljs
   - Correr recipeValidation.ts → obtener ValidationResult
3. FASE REVIEW (si hay cambios):
   - Abrir RecipeValidationDialog
   - Mostrar cada ValidationChange: campo, celda, valor actual vs sugerido
   - Checkbox por cada cambio (autoApply = pre-checked)
   - Botones: "Apply & Finish" | "Cancel"
4. FASE APPLY:
   - Escribir cambios aceptados al Excel vía IPC recipe:writeBatch
5. FASE FINALIZE:
   - Renombrar archivo: "{RECIPE_NAME} DONE BY {userName}.xlsx"
   - Actualizar Firestore: status = "done", doneBy, doneAt
   - Liberar lock
   - Toast: "Recipe marked as done ✓"
```

### 6.4 Flujo: Nuevo Proyecto Wizard

```
WizardStepBasics:
  - Modo: "Create From Scratch" | "Import From Excel"
  - Nombre del proyecto (text input)
  - Carpeta padre (file picker vía IPC)
  - Template Excel (file picker)

WizardStepRules:
  - Customer Default (dropdown: OPEN DESIGN, WALMART, ALBERTSON'S, etc.)
  - Holiday Default (dropdown: EVERYDAY, VALENTINE'S DAY, CHRISTMAS, etc.)
  - Wet Pack (toggle: Yes/No)
  - Distribution (6 sliders/dropdowns de 0-100, step 5):
    Miami | New Jersey | California | Chicago | Seattle | Texas
    Validación: suma ≤ 100%

WizardStepStructure (modo Scratch):
  - Árbol de carpetas a crear (+ agregar carpeta)
  - Por carpeta: lista de RecipeSpec a crear
  - RecipeSpec editor: precio, opción (A/B/C), nombre
  - Preview en tiempo real del nombre normalizado

En Finish:
  - Crear carpeta del proyecto en el sistema de archivos (IPC)
  - Crear _project/project_config.json
  - Generar archivos Excel por cada RecipeSpec desde template
  - Registrar en Firestore recipeProjects + recipeFiles
  - Navegar a /recipes/:newProjectId
```

---

## 7. COMPONENTES UI DETALLADOS

### 7.1 RecipeRowItem

```typescript
// Estado visual según RecipeFileStatus:
// pending     → bg-gray-50, texto gris, badge "Pending"
// in_progress (own lock) → bg-amber-50, badge amarillo "In Progress - You"
// in_progress (other)    → bg-red-50, badge rojo "Locked by {name}"
// lock_expired           → bg-orange-50, badge naranja "Lock Expired"
// done                   → bg-green-50, texto opacidad 60%, badge verde "Done"
//
// Columnas: checkbox, nombre de receta, precio, opción, estado, locked by
// Click → seleccionar en RecipeDetailPanel
// Double click → si own lock, abrir Excel directamente
```

### 7.2 RecipeValidationDialog

```typescript
// Modal similar a ConflictDialog existente en NPD Planner
// Props: changes: ValidationChange[], onApply: (accepted: string[]) => void
//
// Layout:
// Header: "Review Changes Before Finishing"
// Subtitle: "{N} changes suggested for {recipeName}"
//
// Por cada change:
// [checkbox] | {field} ({cell}) | {currentValue} → {suggestedValue} | {type badge}
//
// autoApply changes: pre-checked, destacadas con fondo verde claro
// manual changes: pre-unchecked, destacadas con fondo amarillo
//
// Footer: "Apply X changes & Finish" | "Cancel"
```

### 7.3 DistributionEditor

```typescript
// 6 inputs numéricos (0-100, step 5) para los DCs
// Miami | New Jersey | California | Chicago | Seattle | Texas
// Mostrar suma total en tiempo real
// Si suma > 100: borde rojo + mensaje "Total exceeds 100%"
// Regla Miami: si Miami = 100, deshabilitar los demás y poner en 0 automáticamente
```

---

## 8. IPC HANDLERS NUEVOS (src/main/ipc/recipeIpcHandlers.ts)

```typescript
// Agregar al main process de Electron:

ipcMain.handle('recipe:readCells', async (_, filePath: string, cells: string[]) => {
  // Usar exceljs para leer múltiples celdas
  // Retorna: Record<string, string | number | null>
})

ipcMain.handle('recipe:writeCells', async (_, filePath: string, changes: {cell: string, value: unknown}[]) => {
  // Usar exceljs para escribir celdas
  // IMPORTANTE: preservar formato y fórmulas
})

ipcMain.handle('recipe:generateFromTemplate', async (_, templatePath: string, outputPath: string, recipeData: RecipeSpec) => {
  // Copiar template → output path
  // Escribir valores iniciales de recipeData en celdas configuradas
})

ipcMain.handle('recipe:renameFile', async (_, oldPath: string, newPath: string) => {
  // fs.rename — renombrar archivo
  // Si el archivo está abierto, lanzar error específico
})

ipcMain.handle('recipe:isFileOpen', async (_, filePath: string) => {
  // Intentar abrir el archivo exclusivamente para detectar si está abierto
  // Retorna: boolean
})

ipcMain.handle('recipe:createFolder', async (_, folderPath: string) => {
  // fs.mkdir recursive
})

ipcMain.handle('recipe:scanProject', async (_, rootPath: string) => {
  // Escanear recursivamente buscando archivos .xlsx (excluir _project/)
  // Retorna: { relativePath, displayName, price, option, name }[]
})

ipcMain.handle('recipe:openInExcel', async (_, filePath: string) => {
  // shell.openPath(filePath) — ya existe patrón en NPD Planner
})
```

Exponer en preload/index.ts:
```typescript
recipeReadCells: (filePath, cells) => ipcRenderer.invoke('recipe:readCells', filePath, cells),
recipeWriteCells: (filePath, changes) => ipcRenderer.invoke('recipe:writeCells', filePath, changes),
recipeGenerateFromTemplate: (t, o, d) => ipcRenderer.invoke('recipe:generateFromTemplate', t, o, d),
recipeRenameFile: (old, next) => ipcRenderer.invoke('recipe:renameFile', old, next),
recipeIsFileOpen: (path) => ipcRenderer.invoke('recipe:isFileOpen', path),
recipeCreateFolder: (path) => ipcRenderer.invoke('recipe:createFolder', path),
recipeScanProject: (root) => ipcRenderer.invoke('recipe:scanProject', root),
recipeOpenInExcel: (path) => ipcRenderer.invoke('recipe:openInExcel', path),
```

---

## 9. STORE ZUSTAND (recipeStore.ts)

```typescript
interface RecipeStore {
  // Estado
  projects: RecipeProject[]
  activeProject: RecipeProject | null
  files: RecipeFile[]
  selectedFile: RecipeFile | null
  presence: RecipePresence[]
  settings: RecipeSettings | null
  isLoadingFiles: boolean

  // Acciones
  setActiveProject: (project: RecipeProject | null) => void
  setFiles: (files: RecipeFile[]) => void
  setSelectedFile: (file: RecipeFile | null) => void
  updateFileStatus: (fileId: string, updates: Partial<RecipeFile>) => void
  setPresence: (presence: RecipePresence[]) => void
  setSettings: (settings: RecipeSettings) => void
}
```

---

## 10. HEARTBEAT Y POLLING (useRecipeLock.ts)

```typescript
// Heartbeat: cada 15 segundos mientras haya un archivo claimed
// → actualizar lockHeartbeatAt en Firestore

// Lock expiry detection:
// En recipeFirestore.ts, al leer archivos:
// Si status === 'in_progress' && lockHeartbeatAt < now - 300s → cambiar a 'lock_expired'

// Polling de presencia: cada 15 segundos
// → actualizar recipePresence/{uid} con lastSeenAt = serverTimestamp()

// Cleanup: al desmontar el componente / cerrar la app
// → liberar lock si lo tiene
// → eliminar entrada de presencia
```

---

## 11. CONFIGURACIÓN (RecipeSettingsTab)

Tab dentro de Settings (/settings) de NPD Planner:

```
📋 Rule Cells
   Inputs para cada celda: D3 (Recipe Name), D6 (Holiday), D7 (Customer), etc.
   Guardar en recipeSettings/{userId}

🗓 Holiday Dictionary
   Tabla editable: keyword → valor holiday
   Ejemplos: "VALENTINE" → "VALENTINE'S DAY", "XMAS" → "CHRISTMAS"
   + Agregar keyword | Eliminar

💰 Sleeve by Price
   Tabla editable: precio → sleeve price
   Ejemplo: "$12.99" → 2.49

🌿 Sleeve by Stem Count
   Tabla editable: stem count → sleeve price
   Fallback cuando no hay match por precio

⚙️ General
   - Lock timeout (segundos): default 300, rango 120-3600
   - Distribution defaults: 6 inputs (misma lógica que DistributionEditor)
```

---

## 12. TIPOS TYPESCRIPT (agregar a src/types/index.ts)

```typescript
// ─────────────────────────────────────────
// RECIPE MANAGER
// ─────────────────────────────────────────

export type RecipeFileStatus = 'pending' | 'in_progress' | 'lock_expired' | 'done'

export interface RecipeDistribution {
  miami: number
  newJersey: number
  california: number
  chicago: number
  seattle: number
  texas: number
}

export interface RecipeProjectConfig {
  customerDefault: string
  holidayDefault: string
  wetPackDefault: boolean
  wetPackFalseValue: string
  distributionDefault: RecipeDistribution
  templatePath: string
  sourceMode: 'from_scratch' | 'import'
  notes: string
}

export interface RecipeProject {
  id: string
  name: string
  rootPath: string
  createdAt: Timestamp
  createdBy: string
  status: 'active' | 'completed' | 'archived'
  config: RecipeProjectConfig
}

export interface RecipeFile {
  id: string
  projectId: string
  fileId: string
  relativePath: string
  displayName: string
  price: string
  option: string
  recipeName: string
  holidayOverride: string
  customerOverride: string
  wetPackOverride: string
  distributionOverride: RecipeDistribution
  status: RecipeFileStatus
  lockedBy: string | null
  lockClaimedAt: Timestamp | null
  lockHeartbeatAt: Timestamp | null
  lockToken: string | null
  doneBy: string | null
  doneAt: Timestamp | null
  requiresManualUpdate: boolean
  version: number
  updatedAt: Timestamp
}

export interface RecipePresence {
  projectId: string
  userId: string
  userName: string
  lastSeenAt: Timestamp
}

export interface RecipeRuleCells {
  recipeName: string
  holiday: string
  customer: string
  dryPackSuggested: string
  dryPackActual: string
  wetPackFlag: string
  wetPackSuggested: string
  wetPackActual: string
  sleevePrice: string
  sleeveFlag: string
  stemCount: string
  distributionStart: string
}

export interface RecipeSettings {
  userId: string
  ruleCells: RecipeRuleCells
  holidayMap: Record<string, string>
  sleeveByPrice: Record<string, number>
  sleeveByStems: Record<string, number>
  distributionDefaults: RecipeDistribution
  lockTimeoutSeconds: number
}

export interface RecipeSpec {
  recipeId: string
  relativePath: string
  displayName: string
  price: string
  option: string
  name: string
  holidayOverride: string
  customerOverride: string
  wetPackOverride: string
  distributionOverride: RecipeDistribution
  requiresManualUpdate: boolean
}

export interface ValidationChange {
  field: string
  cell: string
  currentValue: string
  suggestedValue: string
  autoApply: boolean
  type: 'error' | 'warning' | 'info'
}

export interface ValidationResult {
  valid: boolean
  changes: ValidationChange[]
  requiresManualUpdate: boolean
}

export const DEFAULT_RECIPE_RULE_CELLS: RecipeRuleCells = {
  recipeName: 'D3',
  holiday: 'D6',
  customer: 'D7',
  dryPackSuggested: 'Z9',
  dryPackActual: 'AA9',
  wetPackFlag: 'AA40',
  wetPackSuggested: 'AA45',
  wetPackActual: 'AB45',
  sleevePrice: 'AB25',
  sleeveFlag: 'AC25',
  stemCount: 'K3',
  distributionStart: 'AI15',
}

export const DEFAULT_RECIPE_DISTRIBUTION: RecipeDistribution = {
  miami: 0,
  newJersey: 0,
  california: 0,
  chicago: 0,
  seattle: 0,
  texas: 0,
}

export const RECIPE_CUSTOMER_OPTIONS = [
  'OPEN DESIGN',
  'WALMART',
  "ALBERTSON'S IRVINE",
  'KROGER',
  'COSTCO',
  'HEB',
  'PUBLIX',
]

export const RECIPE_HOLIDAY_OPTIONS = [
  'EVERYDAY',
  "VALENTINE'S DAY",
  'CHRISTMAS',
  'THANKSGIVING',
  "MOTHER'S DAY",
  "FATHER'S DAY",
  'EASTER',
  'HALLOWEEN',
]
```

---

## 13. DEFAULTS DE CONFIGURACIÓN

```typescript
// Guardar en Firestore recipeSettings/{userId} en primer uso
const DEFAULT_HOLIDAY_MAP: Record<string, string> = {
  'VALENTINE': "VALENTINE'S DAY",
  'VALENTINES': "VALENTINE'S DAY",
  'XMAS': 'CHRISTMAS',
  'CHRISTMAS': 'CHRISTMAS',
  'THANKSGIVING': 'THANKSGIVING',
  'MOTHERS': "MOTHER'S DAY",
  'FATHERS': "FATHER'S DAY",
  'EASTER': 'EASTER',
  'HALLOWEEN': 'HALLOWEEN',
}
```

---

## 14. PLAN DE IMPLEMENTACIÓN — 5 PROMPTS PARA KIMI

Ver archivo `RECIPE_MANAGER_PROMPTS.md` para los prompts copy-paste.

**Orden de implementación:**
1. Tipos + Firestore + IPC handlers
2. Home de proyectos + Wizard
3. Ventana de proyecto + sistema de locks
4. Validación + Mark Done
5. Settings + pulido final

---

## 15. QUÉ NO SE PORTA

| Funcionalidad EliteQuote | Razón para no portar |
|--------------------------|---------------------|
| Supabase backend | Firebase ya está en NPD Planner, mismo patrón |
| PySide6 UI | Stack es React — reimplementar en componentes |
| win32com para Excel | shell.openPath() via IPC es suficiente |
| openpyxl | exceljs es el equivalente en Node.js |
| PyInstaller build | electron-builder ya maneja esto |
| MSAL auth | Firebase Auth @eliteflower.com ya está |
| JSON local tracker fallback | Firebase tiene offline persistence nativo |
| Modo import desde Excel | Se puede portar en una fase 2 si se necesita |

---

*Documento generado para implementación por agente Kimi en el repo NPD-PLANNER.*
*Referencia de lógica de negocio: repo EliteQuote (no modificar).*
