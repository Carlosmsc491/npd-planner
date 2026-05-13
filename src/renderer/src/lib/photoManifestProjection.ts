// photoManifestProjection.ts — Bridge between the on-disk manifest and the legacy
// RecipeFile shape that the existing UI components expect (capturedPhotos[],
// readyPngPath, cleanedPhotoPaths, etc.).
//
// During the transition, the manifest is canonical: if a manifest exists for a
// recipe, its data overrides the (deprecated) Firestore fields. If no manifest
// exists yet (legacy project), the UI continues to read the Firestore fields.

import { Timestamp } from 'firebase/firestore'
import type { PhotoManifest } from '../../../shared/photoManifest'
import type { CapturedPhoto, RecipeFile } from '../types'

/** Build a Timestamp from an ISO string. Returns Timestamp.now() if the string is invalid. */
function tsFromIso(iso: string | undefined): Timestamp {
  if (!iso) return Timestamp.now()
  const d = new Date(iso)
  if (isNaN(d.getTime())) return Timestamp.now()
  return Timestamp.fromDate(d)
}

/** Convert manifest camera entries into the legacy CapturedPhoto array shape. */
export function manifestToCapturedPhotos(m: PhotoManifest): CapturedPhoto[] {
  return m.camera.map(e => {
    const relPath = m.subfolderName
      ? `PICTURES/1. CAMERA/${m.subfolderName}/${e.filename}`
      : `PICTURES/1. CAMERA/${e.filename}`
    const photo: CapturedPhoto = {
      sequence:      e.sequence,
      filename:      e.filename,
      subfolderName: m.subfolderName,
      picturePath:   relPath,
      cameraPath:    relPath,
      ssdPath:       null,
      capturedAt:    tsFromIso(e.capturedAt),
      capturedBy:    e.capturedBy,
      isSelected:    e.isSelected,
    }
    if (e.selectedAt) photo.selectedAt = tsFromIso(e.selectedAt)
    if (e.selectedBy) photo.selectedBy = e.selectedBy
    return photo
  })
}

/** Relative path under project root for the READY PNG (or null). */
export function manifestReadyPngRel(m: PhotoManifest): string | null {
  if (!m.ready) return null
  return m.subfolderName
    ? `PICTURES/4. READY/PNG/${m.subfolderName}/${m.ready.pngFilename}`
    : `PICTURES/4. READY/PNG/${m.ready.pngFilename}`
}

/** Relative path under project root for the READY JPG (or null). */
export function manifestReadyJpgRel(m: PhotoManifest): string | null {
  if (!m.ready) return null
  return m.subfolderName
    ? `PICTURES/4. READY/JPG/${m.ready.jpgFilename}`
    : `PICTURES/4. READY/JPG/${m.ready.jpgFilename}`
}

/** Relative paths for all cleaned PNGs. */
export function manifestCleanedRels(m: PhotoManifest): string[] {
  return m.cleaned.map(e =>
    m.subfolderName
      ? `PICTURES/3. CLEANED/${m.subfolderName}/${e.filename}`
      : `PICTURES/3. CLEANED/${e.filename}`
  )
}

/** Cleaned status: 'done' if any entry is done, otherwise 'needs_retouch', else null. */
export function manifestCleanedStatus(m: PhotoManifest): 'needs_retouch' | 'done' | null {
  if (m.cleaned.length === 0) return null
  return m.cleaned.every(e => e.status === 'done') ? 'done' : 'needs_retouch'
}

/**
 * Take a RecipeFile (from Firestore) and a manifest (from disk) and produce a
 * single object that the existing UI can consume. If manifest is null, returns
 * the recipe unchanged so legacy projects keep working.
 */
export function projectManifestOntoRecipe(recipe: RecipeFile, m: PhotoManifest | null): RecipeFile {
  if (!m) return recipe

  const readyPng = manifestReadyPngRel(m)
  const readyJpg = manifestReadyJpgRel(m)

  return {
    ...recipe,
    capturedPhotos:       manifestToCapturedPhotos(m),
    readyPngPath:         readyPng,
    readyJpgPath:         readyJpg,
    readyProcessedAt:     m.ready ? tsFromIso(m.ready.processedAt) : null,
    readyProcessedBy:     m.ready?.processedBy ?? null,
    cleanedPhotoPaths:    manifestCleanedRels(m),
    cleanedPhotoStatus:   manifestCleanedStatus(m),
    excelInsertedAt:      m.excelInsertedAt ? tsFromIso(m.excelInsertedAt) : recipe.excelInsertedAt,
    excelInsertedBy:      m.excelInsertedBy ?? recipe.excelInsertedBy,
    photoStatus:
      m.ready ? 'ready'
      : m.camera.some(e => e.isSelected) ? 'selected'
      : m.camera.length > 0 ? 'in_progress'
      : 'pending',
    // Summary fields
    photoCount:           m.camera.length,
    selectedCount:        m.camera.filter(e => e.isSelected).length,
    cleanedCount:         m.cleaned.length,
    hasReady:             !!m.ready,
  }
}
