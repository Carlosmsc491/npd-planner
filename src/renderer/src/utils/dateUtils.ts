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
 * NOTE: For Date objects parsed from <input type="date"> strings, use
 * dateStringToTimestamp() instead to avoid timezone offset issues.
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
 * Convert a "YYYY-MM-DD" string (from <input type="date">) to a Firestore Timestamp.
 * Parses the components directly to avoid timezone offset issues.
 */
export function dateStringToTimestamp(dateStr: string): Timestamp | null {
  if (!dateStr) return null
  const [yearStr, monthStr, dayStr] = dateStr.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr) - 1  // JS months are 0-indexed
  const day = Number(dayStr)
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null
  // Store as UTC noon to prevent timezone drift
  const d = new Date(Date.UTC(year, month, day, 12, 0, 0, 0))
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

/**
 * Converts a Firestore Date to a YYYY-MM-DD string for FullCalendar all-day events.
 * Uses UTC methods because Firestore stores all-day dates as UTC midnight or UTC noon.
 */
export function toLocalDateString(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Converts a Firestore end-date Timestamp to a FullCalendar exclusive end string.
 * FullCalendar all-day events use exclusive end dates:
 *   event visible Jan 25–28 → pass end: "2025-01-29"
 * So we add 1 UTC day before formatting.
 */
export function toFCExclusiveEnd(date: Date): string {
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1))
  return toLocalDateString(next)
}

/**
 * Converts a FullCalendar exclusive end Date back to the inclusive end date for Firestore.
 * FullCalendar passes end = day-after-last-visible, so we subtract 1 day.
 * Uses local getDate() because FullCalendar all-day callbacks give local midnight dates.
 */
export function fromFCExclusiveEnd(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate() - 1, 12, 0, 0))
}
