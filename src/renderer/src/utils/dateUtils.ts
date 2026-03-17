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

/**
 * Convert a Date (from FullCalendar or a date input) to a Firestore Timestamp
 * using UTC noon so timezone offsets never shift the date by ±1 day.
 */
export function toFirestoreDate(date: Date): Timestamp {
  const d = new Date(Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    12, 0, 0, 0,
  ))
  return Timestamp.fromDate(d)
}

/**
 * Convert a Firestore Timestamp to a local YYYY-MM-DD string for <input type="date">.
 * Uses UTC values so the stored UTC-noon date renders as the correct calendar day.
 */
export function timestampToDateInput(ts: Timestamp | null): string {
  if (!ts) return ''
  const d = ts.toDate()
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

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
