// PhotoGalleryPopup.tsx — Read-only gallery popup for reviewing captured photos
// Used in RecipeDetailPanel and PhotoManagerView

import { useEffect, useState, useRef, useCallback } from 'react'
import { X, Camera } from 'lucide-react'
import { Star } from 'lucide-react'
import type { CapturedPhoto } from '../../types'

interface Props {
  photos: CapturedPhoto[]
  initialIndex: number
  recipeName: string
  onClose: () => void
}

export default function PhotoGalleryPopup({ photos, initialIndex, recipeName, onClose }: Props) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [dataUrls, setDataUrls] = useState<Record<string, string | null>>({})
  const filmstripRef = useRef<HTMLDivElement>(null)

  const currentPhoto = photos[currentIndex]

  // Load data URL for a photo by index
  const loadDataUrl = useCallback(async (idx: number) => {
    const photo = photos[idx]
    if (!photo) return
    if (dataUrls[photo.filename] !== undefined) return
    try {
      const url = await window.electronAPI.readFileAsDataUrl(photo.picturePath)
      setDataUrls(prev => ({ ...prev, [photo.filename]: url }))
    } catch {
      setDataUrls(prev => ({ ...prev, [photo.filename]: null }))
    }
  }, [photos, dataUrls])

  // Load current + neighbours
  useEffect(() => {
    loadDataUrl(currentIndex)
    if (currentIndex > 0) loadDataUrl(currentIndex - 1)
    if (currentIndex < photos.length - 1) loadDataUrl(currentIndex + 1)
  }, [currentIndex]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard + wheel navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'ArrowLeft')  setCurrentIndex(i => Math.max(0, i - 1))
      if (e.key === 'ArrowRight') setCurrentIndex(i => Math.min(photos.length - 1, i + 1))
    }
    function handleWheel(e: WheelEvent) {
      e.preventDefault()
      if (e.deltaY > 0) setCurrentIndex(i => Math.min(photos.length - 1, i + 1))
      if (e.deltaY < 0) setCurrentIndex(i => Math.max(0, i - 1))
    }
    window.addEventListener('keydown', handleKey)
    window.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      window.removeEventListener('keydown', handleKey)
      window.removeEventListener('wheel', handleWheel)
    }
  }, [photos.length, onClose])

  // Auto-scroll filmstrip
  useEffect(() => {
    if (!filmstripRef.current) return
    const thumb = filmstripRef.current.children[currentIndex] as HTMLElement | undefined
    if (thumb) thumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
  }, [currentIndex])

  const dataUrl = currentPhoto ? (dataUrls[currentPhoto.filename] ?? null) : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backdropFilter: 'blur(12px)', background: 'rgba(0,0,0,0.75)' }}
      onClick={onClose}
    >
      <div
        className="relative flex flex-col bg-gray-950 rounded-2xl overflow-hidden shadow-2xl"
        style={{ width: 'min(900px, 95vw)', maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800 shrink-0">
          <span className="font-semibold text-white text-sm truncate">{recipeName}</span>
          <button
            onClick={onClose}
            className="shrink-0 text-gray-400 hover:text-white transition-colors ml-4"
          >
            <X size={18} />
          </button>
        </div>

        {/* Main image area */}
        <div className="relative flex-1 flex items-center min-h-0 bg-black">
          {/* Left arrow */}
          {currentIndex > 0 && (
            <button
              onClick={() => setCurrentIndex(i => i - 1)}
              className="absolute left-0 z-10 h-full w-14 flex items-center justify-center bg-black/20 hover:bg-black/50 text-white text-5xl transition-colors select-none"
            >
              ‹
            </button>
          )}

          {/* Image */}
          <div className="relative flex-1 h-full flex items-center justify-center" style={{ minHeight: 320 }}>
            {dataUrl ? (
              <img
                key={currentPhoto?.filename}
                src={dataUrl}
                alt={currentPhoto?.filename}
                className="max-w-full max-h-full object-contain select-none"
                style={{ WebkitUserDrag: 'none' } as React.CSSProperties}
              />
            ) : dataUrl === null && currentPhoto ? (
              <div className="flex flex-col items-center gap-2 text-gray-600">
                <Camera size={32} strokeWidth={1} />
                <span className="text-xs">Image not available</span>
              </div>
            ) : (
              <div className="w-16 h-16 rounded-full bg-gray-800 animate-pulse" />
            )}

            {/* Star — read-only indicator */}
            {currentPhoto?.isSelected && (
              <div className="absolute top-3 right-3 pointer-events-none">
                <Star size={28} fill="#F59E0B" className="text-yellow-400 drop-shadow-lg" />
              </div>
            )}
          </div>

          {/* Right arrow */}
          {currentIndex < photos.length - 1 && (
            <button
              onClick={() => setCurrentIndex(i => i + 1)}
              className="absolute right-0 z-10 h-full w-14 flex items-center justify-center bg-black/20 hover:bg-black/50 text-white text-5xl transition-colors select-none"
            >
              ›
            </button>
          )}
        </div>

        {/* Photo name */}
        <div className="px-5 py-2 text-center text-sm text-gray-300 shrink-0 border-t border-gray-800">
          {currentPhoto?.filename.replace(/\.[^.]+$/, '') ?? '—'}
        </div>

        {/* Filmstrip */}
        <div
          ref={filmstripRef}
          className="flex items-center gap-1.5 px-3 py-2 overflow-x-auto shrink-0 bg-gray-900"
          style={{ scrollbarWidth: 'thin', scrollbarColor: '#374151 transparent' }}
        >
          {photos.map((photo, idx) => {
            const thumbUrl = dataUrls[photo.filename]
            const isActive = idx === currentIndex
            return (
              <button
                key={photo.filename}
                onClick={() => setCurrentIndex(idx)}
                className={`relative shrink-0 w-[80px] h-[56px] rounded overflow-hidden border-2 transition-colors ${
                  isActive ? 'border-white' : 'border-transparent hover:border-gray-500'
                }`}
              >
                {thumbUrl ? (
                  <img src={thumbUrl} alt={photo.filename} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                    <Camera size={12} className="text-gray-600" />
                  </div>
                )}
                {photo.isSelected && (
                  <div className="absolute bottom-0.5 right-0.5 pointer-events-none">
                    <Star size={10} fill="#F59E0B" className="text-yellow-400" />
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
