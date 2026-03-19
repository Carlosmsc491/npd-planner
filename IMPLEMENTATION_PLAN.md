# NPD Planner — Implementation Plan for Kimi Agent

> **MANDATORY:** Read `CLAUDE.md` and `README.md` fully before writing any code.
> Verify each step compiles and runs before moving to the next.
> Never use `any` in TypeScript. Never hardcode credentials.
> Run `npm run typecheck` after every change to validate types.

---

## CRITICAL RULE
Run this before starting and after EVERY change:
```powershell
npm run typecheck
```
If it fails, fix it before proceeding. Do NOT move to the next step with type errors.

---

## STEP 0 — Firebase ✅ ALREADY DONE

Firebase indexes and security rules have already been deployed. Skip this step entirely. Start at STEP 1.

---

## STEP 1 — Fix Scrolling Text Editors

### Problem
The TipTap rich-text editor toolbar scrolls out of view when the user scrolls within the TaskPage modal. The toolbar should stick to the top of the editor container.

### Files to Edit
- `src/renderer/src/components/task/RichTextEditor.tsx`

### What to Change

**1a. Make the toolbar sticky inside the editor container.**

In `RichTextEditor.tsx`, find the outer editor wrapper (the `div` at line ~219 with class `rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden focus-within:border-green-500`).

Change `overflow-hidden` to `overflow-visible` on that outer wrapper so sticky positioning works correctly. Then add `sticky top-0 z-10` plus background classes to the toolbar container (`div` at line ~75).

**Before (line ~75):**
```tsx
<div className="flex items-center gap-0.5 px-2 py-1 border-b border-gray-200 dark:border-gray-700 flex-wrap">
```

**After:**
```tsx
<div className="flex items-center gap-0.5 px-2 py-1 border-b border-gray-200 dark:border-gray-700 flex-wrap sticky top-0 z-10 bg-white dark:bg-gray-800 rounded-t-lg">
```

**Before (line ~219 outer wrapper):**
```tsx
<div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden focus-within:border-green-500">
```

**After:**
```tsx
<div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-visible focus-within:border-green-500">
```

**1b. Add max height + internal scroll to the editor content area** so the editor itself doesn't grow unboundedly and push things down.

Find the `EditorContent` wrapper (`div` containing `<EditorContent>`), add `max-h-[300px] overflow-y-auto` to keep it bounded. If there is no wrapping div, add one.

**Before (around line ~218):**
```tsx
<EditorContent editor={editor} />
```

**After:**
```tsx
<div className="max-h-[300px] overflow-y-auto">
  <EditorContent editor={editor} />
</div>
```

**Verify:** Run `npm run typecheck`. Open a task in Planner, scroll within the modal — toolbar should stay visible.

---

## STEP 2 — My Space: Replace Grid with Tabs (Remove Notes, Keep Tasks/Calendar/Links)

### Problem
My Space shows 4 panels in a grid simultaneously. User wants tabs to switch between views, removing PersonalNotes.

### Files to Edit
- `src/renderer/src/pages/MySpacePage.tsx`

### Current Structure (do NOT break existing components)
The page currently renders a grid with:
- `PersonalNotes` — **REMOVE this from the tab system**
- `PersonalTasks` — keep as "Tasks" tab
- `PersonalCalendar` — keep as "Calendar" tab
- `QuickLinks` — keep as "Links" tab

All subscriptions and data hooks at the top of the file must stay intact.

### What to Change

Replace the grid `<div className="grid grid-cols-1 lg:grid-cols-5 gap-6">` and everything inside it with a tabbed layout.

**New JSX structure** (replace the return JSX, keep all hooks and state above it):

```tsx
// At the top of the component, add tab state:
const [activeTab, setActiveTab] = useState<'tasks' | 'calendar' | 'links'>('tasks')

// Replace the grid with:
return (
  <AppLayout>
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">My Space</h1>
      </div>

      {/* Tab Bar */}
      <div className="flex-shrink-0 flex gap-1 px-6 pt-3 border-b border-gray-200 dark:border-gray-700">
        {(
          [
            { id: 'tasks', label: 'My Tasks' },
            { id: 'calendar', label: 'My Calendar' },
            { id: 'links', label: 'Quick Links' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-green-500 text-green-600 dark:text-green-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'tasks' && (
          <div className="h-full overflow-y-auto p-6">
            <PersonalTasks
              tasks={personalTasks}
              onAdd={handleAddPersonalTask}
              onToggle={handleTogglePersonalTask}
              onDelete={handleDeletePersonalTask}
            />
          </div>
        )}
        {activeTab === 'calendar' && (
          <div className="h-full overflow-hidden p-6">
            <PersonalCalendar
              boardTasks={myBoardTasks}
              personalTasks={personalTasks}
              boards={boards}
              onBoardTaskClick={(task) => setSelectedTask(task)}
              onPersonalTaskClick={(task) => setSelectedPersonalTask(task)}
            />
          </div>
        )}
        {activeTab === 'links' && (
          <div className="h-full overflow-y-auto p-6">
            <QuickLinks
              links={quickLinks}
              onAdd={handleAddLink}
              onDelete={handleDeleteLink}
            />
          </div>
        )}
      </div>

      {/* Task detail modal — keep exactly as is */}
      {selectedTask && ( ... existing modal code ... )}
    </div>
  </AppLayout>
)
```

**Important:** Do NOT remove any hook calls, subscriptions, or state that was already there. Only change the JSX return. Keep the `PersonalNotes` subscription if it exists so it doesn't break — just don't render it.

**Verify:** Run `npm run typecheck`. My Space should show 3 tabs, clicking each switches the view.

---

## STEP 3 — My Calendar: Add Month/Week/Day View Switcher

### Problem
`PersonalCalendar` only shows month view with no way to switch to week/day.

### Files to Edit
- `src/renderer/src/components/myspace/PersonalCalendar.tsx`

### Current State
- Uses `dayGridPlugin` and `timeGridPlugin`
- No view switcher UI

### What to Change

**3a.** Add local state for current view:
```tsx
const [currentView, setCurrentView] = useState<'dayGridMonth' | 'timeGridWeek' | 'timeGridDay'>('dayGridMonth')
```

**3b.** Add a view switcher UI above the FullCalendar component:
```tsx
<div className="flex items-center justify-between mb-3">
  <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
    {([
      { key: 'dayGridMonth', label: 'Month' },
      { key: 'timeGridWeek', label: 'Week' },
      { key: 'timeGridDay', label: 'Day' },
    ] as const).map(({ key, label }) => (
      <button
        key={key}
        onClick={() => {
          setCurrentView(key)
          calRef.current?.getApi().changeView(key)
        }}
        className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
          currentView === key
            ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
        }`}
      >
        {label}
      </button>
    ))}
  </div>
</div>
```

**3c.** Update FullCalendar props:
```tsx
<FullCalendar
  ref={calRef}
  plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
  initialView={currentView}
  headerToolbar={{ left: 'prev,next', center: 'title', right: '' }}
  height="100%"
  events={events}
  eventContent={(arg) => (
    <div className="text-xs truncate px-1 py-0.5">{arg.event.title}</div>
  )}
  eventClick={handleEventClick}
  // ... keep existing event handlers
/>
```

**Important:** Add `interactionPlugin` import if not present: `import interactionPlugin from '@fullcalendar/interaction'`

**Verify:** Run `npm run typecheck`. My Calendar tab shows Month/Week/Day buttons.

---

## STEP 4 — Master Calendar: Add + Button on Day Hover

### Problem
The Master Calendar (`src/renderer/src/pages/CalendarPage.tsx`) has no + button on day hover to create tasks.

### Files to Edit
- `src/renderer/src/pages/CalendarPage.tsx`
- `src/renderer/src/components/ui/NewTaskModal.tsx` (verify it accepts `defaultDate` prop — check if it does, if not add it)

### Current State
CalendarPage has NO `dayCellContent`, NO `dateClick`, NO `NewTaskModal` import.
The `NewTaskModal` requires a `board: Board` prop (the board is predetermined — no selector inside the modal).

### What to Add

**4a.** Add state to CalendarPage:
```tsx
const [newTaskDate, setNewTaskDate] = useState<Date | null>(null)
const [showBoardPicker, setShowBoardPicker] = useState(false)
const [pendingDate, setPendingDate] = useState<Date | null>(null)
const [selectedBoardForNew, setSelectedBoardForNew] = useState<Board | null>(null)
```

**4b.** Add imports:
```tsx
import NewTaskModal from '../components/ui/NewTaskModal'
```

**4c.** Add `dayCellContent` callback to FullCalendar (the Master Calendar FullCalendar component):
```tsx
dayCellContent={(arg) => (
  <div className="group/day relative flex items-center justify-between w-full px-1">
    <span className="text-sm">{arg.dayNumberText}</span>
    <button
      onMouseDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setPendingDate(arg.date)
        setShowBoardPicker(true)
      }}
      className="hidden group-hover/day:flex h-5 w-5 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-300 hover:bg-green-500 hover:text-white text-xs font-bold transition-colors"
    >
      +
    </button>
  </div>
)}
```

**4d.** Add Board Picker modal JSX at the bottom of the return statement:
```tsx
{/* Board Picker */}
{showBoardPicker && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-2xl w-80">
      <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
        Select Board
      </h3>
      <div className="space-y-2">
        {boards.map((board) => (
          <button
            key={board.id}
            onClick={() => {
              setSelectedBoardForNew(board)
              setNewTaskDate(pendingDate)
              setShowBoardPicker(false)
            }}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
          >
            <span
              className="h-3 w-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: board.color }}
            />
            <span className="text-sm text-gray-800 dark:text-gray-200">{board.name}</span>
          </button>
        ))}
      </div>
      <button
        onClick={() => { setShowBoardPicker(false); setPendingDate(null) }}
        className="mt-4 w-full text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400"
      >
        Cancel
      </button>
    </div>
  </div>
)}

{/* New Task Modal */}
{newTaskDate && selectedBoardForNew && user && (
  <NewTaskModal
    board={selectedBoardForNew}
    defaultDate={newTaskDate}
    currentUserId={user.uid}
    onClose={() => {
      setNewTaskDate(null)
      setSelectedBoardForNew(null)
    }}
  />
)}
```

**4e.** Check `NewTaskModal` props interface. If `defaultDate?: Date` prop does not exist:
- Add `defaultDate?: Date` to its Props interface
- Use it to pre-fill `dateStart` in the task creation: `dateStart: defaultDate ? Timestamp.fromDate(defaultDate) : null`

**Verify:** Run `npm run typecheck`. Hovering over a day in Master Calendar shows +. Clicking it opens board picker, then NewTaskModal.

---

## STEP 5 — Planner: Multiple PO Numbers

### Problem
The Planner Order Status section only allows one PO/Order #. User wants to add multiple POs like AWBs.

### Files to Edit
1. `src/renderer/src/types/index.ts` — add `poNumbers` field
2. `src/renderer/src/components/task/OrderStatusSection.tsx` — update UI
3. `src/renderer/src/components/task/TaskPage.tsx` — update state/handlers
4. `src/renderer/src/components/ui/NewTaskModal.tsx` — initialize empty array
5. `src/renderer/src/hooks/useSearch.ts` — add search for poNumbers

### 5a. Update Types

**File:** `src/renderer/src/types/index.ts`

Find the `Task` interface. After `poNumber: string`, add:
```typescript
poNumbers: string[]   // additional PO/Order numbers beyond the first
```

This makes it required. Set it to `[]` in all places that create tasks.

### 5b. Update NewTaskModal

**File:** `src/renderer/src/components/ui/NewTaskModal.tsx`

Find the task creation object where `poNumber: ''` is set. Add below it:
```typescript
poNumbers: [],
```

### 5c. Update OrderStatusSection

**File:** `src/renderer/src/components/task/OrderStatusSection.tsx`

The component currently receives `poNumber: string` as a prop. Add a second prop:
```typescript
poNumbers: string[]
onPoNumbersChange: (numbers: string[]) => void
```

**Replace the single PO number display/edit UI** with a list:

```tsx
{/* PO / Order # — multiple entries */}
<div>
  <div className="flex items-center justify-between mb-1">
    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
      P.O. / Order #
    </span>
    <button
      onClick={() => onPoNumbersChange([...allPoNumbers, ''])}
      className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 hover:text-green-700"
      title="Add PO Number"
    >
      <span className="text-base leading-none">+</span>
    </button>
  </div>
  {allPoNumbers.length === 0 ? (
    <button
      onClick={() => onPoNumbersChange([''])}
      className="text-xs text-gray-400 hover:text-green-500 italic"
    >
      + Add P.O. / Order #
    </button>
  ) : (
    <div className="space-y-1">
      {allPoNumbers.map((po, idx) => (
        <div key={idx} className="flex items-center gap-1">
          <input
            type="text"
            value={po}
            onChange={(e) => {
              const updated = [...allPoNumbers]
              updated[idx] = e.target.value
              onPoNumbersChange(updated)
            }}
            onBlur={() => {
              // Remove empty entries except if it's the only one and was just added
              const cleaned = allPoNumbers.filter((p, i) => p.trim() !== '' || i === idx)
              if (cleaned.length !== allPoNumbers.length) onPoNumbersChange(cleaned)
            }}
            placeholder="e.g. PO-12345"
            className="flex-1 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1 text-gray-900 dark:text-white focus:outline-none focus:border-green-500"
          />
          {allPoNumbers.length > 1 && (
            <button
              onClick={() => onPoNumbersChange(allPoNumbers.filter((_, i) => i !== idx))}
              className="text-gray-400 hover:text-red-500 text-xs p-1"
              title="Remove"
            >
              ✕
            </button>
          )}
        </div>
      ))}
    </div>
  )}
</div>
```

**In the component**, compute `allPoNumbers` from both the single `poNumber` and the `poNumbers` array:
```typescript
// Merge single poNumber + array for display (backward compatibility)
const allPoNumbers = useMemo(() => {
  const combined = poNumber ? [poNumber, ...poNumbers] : [...poNumbers]
  return combined.length > 0 ? combined : []
}, [poNumber, poNumbers])
```

Import `useMemo` if not already imported.

### 5d. Update TaskPage

**File:** `src/renderer/src/components/task/TaskPage.tsx`

**Add state for poNumbers array (near line 66):**
```typescript
const [localPoNumbers, setLocalPoNumbers] = useState<string[]>(task.poNumbers ?? [])
```

**Add effect to sync when task changes:**
```typescript
useEffect(() => { setLocalPoNumbers(task.poNumbers ?? []) }, [task.poNumbers])
```

**Add save handler for poNumbers:**
```typescript
function handlePoNumbersChange(numbers: string[]) {
  setLocalPoNumbers(numbers)
  // Keep the first one in poNumber for backward compatibility
  const firstPo = numbers.find(n => n.trim() !== '') ?? ''
  save('poNumbers', numbers, task.poNumbers ?? [])
  if (firstPo !== task.poNumber) {
    save('poNumber', firstPo, task.poNumber)
  }
}
```

**Pass the new props to OrderStatusSection (around line 491):**
```tsx
<OrderStatusSection
  taskId={task.id}
  poNumber={localPoNumber}
  poNumbers={localPoNumbers}
  awbs={localAwbs}
  onPoNumberChange={handlePoNumberChange}
  onPoNumbersChange={handlePoNumbersChange}
  onAwbsChange={handleAwbsChange}
  csvStatus={csvStatus}
/>
```

### 5e. Update Search

**File:** `src/renderer/src/hooks/useSearch.ts`

Find where `poNumber` is in the Fuse.js keys array. Add `poNumbers` after it:
```typescript
{ name: 'poNumbers', weight: 1.5 },
```

### 5f. Update firestore.ts createTask (if it explicitly sets poNumbers)

Search for any `createTask` or task creation functions in `src/renderer/src/lib/firestore.ts`. If they spread task data or explicitly list fields, make sure `poNumbers: []` is included as default.

**Verify:** Run `npm run typecheck`. Open a Planner task → Order Status section shows + button to add more POs. Each PO has an X to remove it.

---

## FINAL VERIFICATION

After completing all steps:

```powershell
npm run typecheck   # must pass with zero errors
npm run dev         # open app, test each feature
```

**Test checklist:**
- [ ] Scrolling within a task modal keeps the editor toolbar visible
- [ ] My Space shows 3 tabs: My Tasks, My Calendar, Quick Links
- [ ] My Calendar has Month/Week/Day switcher buttons
- [ ] Master Calendar shows + on day hover → opens board picker → opens NewTaskModal
- [ ] Planner task Order Status can have multiple PO numbers with + and X
- [ ] No TypeScript errors
- [ ] Existing Planner/Trips/Vacations boards still load normally
- [ ] TipTap editor still works (bold, italic, underline, colors)

---

## Firebase Indexes & Rules — ✅ Already deployed, no action needed.

---

## STEP 6 — Flight Status Panel on Dashboard

### Overview
Add a "Flight Status" section to `DashboardPage` that shows all active AWBs from Planner tasks with real-time computed flight status. Statuses refresh every 60 seconds automatically.

### Status Logic (exact rules)

```
Given: now = current time, eta = AWbEntry.eta parsed as Date, ata = AwbEntry.ata parsed as Date

Arrived  → ata !== null AND ata <= now
Flying   → (ata === null AND eta !== null AND now >= eta - 1h AND now < eta)
           OR (ata !== null AND now >= ata - 1h AND now < ata)
Scheduled → eta !== null AND (eta - now) > 1h  (more than 1 hour until ETA)
Unknown  → no eta and no ata
```

**Delayed modifier** (shown alongside any status): `awb.etaChanged === true`
→ Show inline: `now [current eta] · before [etaHistory[last].previousEta]`

### ETA/ATA Date Parsing
Dates come from CSV as strings like `"03/21/2026"` or `"03/21/2026 14:30"`. Use this parser:
```typescript
function parseFlightDate(val: string | null): Date | null {
  if (!val) return null
  // Try "MM/DD/YYYY HH:mm" first, then "MM/DD/YYYY"
  const parts = val.trim().split(' ')
  const [m, d, y] = parts[0].split('/')
  if (!m || !d || !y) return null
  const [hh, mm] = parts[1] ? parts[1].split(':') : ['0', '0']
  return new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm))
}
```

---

### 6a — Add `guia` field to `AwbEntry`

**File:** `src/renderer/src/types/index.ts`

Find the `AwbEntry` interface and add ONE line after `ata`:

**Before:**
```typescript
export interface AwbEntry {
  id: string
  number: string
  boxes: number
  carrier: string | null
  shipDate: string | null
  eta: string | null
  ata: string | null
  etaChanged: boolean
  lastCheckedAt: Timestamp | null
  etaHistory: EtaHistoryEntry[]
}
```

**After:**
```typescript
export interface AwbEntry {
  id: string
  number: string
  boxes: number
  carrier: string | null
  shipDate: string | null
  eta: string | null
  ata: string | null
  guia: string | null        // house AWB / local tracking guide number
  etaChanged: boolean
  lastCheckedAt: Timestamp | null
  etaHistory: EtaHistoryEntry[]
}
```

Then search the entire codebase for every place that creates an `AwbEntry` object literal (look for `{ id:` near `number:` and `boxes:`). Add `guia: null` to each one.

```bash
# Find all places to update:
grep -r "etaChanged:" src/ --include="*.ts" --include="*.tsx" -l
```

For every file found, add `guia: null,` after `ata: null,` in each AwbEntry creation.

Run `npm run typecheck` — must pass before continuing.

---

### 6b — Add `guia` input to the AWB entry form

**File:** `src/renderer/src/components/task/OrderStatusSection.tsx`

Find the section where each AWB entry is rendered/edited (the input for `number`, `boxes`, `carrier`, `eta`, `ata`). Add a guia input field in the same row or below ATA:

```tsx
{/* Guia input — add after the ATA input */}
<input
  type="text"
  value={awb.guia ?? ''}
  onChange={(e) => {
    const updated = awbs.map((a) =>
      a.id === awb.id ? { ...a, guia: e.target.value || null } : a
    )
    onAwbsChange(updated)
  }}
  onBlur={() => {
    const updated = awbs.map((a) =>
      a.id === awb.id ? { ...a, guia: a.guia?.trim() || null } : a
    )
    onAwbsChange(updated)
  }}
  placeholder="Guía #"
  className="w-28 text-xs rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1 text-gray-900 dark:text-white focus:outline-none focus:border-green-500"
/>
```

Run `npm run typecheck`.

---

### 6c — Create the FlightStatusPanel component

**Create new file:** `src/renderer/src/components/dashboard/FlightStatusPanel.tsx`

```tsx
import { useMemo, useEffect, useState } from 'react'
import { Plane, Clock, CheckCircle2, AlertTriangle } from 'lucide-react'
import type { Task } from '../../types'

// ─── Types ────────────────────────────────────────────────────────────────────

type FlightStatus = 'scheduled' | 'flying' | 'arrived' | 'unknown'

interface FlightRow {
  taskId: string
  boardId: string
  taskTitle: string
  poNumber: string
  awbNumber: string
  guia: string | null
  eta: string | null
  ata: string | null
  status: FlightStatus
  delayed: boolean
  previousEta: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseFlightDate(val: string | null): Date | null {
  if (!val) return null
  const parts = val.trim().split(' ')
  const [m, d, y] = parts[0].split('/')
  if (!m || !d || !y) return null
  const [hh, mm] = parts[1] ? parts[1].split(':') : ['0', '0']
  return new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm))
}

function computeStatus(eta: string | null, ata: string | null): FlightStatus {
  const now = new Date()
  const etaDate = parseFlightDate(eta)
  const ataDate = parseFlightDate(ata)

  // Arrived: ATA exists and has passed
  if (ataDate && ataDate <= now) return 'arrived'

  // Prefer ATA for flying check if it's in the future, else fall back to ETA
  const refDate = ataDate ?? etaDate
  if (!refDate) return 'unknown'

  const diffMs = refDate.getTime() - now.getTime()
  const diffHours = diffMs / (1000 * 60 * 60)

  if (diffHours <= 0) return 'arrived'       // ref time passed
  if (diffHours <= 1) return 'flying'        // within 1 hour
  return 'scheduled'                          // more than 1 hour away
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: FlightStatus }) {
  if (status === 'arrived') return (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 text-xs font-medium">
      <CheckCircle2 size={11} /> Arrived
    </span>
  )
  if (status === 'flying') return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 text-xs font-medium animate-pulse">
      <Plane size={11} /> Flying
    </span>
  )
  if (status === 'scheduled') return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 text-xs font-medium">
      <Clock size={11} /> Scheduled
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-400 px-2 py-0.5 text-xs font-medium">
      —
    </span>
  )
}

// ─── Sort order ───────────────────────────────────────────────────────────────

const STATUS_ORDER: Record<FlightStatus, number> = {
  flying: 0,
  scheduled: 1,
  arrived: 2,
  unknown: 3,
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  tasks: Task[]
  onTaskClick: (boardId: string) => void
}

export default function FlightStatusPanel({ tasks, onTaskClick }: Props) {
  // Tick every 60s to re-compute statuses
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  const rows = useMemo<FlightRow[]>(() => {
    const result: FlightRow[] = []
    for (const task of tasks) {
      if (!task.awbs || task.awbs.length === 0) continue
      for (const awb of task.awbs) {
        if (!awb.eta && !awb.ata) continue  // skip AWBs with no dates
        const status = computeStatus(awb.eta, awb.ata)
        // Don't show arrived flights from before today
        if (status === 'arrived') {
          const ataDate = parseFlightDate(awb.ata)
          if (ataDate) {
            const now = new Date()
            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
            if (ataDate < todayStart) continue
          }
        }
        const lastHistory = awb.etaHistory?.length > 0
          ? awb.etaHistory[awb.etaHistory.length - 1]
          : null
        result.push({
          taskId: task.id,
          boardId: task.boardId,
          taskTitle: task.title,
          poNumber: task.poNumber,
          awbNumber: awb.number,
          guia: awb.guia ?? null,
          eta: awb.eta,
          ata: awb.ata,
          status,
          delayed: awb.etaChanged,
          previousEta: lastHistory?.previousEta ?? null,
        })
      }
    }
    return result.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
  }, [tasks])  // tick not in deps — re-sort only when tasks change; status badge re-renders via tick

  if (rows.length === 0) return null

  return (
    <div className="mb-8">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3 flex items-center gap-2">
        <Plane size={13} />
        Flight Status
      </h2>
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60">
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wide">Task</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wide">PO</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wide">AWB</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wide">Guía</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wide">Status</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wide">Scheduled</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={`${row.taskId}-${row.awbNumber}`}
                onClick={() => onTaskClick(row.boardId)}
                className={`cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors ${
                  i < rows.length - 1 ? 'border-b border-gray-100 dark:border-gray-700/50' : ''
                }`}
              >
                <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-gray-100 max-w-[180px] truncate">{row.taskTitle}</td>
                <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 text-xs">{row.poNumber || '—'}</td>
                <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300 font-mono text-xs">{row.awbNumber}</td>
                <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 text-xs">{row.guia || '—'}</td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-col gap-0.5">
                    <StatusBadge status={row.status} />
                    {row.delayed && row.previousEta && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
                        <AlertTriangle size={9} />
                        now {row.eta} · before {row.previousEta}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400">
                  {row.ata ? `ATA ${row.ata}` : row.eta ? `ETA ${row.eta}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

Run `npm run typecheck`.

---

### 6d — Add FlightStatusPanel to DashboardPage

**File:** `src/renderer/src/pages/DashboardPage.tsx`

**Add import at the top:**
```tsx
import FlightStatusPanel from '../components/dashboard/FlightStatusPanel'
```

**Add inside the component, right after the stats computation (before `return`):**
```tsx
// Tasks with at least one AWB that has ETA or ATA — from ALL boards, not just planner
const flightTasks = allTasks.filter(
  (t) => !t.completed && t.awbs?.some((a) => a.eta || a.ata)
)
```

**Add inside the JSX, between the stats grid and the boards section:**
```tsx
{/* Flight Status — insert between stats grid and boards */}
<FlightStatusPanel
  tasks={flightTasks}
  onTaskClick={(boardId) => navigate(`/board/${boardId}`)}
/>
```

The full JSX order should be:
1. Header (greeting)
2. Stats grid
3. **← FlightStatusPanel here (new)**
4. Boards quick access
5. Assigned to Me

Run `npm run typecheck`. Open dashboard — if any tasks have AWBs with ETA/ATA set, the panel appears. Flying rows pulse blue.

---

### 6e — Verify the `tick` re-render works

Inside `FlightStatusPanel`, the `setTick` interval forces a component re-render every 60s so status badges update in real time without needing a page refresh. Confirm the `useEffect` cleanup (`clearInterval`) is present to avoid memory leaks on unmount.

---

### Final Check for STEP 6

```powershell
npm run typecheck   # zero errors
npm run dev
```

**Test checklist:**
- [ ] `AwbEntry` has `guia: string | null` — TypeScript compiles cleanly
- [ ] Guia input appears in the AWB section of a task
- [ ] Dashboard shows "Flight Status" section when tasks with AWBs exist
- [ ] A task with ETA 1+ hours from now → **Scheduled** badge (gray)
- [ ] A task with ETA within 1 hour → **Flying** badge (blue, pulsing)
- [ ] A task where ATA has passed → **Arrived** badge (green)
- [ ] A task with `etaChanged: true` shows amber "now X · before Y" line
- [ ] Clicking a row navigates to the board

---

## Do NOT Touch

- `src/main/index.ts` — Electron main process (already fixed)
- `src/renderer/src/lib/firebase.ts` — Firebase init (already fixed)
- `src/renderer/src/main.tsx` — Uses HashRouter (already fixed)
- `electron.vite.config.ts` — Build config (already fixed)
- `.env` — Firebase credentials (already fixed)
- `firestore.rules` — Already updated (only needs deployment)
- `firestore.indexes.json` — Already updated (only needs deployment)
