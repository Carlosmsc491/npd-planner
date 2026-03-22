// src/renderer/src/lib/repositories/firebase/FirebaseRecipeRepository.ts
// Wraps all recipeFirestore.ts functions — no logic changes, only delegation.

import type { IRecipeRepository } from '../interfaces/IRecipeRepository'
import {
  subscribeToRecipeProjects,
  createRecipeProject,
  updateRecipeProject,
  subscribeToRecipeFiles,
  upsertRecipeFile,
  updateRecipeFileId,
  claimRecipeFile,
  unclaimRecipeFile,
  markRecipeDone,
  reopenRecipeFile,
  updateRecipeHeartbeat,
  checkAndExpireLocks,
  subscribeToRecipePresence,
  updatePresence,
  removePresence,
  getRecipeSettings,
  saveRecipeSettings,
  initDefaultRecipeSettings,
} from '../../recipeFirestore'

export class FirebaseRecipeRepository implements IRecipeRepository {
  subscribeToRecipeProjects = subscribeToRecipeProjects
  createRecipeProject = createRecipeProject
  updateRecipeProject = updateRecipeProject
  subscribeToRecipeFiles = subscribeToRecipeFiles
  upsertRecipeFile = upsertRecipeFile
  updateRecipeFileId = updateRecipeFileId
  claimRecipeFile = claimRecipeFile
  unclaimRecipeFile = unclaimRecipeFile
  markRecipeDone = markRecipeDone
  reopenRecipeFile = reopenRecipeFile
  updateRecipeHeartbeat = updateRecipeHeartbeat
  checkAndExpireLocks = checkAndExpireLocks
  subscribeToRecipePresence = subscribeToRecipePresence
  updatePresence = updatePresence
  removePresence = removePresence
  getRecipeSettings = getRecipeSettings
  saveRecipeSettings = saveRecipeSettings
  initDefaultRecipeSettings = initDefaultRecipeSettings
}
