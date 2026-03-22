// NPD Planner — All TypeScript Interfaces
// src/types/index.ts
// DO NOT use `any` anywhere in the project — extend these types as needed

import { Timestamp } from 'firebase/firestore'

// ─────────────────────────────────────────
// AUTH & USERS
// ─────────────────────────────────────────

export type UserRole = 'owner' | 'admin' | 'member'
export type UserStatus = 'active' | 'awaiting' | 'suspended'
export type Theme = 'light' | 'dark' | 'system'

export interface UserPreferences {
  theme: Theme
  dndEnabled: boolean     // master toggle for DND
  dndStart: string        // "22:00"
  dndEnd: string          // "08:00"
  shortcuts: Record<string, string>  // action → key binding
  sharePointPath: string  // local path verified on setup
  calendarView: 'day' | 'week' | 'month'
  defaultBoardView: 'cards' | 'list' | 'gantt' | 'calendar'
  trashRetentionDays: number  // days before permanent deletion (default: 30)
}

export interface AppUser {
  uid: string
  email: string
  name: string
  role: UserRole
  status: UserStatus
  createdAt: Timestamp
  lastSeen: Timestamp
  preferences: UserPreferences
}

// ─────────────────────────────────────────
// BOARDS
// ─────────────────────────────────────────

export type BoardType = 'planner' | 'trips' | 'vacations' | 'custom'
export type GroupByField = 'bucket' | 'client' | 'assignee' | 'date' | 'status' | 'priority'
export type BoardView = 'cards' | 'list' | 'gantt' | 'calendar'

export type PropertyType =
  | 'text' | 'number' | 'select' | 'multiselect' | 'date' | 'daterange'
  | 'person' | 'checkbox' | 'url' | 'attachment' | 'tags' | 'email' | 'phone'

export interface SelectOption {
  id: string
  label: string
  color: string
}

export interface BoardProperty {
  id: string
  name: string
  type: PropertyType
  icon: string
  options?: SelectOption[]
  order: number
  required?: boolean
  display?: boolean   // shown as subtitle on task cards (only one per board)
}

export interface Board {
  id: string
  name: string
  color: string
  type: BoardType
  order: number
  createdBy: string
  createdAt: Timestamp
  customProperties?: BoardProperty[]
  defaultView?: BoardView
  icon?: string   // lucide icon name for custom boards
}

// ─────────────────────────────────────────
// AWB & ORDER STATUS
// ─────────────────────────────────────────

export interface EtaHistoryEntry {
  eta: string            // "MM/DD/YYYY" or "MM/DD/YYYY HH:mm"
  recordedAt: Timestamp
  source: 'auto' | 'manual'
  previousEta: string | null
}

export interface AwbEntry {
  id: string             // nanoid() — unique per entry
  number: string         // AWB as entered by user, e.g. "369-9824-2535"
  boxes: number          // number of boxes on this AWB
  carrier: string | null       // populated from CSV (carrier column)
  shipDate: string | null      // "MM/DD/YYYY" from CSV (SHIP DATE column)
  eta: string | null           // from CSV (ETA column)
  ata: string | null           // from CSV (ATA column)
  guia: string | null          // house AWB / local tracking guide number
  etaChanged: boolean          // true if ETA changed in the last CSV check
  lastCheckedAt: Timestamp | null
  etaHistory: EtaHistoryEntry[]
  missingAtaAlertSent: boolean // true after "no ATA 6h post-ETA" alert fired
}

// ─────────────────────────────────────────
// TASKS
// ─────────────────────────────────────────

export type TaskStatus = 'todo' | 'inprogress' | 'review' | 'done'
export type TaskPriority = 'normal' | 'high'
export type RecurringFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom'
export type AttachmentStatus = 'uploading' | 'synced' | 'error' | 'pending'

export interface Subtask {
  id: string
  title: string
  completed: boolean
  assigneeUid: string | null
  createdAt: Timestamp
}

export interface TaskAttachment {
  id: string
  name: string
  sharePointRelativePath: string  // relative to SharePoint root folder
  uploadedBy: string              // uid
  uploadedAt: Timestamp
  status: AttachmentStatus
  sizeBytes: number | null
  mimeType: string | null
}

export interface RecurringConfig {
  enabled: boolean
  frequency: RecurringFrequency
  customDays: number[] | null  // 0=Sun, 1=Mon, ... 6=Sat
  nextDate: Timestamp | null
}

export interface Task {
  id: string
  boardId: string
  title: string
  clientId: string          // REQUIRED
  status: TaskStatus
  priority: TaskPriority
  assignees: string[]       // array of uids
  labelIds: string[]
  bucket: string            // column/group name
  dateStart: Timestamp | null
  dateEnd: Timestamp | null
  description: string   // rich text HTML
  notes: string
  poNumber: string
  poNumbers: string[]   // additional PO/Order numbers beyond the first
  awbs: AwbEntry[]
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

// ─────────────────────────────────────────
// CLIENTS & LABELS
// ─────────────────────────────────────────

export interface Client {
  id: string
  name: string
  active: boolean
  createdAt: Timestamp
  createdBy: string
}

export interface Label {
  id: string
  name: string
  color: string       // hex background
  textColor: string   // hex text (auto-computed)
  boardId: string | null  // null = global
  createdAt: Timestamp
}

// ─────────────────────────────────────────
// HISTORY & COMMENTS
// ─────────────────────────────────────────

export type HistoryAction = 'created' | 'updated' | 'completed' | 'reopened' | 'deleted' | 'file_added' | 'assigned' | 'unassigned'

export interface TaskHistoryEntry {
  id: string
  taskId: string
  userId: string
  userName: string
  action: HistoryAction
  field: string | null
  oldValue: string | null
  newValue: string | null
  timestamp: Timestamp
}

export interface Comment {
  id: string
  taskId: string
  authorId: string
  authorName: string
  text: string
  mentions: string[]   // uids mentioned with @
  createdAt: Timestamp
  editedAt: Timestamp | null
}

// ─────────────────────────────────────────
// NOTIFICATIONS
// ─────────────────────────────────────────

export type NotificationType = 'assigned' | 'updated' | 'completed' | 'comment' | 'mentioned' | 'reopened' | 'new_user_pending'

export interface AppNotification {
  id: string
  userId: string      // recipient uid
  taskId?: string     // optional for non-task notifications (e.g., user approval)
  taskTitle?: string
  boardId?: string
  boardType?: BoardType
  type: NotificationType
  message: string
  read: boolean
  createdAt: Timestamp
  triggeredBy: string    // uid of actor
  triggeredByName: string
}

// ─────────────────────────────────────────
// ANALYTICS & ARCHIVE
// ─────────────────────────────────────────

export interface BoardSummary {
  boardId: string
  boardName: string
  totalTasks: number
  completedTasks: number
  completionRate: number
}

export interface AnnualSummary {
  id: string          // format: "2025"
  year: number
  generatedAt: Timestamp
  totalTasks: number
  totalTrips: number
  totalVacations: number
  completionRate: number
  byBoard: Record<string, number>
  byClient: Record<string, number>
  byAssignee: Record<string, number>
  byMonth: number[]   // index 0=Jan, 11=Dec
  topClients: Array<{ clientId: string; clientName: string; count: number }>
  topAssignees: Array<{ uid: string; name: string; count: number }>
}

// ─────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────

export interface GlobalSettings {
  sharePointVerificationFolder: string  // 'REPORTS (NPD-SECURE)'
  archiveAfterMonths: number            // default: 12
  notificationsEnabled: boolean
}

export interface EmergencySettings {
  masterKeyHash: string   // SHA-256 hash — NEVER store plain text
}

// ─────────────────────────────────────────
// UI STATE TYPES
// ─────────────────────────────────────────

export interface BoardViewState {
  boardId: string
  view: BoardView
  groupBy: GroupByField
  showCompleted: Record<string, boolean>  // groupKey → show/hide
  calendarView: 'day' | 'week' | 'month'
}

export interface SearchResult {
  type: 'task' | 'client' | 'comment'
  id: string
  title: string
  subtitle: string
  boardId?: string
  taskId?: string
  clientName?: string
  boardName?: string
  authorName?: string
  date?: string | null
}

export interface ConflictData {
  taskId: string
  field: string
  fieldLabel: string
  localValue: string
  remoteValue: string
  localUpdatedBy: string
  remoteUpdatedBy: string
}

export interface ToastData {
  id: string
  message: string
  type: 'success' | 'error' | 'info' | 'warning'
  undoAction?: () => void
  duration?: number  // ms, default 5000
}

export interface FileUploadJob {
  taskId: string
  attachmentId: string
  sourcePath: string
  destPath: string
  fileName: string
  retryCount: number
  status: AttachmentStatus
}

// ─────────────────────────────────────────
// IPC CHANNEL TYPES (Electron main ↔ renderer)
// ─────────────────────────────────────────

export interface IpcFileRequest {
  sourcePath: string
  destPath: string
  createDirs: boolean
}

export interface IpcFileResponse {
  success: boolean
  error?: string
}

export interface IpcSharePointVerifyRequest {
  folderPath: string
  verificationSubfolder: string  // 'REPORTS (NPD-SECURE)'
}

export interface IpcSharePointVerifyResponse {
  valid: boolean
  error?: string
}

export interface IpcNotificationRequest {
  title: string
  body: string
  taskId: string
}

// ─────────────────────────────────────────
// KEYBOARD SHORTCUTS
// ─────────────────────────────────────────

export type ShortcutAction =
  | 'newTask'
  | 'editTask'
  | 'deleteTask'
  | 'closeModal'
  | 'globalSearch'
  | 'toggleDarkMode'
  | 'goToDashboard'
  | 'goToCalendar'
  | 'goToSettings'

// ─────────────────────────────────────────
// PERSONAL SPACE (userPrivate collection)
// ─────────────────────────────────────────

export interface PersonalTask {
  id: string
  title: string
  dueDate: Timestamp | null
  completed: boolean
  completedAt: Timestamp | null
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface PersonalNote {
  id: string
  content: string
  updatedAt: Timestamp
}

export interface QuickLink {
  id: string
  title: string
  url: string
  icon: string  // lucide icon name
  createdAt: Timestamp
}

// ─────────────────────────────────────────
// MY TASKS GROUPING
// ─────────────────────────────────────────

export type MyTaskGroup = 'today' | 'thisWeek' | 'thisMonth' | 'later' | 'noDate' | 'completed'

export interface MyTaskFilter {
  boardId: string | 'all'
  sortBy: 'dueDate' | 'board' | 'priority' | 'created'
}

// ─────────────────────────────────────────
// TRASH QUEUE (Soft delete for tasks)
// ─────────────────────────────────────────

export type TrashItemStatus = 'pending' | 'restored' | 'deleted' | 'failed'

export interface TrashQueueItem {
  id: string                    // same as taskId
  taskId: string
  taskTitle: string
  boardId: string
  boardName: string
  clientName: string
  sharePointFolderPath: string  // full path: year/client/task
  
  // Deletion info
  deletedBy: string             // uid
  deletedByName: string
  deletedAt: Timestamp
  scheduledDeleteAt: Timestamp  // deletedAt + retentionDays
  
  // Status
  status: TrashItemStatus
  
  // Recovery data
  taskData: {
    title: string
    description: string
    clientId: string
    boardId: string
    assignees: string[]
    labelIds: string[]
    status: TaskStatus
    priority: TaskPriority
    bucket: string
    dateStart: Timestamp | null
    dateEnd: Timestamp | null
    poNumber: string
    poNumbers: string[]
    awbs: AwbEntry[]
    subtasks: Subtask[]
    recurring: RecurringConfig | null
    customFields?: Record<string, unknown>
  }
  
  attachments: Array<{
    id: string
    name: string
    relativePath: string
    sizeBytes: number | null
    mimeType: string | null
  }>
}

export const DEFAULT_SHORTCUTS: Record<ShortcutAction, string> = {
  newTask:        'n',
  editTask:       'e',
  deleteTask:     'Delete',
  closeModal:     'Escape',
  globalSearch:   'ctrl+k',
  toggleDarkMode: 'ctrl+shift+d',
  goToDashboard:  'ctrl+1',
  goToCalendar:   'ctrl+2',
  goToSettings:   'ctrl+,',
}

export const SHORTCUT_ACTION_LABELS: Record<ShortcutAction, string> = {
  newTask:        'New Task',
  editTask:       'Edit Task',
  deleteTask:     'Delete Task',
  closeModal:     'Close Modal',
  globalSearch:   'Global Search',
  toggleDarkMode: 'Toggle Dark Mode',
  goToDashboard:  'Go to Dashboard',
  goToCalendar:   'Go to Calendar',
  goToSettings:   'Go to Settings',
}

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
  fileId: string                  // "{projectId}::{relativePath}"
  relativePath: string            // "Valentine/$12.99 A VALENTINE.xlsx"
  displayName: string             // "$12.99 A VALENTINE"
  price: string                   // "$12.99"
  option: string                  // "A" | "B" | "C" | ""
  recipeName: string              // "VALENTINE"
  holidayOverride: string
  customerOverride: string
  wetPackOverride: string         // "Y" | "N"
  distributionOverride: RecipeDistribution
  status: RecipeFileStatus
  lockedBy: string | null         // display name of user holding the lock
  lockClaimedAt: Timestamp | null
  lockHeartbeatAt: Timestamp | null
  lockToken: string | null
  doneBy: string | null
  doneAt: Timestamp | null
  requiresManualUpdate: boolean
  version: number                 // increments on each update
  updatedAt: Timestamp
}

export interface RecipePresence {
  projectId: string
  userId: string
  userName: string
  lastSeenAt: Timestamp
}

export interface RecipeRuleCells {
  recipeName: string        // "D3"
  holiday: string           // "D6"
  customer: string          // "D7"
  dryPackSuggested: string  // "Z9"
  dryPackActual: string     // "AA9"
  wetPackFlag: string       // "AA40"
  wetPackSuggested: string  // "AA45"
  wetPackActual: string     // "AB45"
  sleevePrice: string       // "AB25"
  sleeveFlag: string        // "AC25"
  stemCount: string         // "K3"
  distributionStart: string // "AI15" (AI15:AI20 for the 6 DCs)
}

export interface RecipeSettings {
  userId: string
  ruleCells: RecipeRuleCells
  holidayMap: Record<string, string>    // keyword → holiday value
  sleeveByPrice: Record<string, number> // "$12.99" → sleeve price
  sleeveByStems: Record<string, number> // "12" → sleeve price
  distributionDefaults: RecipeDistribution
  lockTimeoutSeconds: number            // default 300
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

export interface RecipeFSEntry {
  name: string
  isDirectory: boolean
  size: number           // bytes, 0 for directories
  modifiedAt: Date
  fullPath: string
}

export interface RecipeScannedFile {
  relativePath: string
  displayName: string
  price: string
  option: string
  name: string
}

// ── Recipe Manager defaults & constants ───────────────────────────────────

export const DEFAULT_RECIPE_RULE_CELLS: RecipeRuleCells = {
  recipeName:        'D3',
  holiday:           'D6',
  customer:          'D7',
  dryPackSuggested:  'Z9',
  dryPackActual:     'AA9',
  wetPackFlag:       'AA40',
  wetPackSuggested:  'AA45',
  wetPackActual:     'AB45',
  sleevePrice:       'AB25',
  sleeveFlag:        'AC25',
  stemCount:         'K3',
  distributionStart: 'AI15',
}

export const DEFAULT_RECIPE_DISTRIBUTION: RecipeDistribution = {
  miami:     0,
  newJersey: 0,
  california:0,
  chicago:   0,
  seattle:   0,
  texas:     0,
}

export const RECIPE_CUSTOMER_OPTIONS: string[] = [
  'OPEN DESIGN',
  'WALMART',
  "ALBERTSON'S IRVINE",
  'KROGER',
  'COSTCO',
  'HEB',
  'PUBLIX',
]

export const RECIPE_HOLIDAY_OPTIONS: string[] = [
  'EVERYDAY',
  "VALENTINE'S DAY",
  'CHRISTMAS',
  'THANKSGIVING',
  "MOTHER'S DAY",
  "FATHER'S DAY",
  'EASTER',
  'HALLOWEEN',
]
