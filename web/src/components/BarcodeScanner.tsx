// src/components/BarcodeScanner.tsx
// Camera barcode scan for a 'text' task with scannable: true — added for
// UPC Check (GOSPOTCHECK_PARITY_AUDIT.md §4.1 item 3).
//
// Uses the browser-native BarcodeDetector (Shape Detection API) only — no
// scanning library. That is a real, permanent limitation: BarcodeDetector
// has only ever shipped in Chromium (Chrome/Edge/Samsung Internet, desktop
// and Android). Safari has never implemented it on any Apple platform — an
// iOS 17 feature flag existed and iOS 18 broke even that (WebKit bug
// 281848). isBarcodeScanSupported() feature-detects this; TextTask only
// renders the scan button when it's true, so iPhone silently keeps the
// plain text field it already had — no dead button, nothing regresses.
// Getting a real scanner on iOS needs a WASM decoding library and is a
// separate, deliberate decision (adds the first real dependency to this
// module) — not something to slip in as a side effect of this feature.

import { useEffect, useRef, useState } from 'react'

// BarcodeDetector isn't in TS's lib.dom.d.ts yet (Shape Detection API is
// still a WICG draft) — minimal ambient shape for exactly what's used here.
interface DetectedBarcode {
  rawValue: string
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>
}
interface BarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike
  getSupportedFormats?: () => Promise<string[]>
}

function getBarcodeDetectorCtor(): BarcodeDetectorConstructor | null {
  return (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector ?? null
}

/** Feature-detect once — cheap, and the result can't change mid-session. */
export function isBarcodeScanSupported(): boolean {
  return getBarcodeDetectorCtor() !== null
}

// UPC-A/UPC-E/EAN-13/EAN-8 cover retail product barcodes; code_128 catches
// the odd internal/shelf label. Deliberately not the full format list
// BarcodeDetector supports (QR etc.) — nothing here is looking for those.
const FORMATS = ['upc_a', 'upc_e', 'ean_13', 'ean_8', 'code_128']
const DETECT_INTERVAL_MS = 300

interface BarcodeScannerProps {
  onDetected: (value: string) => void
  onClose: () => void
}

export default function BarcodeScanner({ onDetected, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const detectTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const closedRef = useRef(false) // guards against a detect() resolving after unmount/close
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    closedRef.current = false
    let cancelled = false

    async function start() {
      const DetectorCtor = getBarcodeDetectorCtor()
      if (!DetectorCtor) {
        setError('Barcode scanning is not supported on this device.')
        return
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }

        const detector = new DetectorCtor({ formats: FORMATS })
        detectTimerRef.current = setInterval(async () => {
          if (closedRef.current || !videoRef.current) return
          try {
            const codes = await detector.detect(videoRef.current)
            if (codes.length > 0 && !closedRef.current) {
              closedRef.current = true // stop the interval firing again while we unwind
              onDetected(codes[0].rawValue)
            }
          } catch {
            // A frame failing to decode is normal (motion blur, out of
            // frame) — only a real getUserMedia/permission failure sets
            // the error state, via the catch below.
          }
        }, DETECT_INTERVAL_MS)
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof DOMException && err.name === 'NotAllowedError'
              ? 'Camera access was denied. Allow it in your browser settings to scan.'
              : 'Could not open the camera.'
          )
        }
      }
    }

    void start()

    return () => {
      cancelled = true
      closedRef.current = true
      if (detectTimerRef.current) clearInterval(detectTimerRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [onDetected])

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 text-white safe-top">
        <p className="text-sm font-medium">Scan barcode</p>
        <button type="button" onClick={onClose} className="p-1" aria-label="Close scanner">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-4/5 max-w-sm aspect-[2/1] border-2 border-white/80 rounded-xl shadow-[0_0_0_2000px_rgba(0,0,0,0.4)]" />
        </div>
        {error && (
          <div className="absolute inset-x-4 bottom-6 rounded-xl bg-white/95 px-4 py-3 text-sm text-gray-800 text-center">
            {error}
          </div>
        )}
      </div>

      {!error && <p className="text-center text-white/70 text-xs pb-6 px-4">Point the camera at the barcode</p>}
    </div>
  )
}
