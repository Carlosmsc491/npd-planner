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
  etaChanged: boolean          // true if ETA changed in the last CSV check
  lastCheckedAt: Timestamp | null
  etaHistory: EtaHistoryEntry[]
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

export type NotificationType = 'assigned' | 'updated' | 'completed' | 'comment' | 'mentioned' | 'reopened'

export interface AppNotification {
  id: string
  userId: string      // recipient uid
  taskId: string
  taskTitle: string
  boardId: string
  boardType: BoardType
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
