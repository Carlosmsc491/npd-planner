// photoManifestApi.ts — Renderer-side operations on per-recipe photo manifests.
//
// The manifest is the source of truth for "what photos exist for this recipe".
// Firestore only carries summary fields (photoStatus, photoCount, excelInsertedAt)
// so the rest of the app (recipe list badges, dashboards) can read fast without
// touching disk.
//
// Every write here:
//   1. Reads the current manifest from disk (the IPC auto-heals OneDrive conflict copies).
//   2. Applies the mutation in memory.
//   3. Writes back atomically (IPC re-merges against disk to avoid lost writes).
//   4. Pushes the derived summary to Firestore (single updateDoc).
//
// Concurrency model:
//   - Disk: atomic temp+rename, conflict-copy merge. Safe across machines via OneDrive.
//   - Firestore summary: last-write-wins per field. The actual photo data is on disk,
//     so a stale Firestore summary self-heals on the next manifest write.

import {
  PhotoManifest,
  CameraEntry,
  CleanedEntry,
  ReadyEntry,
  emptyManifest,
  summarize,
} from '../../../shared/photoManifest'
import { updateRecipePhotoSummary } from './firestore'
import type { RecipeFile } from '../types'

// ── Loaders ─────────────────────────────────────────────────────────────────

export async function loadManifest(
  projectRoot: string,
  recipeUid: string,
): Promise<PhotoManifest | null> {
  if (!projectRoot || !recipeUid) return null
  const res = await window.electronAPI.photoManifestRead({ projectRoot, recipeUid })
  if (res.error) console.warn('[manifest] read error:', res.error)
  return res.manifest
}

export async function loadAllManifests(projectRoot: string): Promise<PhotoManifest[]> {
  if (!projectRoot) return []
  const res = await window.electronAPI.photoManifestReadAll({ projectRoot })
  if (res.error) console.warn('[manifest] read-all error:', res.error)
  return res.manifests
}

// ── Generic write + summary push ────────────────────────────────────────────

interface RecipeRef {
  recipeId: string         // full Firestore compound id: "{projectId}::..."
  recipeUid: string
  excelRelativePath: string
  recipeName: string
  subfolderName: string
  userId: string
}

async function writeManifestAndSummary(
  projectRoot: string,
  ref: RecipeRef,
  mutator: (m: PhotoManifest) => PhotoManifest,
): Promise<PhotoManifest> {
  const existing = await loadManifest(projectRoot, ref.recipeUid)
  const base = existing ?? emptyManifest({
    recipeUid:         ref.recipeUid,
    excelRelativePath: ref.excelRelativePath,
    recipeName:        ref.recipeName,
    subfolderName:     ref.subfolderName,
    userId:            ref.userId,
  })

  // Keep header fields in sync on every write (in case the recipe got renamed).
  const seeded: PhotoManifest = {
    ...base,
    excelRelativePath: ref.excelRelativePath || base.excelRelativePath,
    recipeName:        ref.recipeName        || base.recipeName,
    subfolderName:     ref.subfolderName     ?? base.subfolderName,
    lastModifiedBy:    ref.userId,
  }

  const mutated = mutator(seeded)

  const res = await window.electronAPI.photoManifestWrite({ projectRoot, manifest: mutated })
  if (res.error || !res.manifest) {
    throw new Error(`Failed to write photo manifest: ${res.error ?? 'unknown'}`)
  }

  // Fire-and-forget Firestore summary — the manifest on disk is canonical.
  const summary = summarize(res.manifest)
  updateRecipePhotoSummary(ref.recipeId, summary).catch(err =>
    console.warn('[manifest] Firestore summary push failed (non-fatal):', err)
  )

  return res.manifest
}

// ── Camera operations ───────────────────────────────────────────────────────

export async function appendCameraEntry(
  projectRoot: string,
  ref: RecipeRef,
  entry: Omit<CameraEntry, 'capturedBy'>,
): Promise<PhotoManifest> {
  return writeManifestAndSummary(projectRoot, ref, m => {
    // Skip if same filename already present (idempotent on retry).
    if (m.camera.some(e => e.filename === entry.filename)) return m
    const full: CameraEntry = { ...entry, capturedBy: ref.userId }
    return { ...m, camera: [...m.camera, full] }
  })
}

export async function replaceCameraEntries(
  projectRoot: string,
  ref: RecipeRef,
  entries: CameraEntry[],
): Promise<PhotoManifest> {
  return writeManifestAndSummary(projectRoot, ref, m => ({ ...m, camera: entries }))
}

export async function toggleCameraSelected(
  projectRoot: string,
  ref: RecipeRef,
  filename: string,
): Promise<PhotoManifest> {
  return writeManifestAndSummary(projectRoot, ref, m => {
    const camera = m.camera.map(e => {
      if (e.filename !== filename) return e
      const next: CameraEntry = { ...e, isSelected: !e.isSelected }
      if (next.isSelected) {
        next.selectedAt = new Date().toISOString()
        next.selectedBy = ref.userId
      } else {
        delete next.selectedAt
        delete next.selectedBy
      }
      return next
    })
    return { ...m, camera }
  })
}

export async function removeCameraEntries(
  projectRoot: string,
  ref: RecipeRef,
  filenamesToRemove: string[],
): Promise<PhotoManifest> {
  const toRemove = new Set(filenamesToRemove)
  return writeManifestAndSummary(projectRoot, ref, m => ({
    ...m,
    camera: m.camera.filter(e => !toRemove.has(e.filename)),
  }))
}

// ── Cleaned operations ──────────────────────────────────────────────────────

export async function appendCleanedEntry(
  projectRoot: string,
  ref: RecipeRef,
  filename: string,
): Promise<PhotoManifest> {
  return writeManifestAndSummary(projectRoot, ref, m => {
    if (m.cleaned.some(e => e.filename === filename)) return m
    const entry: CleanedEntry = {
      filename,
      addedAt: new Date().toISOString(),
      addedBy: ref.userId,
      status: 'needs_retouch',
    }
    return { ...m, cleaned: [...m.cleaned, entry] }
  })
}

export async function markCleanedDone(
  projectRoot: string,
  ref: RecipeRef,
): Promise<PhotoManifest> {
  return writeManifestAndSummary(projectRoot, ref, m => ({
    ...m,
    cleaned: m.cleaned.map(e => ({ ...e, status: 'done' as const })),
  }))
}

// ── Ready operations ────────────────────────────────────────────────────────

export async function setReady(
  projectRoot: string,
  ref: RecipeRef,
  pngFilename: string,
  jpgFilename: string,
): Promise<PhotoManifest> {
  return writeManifestAndSummary(projectRoot, ref, m => ({
    ...m,
    ready: {
      pngFilename,
      jpgFilename,
      processedAt: new Date().toISOString(),
      processedBy: ref.userId,
    } as ReadyEntry,
  }))
}

export async function clearReady(
  projectRoot: string,
  ref: RecipeRef,
): Promise<PhotoManifest> {
  return writeManifestAndSummary(projectRoot, ref, m => ({ ...m, ready: null }))
}

// ── Excel insert ────────────────────────────────────────────────────────────

export async function markExcelInserted(
  projectRoot: string,
  ref: RecipeRef,
): Promise<PhotoManifest> {
  return writeManifestAndSummary(projectRoot, ref, m => ({
    ...m,
    excelInsertedAt: new Date().toISOString(),
    excelInsertedBy: ref.userId,
  }))
}

// ── Path reconstruction helpers (no paths stored in JSON) ───────────────────

export function cameraPhotoPath(projectRoot: string, manifest: PhotoManifest, filename: string): string {
  const root = projectRoot.replace(/\\/g, '/').replace(/\/$/, '')
  return manifest.subfolderName
    ? `${root}/PICTURES/1. CAMERA/${manifest.subfolderName}/${filename}`
    : `${root}/PICTURES/1. CAMERA/${filename}`
}

export function selectedPhotoPath(projectRoot: string, manifest: PhotoManifest, filename: string): string {
  const root = projectRoot.replace(/\\/g, '/').replace(/\/$/, '')
  return manifest.subfolderName
    ? `${root}/PICTURES/2. SELECTED/${manifest.subfolderName}/${filename}`
    : `${root}/PICTURES/2. SELECTED/${filename}`
}

export function cleanedPhotoPath(projectRoot: string, manifest: PhotoManifest, filename: string): string {
  const root = projectRoot.replace(/\\/g, '/').replace(/\/$/, '')
  return manifest.subfolderName
    ? `${root}/PICTURES/3. CLEANED/${manifest.subfolderName}/${filename}`
    : `${root}/PICTURES/3. CLEANED/${filename}`
}

export function readyPngPath(projectRoot: string, manifest: PhotoManifest): string | null {
  if (!manifest.ready) return null
  const root = projectRoot.replace(/\\/g, '/').replace(/\/$/, '')
  return manifest.subfolderName
    ? `${root}/PICTURES/4. READY/PNG/${manifest.subfolderName}/${manifest.ready.pngFilename}`
    : `${root}/PICTURES/4. READY/PNG/${manifest.ready.pngFilename}`
}

export function readyJpgPath(projectRoot: string, manifest: PhotoManifest): string | null {
  if (!manifest.ready) return null
  const root = projectRoot.replace(/\\/g, '/').replace(/\/$/, '')
  return manifest.subfolderName
    ? `${root}/PICTURES/4. READY/JPG/${manifest.subfolderName}/${manifest.ready.jpgFilename}`
    : `${root}/PICTURES/4. READY/JPG/${manifest.ready.jpgFilename}`
}

// ── Auto-migration from legacy Firestore fields ──────────────────────────────
//
// Projects created before v1.7.0 store photo metadata in the recipeFile doc
// (capturedPhotos[], readyPngPath, cleanedPhotoPaths…). On first open of the
// Photo Manager, we copy that data into a manifest file on disk so subsequent
// sessions read from the manifest.
//
// Idempotent: a recipe is migrated only when it has a recipeUid, no on-disk
// manifest, and any legacy photo data to copy.

interface LegacyMigrationStats {
  migrated: number
  skipped: number
  failed: number
}

export async function migrateLegacyManifests(
  projectRoot: string,
  recipes: RecipeFile[],
  existingManifests: Record<string, PhotoManifest>,
  userId: string,
): Promise<{ stats: LegacyMigrationStats; manifests: PhotoManifest[] }> {
  const stats: LegacyMigrationStats = { migrated: 0, skipped: 0, failed: 0 }
  const result: PhotoManifest[] = []

  for (const recipe of recipes) {
    if (!recipe.recipeUid) { stats.skipped++; continue }
    if (existingManifests[recipe.recipeUid]) { stats.skipped++; continue }

    const hasCaptured = (recipe.capturedPhotos?.length ?? 0) > 0
    const hasCleaned  = (recipe.cleanedPhotoPaths?.length ?? 0) > 0
    const hasReady    = !!(recipe.readyPngPath && recipe.readyJpgPath)
    if (!hasCaptured && !hasCleaned && !hasReady) { stats.skipped++; continue }

    const parts = recipe.relativePath.replace(/\\/g, '/').split('/')
    const subfolderName = parts.length > 1 ? parts[0] : ''

    const manifest = emptyManifest({
      recipeUid:         recipe.recipeUid,
      excelRelativePath: recipe.relativePath,
      recipeName:        recipe.recipeName || recipe.displayName,
      subfolderName,
      userId,
    })

    manifest.camera = (recipe.capturedPhotos ?? []).map<CameraEntry>(p => {
      const entry: CameraEntry = {
        filename:   p.filename,
        sequence:   p.sequence,
        isSelected: p.isSelected ?? false,
        capturedAt: p.capturedAt?.toDate?.()?.toISOString?.() ?? new Date().toISOString(),
        capturedBy: p.capturedBy ?? '',
      }
      if (p.selectedAt?.toDate) entry.selectedAt = p.selectedAt.toDate().toISOString()
      if (p.selectedBy)         entry.selectedBy = p.selectedBy
      return entry
    })

    manifest.cleaned = (recipe.cleanedPhotoPaths ?? []).map<CleanedEntry>(relPath => ({
      filename: relPath.split('/').pop() ?? '',
      addedAt:  recipe.cleanedPhotoDroppedAt?.toDate?.()?.toISOString?.() ?? new Date().toISOString(),
      addedBy:  userId,
      status:   recipe.cleanedPhotoStatus === 'done' ? 'done' : 'needs_retouch',
    }))

    if (recipe.readyPngPath && recipe.readyJpgPath) {
      manifest.ready = {
        pngFilename: recipe.readyPngPath.split('/').pop() ?? '',
        jpgFilename: recipe.readyJpgPath.split('/').pop() ?? '',
        processedAt: recipe.readyProcessedAt?.toDate?.()?.toISOString?.() ?? new Date().toISOString(),
        processedBy: recipe.readyProcessedBy ?? '',
      } as ReadyEntry
    }

    if (recipe.excelInsertedAt?.toDate) {
      manifest.excelInsertedAt = recipe.excelInsertedAt.toDate().toISOString()
      manifest.excelInsertedBy = recipe.excelInsertedBy ?? null
    }

    try {
      const res = await window.electronAPI.photoManifestWrite({ projectRoot, manifest })
      if (res.manifest) {
        // Mirror summary to Firestore so the recipe row UI updates immediately.
        updateRecipePhotoSummary(recipe.id, summarize(res.manifest)).catch(() => {})
        result.push(res.manifest)
        stats.migrated++
      } else {
        stats.failed++
      }
    } catch (err) {
      console.warn('[migrate] failed for recipe', recipe.recipeUid, err)
      stats.failed++
    }
  }

  return { stats, manifests: result }
}
