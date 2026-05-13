// photoManifest.ts — Shared types for the per-recipe photo manifest
//
// Each recipe owns one JSON file at:
//   {projectRoot}/_project/photos/{recipeUid}.json
//
// The manifest is the source of truth for "what photos exist for this recipe".
// It contains only filenames + the top-level subfolder; the renderer reconstructs
// absolute paths from the local project root. This makes projects fully portable:
// copy the folder to any machine and the app finds the photos.
//
// File layout on disk (relative to projectRoot):
//   PICTURES/1. CAMERA/{subfolderName}/{filename}.jpg    ← all captures
//   PICTURES/2. SELECTED/{subfolderName}/{filename}.jpg  ← mirror of camera entries where isSelected=true
//   PICTURES/3. CLEANED/{subfolderName}/{filename}.png   ← background-removed PNGs
//   PICTURES/4. READY/PNG/{subfolderName}/{pngFilename}  ← retouched PNG
//   PICTURES/4. READY/JPG/{subfolderName}/{jpgFilename}  ← compressed JPG (for Excel insert)
//
// Concurrent writes: OneDrive creates conflict copies (e.g. "{uid} (Carlos's conflict).json").
// The write handler detects them and merges via union-by-filename + latest-timestamp wins.

export const PHOTO_MANIFEST_VERSION = 1

export interface PhotoManifest {
  /** Schema version — bumped on breaking changes */
  schemaVersion: number
  /** Stable recipe ID (also stored in Excel cell Z52) */
  recipeUid: string
  /** Excel file location relative to project root, e.g. "Valentines/Standard Rose.xlsx" */
  excelRelativePath: string
  /** Display name of the recipe ("Standard Rose") */
  recipeName: string
  /** Topmost folder used for photo paths (empty string for root-level recipes) */
  subfolderName: string
  /** ISO 8601 timestamp of last write */
  lastModified: string
  /** uid of the user who performed the last write */
  lastModifiedBy: string
  /** All captured photos (CAMERA) — SELECTED is a view of isSelected=true entries */
  camera: CameraEntry[]
  /** Background-removed PNGs */
  cleaned: CleanedEntry[]
  /** Final retouched output (single set per recipe) */
  ready: ReadyEntry | null
  /** When the JPG was inserted into the Excel; null = not yet inserted */
  excelInsertedAt: string | null
  /** uid of the user who performed the last Excel insert */
  excelInsertedBy: string | null
}

export interface CameraEntry {
  filename: string
  sequence: number
  isSelected: boolean
  capturedAt: string
  capturedBy: string
  selectedAt?: string
  selectedBy?: string
}

export interface CleanedEntry {
  filename: string
  addedAt: string
  addedBy: string
  status: 'needs_retouch' | 'done'
}

export interface ReadyEntry {
  pngFilename: string
  jpgFilename: string
  processedAt: string
  processedBy: string
}

/** Folder a discovered file belongs to (used for disk reconciliation) */
export type ManifestLocation = 'camera' | 'selected' | 'cleaned' | 'ready-png' | 'ready-jpg'

/** A file found on disk by reconciliation scan but not (yet) tracked in any manifest. */
export interface OrphanFile {
  location: ManifestLocation
  subfolderName: string
  filename: string
}

/** Quick aggregate summary used to update Firestore index fields without reading every entry. */
export interface PhotoManifestSummary {
  recipeUid: string
  excelRelativePath: string
  photoCount: number              // total in CAMERA
  selectedCount: number
  cleanedCount: number
  hasReady: boolean
  excelInsertedAt: string | null
  /** Derived photoStatus for fast UI badges */
  photoStatus: 'pending' | 'in_progress' | 'selected' | 'complete' | 'ready'
}

/** Build a fresh empty manifest. */
export function emptyManifest(input: {
  recipeUid: string
  excelRelativePath: string
  recipeName: string
  subfolderName: string
  userId: string
}): PhotoManifest {
  return {
    schemaVersion: PHOTO_MANIFEST_VERSION,
    recipeUid: input.recipeUid,
    excelRelativePath: input.excelRelativePath,
    recipeName: input.recipeName,
    subfolderName: input.subfolderName,
    lastModified: new Date().toISOString(),
    lastModifiedBy: input.userId,
    camera: [],
    cleaned: [],
    ready: null,
    excelInsertedAt: null,
    excelInsertedBy: null,
  }
}

/** Compute summary fields from a manifest (used to update Firestore index on every write). */
export function summarize(m: PhotoManifest): PhotoManifestSummary {
  const selectedCount = m.camera.filter(e => e.isSelected).length
  const photoStatus: PhotoManifestSummary['photoStatus'] =
    m.ready ? 'ready'
    : selectedCount > 0 ? 'selected'
    : m.camera.length > 0 ? 'in_progress'
    : 'pending'
  return {
    recipeUid: m.recipeUid,
    excelRelativePath: m.excelRelativePath,
    photoCount: m.camera.length,
    selectedCount,
    cleanedCount: m.cleaned.length,
    hasReady: !!m.ready,
    excelInsertedAt: m.excelInsertedAt,
    photoStatus,
  }
}

/**
 * Merge two manifests for the same recipe. Used when a OneDrive conflict copy is found.
 *  - camera/cleaned arrays: union by filename. For dupes, the entry with the newer timestamp wins
 *    (selectedAt > capturedAt for camera; addedAt for cleaned).
 *  - ready: take the entry with the newer processedAt.
 *  - excelInsertedAt: most-recent-wins.
 *  - recipeName / subfolderName / excelRelativePath: taken from whichever side has the newer
 *    lastModified, since these change as a unit on rename.
 */
export function mergeManifests(a: PhotoManifest, b: PhotoManifest): PhotoManifest {
  const aNewer = new Date(a.lastModified).getTime() >= new Date(b.lastModified).getTime()
  const newer = aNewer ? a : b
  const older = aNewer ? b : a

  // ── camera: union by filename ────────────────────────────────────────────
  const cameraMap = new Map<string, CameraEntry>()
  for (const e of older.camera) cameraMap.set(e.filename, e)
  for (const e of newer.camera) {
    const prev = cameraMap.get(e.filename)
    if (!prev) { cameraMap.set(e.filename, e); continue }
    // Choose the entry with the most recent selection event (or capture event)
    const eTs = new Date(e.selectedAt ?? e.capturedAt).getTime()
    const prevTs = new Date(prev.selectedAt ?? prev.capturedAt).getTime()
    cameraMap.set(e.filename, eTs >= prevTs ? e : prev)
  }
  const camera = Array.from(cameraMap.values()).sort((x, y) => x.sequence - y.sequence)

  // ── cleaned: union by filename ───────────────────────────────────────────
  const cleanedMap = new Map<string, CleanedEntry>()
  for (const e of older.cleaned) cleanedMap.set(e.filename, e)
  for (const e of newer.cleaned) {
    const prev = cleanedMap.get(e.filename)
    if (!prev || new Date(e.addedAt).getTime() >= new Date(prev.addedAt).getTime()) {
      cleanedMap.set(e.filename, e)
    }
  }
  const cleaned = Array.from(cleanedMap.values())

  // ── ready: most-recent-processed wins ────────────────────────────────────
  let ready: ReadyEntry | null = newer.ready
  if (a.ready && b.ready) {
    ready = new Date(a.ready.processedAt).getTime() >= new Date(b.ready.processedAt).getTime()
      ? a.ready : b.ready
  } else if (!ready) {
    ready = older.ready
  }

  // ── excelInsertedAt: most-recent wins ────────────────────────────────────
  const excelInsertedAt =
    a.excelInsertedAt && b.excelInsertedAt
      ? (new Date(a.excelInsertedAt).getTime() >= new Date(b.excelInsertedAt).getTime() ? a.excelInsertedAt : b.excelInsertedAt)
      : (a.excelInsertedAt ?? b.excelInsertedAt)
  const excelInsertedBy = excelInsertedAt === a.excelInsertedAt ? a.excelInsertedBy
    : excelInsertedAt === b.excelInsertedAt ? b.excelInsertedBy
    : null

  return {
    schemaVersion: PHOTO_MANIFEST_VERSION,
    recipeUid: newer.recipeUid,
    excelRelativePath: newer.excelRelativePath,
    recipeName: newer.recipeName,
    subfolderName: newer.subfolderName,
    lastModified: new Date().toISOString(),
    lastModifiedBy: newer.lastModifiedBy,
    camera,
    cleaned,
    ready,
    excelInsertedAt,
    excelInsertedBy,
  }
}
