// src/renderer/src/lib/repositories/firebase/FirebaseAppRepository.ts
// Wraps all firestore.ts functions — no logic changes, only delegation.

import type { IAppRepository } from '../interfaces/IAppRepository'
import {
  getUser,
  createUser,
  subscribeToUsers,
  updateUserStatus,
  updateUserRole,
  hasAnyAdmin,
  updateUserName,
  notifyAdminsOfPendingUser,
  updateUserPreferences,
  subscribeToBoards,
  createBoard,
  updateBoard,
  deleteBoard,
  updateBoardProperties,
  deduplicateDefaultBoards,
  seedDefaultBoards,
  subscribeToTask,
  subscribeToTasks,
  subscribeToAllTasks,
  subscribeToMyTasks,
  createTask,
  updateTaskField,
  completeTask,
  deleteTask,
  duplicateTask,
  updateTaskAttachments,
  updateAttachmentStatus,
  subscribeToClients,
  subscribeToAllClients,
  createClient,
  updateClient,
  deleteClient,
  getClientTaskCount,
  subscribeToLabels,
  createLabel,
  updateLabel,
  deleteLabel,
  getLabelTaskCount,
  subscribeToComments,
  subscribeToCommentsForBoards,
  addComment,
  subscribeToTaskHistory,
  subscribeToNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  createNotification,
  getGlobalSettings,
  verifyEmergencyKey,
  getAnnualSummary,
  saveAnnualSummary,
  subscribeToArchive,
  getArchiveByYear,
  getOldTasksToArchive,
  archiveOldTasks,
  subscribeToPersonalNotes,
  updatePersonalNotes,
  subscribeToPersonalTasks,
  createPersonalTask,
  updatePersonalTask,
  deletePersonalTask,
  togglePersonalTaskComplete,
  subscribeToQuickLinks,
  createQuickLink,
  deleteQuickLink,
  moveTaskToTrash,
  restoreTaskFromTrash,
  permanentDeleteTrashItem,
  subscribeToTrashQueue,
  getTrashItemsDueForDeletion,
  updateTrashItemStatus,
} from '../../firestore'

export class FirebaseAppRepository implements IAppRepository {
  // USERS
  getUser = getUser
  createUser = createUser
  subscribeToUsers = subscribeToUsers
  updateUserStatus = updateUserStatus
  updateUserRole = updateUserRole
  hasAnyAdmin = hasAnyAdmin
  updateUserName = updateUserName
  notifyAdminsOfPendingUser = notifyAdminsOfPendingUser
  updateUserPreferences = updateUserPreferences

  // BOARDS
  subscribeToBoards = subscribeToBoards
  createBoard = createBoard
  updateBoard = updateBoard
  deleteBoard = deleteBoard
  updateBoardProperties = updateBoardProperties
  deduplicateDefaultBoards = deduplicateDefaultBoards
  seedDefaultBoards = seedDefaultBoards

  // TASKS
  subscribeToTask = subscribeToTask
  subscribeToTasks = subscribeToTasks
  subscribeToAllTasks = subscribeToAllTasks
  subscribeToMyTasks = subscribeToMyTasks
  createTask = createTask
  updateTaskField = updateTaskField
  completeTask = completeTask
  deleteTask = deleteTask
  duplicateTask = duplicateTask
  updateTaskAttachments = updateTaskAttachments
  updateAttachmentStatus = updateAttachmentStatus

  // CLIENTS
  subscribeToClients = subscribeToClients
  subscribeToAllClients = subscribeToAllClients
  createClient = createClient
  updateClient = updateClient
  deleteClient = deleteClient
  getClientTaskCount = getClientTaskCount

  // LABELS
  subscribeToLabels = subscribeToLabels
  createLabel = createLabel
  updateLabel = updateLabel
  deleteLabel = deleteLabel
  getLabelTaskCount = getLabelTaskCount

  // COMMENTS
  subscribeToComments = subscribeToComments
  subscribeToCommentsForBoards = subscribeToCommentsForBoards
  addComment = addComment

  // HISTORY
  subscribeToTaskHistory = subscribeToTaskHistory

  // NOTIFICATIONS
  subscribeToNotifications = subscribeToNotifications
  markNotificationRead = markNotificationRead
  markAllNotificationsRead = markAllNotificationsRead
  createNotification = createNotification

  // SETTINGS
  getGlobalSettings = getGlobalSettings
  verifyEmergencyKey = verifyEmergencyKey

  // ANNUAL ARCHIVE
  getAnnualSummary = getAnnualSummary
  saveAnnualSummary = saveAnnualSummary
  subscribeToArchive = subscribeToArchive
  getArchiveByYear = getArchiveByYear
  getOldTasksToArchive = getOldTasksToArchive
  archiveOldTasks = archiveOldTasks

  // PERSONAL SPACE
  subscribeToPersonalNotes = subscribeToPersonalNotes
  updatePersonalNotes = updatePersonalNotes
  subscribeToPersonalTasks = subscribeToPersonalTasks
  createPersonalTask = createPersonalTask
  updatePersonalTask = updatePersonalTask
  deletePersonalTask = deletePersonalTask
  togglePersonalTaskComplete = togglePersonalTaskComplete

  // QUICK LINKS
  subscribeToQuickLinks = subscribeToQuickLinks
  createQuickLink = createQuickLink
  deleteQuickLink = deleteQuickLink

  // TRASH
  moveTaskToTrash = moveTaskToTrash
  restoreTaskFromTrash = restoreTaskFromTrash
  permanentDeleteTrashItem = permanentDeleteTrashItem
  subscribeToTrashQueue = subscribeToTrashQueue
  getTrashItemsDueForDeletion = getTrashItemsDueForDeletion
  updateTrashItemStatus = updateTrashItemStatus
}
