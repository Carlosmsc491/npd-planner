// src/renderer/src/utils/colorUtils.ts
// Re-exports from utils.ts + additional color helpers

export { getContrastTextColor, BOARD_COLORS, STATUS_STYLES } from './utils'

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
