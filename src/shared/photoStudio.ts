// src/shared/photoStudio.ts
// Shared types for the standalone Photo Studio module (Mac-only)

export interface StudioSession {
  id: string
  name: string
  createdAt: string      // ISO date
  photoCount: number
  coverThumb: string | null  // abs path to first photo (for thumbnail loading)
}

export interface StudioPhoto {
  id: string             // filename stem (no ext)
  filename: string
  absPath: string
  ext: string
  size: number
  mtimeMs: number
  state: 'captured' | 'selected' | 'cleaned' | 'ready'
  cleanedPath: string | null   // abs path to the cleaned PNG (state >= cleaned)
  jpgPath: string | null       // abs path to the JPG (state == ready)
}
