// src/shared/photoStudio.ts
// Shared types for the standalone Photo Studio module (Mac-only)

export type StudioStage = 'captured' | 'selected' | 'cleaned' | 'ready'

// 'flat'   = legacy: originals live in the session root, state in _states.json,
//            cleaned/ready are derivatives in _cleaned/ _ready/.
// 'stages' = each photo is COPIED into real capture/ selected/ cleaned/ ready/
//            folders as it advances; the filesystem itself is the state.
export type StudioLayout = 'flat' | 'stages'

export interface StudioSession {
  id: string
  name: string
  createdAt: string      // ISO date
  photoCount: number
  coverThumb: string | null  // abs path to first photo (for thumbnail loading)
  layout: StudioLayout
}

export interface StudioPhoto {
  id: string             // filename stem (no ext)
  filename: string
  absPath: string        // the capture original — source of truth for the photo
  ext: string
  size: number
  mtimeMs: number
  state: StudioStage     // furthest stage reached
  cleanedPath: string | null   // abs path to the cleaned PNG (stage >= cleaned)
  jpgPath: string | null       // abs path to the ready JPG (stage == ready)
  // Per-stage artifact paths — populated for 'stages' sessions; on 'flat' they
  // are derived so the UI can render every session the same cumulative way.
  capturePath: string | null
  selectedPath: string | null
  readyPngPath: string | null
  // Which stages this photo currently occupies (captured is always true).
  stages: { selected: boolean; cleaned: boolean; ready: boolean }
}
