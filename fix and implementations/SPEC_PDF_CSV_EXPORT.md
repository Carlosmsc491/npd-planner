# TECHNICAL SPEC — PDF & CSV Export System

## NPD Planner · Phase 0 · Estimated: 2–3 days

---

## 1. STATUS AUDIT — What exists vs what's missing

### ✅ Already built and working

| Component | File | Status |
|-----------|------|--------|
| `jsPDF` + `html2canvas` installed | `package.json` devDeps | v2.5.2 / v1.4.1 |
| `exportSummaryToCSV()` | `src/renderer/src/utils/utils.ts` | Working — produces CSV string from `AnnualSummary` |
| `exportUtils.ts` re-export barrel | `src/renderer/src/utils/exportUtils.ts` | Working — re-exports from utils.ts |
| `AnnualSummary` type | `src/renderer/src/types/index.ts` | Complete with all fields |
| `AnnualReportsTab` component | `src/renderer/src/pages/AnalyticsPage.tsx` | Has `handleExportPDF` and `handleExportCSV` functions |
| `subscribeToArchive()` | `src/renderer/src/lib/firestore.ts` | Working — real-time subscription |
| `getArchiveByYear()` | `src/renderer/src/lib/firestore.ts` | Working — single document fetch |
| `saveAnnualSummary()` | `src/renderer/src/lib/firestore.ts` | Working |
| `archiveOldTasks()` | `src/renderer/src/lib/firestore.ts` | Working — moves tasks to archive subcollection |
| Year selector + buttons UI | `AnalyticsPage.tsx` → `AnnualReportsTab` | Renders Export PDF + Export CSV buttons |
| Report content div with `ref={reportRef}` | `AnalyticsPage.tsx` | Charts + stat cards wrapped in capturable div |

### ❌ Problems to fix / Features to complete

| Issue | Severity | Description |
|-------|----------|-------------|
| **PDF multi-page overflow** | High | Current `handleExportPDF` renders single `addImage()` call — if reportRef content exceeds one A4 page, it gets squished to fit instead of spanning pages |
| **PDF dark mode capture** | High | `html2canvas` captures whatever theme is active — dark mode produces dark-background PDFs unreadable when printed |
| **PDF loading state** | Medium | No spinner/disabled during PDF generation (takes 2-5 seconds depending on chart count) |
| **CSV missing commas in values** | Medium | `exportSummaryToCSV` doesn't escape values containing commas — client names like "Bloom, Inc." break CSV structure |
| **CSV BOM for Excel** | Low | Excel on Windows misreads UTF-8 CSVs without BOM — accented characters (common in Spanish finca names) display as mojibake |
| **No live dashboard export** | Medium | Export only works from Annual Reports tab — the live Dashboard tab has no export buttons |
| **No export from board views** | Low | Board task lists cannot be exported at all (user request likely) |
| **Archive empty state** | Low | If no archives exist, Export buttons show but do nothing with no feedback |

---

## 2. IMPLEMENTATION TASKS

### TASK 1 — Fix PDF multi-page rendering (Day 1, ~3 hours)

**Problem**: The current code does:
```typescript
pdf.addImage(imgData, 'PNG', 10, 40, pdfWidth - 20, pdfHeight)
```
This places the entire captured canvas as one image starting at y=40mm. If `pdfHeight` exceeds the page height (~257mm for A4 minus header), the image overflows into nothing — it doesn't auto-paginate.

**File**: `src/renderer/src/pages/AnalyticsPage.tsx`

**Replace the entire `handleExportPDF` function** in `AnnualReportsTab` with:

```typescript
const handleExportPDF = async () => {
  if (!reportRef.current || !summary) return
  setExporting(true)  // new state — see Task 3

  try {
    // Force light mode for capture
    const htmlEl = document.documentElement
    const wasDark = htmlEl.classList.contains('dark')
    if (wasDark) htmlEl.classList.remove('dark')

    // Small delay for repaint
    await new Promise(r => setTimeout(r, 100))

    const canvas = await html2canvas(reportRef.current, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      // Ignore elements that shouldn't appear in export
      ignoreElements: (el) => el.hasAttribute('data-no-export'),
    })

    // Restore dark mode if it was active
    if (wasDark) htmlEl.classList.add('dark')

    const pdf = new jsPDF('p', 'mm', 'a4')
    const pageWidth = pdf.internal.pageSize.getWidth()    // 210mm
    const pageHeight = pdf.internal.pageSize.getHeight()  // 297mm
    const margins = { top: 15, bottom: 15, left: 10, right: 10 }
    const contentWidth = pageWidth - margins.left - margins.right

    // ── Header (page 1 only) ──
    const headerHeight = 30 // mm reserved for header
    pdf.setFontSize(18)
    pdf.setFont('helvetica', 'bold')
    pdf.text('NPD Planner', pageWidth / 2, margins.top, { align: 'center' })
    pdf.setFontSize(12)
    pdf.setFont('helvetica', 'normal')
    pdf.text(
      `Annual Summary ${summary.year}`,
      pageWidth / 2, margins.top + 8,
      { align: 'center' }
    )
    pdf.setFontSize(9)
    pdf.setTextColor(120, 120, 120)
    pdf.text('Elite Flower', pageWidth / 2, margins.top + 14, { align: 'center' })
    pdf.text(
      `Generated: ${new Date().toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric'
      })}`,
      pageWidth / 2, margins.top + 19,
      { align: 'center' }
    )
    pdf.setTextColor(0, 0, 0)

    // ── Separator line ──
    pdf.setDrawColor(200, 200, 200)
    pdf.setLineWidth(0.3)
    pdf.line(
      margins.left, margins.top + headerHeight - 5,
      pageWidth - margins.right, margins.top + headerHeight - 5
    )

    // ── Paginated image slicing ──
    const imgData = canvas.toDataURL('image/png')
    const imgWidthPx = canvas.width
    const imgHeightPx = canvas.height

    // Scale: how many px per mm of PDF content width
    const pxPerMm = imgWidthPx / contentWidth

    // Available height on first page (after header) and subsequent pages
    const firstPageAvail = pageHeight - margins.top - headerHeight - margins.bottom
    const otherPageAvail = pageHeight - margins.top - margins.bottom

    // Total image height in mm
    const totalImgHeightMm = imgHeightPx / pxPerMm

    let remainingMm = totalImgHeightMm
    let sourceYPx = 0
    let pageNum = 0

    while (remainingMm > 0) {
      const availMm = pageNum === 0 ? firstPageAvail : otherPageAvail
      const sliceHeightMm = Math.min(remainingMm, availMm)
      const sliceHeightPx = sliceHeightMm * pxPerMm

      if (pageNum > 0) {
        pdf.addPage()
      }

      // Create a temporary canvas for this slice
      const sliceCanvas = document.createElement('canvas')
      sliceCanvas.width = imgWidthPx
      sliceCanvas.height = Math.ceil(sliceHeightPx)
      const ctx = sliceCanvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(
          canvas,
          0, sourceYPx,                          // source x, y
          imgWidthPx, Math.ceil(sliceHeightPx),  // source w, h
          0, 0,                                   // dest x, y
          imgWidthPx, Math.ceil(sliceHeightPx)   // dest w, h
        )
      }

      const sliceData = sliceCanvas.toDataURL('image/png')
      const yPos = pageNum === 0
        ? margins.top + headerHeight
        : margins.top

      pdf.addImage(
        sliceData, 'PNG',
        margins.left, yPos,
        contentWidth, sliceHeightMm
      )

      // Page number footer
      pdf.setFontSize(8)
      pdf.setTextColor(160, 160, 160)
      pdf.text(
        `Page ${pageNum + 1}`,
        pageWidth / 2,
        pageHeight - 8,
        { align: 'center' }
      )
      pdf.setTextColor(0, 0, 0)

      sourceYPx += sliceHeightPx
      remainingMm -= sliceHeightMm
      pageNum++
    }

    pdf.save(`NPD-Planner-Summary-${summary.year}.pdf`)
  } catch (error) {
    console.error('PDF export failed:', error)
    alert('Failed to export PDF. Please try again.')
  } finally {
    setExporting(false)
  }
}
```

**Key changes from current code**:
- Slices the canvas into page-sized chunks instead of one huge image
- Forces light mode during capture, then restores
- Adds page numbers to every page
- Header only on first page
- Separator line under header
- Proper margins throughout

---

### TASK 2 — Fix CSV escaping and BOM (Day 1, ~1 hour)

**File**: `src/renderer/src/utils/utils.ts`

**Replace** the `exportSummaryToCSV` function:

```typescript
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
```

**Also update** `handleExportCSV` in `AnalyticsPage.tsx` to use the correct MIME type:

```typescript
const handleExportCSV = () => {
  if (!summary) return

  const csv = exportSummaryToCSV(summary)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `NPD-Planner-Summary-${summary.year}.csv`
  document.body.appendChild(link) // Required for Firefox
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(link.href)
}
```

---

### TASK 3 — Add loading state and empty state (Day 1, ~1 hour)

**File**: `src/renderer/src/pages/AnalyticsPage.tsx`

**Add state variable** inside `AnnualReportsTab`:

```typescript
function AnnualReportsTab() {
  const [archives, setArchives] = useState<AnnualSummary[]>([])
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [summary, setSummary] = useState<AnnualSummary | null>(null)
  const [exporting, setExporting] = useState(false) // ← ADD THIS
  const reportRef = useRef<HTMLDivElement>(null)
  // ... rest of component
```

**Update the Export buttons** to show loading state:

```tsx
{summary && (
  <div className="flex gap-2">
    <button
      onClick={handleExportPDF}
      disabled={exporting}
      className="flex items-center gap-2 rounded-lg border border-gray-200
                 dark:border-gray-700 px-3 py-2 text-sm text-gray-700
                 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700
                 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {exporting ? (
        <>
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10"
                    stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Generating...
        </>
      ) : (
        <>
          <FileText size={16} />
          Export PDF
        </>
      )}
    </button>
    <button
      onClick={handleExportCSV}
      disabled={exporting}
      className="flex items-center gap-2 rounded-lg border border-gray-200
                 dark:border-gray-700 px-3 py-2 text-sm text-gray-700
                 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700
                 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <FileSpreadsheet size={16} />
      Export CSV
    </button>
  </div>
)}
```

**Add empty state** when no archives exist. Replace the section after `{summary ? (` with:

```tsx
{!summary && availableYears.length === 0 ? (
  <div className="rounded-2xl border border-dashed border-gray-200
                  dark:border-gray-700 bg-white dark:bg-gray-800
                  px-6 py-12 flex flex-col items-center justify-center text-center">
    <Archive size={32} className="text-gray-300 dark:text-gray-600 mb-3" />
    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
      No annual reports yet
    </p>
    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 max-w-sm">
      Reports are generated when tasks older than 12 months are archived.
      You can trigger archiving from Settings → Archive.
    </p>
  </div>
) : summary ? (
  <div ref={reportRef} className="space-y-6">
    {/* ...existing chart content... */}
  </div>
) : (
  <div className="flex items-center justify-center py-12">
    <p className="text-sm text-gray-400">Select a year to view the report.</p>
  </div>
)}
```

---

### TASK 4 — Add live Dashboard tab export (Day 2, ~3 hours)

The live Dashboard tab currently has charts but no export. Add both PDF and CSV export.

**File**: `src/renderer/src/pages/AnalyticsPage.tsx`

**Step 4a — Add export state and ref to `DashboardTab`**:

```typescript
function DashboardTab({ boards }: DashboardTabProps) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<AppUser[]>([])
  const [exporting, setExporting] = useState(false)  // ← ADD
  const dashboardRef = useRef<HTMLDivElement>(null)    // ← ADD
  // ... existing useEffects
```

**Step 4b — Add `exportDashboardPDF` function** inside `DashboardTab`:

```typescript
const exportDashboardPDF = async () => {
  if (!dashboardRef.current) return
  setExporting(true)

  try {
    const htmlEl = document.documentElement
    const wasDark = htmlEl.classList.contains('dark')
    if (wasDark) htmlEl.classList.remove('dark')
    await new Promise(r => setTimeout(r, 100))

    const canvas = await html2canvas(dashboardRef.current, {
      scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false,
    })

    if (wasDark) htmlEl.classList.add('dark')

    const pdf = new jsPDF('p', 'mm', 'a4')
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()

    // Header
    pdf.setFontSize(18)
    pdf.setFont('helvetica', 'bold')
    pdf.text('NPD Planner — Dashboard Report', pageWidth / 2, 15, { align: 'center' })
    pdf.setFontSize(9)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(120, 120, 120)
    pdf.text(
      `Elite Flower · Generated ${new Date().toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric'
      })}`,
      pageWidth / 2, 22, { align: 'center' }
    )
    pdf.setTextColor(0, 0, 0)

    // Use same pagination logic as Task 1
    const imgData = canvas.toDataURL('image/png')
    const margins = { top: 10, left: 10, right: 10, bottom: 10 }
    const contentWidth = pageWidth - margins.left - margins.right
    const pxPerMm = canvas.width / contentWidth
    const headerOffset = 30
    const firstAvail = pageHeight - headerOffset - margins.bottom
    const otherAvail = pageHeight - margins.top - margins.bottom
    const totalMm = canvas.height / pxPerMm

    let remaining = totalMm
    let srcY = 0
    let page = 0

    while (remaining > 0) {
      const avail = page === 0 ? firstAvail : otherAvail
      const sliceMm = Math.min(remaining, avail)
      const slicePx = sliceMm * pxPerMm

      if (page > 0) pdf.addPage()

      const sliceCanvas = document.createElement('canvas')
      sliceCanvas.width = canvas.width
      sliceCanvas.height = Math.ceil(slicePx)
      const ctx = sliceCanvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(canvas, 0, srcY, canvas.width, Math.ceil(slicePx),
                       0, 0, canvas.width, Math.ceil(slicePx))
      }

      pdf.addImage(sliceCanvas.toDataURL('image/png'), 'PNG',
        margins.left, page === 0 ? headerOffset : margins.top,
        contentWidth, sliceMm)

      srcY += slicePx
      remaining -= sliceMm
      page++
    }

    pdf.save(`NPD-Planner-Dashboard-${new Date().toISOString().slice(0, 10)}.pdf`)
  } catch (err) {
    console.error('Dashboard PDF export failed:', err)
    alert('Export failed. Please try again.')
  } finally {
    setExporting(false)
  }
}
```

**Step 4c — Add `exportDashboardCSV` function**:

```typescript
const exportDashboardCSV = () => {
  if (!stats) return

  const BOM = '\uFEFF'
  const lines: string[] = []
  const esc = (v: string | number) => {
    const s = String(v)
    return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s
  }

  lines.push(`NPD Planner — Dashboard Snapshot`)
  lines.push(`Generated:,${new Date().toLocaleDateString()}`)
  lines.push('')

  lines.push('Overview')
  lines.push('Metric,Value')
  lines.push(`Tasks Completed This Week,${stats.thisWeekCount}`)
  lines.push(`Tasks Completed Last Week,${stats.lastWeekCount}`)
  lines.push(`Week-over-Week Change,${stats.percentChange > 0 ? '+' : ''}${stats.percentChange.toFixed(1)}%`)
  lines.push(`Total Active Tasks,${stats.activeTasks}`)
  lines.push('')

  lines.push('Tasks by Assignee')
  lines.push('Assignee,Active Tasks')
  stats.byAssignee.forEach(({ name, count }: { name: string; count: number }) => {
    lines.push(`${esc(name)},${count}`)
  })
  lines.push('')

  lines.push('Tasks by Client (Top 10)')
  lines.push('Client,Tasks')
  stats.byClient.slice(0, 10).forEach(({ name, count }: { name: string; count: number }) => {
    lines.push(`${esc(name)},${count}`)
  })
  lines.push('')

  lines.push('Tasks by Board')
  lines.push('Board,Tasks')
  stats.byBoard.forEach(({ name, count }: { name: string; count: number }) => {
    lines.push(`${esc(name)},${count}`)
  })

  const csv = BOM + lines.join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `NPD-Planner-Dashboard-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(link.href)
}
```

**Step 4d — Add export buttons** to the Dashboard tab's UI.

Add this block inside the DashboardTab return, above the charts grid:

```tsx
{/* Export Controls */}
<div className="flex gap-2 justify-end" data-no-export>
  <button
    onClick={exportDashboardPDF}
    disabled={exporting || loading}
    className="flex items-center gap-2 rounded-lg border border-gray-200
               dark:border-gray-700 px-3 py-1.5 text-xs text-gray-600
               dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700
               transition-colors disabled:opacity-50"
  >
    {exporting ? 'Generating...' : <><FileText size={14} /> PDF</>}
  </button>
  <button
    onClick={exportDashboardCSV}
    disabled={loading}
    className="flex items-center gap-2 rounded-lg border border-gray-200
               dark:border-gray-700 px-3 py-1.5 text-xs text-gray-600
               dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700
               transition-colors disabled:opacity-50"
  >
    <FileSpreadsheet size={14} /> CSV
  </button>
</div>
```

Note the `data-no-export` attribute — this prevents the export buttons themselves from appearing in the PDF capture (the `ignoreElements` callback in `html2canvas` checks for this).

**Step 4e — Wrap chart content** in the dashboard ref:

```tsx
<div ref={dashboardRef}>
  {/* ...existing stat cards and chart grid... */}
</div>
```

**Step 4f — Update the `stats` useMemo** to also return the intermediate arrays so the CSV function can access them. The current stats computation already calculates `byAssignee`, `byClient`, `byBoard` — ensure they're included in the return object. If the stats object currently only returns simple counts, extend it:

```typescript
// Inside the stats useMemo, add to the return:
return {
  // ...existing fields...
  thisWeekCount,
  lastWeekCount,
  percentChange,
  activeTasks: tasks.filter(t => !t.completed).length,
  byAssignee: assigneeData,    // Array<{ name: string; count: number }>
  byClient: clientData,         // Array<{ name: string; count: number }>
  byBoard: boardData,           // Array<{ name: string; count: number }>
}
```

---

### TASK 5 — Add board-level task list CSV export (Day 2, ~2 hours)

**New utility function** — add to `src/renderer/src/utils/exportUtils.ts`:

```typescript
import type { AnnualSummary, Task, Client, AppUser } from '../types'
export { exportSummaryToCSV } from './utils'

/**
 * Exports a list of tasks to CSV.
 * Used from BoardPage and MyTasksPage.
 */
export function exportTasksToCSV(
  tasks: Task[],
  clients: Client[],
  users: AppUser[],
  boardName: string
): string {
  const BOM = '\uFEFF'

  const clientMap = new Map(clients.map(c => [c.id, c.name]))
  const userMap = new Map(users.map(u => [u.uid, u.name]))

  const esc = (v: string | number | null | undefined): string => {
    const s = String(v ?? '')
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }

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
      esc(t.title),
      esc(clientMap.get(t.clientId) ?? ''),
      esc(t.status),
      esc(t.priority),
      esc(assigneeNames),
      esc(fmtDate(t.dateStart)),
      esc(fmtDate(t.dateEnd)),
      esc(t.poNumber ?? ''),
      esc(t.bucket ?? ''),
      subtasksDone,
      subtasksTotal,
      t.completed ? 'Yes' : 'No',
      esc(fmtDate(t.completedAt ?? null)),
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
```

**Add export button to BoardPage** — `src/renderer/src/pages/BoardPage.tsx`

In the topbar, next to the "+ New Task" button, add:

```tsx
import { Download } from 'lucide-react'
import { exportTasksToCSV, downloadCSV } from '../utils/exportUtils'
// You'll need access to clients and users — import useClients and subscribeToUsers hooks

<button
  onClick={() => {
    const csv = exportTasksToCSV(tasks, clients, users, activeBoard.name)
    downloadCSV(csv, `${activeBoard.name}-tasks-${new Date().toISOString().slice(0, 10)}.csv`)
  }}
  className="flex items-center gap-1 rounded-lg border border-gray-200
             dark:border-gray-700 px-2.5 py-1.5 text-xs text-gray-500
             hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200
             hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
  title="Export tasks as CSV"
>
  <Download size={13} />
  CSV
</button>
```

**Note on data access**: BoardPage already has `tasks` from its `useTasks` hook. You'll need to also import clients and users. If `useClients` and `subscribeToUsers` aren't already available in BoardPage, add:

```typescript
import { useClients } from '../hooks/useClients'
// Inside component:
const { clients } = useClients()
const [users, setUsers] = useState<AppUser[]>([])
useEffect(() => {
  const unsub = subscribeToUsers(setUsers)
  return unsub
}, [])
```

---

## 3. TESTING CHECKLIST

Run through these after implementation:

| # | Test | Expected |
|---|------|----------|
| 1 | Export PDF with 4+ charts (enough to overflow A4) | PDF has 2+ pages, all charts visible, no squishing |
| 2 | Export PDF in dark mode | PDF renders with white background regardless |
| 3 | Export PDF — check header | "NPD Planner", year, "Elite Flower", date, separator line |
| 4 | Export PDF — check page numbers | "Page 1", "Page 2" etc. centered at bottom |
| 5 | Export CSV → open in Excel (Windows) | No mojibake on accented characters (BOM test) |
| 6 | Create client named `"Bloom, Inc."` → export CSV | Client name wrapped in quotes, CSV not broken |
| 7 | Create client named `He said "hello"` → export CSV | Quotes doubled, CSV valid |
| 8 | Export CSV from Annual Reports → check data | All sections present: metrics, by-board, by-client, by-month, top lists |
| 9 | Annual Reports with no archives → check UI | Empty state with Archive icon and guidance text |
| 10 | Click Export PDF → check loading spinner | Button disabled, shows "Generating...", re-enables after save |
| 11 | Dashboard tab → Export PDF | Produces dated dashboard snapshot PDF |
| 12 | Dashboard tab → Export CSV | CSV has overview metrics, assignees, clients, boards |
| 13 | Board page → Export CSV button | Downloads CSV with all visible tasks, correct columns |
| 14 | Board CSV with 0 tasks | Downloads CSV with header row only (no crash) |

---

## 4. FILES MODIFIED (Summary)

| File | Changes |
|------|---------|
| `src/renderer/src/pages/AnalyticsPage.tsx` | Replace `handleExportPDF`, add `exporting` state, add empty state, add dashboard export buttons + functions |
| `src/renderer/src/utils/utils.ts` | Replace `exportSummaryToCSV` with escaped + BOM version |
| `src/renderer/src/utils/exportUtils.ts` | Add `exportTasksToCSV` and `downloadCSV` utility functions |
| `src/renderer/src/pages/BoardPage.tsx` | Add CSV export button to topbar |

---

## 5. CLAUDE.MD CHECKBOXES TO MARK

After completion, update these in CLAUDE.md:

```
- [x] Export PDF (jsPDF + html2canvas) with Elite Flower header
- [x] Export CSV (all filterable data)
```

---

## 6. COMMIT MESSAGE

```
feat: complete PDF & CSV export system

- Fix PDF multi-page overflow (canvas slicing pagination)
- Force light mode during PDF capture for printable output
- Add page numbers and Elite Flower branded header
- Fix CSV escaping for values with commas/quotes
- Add UTF-8 BOM for Excel Windows compatibility
- Add loading spinner during PDF generation
- Add empty state when no archives exist
- Add PDF + CSV export to live Dashboard tab
- Add CSV export button to BoardPage topbar
- Add exportTasksToCSV utility for board-level exports
```
