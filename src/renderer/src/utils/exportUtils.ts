// src/renderer/src/utils/exportUtils.ts
// Export utilities for PDF and CSV generation

import type { AnnualSummary, Task, Client, AppUser } from '../types'

/**
 * Escapes a CSV cell value.
 * Wraps in quotes if value contains comma, quote, or newline.
 */
function csvEscape(value: string | number | null | undefined): string {
  const str = String(value ?? '')
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

/**
 * Exports a list of tasks to CSV.
 * Used from BoardPage and MyTasksPage.
 */
export function exportTasksToCSV(
  tasks: Task[],
  clients: Client[],
  users: AppUser[],
  _boardName?: string
): string {
  const BOM = '\uFEFF'

  const clientMap = new Map(clients.map(c => [c.id, c.name]))
  const userMap = new Map(users.map(u => [u.uid, u.name]))

  const fmtDate = (ts: import('firebase/firestore').Timestamp | null): string => {
    if (!ts) return ''
    return ts.toDate().toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    })
  }

  const lines: string[] = []

  // Header
  lines.push([
    'Title', 'Client', 'Status', 'Priority', 'Assignees',
    'Start Date', 'End Date', 'PO Number', 'Bucket',
    'Subtasks Done', 'Subtasks Total', 'Completed', 'Completed Date',
  ].join(','))

  // Rows
  for (const t of tasks) {
    const assigneeNames = (t.assignees ?? [])
      .map(uid => userMap.get(uid) ?? uid)
      .join('; ')

    const subtasksDone = (t.subtasks ?? []).filter(s => s.completed).length
    const subtasksTotal = (t.subtasks ?? []).length

    lines.push([
      csvEscape(t.title),
      csvEscape(clientMap.get(t.clientId) ?? ''),
      csvEscape(t.status),
      csvEscape(t.priority),
      csvEscape(assigneeNames),
      csvEscape(fmtDate(t.dateStart)),
      csvEscape(fmtDate(t.dateEnd)),
      csvEscape(t.poNumber ?? ''),
      csvEscape(t.bucket ?? ''),
      subtasksDone,
      subtasksTotal,
      t.completed ? 'Yes' : 'No',
      csvEscape(fmtDate(t.completedAt)),
    ].join(','))
  }

  return BOM + lines.join('\n')
}

/**
 * Triggers a browser download of a CSV string.
 */
export function downloadCSV(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(link.href)
}
