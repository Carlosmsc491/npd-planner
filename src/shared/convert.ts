// Shared types for the Convert Pictures module (PNG → JPG, white background, resize).
// Used by the main process (sharp conversion), the preload bridge and the renderer.

export const CONVERT_IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tif', '.tiff', '.gif'] as const

export interface ConvertGroup {
  /** Absolute path of the sub-folder (e.g. .../Pictures/holiday 1). */
  folderPath: string
  /** Folder name shown in the UI (e.g. "holiday 1"). */
  name: string
  /** Absolute path of a child "PNG" folder if the images live inside one, else null. */
  pngSubfolder: string | null
  /** Absolute paths of the images to convert for this group. */
  images: string[]
}

export interface ConvertScanResult {
  /** Image files directly inside the selected folder. */
  rootImages: string[]
  /** Sub-folders that contain images. */
  groups: ConvertGroup[]
}

export type ConvertMode = 'flat' | 'mirror' | 'custom' | 'files'

// Two distinct tools:
//  • 'convert' — PNG/PSD → JPG with a white background, keeping the original size.
//  • 'resize'  — shrink to maxLongEdge, keeping the original format (PNG stays PNG).
export type ConvertTool = 'convert' | 'resize'

export interface ConvertBatchJob {
  tool: ConvertTool
  mode: ConvertMode
  /** Longest side of the output, in pixels. Aspect ratio is preserved; images are never enlarged. */
  maxLongEdge: number
  /** JPEG quality, 1–100. */
  quality: number
  rootPath?: string          // selected folder (flat / mirror)
  rootImages?: string[]      // images at the root level
  groups?: ConvertGroup[]    // sub-folder groups (mirror / custom)
  destRoot?: string          // chosen destination folder (custom)
  files?: string[]           // individual files ('files' mode)
}

export interface ConvertBatchResult {
  success: boolean
  converted: number
  failed: number
  errors: string[]
  /** Folder to reveal in Finder/Explorer when done. */
  outputFolder: string | null
  /** Total bytes of the source files that converted successfully. */
  sourceBytes: number
  /** Total bytes of the produced files. */
  outputBytes: number
}

/** Pre-flight size preview: real source total + a sample-based output estimate. */
export interface ConvertEstimate {
  /** Number of source images. */
  count: number
  /** Exact total size of the sources, in bytes. */
  sourceBytes: number
  /** Estimated output size, extrapolated from a few sample conversions. */
  estBytes: number
  /** How many files were actually sampled to build the estimate. */
  sampled: number
}

/** Options for a size estimate — mirrors the relevant batch-job fields. */
export interface ConvertEstimateOptions {
  tool: ConvertTool
  quality: number
  maxLongEdge: number
}

export interface ConvertProgress {
  done: number
  total: number
  currentName: string
}

export interface PathStat {
  path: string
  isDir: boolean
  isImage: boolean
}
