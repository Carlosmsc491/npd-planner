// src/renderer/src/components/ui/ConnectionStatus.tsx
// Fixed bottom-right indicator: connected / reconnecting / offline

import { useEffect, useState, useRef } from 'react'

type Status = 'connected' | 'reconnecting' | 'offline'

export default function ConnectionStatus() {
  const [status, setStatus] = useState<Status>('connected')
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function clearTimer() {
      if (timerRef.current) clearTimeout(timerRef.current)
    }

    function handleOnline() {
      clearTimer()
      setStatus('reconnecting')
      setVisible(true)
      timerRef.current = setTimeout(() => {
        setStatus('connected')
        timerRef.current = setTimeout(() => setVisible(false), 2000)
      }, 1500)
    }

    function handleOffline() {
      clearTimer()
      setStatus('offline')
      setVisible(true)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearTimer()
    }
  }, [])

  if (!visible) return null

  const config = {
    connected:    { dot: 'bg-green-500',  text: 'Connected',                        pill: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800' },
    reconnecting: { dot: 'bg-amber-500 animate-pulse', text: 'Reconnecting…',       pill: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800' },
    offline:      { dot: 'bg-red-500',    text: 'Offline — changes saved locally',  pill: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800' },
  }[status]

  return (
    <div className="fixed bottom-4 right-4 z-40">
      <div className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm ${config.pill}`}>
        <span className={`h-2 w-2 rounded-full shrink-0 ${config.dot}`} />
        {config.text}
      </div>
    </div>
  )
}
