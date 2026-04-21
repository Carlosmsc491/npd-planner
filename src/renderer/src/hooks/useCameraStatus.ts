/**
 * useCameraStatus — tracks camera connection in real-time
 * - On mount: calls checkCameraConnection() for initial state
 * - Listens to camera:status-changed from main process
 * - Plays a chime sound when camera connects
 */
import { useState, useEffect, useRef } from 'react'

interface CameraStatus {
  connected: boolean
  model: string | null
}

export function useCameraStatus(): CameraStatus {
  const [status, setStatus] = useState<CameraStatus>({ connected: false, model: null })
  const prevConnected = useRef(false)

  useEffect(() => {
    // Initial state
    window.electronAPI.checkCameraConnection().then(setStatus).catch(() => {})

    // Listen for status changes from main process
    const unlisten = window.electronAPI.onCameraStatusChanged((newStatus) => {
      if (newStatus.connected && !prevConnected.current) {
        // Play chime when camera connects
        const audio = new Audio('/sounds/camera-connect.mp3')
        audio.play().catch(() => {}) // ignore if file not present
      }
      prevConnected.current = newStatus.connected
      setStatus(newStatus)
    })

    return () => unlisten()
  }, [])

  return status
}
