// useProjectRootPath.ts
// Resolves the local absolute path for a recipe project on the current machine.
//
// Resolution order:
//   1. localStorage cache  npd:project_path_{projectId}  (fast, verified against disk)
//   2. Scan  npd:projects_root  for _project/project.json with matching projectId
//   3. Legacy  resolveProjectRootPath(relativeRootPath, sharePointPath)
//   4. Path not found → returns pathNotFound=true so the UI can prompt the user
//
// relativeRootPath in Firestore is kept as-is (step 3 fallback). This hook does NOT
// remove or replace it — the new projectId-based discovery adds on top of it.

import { useState, useEffect, useCallback } from 'react'
import { resolveProjectRootPath } from '../utils/photoUtils'
import type { RecipeProject } from '../types'
import type { AppUser } from '../types'

const LS_PATH_KEY = (id: string) => `npd:project_path_${id}`
const LS_PROJECTS_ROOT = 'npd:projects_root'

export interface UseProjectRootPathResult {
  effectiveRootPath: string
  pathLoading: boolean
  pathNotFound: boolean
  /** Call this when the user manually locates the project folder. */
  handleLocateFolder: () => Promise<void>
  /** Re-run resolution (e.g. after setting projectsRoot). */
  refresh: () => void
}

export function useProjectRootPath(
  project: RecipeProject | null,
  user: AppUser | null
): UseProjectRootPathResult {
  const [effectiveRootPath, setEffectiveRootPath] = useState('')
  const [pathLoading, setPathLoading]             = useState(true)
  const [pathNotFound, setPathNotFound]           = useState(false)
  const [resolveKey, setResolveKey]               = useState(0)

  const resolve = useCallback(async () => {
    if (!project) {
      setPathLoading(false)
      return
    }

    setPathLoading(true)
    setPathNotFound(false)

    const pid = project.id

    // ── 1. localStorage cache ──────────────────────────────────────────────
    const cached = localStorage.getItem(LS_PATH_KEY(pid))
    if (cached) {
      try {
        const exists = await window.electronAPI.recipePathExists(cached)
        if (exists) {
          setEffectiveRootPath(cached)
          setPathLoading(false)
          // Background: ensure project.json exists for future discovery
          window.electronAPI.recipeWriteProjectJson({ folderPath: cached, projectId: pid }).catch(() => {})
          return
        }
      } catch { /* ignore */ }
      // Cache is stale — remove it
      localStorage.removeItem(LS_PATH_KEY(pid))
    }

    // ── 2. Scan projectsRoot for _project/project.json ─────────────────────
    const projectsRoot = localStorage.getItem(LS_PROJECTS_ROOT)
    if (projectsRoot) {
      try {
        const result = await window.electronAPI.recipeFindProjectFolder({ projectId: pid, projectsRoot })
        if (result.found) {
          localStorage.setItem(LS_PATH_KEY(pid), result.found)
          setEffectiveRootPath(result.found)
          setPathLoading(false)
          return
        }
      } catch { /* ignore, continue to legacy */ }
    }

    // ── 3. Legacy: relativeRootPath + sharePointPath ───────────────────────
    const spPath = localStorage.getItem('npd_sharepoint_path') || user?.preferences?.sharePointPath || ''
    const legacy = resolveProjectRootPath(project.relativeRootPath ?? project.rootPath ?? '', spPath)
    if (legacy) {
      try {
        const exists = await window.electronAPI.recipePathExists(legacy)
        if (exists) {
          // Cache it and write project.json so future opens skip scanning
          localStorage.setItem(LS_PATH_KEY(pid), legacy)
          window.electronAPI.recipeWriteProjectJson({ folderPath: legacy, projectId: pid }).catch(() => {})
          // Seed projectsRoot if not yet set (use parent of the found folder)
          if (!projectsRoot) {
            const sep  = legacy.includes('\\') ? '\\' : '/'
            const parts = legacy.split(sep).filter(Boolean)
            if (parts.length > 1) {
              const parent = (legacy.startsWith('/') ? '/' : '') + parts.slice(0, -1).join(sep)
              localStorage.setItem(LS_PROJECTS_ROOT, parent)
            }
          }
          setEffectiveRootPath(legacy)
          setPathLoading(false)
          return
        }
      } catch { /* ignore */ }
    }

    // ── 4. Not found ───────────────────────────────────────────────────────
    // Still set a best-effort path so callers have something non-empty
    setEffectiveRootPath(legacy || project.relativeRootPath || project.rootPath || '')
    setPathNotFound(true)
    setPathLoading(false)
  }, [project?.id, user?.uid, resolveKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    resolve()
  }, [resolve])

  async function handleLocateFolder() {
    if (!project) return
    const folder = await window.electronAPI.selectFolder()
    if (!folder) return
    const pid = project.id
    // Cache and write project.json
    localStorage.setItem(LS_PATH_KEY(pid), folder)
    window.electronAPI.recipeWriteProjectJson({ folderPath: folder, projectId: pid }).catch(() => {})
    // Seed projectsRoot from parent if not already set
    if (!localStorage.getItem(LS_PROJECTS_ROOT)) {
      const sep    = folder.includes('\\') ? '\\' : '/'
      const parts  = folder.split(sep).filter(Boolean)
      if (parts.length > 1) {
        const parent = (folder.startsWith('/') ? '/' : '') + parts.slice(0, -1).join(sep)
        localStorage.setItem(LS_PROJECTS_ROOT, parent)
      }
    }
    setEffectiveRootPath(folder)
    setPathNotFound(false)
  }

  function refresh() {
    setResolveKey(k => k + 1)
  }

  return { effectiveRootPath, pathLoading, pathNotFound, handleLocateFolder, refresh }
}
