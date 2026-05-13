// photoManifestHandlers.ts — IPC for per-recipe JSON manifests.
//
// Storage location (relative to projectRoot):
//   _project/photos/{recipeUid}.json
//
// Writes are atomic (tmp + rename). When OneDrive creates conflict copies (filenames
// like "{uid} (Carlos's conflict).json" or "{uid} (conflicted copy ...).json"), each
// write scans for them, merges union-style, and deletes the conflict files.

import { ipcMain } from 'electron'
import * as fs from 'fs'
import * as fsp from 'fs/promises'
import * as path from 'path'
import {
  PhotoManifest,
  ManifestLocation,
  OrphanFile,
  mergeManifests,
} from '../../shared/photoManifest'

// ── path helpers ─────────────────────────────────────────────────────────────

function np(p: string): string {
  const normalized = process.platform === 'win32' ? p : p.replace(/\\/g, '/')
  return path.normalize(normalized)
}

function manifestsDir(projectRoot: string): string {
  return np(path.join(projectRoot, '_project', 'photos'))
}

function manifestPath(projectRoot: string, recipeUid: string): string {
  return np(path.join(manifestsDir(projectRoot), `${recipeUid}.json`))
}

const PICTURES_FOLDERS: Record<ManifestLocation, string> = {
  'camera':    path.join('PICTURES', '1. CAMERA'),
  'selected':  path.join('PICTURES', '2. SELECTED'),
  'cleaned':   path.join('PICTURES', '3. CLEANED'),
  'ready-png': path.join('PICTURES', '4. READY', 'PNG'),
  'ready-jpg': path.join('PICTURES', '4. READY', 'JPG'),
}

// ── conflict-copy detection ──────────────────────────────────────────────────

/**
 * OneDrive conflict copy filename patterns we know about:
 *   {uid}-Carlos's MacBook.json
 *   {uid} (Carlos's conflicted copy 2026-05-13).json
 *   {uid} (conflicted copy 2026-05-13).json
 *
 * The pattern: filename starts with the recipeUid, then a non-alphanumeric separator,
 * then arbitrary characters, then ".json".
 */
function findConflictCopies(dir: string, recipeUid: string): string[] {
  if (!fs.existsSync(dir)) return []
  const escaped = recipeUid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`^${escaped}[^a-zA-Z0-9].*\\.json$`, 'i')
  try {
    return fs.readdirSync(dir)
      .filter(name => pattern.test(name))
      .map(name => path.join(dir, name))
  } catch {
    return []
  }
}

async function readManifestFile(filePath: string): Promise<PhotoManifest | null> {
  try {
    const buf = await fsp.readFile(filePath, 'utf-8')
    const parsed = JSON.parse(buf) as PhotoManifest
    return parsed
  } catch {
    return null
  }
}

/**
 * Atomic write: write to a sibling tmp file, then rename.
 * Rename on the same filesystem is atomic on Mac and Windows.
 */
async function atomicWriteJson(filePath: string, content: unknown): Promise<void> {
  const dir = path.dirname(filePath)
  await fsp.mkdir(dir, { recursive: true })
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`
  const data = JSON.stringify(content, null, 2)
  await fsp.writeFile(tmpPath, data, 'utf-8')
  await fsp.rename(tmpPath, filePath)
}

/**
 * Read the canonical manifest + any conflict copies, merge them, write back the
 * merged result, and delete the conflict copies. Returns the merged manifest
 * (or null if no manifest exists at all).
 */
async function readAndHealManifest(
  projectRoot: string,
  recipeUid: string,
): Promise<PhotoManifest | null> {
  const dir = manifestsDir(projectRoot)
  const mainPath = manifestPath(projectRoot, recipeUid)
  const conflictPaths = findConflictCopies(dir, recipeUid).filter(p => p !== mainPath)

  if (!fs.existsSync(mainPath) && conflictPaths.length === 0) return null

  let current = fs.existsSync(mainPath) ? await readManifestFile(mainPath) : null

  if (conflictPaths.length > 0) {
    for (const cPath of conflictPaths) {
      const c = await readManifestFile(cPath)
      if (!c) continue
      current = current ? mergeManifests(current, c) : c
    }
    if (current) {
      await atomicWriteJson(mainPath, current)
      // Delete conflict copies only after the merged main file is persisted.
      for (const cPath of conflictPaths) {
        try { await fsp.unlink(cPath) } catch { /* ignore */ }
      }
    }
  }

  return current
}

// ── disk reconciliation ──────────────────────────────────────────────────────

/**
 * Scan all 5 PICTURES sub-locations and return every file found.
 * Used by the renderer to detect files the manifest doesn't yet know about
 * (e.g. user dropped a file in via Finder, or OneDrive delivered JPGs before
 * the manifest JSON).
 */
function scanPicturesFolders(projectRoot: string): OrphanFile[] {
  const found: OrphanFile[] = []

  for (const [location, relRoot] of Object.entries(PICTURES_FOLDERS) as [ManifestLocation, string][]) {
    const absRoot = np(path.join(projectRoot, relRoot))
    if (!fs.existsSync(absRoot)) continue

    // Each location supports an optional one-level subfolder.
    let topEntries: fs.Dirent[]
    try { topEntries = fs.readdirSync(absRoot, { withFileTypes: true }) }
    catch { continue }

    for (const entry of topEntries) {
      if (entry.isFile()) {
        found.push({ location, subfolderName: '', filename: entry.name })
      } else if (entry.isDirectory()) {
        const subDir = path.join(absRoot, entry.name)
        let subEntries: fs.Dirent[]
        try { subEntries = fs.readdirSync(subDir, { withFileTypes: true }) }
        catch { continue }
        for (const f of subEntries) {
          if (f.isFile()) {
            found.push({ location, subfolderName: entry.name, filename: f.name })
          }
        }
      }
    }
  }

  return found
}

// ── IPC registration ─────────────────────────────────────────────────────────

export function registerPhotoManifestHandlers(): void {

  /** Read one manifest (auto-heals conflict copies). */
  ipcMain.handle(
    'photo-manifest:read',
    async (_e, { projectRoot, recipeUid }: { projectRoot: string; recipeUid: string }):
      Promise<{ manifest: PhotoManifest | null; error?: string }> => {
      try {
        const manifest = await readAndHealManifest(projectRoot, recipeUid)
        return { manifest }
      } catch (err) {
        return { manifest: null, error: String(err) }
      }
    }
  )

  /** Read every manifest under _project/photos/. Auto-heals each. */
  ipcMain.handle(
    'photo-manifest:read-all',
    async (_e, { projectRoot }: { projectRoot: string }):
      Promise<{ manifests: PhotoManifest[]; error?: string }> => {
      try {
        const dir = manifestsDir(projectRoot)
        if (!fs.existsSync(dir)) return { manifests: [] }

        const files = await fsp.readdir(dir)
        // Group by recipeUid prefix so conflict copies collapse onto the canonical file.
        const uids = new Set<string>()
        for (const name of files) {
          if (!name.toLowerCase().endsWith('.json')) continue
          if (name.includes('.tmp-')) continue
          // Extract the recipeUid prefix: everything up to the first non-alphanumeric / hyphen char.
          const m = name.match(/^([a-zA-Z0-9-]+)/)
          if (m) uids.add(m[1])
        }

        const manifests: PhotoManifest[] = []
        for (const uid of uids) {
          const m = await readAndHealManifest(projectRoot, uid)
          if (m) manifests.push(m)
        }
        return { manifests }
      } catch (err) {
        return { manifests: [], error: String(err) }
      }
    }
  )

  /**
   * Write a manifest atomically. If a manifest already exists on disk, the
   * incoming manifest is merged with it (in case a conflict copy raced in).
   * The merged result is returned to the renderer so it can update its in-memory
   * state with the post-merge view.
   */
  ipcMain.handle(
    'photo-manifest:write',
    async (_e, { projectRoot, manifest }: { projectRoot: string; manifest: PhotoManifest }):
      Promise<{ manifest: PhotoManifest | null; error?: string }> => {
      try {
        const existing = await readAndHealManifest(projectRoot, manifest.recipeUid)
        const merged = existing ? mergeManifests(existing, manifest) : manifest
        merged.lastModified = new Date().toISOString()
        merged.lastModifiedBy = manifest.lastModifiedBy
        await atomicWriteJson(manifestPath(projectRoot, manifest.recipeUid), merged)
        return { manifest: merged }
      } catch (err) {
        return { manifest: null, error: String(err) }
      }
    }
  )

  /** Delete a manifest (used when a recipe is removed entirely). */
  ipcMain.handle(
    'photo-manifest:delete',
    async (_e, { projectRoot, recipeUid }: { projectRoot: string; recipeUid: string }):
      Promise<{ success: boolean; error?: string }> => {
      try {
        const dir = manifestsDir(projectRoot)
        const conflicts = findConflictCopies(dir, recipeUid)
        for (const p of conflicts) {
          try { await fsp.unlink(p) } catch { /* ignore */ }
        }
        const main = manifestPath(projectRoot, recipeUid)
        if (fs.existsSync(main)) await fsp.unlink(main)
        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )

  /** Return every file under PICTURES/{1..4} for reconciliation against manifests. */
  ipcMain.handle(
    'photo-manifest:scan-disk',
    async (_e, { projectRoot }: { projectRoot: string }):
      Promise<{ files: OrphanFile[]; error?: string }> => {
      try {
        const files = scanPicturesFolders(projectRoot)
        return { files }
      } catch (err) {
        return { files: [], error: String(err) }
      }
    }
  )
}
