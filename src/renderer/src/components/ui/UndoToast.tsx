import { useEffect, useState } from 'react'
import { useTaskStore } from '../../store/taskStore'
import type { ToastData } from '../../types'

export default function UndoToast() {
  const { toast, setToast } = useTaskStore()
  const [progress, setProgress] = useState(100)

  useEffect(() => {
    if (!toast) { setProgress(100); return }
    const duration = toast.duration ?? 5000
    setProgress(100)
    const start = Date.now()

    const interval = setInterval(() => {
      const elapsed = Date.now() - start
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100)
      setProgress(remaining)
      if (remaining <= 0) {
        clearInterval(interval)
        setToast(null)
      }
    }, 50)

    return () => clearInterval(interval)
  }, [toast, setToast])

  if (!toast) return null

  const colorMap: Record<ToastData['type'], string> = {
    success: 'bg-green-600',
    error:   'bg-red-600',
    warning: 'bg-amber-600',
    info:    'bg-gray-800 dark:bg-gray-700',
  }

  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
      <div className={`min-w-[280px] max-w-sm rounded-xl ${colorMap[toast.type]} shadow-2xl overflow-hidden`}>
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <p className="text-sm font-medium text-white">{toast.message}</p>
          <div className="flex items-center gap-2 shrink-0">
            {toast.undoAction && (
              <button
                onClick={() => { toast.undoAction?.(); setToast(null) }}
                className="rounded-md bg-white/20 px-3 py-1 text-xs font-semibold text-white hover:bg-white/30 transition-colors"
              >
                Undo
              </button>
            )}
            <button onClick={() => setToast(null)} className="text-white/60 hover:text-white text-lg leading-none">
              ×
            </button>
          </div>
        </div>
        {/* Progress bar */}
        <div className="h-0.5 bg-white/20">
          <div
            className="h-full bg-white/60 transition-none"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  )
}
