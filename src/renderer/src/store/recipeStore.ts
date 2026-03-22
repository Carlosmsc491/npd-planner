// src/renderer/src/store/recipeStore.ts
// Zustand store for Recipe Manager module state

import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { RecipeProject, RecipeFile, RecipePresence, RecipeSettings } from '../types'

interface RecipeState {
  // ── Data ──────────────────────────────────────────────────────────────────
  projects: RecipeProject[]
  activeProject: RecipeProject | null
  files: RecipeFile[]
  selectedFile: RecipeFile | null
  presence: RecipePresence[]
  settings: RecipeSettings | null
  isLoadingFiles: boolean

  // ── Actions ───────────────────────────────────────────────────────────────
  setProjects: (projects: RecipeProject[]) => void
  setActiveProject: (project: RecipeProject | null) => void
  setFiles: (files: RecipeFile[]) => void
  setSelectedFile: (file: RecipeFile | null) => void
  updateFileStatus: (fileId: string, updates: Partial<RecipeFile>) => void
  setPresence: (presence: RecipePresence[]) => void
  setSettings: (settings: RecipeSettings) => void
  setIsLoadingFiles: (loading: boolean) => void
  reset: () => void
}

const initialState = {
  projects: [],
  activeProject: null,
  files: [],
  selectedFile: null,
  presence: [],
  settings: null,
  isLoadingFiles: false,
}

export const useRecipeStore = create<RecipeState>()(
  subscribeWithSelector((set) => ({
    ...initialState,

    setProjects: (projects) => set({ projects }),

    setActiveProject: (activeProject) => set({ activeProject }),

    setFiles: (files) => set({ files }),

    setSelectedFile: (selectedFile) => set({ selectedFile }),

    updateFileStatus: (fileId, updates) =>
      set((state) => ({
        files: state.files.map((f) =>
          f.id === fileId ? { ...f, ...updates } : f
        ),
        // Also update selectedFile if it's the one being updated
        selectedFile:
          state.selectedFile?.id === fileId
            ? { ...state.selectedFile, ...updates }
            : state.selectedFile,
      })),

    setPresence: (presence) => set({ presence }),

    setSettings: (settings) => set({ settings }),

    setIsLoadingFiles: (isLoadingFiles) => set({ isLoadingFiles }),

    reset: () => set(initialState),
  }))
)
