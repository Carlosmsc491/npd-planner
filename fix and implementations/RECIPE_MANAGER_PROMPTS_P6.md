# NPD Planner — Prompt 6: Repository Pattern
# Correr ANTES del Prompt 2 de Recipe Manager
# Este prompt NO agrega funciones nuevas ni cambia nada visual
# Solo reorganiza cómo el código habla con la base de datos
# PRIORIDAD #1: que npm run typecheck pase 0 errores al final
# PRIORIDAD #2: que la app funcione exactamente igual que antes

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT 6 — Repository Pattern (Backend Abstraction Layer)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lee CLAUDE.md completamente antes de empezar.

OBJETIVO: Crear una capa de abstracción entre el código de la app y Firebase,
sin cambiar ninguna funcionalidad existente. La app debe funcionar exactamente
igual que antes al terminar este prompt.

REGLA CRÍTICA: NO modificar la lógica de ningún hook, store, componente ni
página existente. Solo mover y envolver código. Si algo funciona hoy, debe
funcionar igual al terminar.

---

## PASO 1 — Crear la estructura de carpetas

Crear estas carpetas nuevas (vacías por ahora):
- src/renderer/src/lib/repositories/
- src/renderer/src/lib/repositories/interfaces/
- src/renderer/src/lib/repositories/firebase/

---

## PASO 2 — Crear las interfaces (contratos)

### 2a. src/renderer/src/lib/repositories/interfaces/IAppRepository.ts

Crear esta interfaz que cubre TODAS las operaciones de firestore.ts existente.
Copiar las firmas exactas de las funciones de src/renderer/src/lib/firestore.ts
sin cambiar ningún tipo ni parámetro:

```typescript
import type {
  AppUser, Board, Task, Client, Label, Comment,
  TaskHistoryEntry, AppNotification, AnnualSummary,
  GlobalSettings, HistoryAction
} from '../../types'
import type { Unsubscribe } from 'firebase/firestore'

export interface IAppRepository {
  // USERS
  getUser(uid: string): Promise<AppUser | null>
  createUser(uid: string, data: Omit<AppUser, 'uid'>): Promise<void>
  subscribeToUsers(callback: (users: AppUser[]) => void): Unsubscribe
  updateUserStatus(uid: string, status: AppUser['status']): Promise<void>
  updateUserRole(uid: string, role: AppUser['role']): Promise<void>
  updateUserPreferences(uid: string, prefs: Partial<AppUser['preferences']>): Promise<void>
  updateUserLastSeen(uid: string): Promise<void>

  // BOARDS
  subscribeToBoards(callback: (boards: Board[]) => void): Unsubscribe
  createBoard(data: Omit<Board, 'id'>): Promise<string>
  updateBoard(id: string, data: Partial<Board>): Promise<void>
  deleteBoard(id: string): Promise<void>

  // TASKS
  subscribeToTasks(boardId: string, callback: (tasks: Task[]) => void): Unsubscribe
  subscribeToAllTasks(callback: (tasks: Task[]) => void): Unsubscribe
  subscribeToUserTasks(userId: string, callback: (tasks: Task[]) => void): Unsubscribe
  createTask(data: Omit<Task, 'id'>): Promise<string>
  updateTaskField(
    taskId: string,
    field: string,
    value: unknown,
    updatedBy: string,
    updatedByName: string,
    oldValue?: unknown
  ): Promise<void>
  completeTask(taskId: string, userId: string, userName: string): Promise<void>
  deleteTask(taskId: string, userId: string, userName: string): Promise<void>
  duplicateTask(task: Task, newTitle: string): Promise<string>

  // CLIENTS
  subscribeToClients(callback: (clients: Client[]) => void): Unsubscribe
  createClient(name: string, createdBy: string): Promise<string>
  updateClient(id: string, data: Partial<Client>): Promise<void>

  // LABELS
  subscribeToLabels(callback: (labels: Label[]) => void): Unsubscribe
  createLabel(data: Omit<Label, 'id'>): Promise<string>
  updateLabel(id: string, data: Partial<Label>): Promise<void>
  deleteLabel(id: string): Promise<void>

  // COMMENTS
  subscribeToComments(taskId: string, callback: (comments: Comment[]) => void): Unsubscribe
  addComment(data: Omit<Comment, 'id' | 'editedAt'>): Promise<string>

  // HISTORY
  subscribeToTaskHistory(
    taskId: string,
    callback: (history: TaskHistoryEntry[]) => void
  ): Unsubscribe

  // NOTIFICATIONS
  subscribeToNotifications(
    userId: string,
    callback: (notifications: AppNotification[]) => void
  ): Unsubscribe
  markNotificationRead(notificationId: string): Promise<void>
  markAllNotificationsRead(userId: string): Promise<void>
  createNotification(data: Omit<AppNotification, 'id'>): Promise<string>

  // SETTINGS
  getGlobalSettings(): Promise<GlobalSettings | null>
  updateGlobalSettings(data: Partial<GlobalSettings>): Promise<void>

  // ANNUAL SUMMARY
  getAnnualSummary(year: number): Promise<AnnualSummary | null>
  saveAnnualSummary(year: number, data: AnnualSummary): Promise<void>
}
```

Si alguna función en firestore.ts existente no está en esta lista, agrégala
a la interfaz con su firma exacta. La interfaz debe cubrir el 100% de
las funciones exportadas de firestore.ts.

### 2b. src/renderer/src/lib/repositories/interfaces/IRecipeRepository.ts

Crear esta interfaz para Recipe Manager (del Prompt 1):

```typescript
import type {
  RecipeProject, RecipeFile, RecipePresence,
  RecipeSettings, ValidationChange
} from '../../types'
import type { Unsubscribe } from 'firebase/firestore'

export interface IRecipeRepository {
  // PROJECTS
  subscribeToRecipeProjects(
    callback: (projects: RecipeProject[]) => void
  ): Unsubscribe
  createRecipeProject(
    data: Omit<RecipeProject, 'id' | 'createdAt'>
  ): Promise<string>
  updateRecipeProject(id: string, updates: Partial<RecipeProject>): Promise<void>

  // FILES
  subscribeToRecipeFiles(
    projectId: string,
    callback: (files: RecipeFile[]) => void
  ): Unsubscribe
  claimRecipeFile(
    projectId: string,
    fileId: string,
    userName: string
  ): Promise<void>
  unclaimRecipeFile(
    projectId: string,
    fileId: string,
    lockToken: string
  ): Promise<void>
  markRecipeDone(
    projectId: string,
    fileId: string,
    userName: string,
    changes: ValidationChange[]
  ): Promise<void>
  reopenRecipeFile(projectId: string, fileId: string): Promise<void>
  updateRecipeHeartbeat(
    projectId: string,
    fileId: string,
    lockToken: string
  ): Promise<void>
  checkAndExpireLocks(projectId: string): Promise<void>

  // PRESENCE
  updatePresence(
    projectId: string,
    userId: string,
    userName: string
  ): Promise<void>
  removePresence(projectId: string, userId: string): Promise<void>

  // SETTINGS
  getRecipeSettings(userId: string): Promise<RecipeSettings | null>
  saveRecipeSettings(userId: string, settings: RecipeSettings): Promise<void>
  initDefaultRecipeSettings(userId: string): Promise<RecipeSettings>
}
```

---

## PASO 3 — Crear las implementaciones Firebase

### 3a. src/renderer/src/lib/repositories/firebase/FirebaseAppRepository.ts

Crear esta clase que MUEVE (no copia — mueve con re-export) el contenido de
firestore.ts existente:

```typescript
import type { IAppRepository } from '../interfaces/IAppRepository'
// Re-exportar todas las funciones de firestore.ts envueltas en la clase
// NO reescribir la lógica — importar las funciones existentes y delegarles

import {
  getUser, createUser, subscribeToUsers, updateUserStatus,
  updateUserRole, updateUserPreferences, updateUserLastSeen,
  subscribeToBoards, createBoard, updateBoard, deleteBoard,
  subscribeToTasks, subscribeToAllTasks, subscribeToUserTasks,
  createTask, updateTaskField, completeTask, deleteTask, duplicateTask,
  subscribeToClients, createClient, updateClient,
  subscribeToLabels, createLabel, updateLabel, deleteLabel,
  subscribeToComments, addComment,
  subscribeToTaskHistory,
  subscribeToNotifications, markNotificationRead,
  markAllNotificationsRead, createNotification,
  getGlobalSettings, updateGlobalSettings,
  getAnnualSummary, saveAnnualSummary,
} from '../../firestore'

export class FirebaseAppRepository implements IAppRepository {
  getUser = getUser
  createUser = createUser
  subscribeToUsers = subscribeToUsers
  updateUserStatus = updateUserStatus
  updateUserRole = updateUserRole
  updateUserPreferences = updateUserPreferences
  updateUserLastSeen = updateUserLastSeen
  subscribeToBoards = subscribeToBoards
  createBoard = createBoard
  updateBoard = updateBoard
  deleteBoard = deleteBoard
  subscribeToTasks = subscribeToTasks
  subscribeToAllTasks = subscribeToAllTasks
  subscribeToUserTasks = subscribeToUserTasks
  createTask = createTask
  updateTaskField = updateTaskField
  completeTask = completeTask
  deleteTask = deleteTask
  duplicateTask = duplicateTask
  subscribeToClients = subscribeToClients
  createClient = createClient
  updateClient = updateClient
  subscribeToLabels = subscribeToLabels
  createLabel = createLabel
  updateLabel = updateLabel
  deleteLabel = deleteLabel
  subscribeToComments = subscribeToComments
  addComment = addComment
  subscribeToTaskHistory = subscribeToTaskHistory
  subscribeToNotifications = subscribeToNotifications
  markNotificationRead = markNotificationRead
  markAllNotificationsRead = markAllNotificationsRead
  createNotification = createNotification
  getGlobalSettings = getGlobalSettings
  updateGlobalSettings = updateGlobalSettings
  getAnnualSummary = getAnnualSummary
  saveAnnualSummary = saveAnnualSummary
}
```

IMPORTANTE: Si alguna función de firestore.ts no está en este listado porque
no existía en la interfaz, agrégala aquí también. La clase debe implementar
el 100% de IAppRepository sin errores de TypeScript.

### 3b. src/renderer/src/lib/repositories/firebase/FirebaseRecipeRepository.ts

Igual que el anterior pero para Recipe Manager:

```typescript
import type { IRecipeRepository } from '../interfaces/IRecipeRepository'
import {
  subscribeToRecipeProjects, createRecipeProject, updateRecipeProject,
  subscribeToRecipeFiles, claimRecipeFile, unclaimRecipeFile,
  markRecipeDone, reopenRecipeFile, updateRecipeHeartbeat,
  checkAndExpireLocks, updatePresence, removePresence,
  getRecipeSettings, saveRecipeSettings, initDefaultRecipeSettings,
} from '../../recipeFirestore'

export class FirebaseRecipeRepository implements IRecipeRepository {
  subscribeToRecipeProjects = subscribeToRecipeProjects
  createRecipeProject = createRecipeProject
  updateRecipeProject = updateRecipeProject
  subscribeToRecipeFiles = subscribeToRecipeFiles
  claimRecipeFile = claimRecipeFile
  unclaimRecipeFile = unclaimRecipeFile
  markRecipeDone = markRecipeDone
  reopenRecipeFile = reopenRecipeFile
  updateRecipeHeartbeat = updateRecipeHeartbeat
  checkAndExpireLocks = checkAndExpireLocks
  updatePresence = updatePresence
  removePresence = removePresence
  getRecipeSettings = getRecipeSettings
  saveRecipeSettings = saveRecipeSettings
  initDefaultRecipeSettings = initDefaultRecipeSettings
}
```

---

## PASO 4 — Crear el punto de configuración central

### src/renderer/src/lib/repositories/index.ts

```typescript
// PUNTO DE CONFIGURACIÓN CENTRAL
// Para cambiar de Firebase a Azure o Supabase en el futuro:
// 1. Crear AzureAppRepository que implemente IAppRepository
// 2. Cambiar VITE_BACKEND=azure en el .env
// 3. Agregar el case aquí
// Los hooks, stores y componentes no cambian nada.

import { FirebaseAppRepository } from './firebase/FirebaseAppRepository'
import { FirebaseRecipeRepository } from './firebase/FirebaseRecipeRepository'
import type { IAppRepository } from './interfaces/IAppRepository'
import type { IRecipeRepository } from './interfaces/IRecipeRepository'

const backend = import.meta.env.VITE_BACKEND ?? 'firebase'

function createAppRepository(): IAppRepository {
  switch (backend) {
    case 'firebase':
    default:
      return new FirebaseAppRepository()
  }
}

function createRecipeRepository(): IRecipeRepository {
  switch (backend) {
    case 'firebase':
    default:
      return new FirebaseRecipeRepository()
  }
}

export const appRepository: IAppRepository = createAppRepository()
export const recipeRepository: IRecipeRepository = createRecipeRepository()

export type { IAppRepository } from './interfaces/IAppRepository'
export type { IRecipeRepository } from './interfaces/IRecipeRepository'
```

---

## PASO 5 — Agregar variable al .env

Abre .env y .env.example y agrega al final:
```
VITE_BACKEND=firebase
```

---

## PASO 6 — Verificación final

NO modificar ningún hook, store, componente ni página existente.
El código existente (useAuth, useBoard, useTasks, etc.) sigue importando
directamente de firestore.ts — eso está bien por ahora y NO debe cambiarse.
Los prompts futuros (2-5 de Recipe Manager) usarán recipeRepository desde
el inicio, que es lo que importa.

Correr:
```
npm run typecheck
```

Debe pasar con 0 errores. Si hay errores:
- Son casi siempre funciones que están en firestore.ts pero no se agregaron
  a la interfaz o a la clase. Agregarlas hasta que compile.
- NO cambiar tipos existentes para que "encajen" — si hay mismatch de tipos,
  revisar la firma original en firestore.ts y copiarla exactamente.

Correr la app:
```
npm run dev
```

Verificar que todo funciona igual que antes (login, boards, tasks).

Commit:
"refactor: add repository pattern abstraction layer

- IAppRepository + IRecipeRepository interfaces defined
- FirebaseAppRepository wraps existing firestore.ts (zero logic changes)
- FirebaseRecipeRepository wraps recipeFirestore.ts from Prompt 1
- Single config point in repositories/index.ts with VITE_BACKEND switch
- No hooks, stores, or components modified
- Future backend swap (Azure, Supabase) requires only one new class + .env change

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
