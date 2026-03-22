// src/renderer/src/lib/repositories/interfaces/IAppRepository.ts
// Contract for all app-level database operations.
// Changing backend (Firebase → Azure/Supabase) requires only a new implementation class.

import type {
  AppUser, Board, BoardProperty, Task, Client, Label, Comment,
  TaskHistoryEntry, AppNotification, AnnualSummary, GlobalSettings,
  ConflictData, PersonalNote, PersonalTask, QuickLink,
  TrashQueueItem, TrashItemStatus, TaskAttachment, AttachmentStatus,
  UserPreferences,
} from '../../../types'
import type { Unsubscribe } from 'firebase/firestore'

export interface IAppRepository {
  // ── USERS ──────────────────────────────────────────────────────────────────
  getUser(uid: string): Promise<AppUser | null>
  createUser(uid: string, data: Omit<AppUser, 'uid'>): Promise<AppUser>
  subscribeToUsers(callback: (users: AppUser[]) => void): Unsubscribe
  updateUserStatus(uid: string, status: AppUser['status']): Promise<void>
  updateUserRole(uid: string, role: AppUser['role']): Promise<void>
  hasAnyAdmin(): Promise<boolean>
  updateUserName(uid: string, name: string): Promise<void>
  notifyAdminsOfPendingUser(newUser: AppUser): Promise<void>
  updateUserPreferences(uid: string, prefs: Partial<UserPreferences>): Promise<void>

  // ── BOARDS ─────────────────────────────────────────────────────────────────
  subscribeToBoards(callback: (boards: Board[]) => void): Unsubscribe
  createBoard(data: Omit<Board, 'id'>): Promise<string>
  updateBoard(id: string, data: Partial<Omit<Board, 'id'>>): Promise<void>
  deleteBoard(id: string): Promise<void>
  updateBoardProperties(id: string, customProperties: BoardProperty[]): Promise<void>
  deduplicateDefaultBoards(): Promise<void>
  seedDefaultBoards(createdByUid: string): Promise<void>

  // ── TASKS ──────────────────────────────────────────────────────────────────
  subscribeToTask(taskId: string, callback: (task: Task | null) => void): Unsubscribe
  subscribeToTasks(boardId: string, callback: (tasks: Task[]) => void): Unsubscribe
  subscribeToAllTasks(boardIds: string[], callback: (tasks: Task[]) => void): Unsubscribe
  subscribeToMyTasks(userId: string, callback: (tasks: Task[]) => void): Unsubscribe
  createTask(data: Omit<Task, 'id'>): Promise<string>
  updateTaskField(
    taskId: string,
    field: string,
    value: unknown,
    updatedBy: string,
    updatedByName: string,
    oldValue?: unknown,
    boardType?: string
  ): Promise<ConflictData | null>
  completeTask(taskId: string, userId: string, userName: string): Promise<void>
  deleteTask(taskId: string, userId: string, userName: string): Promise<void>
  duplicateTask(task: Task, newTitle: string): Promise<string>
  updateTaskAttachments(taskId: string, attachments: TaskAttachment[]): Promise<void>
  updateAttachmentStatus(taskId: string, attachmentId: string, status: AttachmentStatus): Promise<void>

  // ── CLIENTS ────────────────────────────────────────────────────────────────
  subscribeToClients(callback: (clients: Client[]) => void): Unsubscribe
  subscribeToAllClients(callback: (clients: Client[]) => void): Unsubscribe
  createClient(name: string, createdBy: string): Promise<string>
  updateClient(id: string, data: Partial<Client>): Promise<void>
  deleteClient(id: string): Promise<void>
  getClientTaskCount(clientId: string): Promise<number>

  // ── LABELS ─────────────────────────────────────────────────────────────────
  subscribeToLabels(callback: (labels: Label[]) => void): Unsubscribe
  createLabel(data: Omit<Label, 'id' | 'createdAt'>): Promise<string>
  updateLabel(id: string, data: Partial<Label>): Promise<void>
  deleteLabel(id: string): Promise<void>
  getLabelTaskCount(labelId: string): Promise<number>

  // ── COMMENTS ───────────────────────────────────────────────────────────────
  subscribeToComments(taskId: string, callback: (comments: Comment[]) => void): Unsubscribe
  subscribeToCommentsForBoards(boardIds: string[], callback: (comments: Comment[]) => void): Unsubscribe
  addComment(data: Omit<Comment, 'id' | 'editedAt'>): Promise<string>

  // ── HISTORY ────────────────────────────────────────────────────────────────
  subscribeToTaskHistory(taskId: string, callback: (history: TaskHistoryEntry[]) => void): Unsubscribe

  // ── NOTIFICATIONS ──────────────────────────────────────────────────────────
  subscribeToNotifications(userId: string, callback: (notifs: AppNotification[]) => void): Unsubscribe
  markNotificationRead(notifId: string): Promise<void>
  markAllNotificationsRead(userId: string): Promise<void>
  createNotification(data: Omit<AppNotification, 'id'>): Promise<void>

  // ── SETTINGS ───────────────────────────────────────────────────────────────
  getGlobalSettings(): Promise<GlobalSettings | null>
  verifyEmergencyKey(inputKey: string): Promise<boolean>

  // ── ANNUAL ARCHIVE ─────────────────────────────────────────────────────────
  getAnnualSummary(year: number): Promise<AnnualSummary | null>
  saveAnnualSummary(summary: AnnualSummary): Promise<void>
  subscribeToArchive(callback: (archives: AnnualSummary[]) => void): Unsubscribe
  getArchiveByYear(year: number): Promise<AnnualSummary | null>
  getOldTasksToArchive(): Promise<number>
  archiveOldTasks(): Promise<number>

  // ── PERSONAL SPACE ─────────────────────────────────────────────────────────
  subscribeToPersonalNotes(userId: string, callback: (note: PersonalNote | null) => void): Unsubscribe
  updatePersonalNotes(userId: string, content: string): Promise<void>
  subscribeToPersonalTasks(userId: string, callback: (tasks: PersonalTask[]) => void): Unsubscribe
  createPersonalTask(userId: string, data: Omit<PersonalTask, 'id' | 'createdAt' | 'updatedAt'>): Promise<string>
  updatePersonalTask(userId: string, taskId: string, data: Partial<Omit<PersonalTask, 'id'>>): Promise<void>
  deletePersonalTask(userId: string, taskId: string): Promise<void>
  togglePersonalTaskComplete(userId: string, taskId: string, completed: boolean): Promise<void>

  // ── QUICK LINKS ────────────────────────────────────────────────────────────
  subscribeToQuickLinks(userId: string, callback: (links: QuickLink[]) => void): Unsubscribe
  createQuickLink(userId: string, data: Omit<QuickLink, 'id' | 'createdAt'>): Promise<string>
  deleteQuickLink(userId: string, linkId: string): Promise<void>

  // ── TRASH ──────────────────────────────────────────────────────────────────
  moveTaskToTrash(
    task: Task,
    sharePointFolderPath: string,
    deletedBy: string,
    deletedByName: string,
    retentionDays: number
  ): Promise<void>
  restoreTaskFromTrash(trashId: string): Promise<void>
  permanentDeleteTrashItem(trashId: string): Promise<string | null>
  subscribeToTrashQueue(callback: (items: TrashQueueItem[]) => void): Unsubscribe
  getTrashItemsDueForDeletion(): Promise<TrashQueueItem[]>
  updateTrashItemStatus(trashId: string, status: TrashItemStatus): Promise<void>
}
