// src/renderer/src/utils/colorUtils.ts
// Re-exports from utils.ts + additional color helpers

export { getContrastTextColor, BOARD_COLORS, STATUS_STYLES } from './utils'
import { BOARD_COLORS } from './utils'
import type { Board } from '../types'

/**
 * Returns the effective display color for a board.
 * User-saved board.color takes priority; BOARD_COLORS[type] is the fallback.
 */
export function getBoardColor(board: Board | null | undefined): string {
  if (!board) return '#888'
  return board.color || BOARD_COLORS[board.type] || '#888'
}

/** Look up the color assigned to a bucket name via the board's Bucket property options */
export function getBucketColor(bucketName: string | undefined, board: Board | null | undefined): string | undefined {
  if (!bucketName || !board) return undefined
  const bucketProp = board.customProperties?.find(
    (p) => p.id === 'builtin-bucket' || p.name === 'Bucket'
  )
  return bucketProp?.options?.find((o) => o.label === bucketName)?.color
}

export const PRIORITY_COLORS: Record<string, string> = {
  high:   '#E24B4A',
  normal: '#888780',
}

export function getInitialsColor(name: string): string {
  const colors = ['#1D9E75', '#378ADD', '#D4537E', '#F59E0B', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316']
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export const BOARD_BUCKETS: Record<string, string[]> = {
  planner:   ['SAMPLES/SHIP OUT', 'FedEx', 'IN HOUSE MEETING', 'PICTURES', 'WORKSHOPS', 'SHOWS', 'EVENTS'],
  trips:     ['Confirmed', 'Pending', 'Completed'],
  vacations: ['Approved', 'Pending', 'Rejected'],
  custom:    [],
}
