/**
 * CameraBadge — shows camera connection status in the app header.
 * Green = connected, gray = disconnected.
 * Visible ONLY for owner and photographer roles.
 */
import { Camera } from 'lucide-react'
import { useCameraStatus } from '../../hooks/useCameraStatus'
import { useAuthStore } from '../../store/authStore'

export function CameraBadge() {
  const { user } = useAuthStore()
  const { connected, model } = useCameraStatus()

  // Only owner and photographer see the badge
  if (!user || (user.role !== 'owner' && user.role !== 'photographer')) return null

  return (
    <div
      title={connected ? (model ?? 'Camera connected') : 'No camera detected'}
      className={`
        flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium
        transition-colors duration-300 select-none
        ${connected
          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
          : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600'
        }
      `}
    >
      <Camera size={13} />
      <span className="hidden sm:inline">{connected ? (model ?? 'Connected') : 'No Camera'}</span>
      {connected && (
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
      )}
    </div>
  )
}
