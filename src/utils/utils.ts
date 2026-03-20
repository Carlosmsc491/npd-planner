// src/utils/hashUtils.ts
// SHA-256 hashing for emergency admin key verification
// Uses Web Crypto API — no external dependencies needed

export async function hashSHA256(input: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

// ─────────────────────────────────────────────
// src/utils/colorUtils.ts
// ─────────────────────────────────────────────

/**
 * Determines whether to use white or dark text on a given background color.
 * Returns the appropriate text color hex.
 */
export function getContrastTextColor(hexBg: string): string {
  const hex = hexBg.replace('#', '')
  const r = parseInt(hex.substring(0, 2), 16)
  const g = parseInt(hex.substring(2, 4), 16)
  const b = parseInt(hex.substring(4, 6), 16)
  // Luminance formula
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.5 ? '#1a1a18' : '#ffffff'
}

export const BOARD_COLORS: Record<string, string> = {
  planner:   '#1D9E75',
  trips:     '#378ADD',
  vacations: '#D4537E',
}

export const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  todo:       { bg: '#F1EFE8', text: '#444441', label: 'To do' },
  inprogress: { bg: '#FAEEDA', text: '#633806', label: 'In progress' },
  review:     { bg: '#E6F1FB', text: '#0C447C', label: 'In review' },
  done:       { bg: '#E1F5EE', text: '#085041', label: 'Done' },
}

// ─────────────────────────────────────────────
// src/utils/dateUtils.ts
// ─────────────────────────────────────────────

import { Timestamp } from 'firebase/firestore'

export function timestampToDate(ts: Timestamp | null | undefined): Date | null {
  if (!ts) return null
  return ts.toDate()
}

export function formatDate(ts: Timestamp | null | undefined): string {
  const date = timestampToDate(ts)
  if (!date) return '—'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatDateRange(
  start: Timestamp | null | undefined,
  end: Timestamp | null | undefined
): string {
  if (!start && !end) return '—'
  if (start && !end) return formatDate(start)
  if (!start && end) return formatDate(end)
  return `${formatDate(start)} → ${formatDate(end)}`
}

export function formatRelativeTime(ts: Timestamp): string {
  const now = Date.now()
  const then = ts.toDate().getTime()
  const diff = now - then

  const minutes = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days = Math.floor(diff / 86_400_000)

  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return formatDate(ts)
}

export function getCurrentYear(): number {
  return new Date().getFullYear()
}

export function isOlderThanMonths(ts: Timestamp, months: number): boolean {
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - months)
  return ts.toDate() < cutoff
}

// ─────────────────────────────────────────────
// src/utils/exportUtils.ts
// ─────────────────────────────────────────────

import type { AnnualSummary } from '../types'

/**
 * Escapes a CSV cell value.
 * Wraps in quotes if value contains comma, quote, or newline.
 */
function csvEscape(value: string | number): string {
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 * Exports annual summary data as CSV string with UTF-8 BOM.
 * BOM ensures Excel on Windows reads accented characters correctly.
 */
export function exportSummaryToCSV(summary: AnnualSummary): string {
  const BOM = '\uFEFF'
  const lines: string[] = []

  lines.push(`NPD Planner — Annual Summary ${summary.year}`)
  lines.push(`Generated:,${new Date(summary.generatedAt.toDate()).toLocaleDateString()}`)
  lines.push('')

  // Overview metrics
  lines.push('Metric,Value')
  lines.push(`Total Tasks,${summary.totalTasks}`)
  lines.push(`Total Trips,${summary.totalTrips}`)
  lines.push(`Total Vacations,${summary.totalVacations}`)
  lines.push(`Completion Rate,${(summary.completionRate * 100).toFixed(1)}%`)
  lines.push('')

  // By Board
  lines.push('Tasks by Board')
  lines.push('Board,Tasks')
  Object.entries(summary.byBoard).forEach(([board, count]) => {
    lines.push(`${csvEscape(board)},${count}`)
  })
  lines.push('')

  // By Client
  lines.push('Tasks by Client')
  lines.push('Client,Tasks')
  Object.entries(summary.byClient)
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .forEach(([client, count]) => {
      lines.push(`${csvEscape(client)},${count}`)
    })
  lines.push('')

  // By Team Member
  lines.push('Tasks by Team Member')
  lines.push('Member,Tasks')
  Object.entries(summary.byAssignee)
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .forEach(([member, count]) => {
      lines.push(`${csvEscape(member)},${count}`)
    })
  lines.push('')

  // By Month
  lines.push('Tasks by Month')
  lines.push('Month,Tasks')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  summary.byMonth.forEach((count, i) => {
    lines.push(`${months[i]},${count}`)
  })
  lines.push('')

  // Top Clients detail
  if (summary.topClients?.length > 0) {
    lines.push('Top Clients')
    lines.push('Rank,Client,Tasks')
    summary.topClients.forEach((tc, i) => {
      lines.push(`${i + 1},${csvEscape(tc.clientName)},${tc.count}`)
    })
    lines.push('')
  }

  // Top Assignees detail
  if (summary.topAssignees?.length > 0) {
    lines.push('Top Team Members')
    lines.push('Rank,Member,Tasks')
    summary.topAssignees.forEach((ta, i) => {
      lines.push(`${i + 1},${csvEscape(ta.name)},${ta.count}`)
    })
  }

  return BOM + lines.join('\n')
}
