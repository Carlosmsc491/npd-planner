# Import Microsoft Planner History — Full Spec

> This feature imports historical task data from Microsoft Planner exports (.xlsx/.csv)
> into NPD Planner for analytics and historical reporting.
> The data is NOT imported as live tasks — it is stored as **historical records**
> for annual/monthly summaries, client analytics, and team performance views.

---

## Overview

The user exports their Microsoft Planner board as an Excel file. The app reads it,
auto-matches clients by task name, lets the user assign clients to unmatched tasks,
then stores the data in Firebase as historical records. New analytics views display
this data alongside current NPD Planner data.

---

## Phase 1: Import Wizard (Settings > Import History)

### Step 1 — Upload File

**Location:** Settings page, new tab "Import History" (admin/owner only)

**UI:**
- Drag-and-drop zone OR "Browse" button
- Accepts `.xlsx` and `.csv` files
- On file select: parse immediately with a loading spinner
- Show preview: "Found **47 tasks** across **7 buckets** from **Jan 2026 — Mar 2026**"

**Parsing logic:**
- Use the `xlsx` npm package (add to dependencies) to read .xlsx files
- Expected columns (case-insensitive match):
  - `Task Name` → title
  - `Bucket Name` → bucket
  - `Assigned To` → assignees (semicolon-separated full names)
  - `Created Date` → createdAt (MM/DD/YYYY)
  - `Start date` → dateStart (MM/DD/YYYY, may be empty)
  - `Due date` → dateEnd (MM/DD/YYYY, may be empty)
  - `Description` → notes (may be multi-line with markdown)
- If headers don't match: show error "File format not recognized. Please export from Microsoft Planner."

### Step 2 — Client Matching

This is the core of the wizard. Each task needs a client assignment.

**Auto-match logic:**
1. Load all clients from Firestore (`clients` collection)
2. For each task, check if any client name appears in the task title (case-insensitive)
   - Example: "PUBLIX - MAMA MIA" → matches client "Publix"
   - Example: "TARGET - COTTAGE BQTS" → matches client "Target"
   - Example: "WEEKLY ROSES FOR CAROLINA'S HOUSE" → no match
3. Sort results into two groups:
   - **Auto-matched** (green checkmark) — client found in title
   - **Needs assignment** (yellow warning) — no client match

**UI — Client Assignment Table:**

```
┌──────────────────────────────────────────────────────────────────────┐
│  Import History — Assign Clients                                     │
│                                                                      │
│  Auto-matched: 32/47    Needs assignment: 15/47                      │
│  [Show only unassigned ▼]                                            │
│                                                                      │
│  ┌────────────────────────┬─────────────────────┬──────────────────┐ │
│  │ Task Name              │ Bucket              │ Client           │ │
│  ├────────────────────────┼─────────────────────┼──────────────────┤ │
│  │ PUBLIX - MAMA MIA      │ SAMPLES/PRODUCT...  │ ✅ Publix       │ │
│  │ TARGET - COTTAGE BQTS  │ SAMPLES/PRODUCT...  │ ✅ Target       │ │
│  │ WEEKLY ROSES CAROLINA  │ EVENTS/DONATIONS    │ [Select client ▼]│ │
│  │ MARAY                  │ IN HOUSE MEETING    │ [Select client ▼]│ │
│  │ DALLAS CENTERPIECES    │ EVENTS/DONATIONS    │ [Select client ▼]│ │
│  └────────────────────────┴─────────────────────┴──────────────────┘ │
│                                                                      │
│  [Back]                                    [Import 47 tasks →]       │
└──────────────────────────────────────────────────────────────────────┘
```

**Client dropdown behavior:**
- EXACT same dropdown as NewTaskModal's client selector
- Shows all active clients alphabetically
- Last option: `+ New Client` — opens inline input, creates client in Firestore, auto-selects it
- User can also override auto-matched clients by clicking on them
- "Import" button is disabled until ALL tasks have a client assigned

**Bulk assign:**
- If multiple tasks share the same unmatched pattern (e.g., 5 tasks with "WEEKLY ROSES"),
  show a "Apply to similar" checkbox that assigns the same client to all of them

### Step 3 — Confirm & Import

**UI:**
- Summary card:
  ```
  Ready to import 47 historical tasks

  Period: Jan 2026 — Mar 2026
  Clients: 12
  Buckets: 7
  Team members: 6

  ⚠ This data will appear in Analytics as historical records.
  It will NOT create active tasks on any board.

  [Cancel]    [Import]
  ```
- On "Import": show progress bar, write to Firestore, show success toast

### Step 4 — Done

- "✅ 47 historical tasks imported successfully"
- "View in Analytics →" button that navigates to the new Historical Analytics page

---

## Phase 2: Firestore Schema

### New collection: `historicalTasks`

```typescript
interface HistoricalTask {
  id: string                    // auto-generated
  title: string                 // Task Name from Planner
  clientId: string              // assigned client (from wizard)
  clientName: string            // denormalized for fast queries
  bucket: string                // Bucket Name from Planner
  assigneeNames: string[]       // ["Carlos Manuel Salazar Coelho", "Evelyn Espinoza"]
  dateStart: Timestamp | null   // Start date
  dateEnd: Timestamp | null     // Due date
  createdAt: Timestamp          // Created Date from Planner
  notes: string                 // Description (truncated to 2000 chars)
  source: 'planner'             // origin system (for future: 'trello', 'asana', etc.)
  importedAt: Timestamp         // when it was imported
  importedBy: string            // uid of who imported
  importBatchId: string         // groups tasks from same import session
  year: number                  // derived from dateEnd or createdAt (for fast filtering)
  month: number                 // 1-12, derived from dateEnd or createdAt
}
```

### New collection: `importBatches`

```typescript
interface ImportBatch {
  id: string
  fileName: string              // original file name
  taskCount: number
  dateRange: {
    earliest: Timestamp
    latest: Timestamp
  }
  importedAt: Timestamp
  importedBy: string
  source: 'planner'
}
```

### Firestore rules addition:

```
// Historical tasks (read all active users, write admin/owner only)
match /historicalTasks/{taskId} {
  allow read: if isActiveUser();
  allow write: if isAdmin();
}

match /importBatches/{batchId} {
  allow read: if isActiveUser();
  allow write: if isAdmin();
}
```

### Firebase saturation analysis:
- 47 tasks = 47 documents, each ~1-3 KB = ~100 KB total
- Even 1000 historical tasks = ~2 MB — well within free tier (1 GB)
- Reads: analytics page loads once, caches locally — minimal read ops
- NO real-time subscriptions needed — use `getDocs()` one-shot queries

---

## Phase 3: Analytics Views

### 3A — Restructure Analytics Page

Current Analytics page has basic stats. Restructure into tabbed layout:

```
┌─────────────────────────────────────────────────────────┐
│  Analytics                                               │
│                                                          │
│  [Current]  [Historical]  [Annual Report]                │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Tab 1: Current** — existing analytics (tasks by status, by assignee, etc.) from live tasks

**Tab 2: Historical** — imported Planner data (new)

**Tab 3: Annual Report** — combined view with PDF export (existing, enhanced)

---

### 3B — Historical Analytics Tab

**Filters bar (top):**
```
Year: [2025 ▼] [2026 ▼]    Client: [All ▼]    Bucket: [All ▼]    Source: [Planner ▼]
```

**Section 1: Summary Cards (horizontal row)**
```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│   Total Tasks │ │    Clients   │ │   Buckets    │ │ Team Members │
│      47       │ │      12      │ │       7      │ │      6       │
│  ↗ vs prev yr │ │              │ │              │ │              │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

**Section 2: Tasks by Month (Bar Chart — Recharts)**
- X axis: months (Jan, Feb, Mar, ...)
- Y axis: task count
- Stacked bars by bucket (each bucket a different color)
- Tooltip: "March 2026: 18 tasks — Samples: 8, FedEx: 4, Shows: 3, ..."

**Section 3: Tasks by Client (Horizontal Bar Chart)**
- Y axis: client names (sorted by count descending)
- X axis: task count
- Color: board green (#1D9E75)
- Truncate long names > 18 chars with "..."
- Tooltip shows full name + count

**Section 4: Tasks by Bucket (Donut/Pie Chart)**
- Each bucket gets a distinct color
- Legend on the right
- Center text: total count

**Section 5: Team Workload (Horizontal Bar Chart)**
- Y axis: team member names
- X axis: number of tasks assigned
- Note: one task can appear for multiple assignees

**Section 6: Tasks Table (collapsible)**
- Sortable columns: Task, Client, Bucket, Assignees, Start, Due, Created
- Search/filter input
- Paginated (20 per page)
- Click row → expand to show Description
- No edit capability — read-only historical data

---

### 3C — Enhanced Annual Report Tab

Merge current + historical data into unified annual view:

```
Year: [2026 ▼]

┌─────────────────────────────────────────────────────────┐
│                    2026 Annual Summary                    │
│                                                          │
│  NPD Planner Tasks:  ███████████████████░░░  156         │
│  Historical Tasks:   ████████░░░░░░░░░░░░░   47         │
│  Total:              ███████████████████████  203         │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │          Monthly Activity (Combined)                 │ │
│  │  ▐▐                                                 │ │
│  │  ▐▐  ▐▐                                             │ │
│  │  ▐▐  ▐▐  ▐▐                                        │ │
│  │  Jan  Feb  Mar  Apr  May  Jun  Jul  Aug  Sep  ...   │ │
│  │  ■ NPD Planner  ■ Historical (Planner)              │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  [Export PDF]  [Export CSV]                               │
└─────────────────────────────────────────────────────────┘
```

---

## Phase 4: Implementation Files

### New files to create:

```
src/renderer/src/components/settings/ImportHistoryPanel.tsx   ← Import wizard (Steps 1-4)
src/renderer/src/components/analytics/HistoricalAnalytics.tsx ← Historical tab content
src/renderer/src/components/analytics/AnalyticsTabs.tsx       ← Tab navigation wrapper
src/renderer/src/hooks/useHistoricalTasks.ts                  ← Firestore queries for historical data
src/renderer/src/lib/plannerImporter.ts                       ← Excel parsing + client matching logic
```

### Files to modify:

```
src/renderer/src/pages/SettingsPage.tsx       ← Add "Import History" tab
src/renderer/src/pages/AnalyticsPage.tsx      ← Restructure into tabs
src/renderer/src/lib/firestore.ts             ← Add historicalTasks CRUD
src/renderer/src/types/index.ts               ← Add HistoricalTask, ImportBatch interfaces
package.json                                  ← Add "xlsx" dependency
firestore.rules                               ← Add historicalTasks rules
```

### Dependencies to add:

```bash
npm install xlsx
```

The `xlsx` package (SheetJS) handles both .xlsx and .csv parsing in the browser.
It's already widely used and has no native dependencies — works in Electron renderer.

---

## Phase 5: Implementation Order

### Prompt 1 — Types + Firestore + Parser
1. Add `HistoricalTask` and `ImportBatch` interfaces to `types/index.ts`
2. Add Firestore functions in `firestore.ts`:
   - `createHistoricalTasks(tasks: HistoricalTask[]): Promise<void>` (batch write)
   - `createImportBatch(batch: ImportBatch): Promise<string>`
   - `getHistoricalTasks(filters: { year?: number, clientId?: string }): Promise<HistoricalTask[]>`
   - `getImportBatches(): Promise<ImportBatch[]>`
   - `deleteImportBatch(batchId: string): Promise<void>` (deletes batch + all its tasks)
3. Create `plannerImporter.ts`:
   - `parsePlannerExport(file: File): Promise<RawPlannerTask[]>`
   - `autoMatchClients(tasks: RawPlannerTask[], clients: Client[]): MatchResult[]`
   - Interface `RawPlannerTask`: { title, bucket, assigneeNames, createdAt, dateStart, dateEnd, notes }
   - Interface `MatchResult`: { task: RawPlannerTask, clientId: string | null, clientName: string | null, confidence: 'auto' | 'none' }
4. Install xlsx: `npm install xlsx`

### Prompt 2 — Import Wizard UI
1. Create `ImportHistoryPanel.tsx` with 4 steps:
   - Step 1: File upload + parse preview
   - Step 2: Client matching table with dropdown (reuse client selector from NewTaskModal)
   - Step 3: Confirm summary
   - Step 4: Done with link to analytics
2. Add "Import History" tab to SettingsPage.tsx (admin/owner only)
3. Create `useHistoricalTasks.ts` hook

### Prompt 3 — Analytics Views
1. Create `AnalyticsTabs.tsx` wrapper with [Current] [Historical] [Annual Report] tabs
2. Create `HistoricalAnalytics.tsx` with:
   - Summary cards
   - Tasks by Month (stacked bar chart)
   - Tasks by Client (horizontal bar)
   - Tasks by Bucket (donut chart)
   - Team Workload (horizontal bar)
   - Tasks data table (sortable, searchable, paginated)
3. Restructure `AnalyticsPage.tsx` to use tabs

### Prompt 4 — Annual Report Enhancement + Polish
1. Update Annual Report tab to merge current + historical data
2. Update PDF export to include historical data
3. Add "Delete import batch" option in Settings (admin only)
4. Update firestore.rules
5. Run `npm run typecheck`

---

## UI/UX Guidelines

- Use existing color palette from CLAUDE.md
- Charts use Recharts (already installed)
- Client dropdown MUST be identical to NewTaskModal — same component, same behavior
- All text in English (same as rest of app)
- Dark mode must work on all new views
- Loading states: skeleton loaders on analytics, spinner on import
- Error states: clear messages, retry buttons
- Empty states: "No historical data imported yet. Go to Settings → Import History to get started."

## Client Auto-Match Algorithm

```typescript
function autoMatchClients(tasks: RawPlannerTask[], clients: Client[]): MatchResult[] {
  return tasks.map(task => {
    const titleUpper = task.title.toUpperCase()

    // Try exact client name match in title (longest match first to avoid partial matches)
    const sortedClients = [...clients].sort((a, b) => b.name.length - a.name.length)

    for (const client of sortedClients) {
      if (titleUpper.includes(client.name.toUpperCase())) {
        return {
          task,
          clientId: client.id,
          clientName: client.name,
          confidence: 'auto' as const,
        }
      }
    }

    return {
      task,
      clientId: null,
      clientName: null,
      confidence: 'none' as const,
    }
  })
}
```

## Important Notes

- Historical tasks are READ-ONLY after import — no editing
- Multiple imports are allowed (different files, different date ranges)
- Duplicate detection: if same task title + same date already exists, skip it and show warning
- The `importBatchId` lets us delete an entire import if the user made a mistake
- Assignee names from Planner are stored as strings (not matched to Firebase UIDs) because
  historical assignees may not have accounts in NPD Planner
- Year/month fields are denormalized for fast Firestore queries (avoid complex date filtering)
