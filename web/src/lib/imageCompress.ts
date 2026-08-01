const MAX_DIMENSION = 2000
const TARGET_BYTES = 800 * 1024
// Quality ladder tried in order until the encoded JPEG is under TARGET_BYTES
// (or we run out of steps and keep the smallest we got).
const QUALITY_STEPS = [0.82, 0.7, 0.58, 0.46, 0.35]

export interface CompressedImage {
  blob: Blob
  width: number
  height: number
}

/**
 * Client-side photo compression before any upload — this is a cost control,
 * not a nice-to-have (CLAUDE.md: free-tier Firebase quota is sacred; this
 * project already lived through a 744k-read/photo-write spike once, see
 * project memory "npd-read-spike-photo-writes"). Downscales to a 2000px
 * longest side and re-encodes as JPEG, stepping quality down toward ~800KB.
 *
 * Relies on the browser decoding the source file with EXIF orientation
 * already applied (standard behavior in evergreen Chrome/Safari for several
 * years) — canvas drawImage of an <img>/ImageBitmap reflects that corrected
 * orientation, so no manual EXIF rotation is done here.
 */
export async function compressImage(file: File | Blob): Promise<CompressedImage> {
  const img = await loadImage(file)
  try {
    const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight, MAX_DIMENSION)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context unavailable')
    ctx.drawImage(img, 0, 0, width, height)

    let blob: Blob | null = null
    for (const quality of QUALITY_STEPS) {
      const candidate = await canvasToBlob(canvas, quality)
      if (!candidate) continue
      blob = candidate
      if (candidate.size <= TARGET_BYTES) break
    }
    if (!blob) throw new Error('Failed to encode compressed image')
    return { blob, width, height }
  } finally {
    URL.revokeObjectURL(img.src)
  }
}

function loadImage(file: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }
    img.src = url
  })
}

function fitWithin(w: number, h: number, max: number): { width: number; height: number } {
  if (w <= max && h <= max) return { width: w, height: h }
  const scale = w >= h ? max / w : max / h
  return { width: Math.round(w * scale), height: Math.round(h * scale) }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
}
