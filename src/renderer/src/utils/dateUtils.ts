// src/renderer/src/utils/dateUtils.ts
// Re-exports from utils.ts

export {
  timestampToDate,
  formatDate,
  formatDateRange,
  formatRelativeTime,
  getCurrentYear,
  isOlderThanMonths,
} from './utils'

import { Timestamp } from 'firebase/firestore'

export function isOverdue(dateEnd: Timestamp | null): boolean {
  if (!dateEnd) return false
  return dateEnd.toDate() < new Date()
}

export function isWithinDNDHours(dndStart: string, dndEnd: string): boolean {
  if (!dndStart || !dndEnd) return false
  const now = new Date()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  const [startH, startM] = dndStart.split(':').map(Number)
  const [endH, endM] = dndEnd.split(':').map(Number)
  const startMinutes = startH * 60 + startM
  const endMinutes = endH * 60 + endM
  if (startMinutes > endMinutes) {
    return currentMinutes >= startMinutes || currentMinutes < endMinutes
  }
  return currentMinutes >= startMinutes && currentMinutes < endMinutes
}
