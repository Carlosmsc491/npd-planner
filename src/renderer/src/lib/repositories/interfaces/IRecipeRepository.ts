// src/renderer/src/lib/repositories/interfaces/IRecipeRepository.ts
// Contract for all Recipe Manager database operations.

import type {
  RecipeProject, RecipeFile, RecipePresence, RecipeSettings,
} from '../../../types'
import type { Unsubscribe } from 'firebase/firestore'

export interface IRecipeRepository {
  // ── PROJECTS ───────────────────────────────────────────────────────────────
  subscribeToRecipeProjects(callback: (projects: RecipeProject[]) => void): Unsubscribe
  createRecipeProject(data: Omit<RecipeProject, 'id' | 'createdAt'>): Promise<string>
  updateRecipeProject(id: string, updates: Partial<Omit<RecipeProject, 'id'>>): Promise<void>

  // ── FILES ──────────────────────────────────────────────────────────────────
  subscribeToRecipeFiles(projectId: string, callback: (files: RecipeFile[]) => void): Unsubscribe
  upsertRecipeFile(
    projectId: string,
    fileId: string,
    data: Omit<RecipeFile, 'id'> & { id?: string }
  ): Promise<void>
  updateRecipeFileId(
    projectId: string,
    oldFileId: string,
    newFileId: string,
    newRelativePath: string,
    newDisplayName: string
  ): Promise<void>
  claimRecipeFile(projectId: string, fileId: string, userName: string): Promise<string>
  unclaimRecipeFile(projectId: string, fileId: string, lockToken: string): Promise<void>
  markRecipeDone(projectId: string, fileId: string, userName: string, lockToken: string): Promise<void>
  reopenRecipeFile(projectId: string, fileId: string): Promise<void>
  updateRecipeHeartbeat(projectId: string, fileId: string, lockToken: string): Promise<void>
  checkAndExpireLocks(projectId: string, lockTimeoutSeconds?: number): Promise<void>

  // ── PRESENCE ───────────────────────────────────────────────────────────────
  subscribeToRecipePresence(projectId: string, callback: (presence: RecipePresence[]) => void): Unsubscribe
  updatePresence(projectId: string, userId: string, userName: string): Promise<void>
  removePresence(projectId: string, userId: string): Promise<void>

  // ── SETTINGS ───────────────────────────────────────────────────────────────
  getRecipeSettings(userId: string): Promise<RecipeSettings | null>
  saveRecipeSettings(userId: string, settings: RecipeSettings): Promise<void>
  initDefaultRecipeSettings(userId: string): Promise<RecipeSettings>
}
