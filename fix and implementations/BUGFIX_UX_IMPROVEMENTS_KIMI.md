# NPD PLANNER — BUGFIX + UX IMPROVEMENTS
# 1 Bug + 3 UX Features
# ═══════════════════════════════════════════════════════════════
# Dale a Kimi el archivo KIMI_READ_FIRST.md antes de este.
# Ejecuta los prompts en orden. typecheck después de cada uno.
# ═══════════════════════════════════════════════════════════════


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT BUGFIX-1 — Fix date off-by-one (selected 20 → saves as 19)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read CLAUDE.md completely before starting.

BUG: When a user selects a date (e.g. March 20) in any date picker
(NewTaskModal, TaskPage date inputs, Calendar date click), the saved
date in Firestore ends up as March 19. One day behind.

ROOT CAUSE: The `<input type="date">` returns a string like "2026-03-20".
When you do `new Date("2026-03-20")`, JavaScript parses it as UTC midnight
(2026-03-20T00:00:00Z). But `toFirestoreDate()` in `dateUtils.ts` then
calls `date.getFullYear()`, `date.getMonth()`, `date.getDate()` — these
are LOCAL time methods. If the user's timezone is behind UTC (e.g. EST = UTC-5),
the local date of UTC midnight March 20 is actually March 19 at 7:00 PM.

EXISTING CODE in `src/renderer/src/utils/dateUtils.ts`:
```typescript
export function toFirestoreDate(date: Date): Timestamp {
  const d = new Date(Date.UTC(
    date.getFullYear(),   // ← LOCAL year — wrong if Date was parsed from UTC string
    date.getMonth(),      // ← LOCAL month
    date.getDate(),       // ← LOCAL day — this is the bug
    12, 0, 0, 0,
  ))
  return Timestamp.fromDate(d)
}
```

The intent of UTC noon is correct (prevent timezone shift), but the input
`date` is already offset when it comes from `new Date("YYYY-MM-DD")`.

FIX: There are TWO call patterns to handle:

PATTERN A — From `<input type="date">` (string → Date → Timestamp):
This happens in TaskPage.tsx `handleDateChange`:
```typescript
const ts = value ? toFirestoreDate(new Date(value)) : null
```
When `value` is "2026-03-20", `new Date("2026-03-20")` = UTC midnight.
Then `toFirestoreDate` reads local getters → off by one.

PATTERN B — From FullCalendar (Date object from event):
Calendar drag/drop/click passes a `Date` object that's already local time.
These are typically correct because the Date was created locally, not parsed.

FIX APPROACH: Parse the date string directly in the call site, NOT via
`new Date(string)`. Create a helper:

File: `src/renderer/src/utils/dateUtils.ts`

Add a new function:
```typescript
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
```

Then update ALL places where `<input type="date">` values are converted:

File: `src/renderer/src/components/task/TaskPage.tsx`

Find `handleDateChange`:
```typescript
async function handleDateChange(field: 'dateStart' | 'dateEnd', value: string) {
  const ts = value ? toFirestoreDate(new Date(value)) : null  // ← BUG
  await save(field, ts, task[field])
}
```

Replace with:
```typescript
async function handleDateChange(field: 'dateStart' | 'dateEnd', value: string) {
  const ts = value ? dateStringToTimestamp(value) : null  // ← FIX
  await save(field, ts, task[field])
}
```

Import `dateStringToTimestamp` from `../../utils/dateUtils`.

File: `src/renderer/src/components/ui/NewTaskModal.tsx`

Find where `defaultDate` is converted. Currently:
```typescript
const dateTs = defaultDate ? toFirestoreDate(defaultDate) : null
```
This is PATTERN B (Date object from calendar) — `toFirestoreDate` is CORRECT
here because `defaultDate` is a local Date, not a UTC-parsed string.
Leave this as-is.

BUT check if NewTaskModal also has any `<input type="date">` fields.
If it does, apply the same fix (use `dateStringToTimestamp` for string values).

Search the entire codebase for other places:
```bash
grep -rn "toFirestoreDate(new Date(" src/ --include="*.tsx" --include="*.ts"
```

Every result where the argument is `new Date(stringValue)` from an input
needs to be replaced with `dateStringToTimestamp(stringValue)`.

Leave calendar/FullCalendar calls to `toFirestoreDate(event.start)` as-is
(those are local Date objects, not parsed from strings).

Also verify `timestampToDateInput` (the reverse function) is correct:
```typescript
export function timestampToDateInput(ts: Timestamp | null): string {
  if (!ts) return ''
  const d = ts.toDate()
  const y = d.getUTCFullYear()      // ← Using UTC getters — CORRECT
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
```
This uses UTC getters to read the stored UTC noon date — correct.

Run `npm run typecheck` — must pass.
Test: Select March 20 in a date picker → verify Firestore stores March 20,
and the input shows March 20 when reopened.
Commit: "fix: date off-by-one caused by timezone offset on date string parsing"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT UX-1 — Drag-to-scroll on board Cards view background
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read CLAUDE.md completely before starting.

Add drag-to-scroll to the Cards view (gallery/kanban). When the user
clicks and drags on empty background space (not on a task card or button),
the board should scroll horizontally. Like grabbing and panning a canvas.

File: `src/renderer/src/components/board/BoardView.tsx`

The board container is currently:
```tsx
<div className="flex gap-4 overflow-x-auto pb-4 px-6 pt-4 h-full">
```

Add a custom hook or inline logic for drag-to-scroll:

1. Create a ref for the scroll container:
```typescript
const scrollRef = useRef<HTMLDivElement>(null)
```

2. Add mousedown/mousemove/mouseup logic that only triggers
   when the user clicks directly on the background (not on a child element
   that handles its own clicks). The key: check `e.target === e.currentTarget`
   or check if the target has no interactive parent.

Approach — use a custom hook `useDragScroll`:

Create `src/renderer/src/hooks/useDragScroll.ts`:

```typescript
import { useRef, useEffect, useCallback } from 'react'

/**
 * Enables click-and-drag horizontal scrolling on a container.
 * Only activates when the user clicks on empty space (background),
 * not on interactive children (buttons, cards, inputs, links).
 */
export function useDragScroll() {
  const ref = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const startX = useRef(0)
  const scrollLeft = useRef(0)

  const isInteractiveElement = useCallback((el: HTMLElement): boolean => {
    // Walk up from target to container — if we hit an interactive element, don't drag
    let current: HTMLElement | null = el
    const container = ref.current
    while (current && current !== container) {
      const tag = current.tagName.toLowerCase()
      if (
        tag === 'button' || tag === 'a' || tag === 'input' ||
        tag === 'textarea' || tag === 'select' ||
        current.getAttribute('role') === 'button' ||
        current.draggable ||
        current.dataset.noDragScroll !== undefined
      ) {
        return true
      }
      current = current.parentElement
    }
    return false
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const onMouseDown = (e: MouseEvent) => {
      // Only left-click
      if (e.button !== 0) return
      // Don't activate if clicking on an interactive element
      if (isInteractiveElement(e.target as HTMLElement)) return

      isDragging.current = true
      startX.current = e.pageX - el.offsetLeft
      scrollLeft.current = el.scrollLeft
      el.style.cursor = 'grabbing'
      el.style.userSelect = 'none'
    }

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      e.preventDefault()
      const x = e.pageX - el.offsetLeft
      const walk = (x - startX.current) * 1.5  // scroll speed multiplier
      el.scrollLeft = scrollLeft.current - walk
    }

    const onMouseUp = () => {
      if (!isDragging.current) return
      isDragging.current = false
      el.style.cursor = ''
      el.style.userSelect = ''
    }

    el.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)

    return () => {
      el.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [isInteractiveElement])

  return ref
}
```

3. Use it in BoardView.tsx:

```typescript
import { useDragScroll } from '../../hooks/useDragScroll'

export default function BoardView({ ... }: Props) {
  const scrollRef = useDragScroll()
  // ...

  return (
    <div
      ref={scrollRef}
      className="flex gap-4 overflow-x-auto pb-4 px-6 pt-4 h-full cursor-grab"
    >
      {/* ...columns... */}
    </div>
  )
}
```

4. Add `cursor-grab` to the container class (shows grab cursor on hover).
   The hook switches to `grabbing` cursor during drag.

5. IMPORTANT: TaskCards, buttons, links inside columns must NOT trigger
   the drag scroll. The `isInteractiveElement` check handles this by
   walking up the DOM tree. But also add `data-no-drag-scroll` attribute
   to TaskCard's root div as a safety net:
   ```tsx
   <div data-no-drag-scroll className="rounded-xl border ...">
   ```

Run `npm run typecheck` — must pass.
Test: Open Planner Cards view → click and drag on empty gray space between
columns → board scrolls horizontally. Click on a task card → does NOT
trigger scroll, opens task normally.
Commit: "feat: drag-to-scroll on board Cards view background"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT UX-2 — Draggable bucket column headers (reorder columns)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read CLAUDE.md completely before starting.

Allow users to drag bucket column headers to reorder them in Cards view.
When a header is moved, ALL tasks in that bucket move with it.

CURRENT STATE:
- BoardView.tsx groups tasks by `groupBy` field (default: 'bucket')
- Column order comes from `BOARD_BUCKETS` defaults + any extra buckets
- Board type 'planner' has default buckets, but bucket order is not persisted
- BoardColumn.tsx renders each column with header + task cards

WHAT TO BUILD:

1. ADD `bucketOrder` FIELD TO BOARD

   File: `src/renderer/src/types/index.ts`

   Add to the Board interface:
   ```typescript
   export interface Board {
     // ...existing fields...
     bucketOrder?: string[]  // ordered list of bucket names, persisted in Firestore
   }
   ```

2. PERSIST BUCKET ORDER IN FIRESTORE

   File: `src/renderer/src/lib/firestore.ts`

   Add a function:
   ```typescript
   export async function updateBoardBucketOrder(
     boardId: string,
     bucketOrder: string[]
   ): Promise<void> {
     try {
       await updateDoc(doc(db, COLLECTIONS.BOARDS, boardId), { bucketOrder })
     } catch (err) {
       throw new Error(`Failed to update bucket order: ${err}`)
     }
   }
   ```

3. USE BUCKET ORDER IN BOARD VIEW

   File: `src/renderer/src/components/board/BoardView.tsx`

   When `groupBy === 'bucket'` and `board?.bucketOrder` exists, sort
   `visibleGroups` by the order in `board.bucketOrder`:

   ```typescript
   const orderedGroups = useMemo(() => {
     if (groupBy !== 'bucket' || !board?.bucketOrder) return visibleGroups
     const order = board.bucketOrder
     return [...visibleGroups].sort((a, b) => {
       const idxA = order.indexOf(a.key)
       const idxB = order.indexOf(b.key)
       // Items not in order go to the end
       return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB)
     })
   }, [visibleGroups, groupBy, board?.bucketOrder])
   ```

   Use `orderedGroups` in the render instead of `visibleGroups`.

4. ADD DRAG-AND-DROP TO COLUMN HEADERS

   File: `src/renderer/src/components/board/BoardView.tsx`

   Use native HTML drag-and-drop on the column wrapper div:

   ```typescript
   const [draggedBucket, setDraggedBucket] = useState<string | null>(null)
   const [dragOverBucket, setDragOverBucket] = useState<string | null>(null)

   function handleColumnDragStart(bucketKey: string) {
     setDraggedBucket(bucketKey)
   }

   function handleColumnDragOver(e: React.DragEvent, bucketKey: string) {
     e.preventDefault()
     if (bucketKey !== draggedBucket) {
       setDragOverBucket(bucketKey)
     }
   }

   async function handleColumnDrop(targetBucket: string) {
     if (!draggedBucket || draggedBucket === targetBucket || !board) return

     const currentOrder = orderedGroups.map(g => g.key)
     const fromIdx = currentOrder.indexOf(draggedBucket)
     const toIdx = currentOrder.indexOf(targetBucket)
     if (fromIdx === -1 || toIdx === -1) return

     const newOrder = [...currentOrder]
     newOrder.splice(fromIdx, 1)
     newOrder.splice(toIdx, 0, draggedBucket)

     // Persist to Firestore
     await updateBoardBucketOrder(board.id, newOrder)

     setDraggedBucket(null)
     setDragOverBucket(null)
   }

   function handleColumnDragEnd() {
     setDraggedBucket(null)
     setDragOverBucket(null)
   }
   ```

   Wrap each BoardColumn in a draggable div:
   ```tsx
   {orderedGroups.map(({ key, tasks: groupTasks }) => (
     <div
       key={key}
       draggable={groupBy === 'bucket'}
       onDragStart={() => handleColumnDragStart(key)}
       onDragOver={(e) => handleColumnDragOver(e, key)}
       onDrop={() => handleColumnDrop(key)}
       onDragEnd={handleColumnDragEnd}
       className={`transition-transform ${
         dragOverBucket === key ? 'scale-[1.02] ring-2 ring-green-400 ring-opacity-50 rounded-xl' : ''
       } ${draggedBucket === key ? 'opacity-50' : ''}`}
     >
       <BoardColumn ... />
     </div>
   ))}
   ```

5. VISUAL FEEDBACK:
   - Column being dragged: opacity-50
   - Drop target: subtle green ring + slight scale
   - Only enable dragging when groupBy is 'bucket' (other groupings don't make sense to reorder)

6. MAKE COLUMN HEADER THE DRAG HANDLE:
   Modify BoardColumn.tsx to expose a drag handle on the header.
   Add a GripVertical icon (from lucide-react) to the column header,
   visible on hover:

   File: `src/renderer/src/components/board/BoardColumn.tsx`

   In the column header div, add:
   ```tsx
   import { GripVertical } from 'lucide-react'

   <div className="mb-2 flex items-center justify-between px-1 group/header">
     <div className="flex items-center gap-2">
       <GripVertical
         size={12}
         className="text-gray-300 opacity-0 group-hover/header:opacity-100 cursor-grab transition-opacity shrink-0"
       />
       {/* ...existing bucket color dot + name + count... */}
     </div>
     {/* ...existing + button... */}
   </div>
   ```

Run `npm run typecheck` — must pass.
Test: Open Planner Cards view → hover over column header → grab icon appears.
Drag "FedEx" column before "DHL" → columns swap, all tasks stay in their buckets.
Reload → order persists (stored in Firestore on board document).
Commit: "feat: draggable bucket columns to reorder in Cards view"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT UX-3 — Drag-to-reorder tasks within a bucket column
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read CLAUDE.md completely before starting.

Allow users to drag task cards up/down within a bucket column to reorder them.
If in FedEx the order is A, B, C and user drags C to the top, it becomes C, B, A.

CURRENT STATE:
- Tasks within a column are ordered by createdAt (Firestore query orderBy)
- No `order` or `position` field on tasks
- BoardColumn.tsx renders tasks in the order they're passed

WHAT TO BUILD:

1. ADD `sortOrder` FIELD TO TASK

   File: `src/renderer/src/types/index.ts`

   Add to Task interface:
   ```typescript
   export interface Task {
     // ...existing fields...
     sortOrder?: number  // manual sort position within bucket (lower = higher)
   }
   ```

   Using a number (not integer) allows inserting between two items:
   if A=1.0 and B=2.0, insert C between them at 1.5.

2. SORT TASKS BY sortOrder IN BOARD COLUMN

   File: `src/renderer/src/components/board/BoardColumn.tsx`

   Before rendering, sort active tasks:
   ```typescript
   const sorted = [...active].sort((a, b) => {
     const orderA = a.sortOrder ?? a.createdAt?.toMillis() ?? 0
     const orderB = b.sortOrder ?? b.createdAt?.toMillis() ?? 0
     return orderA - orderB
   })
   ```

   Use `sorted` instead of `active` for rendering.
   Also apply to `completed` if showing them.

3. ADD DRAG-AND-DROP TO TASK CARDS

   File: `src/renderer/src/components/board/BoardColumn.tsx`

   Use HTML native drag-and-drop on task cards within the column.

   Add state:
   ```typescript
   const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)
   const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null)
   const [dragOverPosition, setDragOverPosition] = useState<'above' | 'below' | null>(null)
   ```

   Wrap each TaskCard:
   ```tsx
   {sorted.map((task, idx) => (
     <div
       key={task.id}
       draggable
       onDragStart={(e) => {
         e.dataTransfer.effectAllowed = 'move'
         setDraggedTaskId(task.id)
       }}
       onDragOver={(e) => {
         e.preventDefault()
         e.dataTransfer.dropEffect = 'move'
         // Determine if cursor is in top half or bottom half of card
         const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
         const midY = rect.top + rect.height / 2
         setDragOverTaskId(task.id)
         setDragOverPosition(e.clientY < midY ? 'above' : 'below')
       }}
       onDragLeave={() => {
         setDragOverTaskId(null)
         setDragOverPosition(null)
       }}
       onDrop={() => handleTaskDrop(task.id)}
       onDragEnd={() => {
         setDraggedTaskId(null)
         setDragOverTaskId(null)
         setDragOverPosition(null)
       }}
       className={`transition-all ${
         draggedTaskId === task.id ? 'opacity-40 scale-95' : ''
       }`}
     >
       {/* Drop indicator line above */}
       {dragOverTaskId === task.id && dragOverPosition === 'above' && (
         <div className="h-0.5 bg-green-500 rounded-full -mt-1 mb-1" />
       )}

       <TaskCard ... />

       {/* Drop indicator line below */}
       {dragOverTaskId === task.id && dragOverPosition === 'below' && (
         <div className="h-0.5 bg-green-500 rounded-full mt-1 -mb-1" />
       )}
     </div>
   ))}
   ```

4. HANDLE THE DROP — CALCULATE NEW sortOrder

   ```typescript
   async function handleTaskDrop(targetTaskId: string) {
     if (!draggedTaskId || draggedTaskId === targetTaskId) return

     const targetIdx = sorted.findIndex(t => t.id === targetTaskId)
     if (targetIdx === -1) return

     // Calculate new sortOrder
     let newOrder: number

     if (dragOverPosition === 'above') {
       if (targetIdx === 0) {
         // Dropping before first item
         newOrder = (sorted[0].sortOrder ?? sorted[0].createdAt?.toMillis() ?? 0) - 1000
       } else {
         // Between previous and target
         const prev = sorted[targetIdx - 1]
         const target = sorted[targetIdx]
         const prevOrder = prev.sortOrder ?? prev.createdAt?.toMillis() ?? 0
         const targetOrder = target.sortOrder ?? target.createdAt?.toMillis() ?? 0
         newOrder = (prevOrder + targetOrder) / 2
       }
     } else {
       if (targetIdx === sorted.length - 1) {
         // Dropping after last item
         const last = sorted[sorted.length - 1]
         newOrder = (last.sortOrder ?? last.createdAt?.toMillis() ?? 0) + 1000
       } else {
         // Between target and next
         const target = sorted[targetIdx]
         const next = sorted[targetIdx + 1]
         const targetOrder = target.sortOrder ?? target.createdAt?.toMillis() ?? 0
         const nextOrder = next.sortOrder ?? next.createdAt?.toMillis() ?? 0
         newOrder = (targetOrder + nextOrder) / 2
       }
     }

     // Persist to Firestore
     try {
       await updateDoc(doc(db, 'tasks', draggedTaskId), {
         sortOrder: newOrder,
         updatedAt: Timestamp.now(),
       })
     } catch (err) {
       console.error('Failed to reorder task:', err)
     }

     setDraggedTaskId(null)
     setDragOverTaskId(null)
     setDragOverPosition(null)
   }
   ```

   Import needed:
   ```typescript
   import { doc, updateDoc, Timestamp } from 'firebase/firestore'
   import { db } from '../../lib/firebase'
   ```

5. VISUAL FEEDBACK:
   - Dragged card: opacity-40 + scale-95
   - Drop position: thin green line (h-0.5 bg-green-500) above or below target
   - Smooth transitions

6. IMPORTANT — don't conflict with column drag:
   Column drag (from UX-2) is on the column wrapper.
   Task drag is on the task card inside the column.
   Use `e.stopPropagation()` in task drag events to prevent bubbling to column.

   In the task card drag handlers, add:
   ```typescript
   onDragStart={(e) => {
     e.stopPropagation()  // prevent column drag from activating
     e.dataTransfer.effectAllowed = 'move'
     setDraggedTaskId(task.id)
   }}
   ```

Run `npm run typecheck` — must pass.
Test: Open Planner Cards view → FedEx column has tasks A, B, C.
Drag C to above A → green line appears above A → drop → order is now C, A, B.
Reload → order persists. Column drag still works separately.
Commit: "feat: drag-to-reorder tasks within bucket columns"
