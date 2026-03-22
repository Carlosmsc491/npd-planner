// src/renderer/src/components/recipes/RecipeRowItem.tsx
// Single recipe file row with state-based visual styling

import { Check, Lock, AlertTriangle, Clock } from 'lucide-react'
import type { RecipeFile } from '../../types'

interface Props {
  file: RecipeFile
  isSelected: boolean
  currentUserName: string
  onClick: () => void
  onDoubleClick: () => void
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
  currentUserName,
  onClick,
  onDoubleClick,
}: Props) {
  const style = getRowStyle(file, currentUserName)

  return (
    <div
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors border-l-2 ${
        isSelected
          ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
          : `border-transparent ${style.row} hover:brightness-95`
      }`}
    >
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
    </div>
  )
}
