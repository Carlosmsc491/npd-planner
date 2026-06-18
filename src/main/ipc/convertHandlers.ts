// src/main/ipc/convertHandlers.ts
// IPC for the Convert Pictures module: scan a folder, classify dropped paths,
// pick image files, and batch-convert PNG/images → JPG (white background +
// resize) using sharp. Photoshop files saved with an image extension (8BPS
// magic) are decoded via ag-psd, since libvips/sharp can't read PSD.

import { ipcMain, dialog, BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import type { Sharp } from 'sharp'
import { readPsd, initializeCanvas } from 'ag-psd'
import {
  CONVERT_IMAGE_EXTS,
  type ConvertScanResult,
  type ConvertGroup,
  type ConvertTool,
  type ConvertBatchJob,
  type ConvertBatchResult,
  type ConvertEstimate,
  type ConvertEstimateOptions,
  type PathStat,
} from '../../shared/convert'

// ag-psd needs an ImageData factory. Provide a pure-JS one so we never pull in
// the native `canvas` module — we only read the flattened composite as raw RGBA.
// The canvas factory itself is never called in that path, so it just throws.
const createImageDataPure = (width: number, height: number) => ({
  width,
  height,
  colorSpace: 'srgb' as const,
  data: new Uint8ClampedArray(width * height * 4),
})
;(initializeCanvas as (...args: unknown[]) => void)(
  () => {
    throw new Error('canvas not supported')
  },
  createImageDataPure,
)

function isImageFile(name: string): boolean {
  return (CONVERT_IMAGE_EXTS as readonly string[]).includes(path.extname(name).toLowerCase())
}

function listImages(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && isImageFile(e.name))
      .map((e) => path.join(dir, e.name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  } catch {
    return []
  }
}

/** True when the file starts with the Photoshop "8BPS" signature, regardless of extension. */
async function fileIsPsd(src: string): Promise<boolean> {
  let fh: fs.promises.FileHandle | null = null
  try {
    fh = await fs.promises.open(src, 'r')
    const { bytesRead, buffer } = await fh.read(Buffer.alloc(4), 0, 4, 0)
    return bytesRead === 4 && buffer.toString('latin1') === '8BPS'
  } catch {
    return false
  } finally {
    if (fh) await fh.close()
  }
}

/** Build a sharp pipeline that decodes the source (PSD via ag-psd, else native). */
async function decode(src: string): Promise<{ pipeline: Sharp; isPsd: boolean }> {
  // Lazy require so sharp's native binary loads on demand and is left external by
  // rollup (a top-level import gets bundled and breaks sharp's dynamic requires).
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const sharp = require('sharp') as typeof import('sharp')
  if (await fileIsPsd(src)) {
    const buf = await fs.promises.readFile(src)
    const psd = readPsd(buf, { useImageData: true, skipLayerImageData: true, useRawThumbnail: true })
    const img = psd.imageData
    if (!img) {
      throw new Error('Photoshop file has no composite image (re-save with "Maximize Compatibility")')
    }
    const pipeline = sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength), {
      raw: { width: img.width, height: img.height, channels: 4 },
    })
    return { pipeline, isPsd: true }
  }
  return { pipeline: sharp(src).rotate(), isPsd: false } // .rotate() honors EXIF
}

/**
 * Encode a source into the output buffer for the chosen tool, returning the
 * buffer and its extension. Both the file writer and the size estimate use this,
 * so a sampled estimate is produced exactly the way the real conversion will be.
 *
 *  • convert — PNG/PSD → JPG, white background, original size. Quality 100 keeps
 *    full chroma (4:4:4) for the closest-to-lossless "Original" option.
 *  • resize  — shrink inside maxEdge, keeping the original format/transparency
 *    (PNG→PNG, JPG→JPG, WEBP→WEBP; PSD and anything else → PNG).
 */
async function encode(src: string, tool: ConvertTool, quality: number, maxEdge: number): Promise<{ buf: Buffer; ext: string }> {
  const { pipeline, isPsd } = await decode(src)
  if (tool === 'convert') {
    const jpegOpts = quality >= 100 ? { quality: 100, chromaSubsampling: '4:4:4' } : { quality }
    const buf = await pipeline.flatten({ background: { r: 255, g: 255, b: 255 } }).jpeg(jpegOpts).toBuffer()
    return { buf, ext: '.jpg' }
  }
  const resized = pipeline.resize(maxEdge, maxEdge, { fit: 'inside', withoutEnlargement: true })
  const ext = isPsd ? '.png' : path.extname(src).toLowerCase()
  if (ext === '.jpg' || ext === '.jpeg') return { buf: await resized.jpeg({ quality }).toBuffer(), ext: '.jpg' }
  if (ext === '.webp') return { buf: await resized.webp({ quality }).toBuffer(), ext: '.webp' }
  return { buf: await resized.png().toBuffer(), ext: '.png' } // lossless, keeps transparency
}

/** Encode + write one file to {destDir}/{base}{ext}; returns the bytes written. */
async function writeOutput(src: string, destDir: string, base: string, tool: ConvertTool, quality: number, maxEdge: number): Promise<number> {
  await fs.promises.mkdir(destDir, { recursive: true })
  const { buf, ext } = await encode(src, tool, quality, maxEdge)
  await fs.promises.writeFile(path.join(destDir, `${base}${ext}`), buf)
  return buf.length
}

async function fileSize(p: string): Promise<number> {
  try {
    return (await fs.promises.stat(p)).size
  } catch {
    return 0
  }
}

/** Pick up to `k` indices spread evenly across [0, len) — first, last and middles. */
function spreadIndices(len: number, k: number): number[] {
  if (len <= k) return Array.from({ length: len }, (_, i) => i)
  const out = new Set<number>()
  for (let i = 0; i < k; i++) out.add(Math.round((i * (len - 1)) / (k - 1)))
  return [...out]
}

export function registerConvertHandlers(): void {
  // Scan a folder: flat (images at root) vs nested (sub-folders with images).
  ipcMain.handle('convert:scan-folder', async (_event, rootPath: string): Promise<ConvertScanResult> => {
    const rootImages = listImages(rootPath)
    const groups: ConvertGroup[] = []

    let subdirs: fs.Dirent[] = []
    try {
      subdirs = fs.readdirSync(rootPath, { withFileTypes: true }).filter((e) => e.isDirectory())
    } catch {
      subdirs = []
    }

    for (const d of subdirs) {
      if (d.name.toUpperCase() === 'JPG' || d.name.toUpperCase() === 'RESIZED') continue // skip our own output folders
      const folderPath = path.join(rootPath, d.name)

      // Prefer a child "PNG" folder if present (the user's convention).
      let pngSubfolder: string | null = null
      try {
        const child = fs
          .readdirSync(folderPath, { withFileTypes: true })
          .find((c) => c.isDirectory() && c.name.toUpperCase() === 'PNG')
        if (child) pngSubfolder = path.join(folderPath, child.name)
      } catch {
        /* ignore */
      }

      const images = pngSubfolder ? listImages(pngSubfolder) : listImages(folderPath)
      if (images.length > 0) {
        groups.push({ folderPath, name: d.name, pngSubfolder, images })
      }
    }

    return { rootImages, groups }
  })

  // Classify dropped paths so the renderer can route folder vs files.
  ipcMain.handle('convert:stat-paths', async (_event, paths: string[]): Promise<PathStat[]> => {
    return paths.map((p) => {
      try {
        const st = fs.statSync(p)
        const isDir = st.isDirectory()
        return { path: p, isDir, isImage: !isDir && isImageFile(p) }
      } catch {
        return { path: p, isDir: false, isImage: false }
      }
    })
  })

  // Multi-select image files via the native picker.
  ipcMain.handle('convert:select-files', async (event): Promise<string[]> => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return []
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tif', 'tiff', 'gif', 'psd'] }],
      title: 'Select images to convert',
    })
    return result.canceled ? [] : result.filePaths
  })

  // Pick a destination folder (custom-destination mode).
  ipcMain.handle('convert:select-dest', async (event): Promise<string | null> => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Choose where to save the JPG files',
    })
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  })

  // Run the batch: white-background flatten + resize (inside maxLongEdge) + JPEG.
  ipcMain.handle('convert:run-batch', async (event, job: ConvertBatchJob): Promise<ConvertBatchResult> => {
    const maxEdge = Math.max(1, Math.round(job.maxLongEdge || 1920))
    const quality = Math.min(100, Math.max(1, Math.round(job.quality || 92)))
    const outName = job.tool === 'convert' ? 'JPG' : 'RESIZED'

    const work: Array<{ src: string; destDir: string }> = []

    if (job.mode === 'files') {
      for (const src of job.files ?? []) {
        work.push({ src, destDir: path.join(path.dirname(src), outName) })
      }
    } else if (job.mode === 'flat') {
      for (const src of job.rootImages ?? []) {
        work.push({ src, destDir: path.join(job.rootPath ?? '', outName) })
      }
    } else if (job.mode === 'mirror') {
      if (job.rootPath) {
        for (const src of job.rootImages ?? []) work.push({ src, destDir: path.join(job.rootPath, outName) })
      }
      for (const g of job.groups ?? []) {
        for (const src of g.images) work.push({ src, destDir: path.join(g.folderPath, outName) })
      }
    } else if (job.mode === 'custom') {
      const dest = job.destRoot ?? ''
      for (const src of job.rootImages ?? []) work.push({ src, destDir: dest })
      for (const g of job.groups ?? []) {
        for (const src of g.images) work.push({ src, destDir: path.join(dest, g.name) })
      }
    }

    const total = work.length
    let done = 0
    let failed = 0
    let sourceBytes = 0
    let outputBytes = 0
    const errors: string[] = []

    for (const { src, destDir } of work) {
      const base = path.basename(src, path.extname(src))
      try {
        outputBytes += await writeOutput(src, destDir, base, job.tool, quality, maxEdge)
        sourceBytes += await fileSize(src)
      } catch (err) {
        failed++
        errors.push(`${path.basename(src)}: ${err instanceof Error ? err.message : String(err)}`)
      }
      done++
      try {
        event.sender.send('convert:progress', { done, total, currentName: base })
      } catch {
        /* ignore */
      }
    }

    let outputFolder: string | null = null
    if (job.mode === 'flat') outputFolder = path.join(job.rootPath ?? '', outName)
    else if (job.mode === 'mirror') outputFolder = job.rootPath ?? null
    else if (job.mode === 'custom') outputFolder = job.destRoot ?? null
    else if (job.mode === 'files') outputFolder = work.length ? work[0].destDir : null

    return { success: failed === 0, converted: total - failed, failed, errors, outputFolder, sourceBytes, outputBytes }
  })

  // Pre-flight estimate: exact source total + a sample-based output projection.
  // Sampling a few files (encoded the real way) keeps it fast while staying close,
  // since JPEG size depends on each image's content and can't be guessed otherwise.
  ipcMain.handle('convert:estimate', async (_event, sources: string[], opts: ConvertEstimateOptions): Promise<ConvertEstimate> => {
    const maxEdge = Math.max(1, Math.round(opts.maxLongEdge || 1920))
    const quality = Math.min(100, Math.max(1, Math.round(opts.quality || 92)))

    let sourceBytes = 0
    for (const s of sources) sourceBytes += await fileSize(s)

    let sampleIn = 0
    let sampleOut = 0
    let sampled = 0
    for (const i of spreadIndices(sources.length, 3)) {
      try {
        const { buf } = await encode(sources[i], opts.tool, quality, maxEdge)
        const inB = await fileSize(sources[i])
        if (inB > 0) {
          sampleIn += inB
          sampleOut += buf.length
          sampled++
        }
      } catch {
        /* skip unreadable samples */
      }
    }

    const ratio = sampleIn > 0 ? sampleOut / sampleIn : 0
    const estBytes = sampled > 0 ? Math.round(sourceBytes * ratio) : 0
    return { count: sources.length, sourceBytes, estBytes, sampled }
  })
}
