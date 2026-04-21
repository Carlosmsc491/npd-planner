// src/renderer/src/components/recipes/RecipeRowItem.tsx
// Single recipe file row with state-based visual styling

import { Check, Lock, AlertTriangle, Clock, Camera } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { RecipeFile } from '../../types'

interface Props {
  file: RecipeFile
  isSelected: boolean
  isChecked?: boolean
  currentUserName: string
  currentUserUid?: string
  userRole?: string
  onClick: () => void
  onDoubleClick: () => void
  onCheckToggle?: (id: string) => void
}

// ── State config ─────────────────────────────────────────────────────────

type RowStyle = {
  row: string
  badge: string
  badgeLabel: string
  icon: React.ReactNode
}

function getRowStyle(file: RecipeFile, currentUserName: string): RowStyle {
  const isOwnLock = file.status === 'in_progress' && file.lockedBy === currentUserName

  switch (file.status) {
    case 'pending':
      return {
        row:        'bg-white dark:bg-gray-900',
        badge:      'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
        badgeLabel: 'Pending',
        icon:       <span className="h-3.5 w-3.5 rounded-full border-2 border-gray-300 dark:border-gray-600" />,
      }
    case 'in_progress':
      if (isOwnLock) {
        return {
          row:        'bg-amber-50 dark:bg-amber-900/10',
          badge:      'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
          badgeLabel: 'In Progress — You',
          icon:       <Clock size={13} className="text-amber-500" />,
        }
      }
      return {
        row:        'bg-red-50 dark:bg-red-900/10',
        badge:      'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
        badgeLabel: `Locked by ${file.lockedBy ?? '?'}`,
        icon:       <Lock size={13} className="text-red-500" />,
      }
    case 'lock_expired':
      return {
        row:        'bg-orange-50 dark:bg-orange-900/10',
        badge:      'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
        badgeLabel: 'Lock Expired',
        icon:       <AlertTriangle size={13} className="text-orange-500" />,
      }
    case 'done':
      return {
        row:        'bg-green-50 dark:bg-green-900/10 opacity-60',
        badge:      'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
        badgeLabel: 'Done',
        icon:       <Check size={13} className="text-green-600" />,
      }
  }
}

export default function RecipeRowItem({
  file,
  isSelected,
  isChecked,
  currentUserName,
  currentUserUid,
  userRole,
  onClick,
  onDoubleClick,
  onCheckToggle,
}: Props) {
  const navigate = useNavigate()
  const style = getRowStyle(file, currentUserName)

  const showCameraBtn = userRole === 'owner' || userRole === 'photographer'
  const photoStatus = file.photoStatus ?? 'pending'
  const cameraDisabled = photoStatus === 'complete'
  const cameraBtnClass = cameraDisabled
    ? 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500 cursor-not-allowed'
    : photoStatus === 'in_progress'
      ? 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400'
      : 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400'
  const cameraBtnLabel = cameraDisabled
    ? 'Ya fotografiada'
    : photoStatus === 'in_progress'
      ? 'Continuar Fotos'
      : 'Tomar Fotos'

  // Deterministic color from name
  const colors = [
    'bg-blue-500', 'bg-purple-500', 'bg-rose-500',
    'bg-teal-500', 'bg-orange-500', 'bg-indigo-500',
  ]
  const getColor = (name: string) => colors[name.charCodeAt(0) % colors.length]

  return (
    <div
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors border-l-2 ${
        isSelected
          ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
          : isChecked
            ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/10'
            : `border-transparent ${style.row} hover:brightness-95`
      }`}
    >
      {/* Bulk checkbox */}
      {onCheckToggle && (
        <input
          type="checkbox"
          checked={isChecked ?? false}
          onChange={(e) => { e.stopPropagation(); onCheckToggle(file.id) }}
          onClick={(e) => e.stopPropagation()}
          className="h-3.5 w-3.5 rounded border-gray-300 text-green-500 shrink-0 cursor-pointer"
        />
      )}

      {/* State icon */}
      <div className="shrink-0 flex items-center justify-center w-4">{style.icon}</div>

      {/* Recipe name */}
      <span className="flex-1 text-sm font-medium text-gray-900 dark:text-white truncate" title={file.displayName}>
        {file.displayName}
      </span>

      {/* Price */}
      {file.price && (
        <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0 w-14 text-right font-mono">
          {file.price}
        </span>
      )}

      {/* Option */}
      {file.option && (
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 shrink-0 w-6 text-center">
          {file.option}
        </span>
      )}

      {/* Status badge */}
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap ${style.badge}`}>
        {style.badgeLabel}
      </span>

      {/* Photo status badge */}
      {photoStatus === 'in_progress' && (
        <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 whitespace-nowrap">
          📷 En progreso
        </span>
      )}
      {photoStatus === 'complete' && (
        <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 whitespace-nowrap">
          📷 Listo
        </span>
      )}
      
      {/* Assigned to avatar */}
      {file.assignedTo && file.assignedToName && (
        <div 
          title={`Assigned to ${file.assignedToName}`}
          className={`shrink-0 h-6 w-6 rounded-full ${getColor(file.assignedToName)} 
                     flex items-center justify-center text-[10px] font-bold text-white`}
        >
          {file.assignedToName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
        </div>
      )}
      
      {/* Warning if assigned to someone else */}
      {file.assignedTo && file.assignedTo !== currentUserUid && file.status === 'pending' && (
        <span className="text-[10px] text-amber-600 dark:text-amber-400 shrink-0">
          Assigned to {file.assignedToName}
        </span>
      )}

      {/* Camera / photo capture button */}
      {showCameraBtn && (
        <button
          title={cameraBtnLabel}
          disabled={cameraDisabled}
          onClick={(e) => {
            e.stopPropagation()
            if (!cameraDisabled) navigate(`/capture/${file.id}`)
          }}
          className={`shrink-0 flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${cameraBtnClass}`}
        >
          <Camera size={11} />
          <span className="hidden sm:inline">{cameraBtnLabel}</span>
        </button>
      )}
    </div>
  )
}
