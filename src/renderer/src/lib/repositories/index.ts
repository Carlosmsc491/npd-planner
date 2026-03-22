// src/renderer/src/lib/repositories/index.ts
// Central configuration point for the backend.
//
// To swap backends (Firebase → Azure, Supabase, etc.):
//   1. Create a new class implementing IAppRepository / IRecipeRepository
//   2. Set VITE_BACKEND=azure (or any key) in .env
//   3. Add the case below
//   Hooks, stores, and components need zero changes.

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
