// src/shared/bgRemoval.ts
// Shared types for the Background Removal module (Mac-only). The app is a thin GUI
// that launches tools/bg-removal/train/batch_run.py and renders its live status.

export const BG_IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tif', '.tiff'] as const

export interface BgRemovalJob {
  files: string[] // absolute paths of originals to process
  toolDir: string // absolute path to tools/bg-removal
  retouch: boolean // also run the Photoshop RETOUCH action afterwards
  retouchAction?: string // default "RETOUCH ACTION"
  retouchSet?: string // default "Default Actions"
  photoshopApp?: string // default "Adobe Photoshop (Beta)"
}

export interface BgRemovalItem {
  name: string
  seconds: number
  thumb: string // absolute path to the preview jpg
  error?: string
}

export interface BgRemovalCurrent {
  name?: string
  index?: number
  step?: string
  step_pct?: number
}

// Mirrors what batch_run.py writes to {out}/_status.json, plus a `phase` the main
// process adds for the post-cutout Photoshop retouch step.
export interface BgRemovalStatus {
  total: number
  done: number
  running: boolean
  finished: boolean
  current: BgRemovalCurrent
  items: BgRemovalItem[]
  elapsed_s: number
  eta_s: number
  avg_s: number
  phase?: 'cutout' | 'retouch' | 'done'
}

export interface BgRemovalResult {
  success: boolean
  outDir: string // folder with the final PNGs (retocados if retouch, else recortes)
  cutDir: string
  retouchedDir: string | null
  error?: string
}

export interface BgRemovalSetup {
  ok: boolean
  pythonOk: boolean
  checkpointOk: boolean
  message: string
}

// ── Self-contained engine install (downloadable runtime package) ────────────────
// The heavy runtime (Python + torch + models, ~2 GB) is NOT shipped in the app.
// On first use the app downloads a prebuilt package from the GitHub Release and
// installs it under userData, so non-technical Mac users get a one-click setup.

// Bump when a new runtime package is published to the release.
export const BG_RUNTIME_VERSION = 'v1'

// Release asset the installer downloads (arm64 only for now).
export const BG_RUNTIME_ASSET = 'bg-removal-runtime-mac-arm64.tar.gz'
export const BG_RUNTIME_REPO = 'Carlosmsc491/npd-planner'

export interface BgInstallState {
  installed: boolean
  version: string | null // installed runtime version, or null
  toolDir: string // resolved runtime path (installed or dev fallback)
  needsUpdate: boolean // installed but older than BG_RUNTIME_VERSION
  supported: boolean // false on non-Mac / wrong arch
}

export type BgInstallPhase =
  | 'download' | 'verify' | 'extract' | 'deps' | 'models' | 'done' | 'error'

export interface BgInstallProgress {
  phase: BgInstallPhase
  pct: number // 0..100 overall
  message: string
  bytesDone?: number
  bytesTotal?: number
  error?: string
}
