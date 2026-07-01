// recipeScanCache.ts — Per-project cache of the disk scan (RecipeScannedFile[]).
//
// The disk scan (reading every recipe .xlsx to pull its Z52 UID) is the slow part
// of opening a project. This cache lets a project that was already opened render
// its file list INSTANTLY on re-entry while a silent background refresh runs, and
// lets the most-recent project be pre-scanned before the user even clicks it.
//
//   • In-memory map  → instant within a session.
//   • localStorage   → survives an app restart ("the session stays on the computer").
// Persistence is LRU-bounded so localStorage never grows without limit.

import type { RecipeScannedFile } from '../types'

const mem = new Map<string, RecipeScannedFile[]>()
const LS_KEY = (id: string) => `npd:scan_${id}`
const LRU_KEY = 'npd:scan_lru'
const MAX_PERSISTED = 4 // keep only the few most-recently-used projects on disk

/** Cached scan for a project (memory first, then localStorage), or null. */
export function getCachedScan(projectId: string): RecipeScannedFile[] | null {
  if (!projectId) return null
  const m = mem.get(projectId)
  if (m) return m
  try {
    const raw = localStorage.getItem(LS_KEY(projectId))
    if (raw) {
      const parsed = JSON.parse(raw) as RecipeScannedFile[]
      mem.set(projectId, parsed)
      return parsed
    }
  } catch { /* corrupt/quota — ignore */ }
  return null
}

/** Store a fresh scan in both caches and bump it to the front of the LRU. */
export function setCachedScan(projectId: string, files: RecipeScannedFile[]): void {
  if (!projectId) return
  mem.set(projectId, files)
  try {
    localStorage.setItem(LS_KEY(projectId), JSON.stringify(files))
    touchLru(projectId)
  } catch { /* quota exceeded — memory cache still works */ }
}

function touchLru(projectId: string): void {
  let lru: string[] = []
  try { lru = JSON.parse(localStorage.getItem(LRU_KEY) ?? '[]') } catch { /* */ }
  lru = [projectId, ...lru.filter(id => id !== projectId)]
  for (const id of lru.slice(MAX_PERSISTED)) {
    try { localStorage.removeItem(LS_KEY(id)) } catch { /* */ }
  }
  try { localStorage.setItem(LRU_KEY, JSON.stringify(lru.slice(0, MAX_PERSISTED))) } catch { /* */ }
}

// ── Background pre-scan ───────────────────────────────────────────────────────
// One project at a time — the most-recent one is warmed so it opens instantly;
// the rarely-used ones are scanned on demand when actually opened.

let preloading: string | null = null

export function isPreloading(): boolean {
  return preloading !== null
}

/** Pre-scan a project's folder into the cache. No-op if already cached, if this
 *  machine hasn't resolved the project's path yet, or if another preload is busy. */
export async function preloadProjectScan(projectId: string): Promise<void> {
  if (!projectId || preloading) return
  if (getCachedScan(projectId)) return
  const rootPath = localStorage.getItem(`npd:project_path_${projectId}`)
  if (!rootPath) return // path not resolved on this machine yet — open it once first
  preloading = projectId
  try {
    const exists = await window.electronAPI.recipePathExists(rootPath)
    if (exists) {
      const scanned = await window.electronAPI.recipeScanProject(rootPath)
      setCachedScan(projectId, scanned)
    }
  } catch { /* best-effort warming */ } finally {
    preloading = null
  }
}
