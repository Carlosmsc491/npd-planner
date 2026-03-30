# NPD PLANNER — BUGFIXES: Recurring Duplicates + Uncomplete Toggle
# ═══════════════════════════════════════════════════════════════
# Dale a Kimi el archivo KIMI_READ_FIRST.md antes de este.
# ═══════════════════════════════════════════════════════════════


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT BUGFIX-RECURRING — Fix recurring task creating 2 duplicates
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read CLAUDE.md completely before starting.

BUG: When completing a recurring task, TWO new instances are created
instead of one, and neither deletes the original completed task.
The original just gets marked complete, and 2 new uncompleted copies appear.

ROOT CAUSE: The recurring logic lives in TWO places that BOTH fire:

PLACE 1 — `src/renderer/src/hooks/useTasks.ts` → `complete` callback:
After calling `completeTask()`, it checks `task.recurring?.enabled`
and calls `createTask()` to make the next instance.

PLACE 2 — `src/renderer/src/lib/firestore.ts` → `completeTask()` function:
Look at this function carefully. The version in the renderer's firestore.ts
may ALSO contain recurring logic inside the transaction or after it.
Check if `completeTask` in firestore.ts does any of the following:
- Checks `task.recurring`
- Calls `createTask` or `addDoc` for a new recurring instance
- Creates a copy of the task after marking it complete

If BOTH places create the next instance, you get 2 duplicates.

FIX: The recurring logic should exist in ONLY ONE place. The best place
is `useTasks.ts` → `complete` callback, because it has access to React
state and can show the undo toast.

STEP 1: Check `completeTask` in `src/renderer/src/lib/firestore.ts`.

Read the FULL function. Look for ANY code that:
- References `task.recurring` or `recurring`
- Calls `createTask`, `addDoc`, or creates a new task document
- Copies task data to create a new instance

If found: REMOVE that recurring logic from `completeTask` in firestore.ts.
The function should ONLY:
a. Set `completed: true`, `completedAt`, `completedBy`
b. Write a history entry with action 'completed'
c. Send notifications to assignees (for planner board)

Nothing else. No recurring instance creation.

STEP 2: Verify `useTasks.ts` → `complete` is the SINGLE source of truth.

The existing code in useTasks.ts already handles recurring correctly:
```typescript
if (task.recurring?.enabled && task.recurring.nextDate) {
  // calculate newDate based on frequency
  // createTask with new dates and recurring config
}
```

This is correct. Leave it as-is.

STEP 3: Also check if there's a Firestore Cloud Function or trigger
that might auto-create recurring tasks. Search for:
```bash
grep -rn "recurring" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v "\.d\.ts"
```

List ALL files that reference `recurring`. Verify only `useTasks.ts`
creates the next instance.

STEP 4: Check if `subscribeToTasks` listener fires a re-render that
somehow calls `complete` twice. The `complete` callback in useTasks
depends on `[user, setToast]` — if these change during the completion
flow, the callback could be recreated. But this shouldn't cause double
execution unless the checkbox click handler fires twice.

Check `TaskCard.tsx` — the checkbox onClick handler:
```tsx
<button onClick={(e) => { e.stopPropagation(); onComplete(task) }}>
```

If the button doesn't have `e.preventDefault()` or if there's a parent
onClick that also triggers completion, you could get double-fire.

Add a guard in `useTasks.ts` to prevent double-completion:

```typescript
const completingRef = useRef(new Set<string>())

const complete = useCallback(async (task: Task) => {
  if (!user) return
  if (completingRef.current.has(task.id)) return  // already completing
  completingRef.current.add(task.id)

  try {
    // ...existing complete logic...
  } finally {
    // Remove after a delay to prevent rapid re-clicks
    setTimeout(() => completingRef.current.delete(task.id), 2000)
  }
}, [user, setToast])
```

Add `import { useRef } from 'react'` if not already imported.

Run `npm run typecheck` — must pass.
Test: Create a recurring weekly task → complete it → verify EXACTLY one
new instance is created. The original stays as completed. No duplicates.
Commit: "fix: recurring task creating duplicate instances on completion"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT BUGFIX-UNCOMPLETE — Fix checkbox toggle to uncomplete a task
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read CLAUDE.md completely before starting.

BUG: When a user clicks the checkbox on a completed task to uncomplete it,
nothing happens. The only way to uncomplete is clicking "Undo" on the
toast popup within 5 seconds of completing. After the toast disappears,
the task is permanently stuck as completed (unless editing Firestore directly).

ROOT CAUSE: The checkbox always calls `onComplete(task)` which calls
`useTasks.ts` → `complete()`. This function ALWAYS marks the task as
completed (sets `completed: true`). It never checks if the task is
already completed to toggle it back.

CURRENT FLOW:
1. User clicks checkbox on a NOT completed task → `complete(task)` → sets completed=true ✅
2. User clicks checkbox on an ALREADY completed task → `complete(task)` → sets completed=true AGAIN ❌

It should:
1. If task.completed === false → mark as complete (existing behavior)
2. If task.completed === true → mark as uncomplete (set completed=false, clear completedAt/completedBy)

FIX:

File: `src/renderer/src/hooks/useTasks.ts`

Replace the `complete` callback with a toggle that handles both directions:

```typescript
const complete = useCallback(async (task: Task) => {
  if (!user) return
  if (completingRef.current.has(task.id)) return
  completingRef.current.add(task.id)

  try {
    if (task.completed) {
      // ── UNCOMPLETE: toggle back to active ──
      await updateTaskField(task.id, 'completed', false, user.uid, user.name, true, boardType)
      await updateTaskField(task.id, 'completedAt', null, user.uid, user.name, task.completedAt, boardType)
      await updateTaskField(task.id, 'completedBy', null, user.uid, user.name, task.completedBy, boardType)
      // No toast for uncomplete — it's instant and intentional
    } else {
      // ── COMPLETE: existing behavior ──
      const snapshot = { ...task }
      await completeTask(task.id, user.uid, user.name, boardType)

      // Auto-create next recurring instance
      if (task.recurring?.enabled && task.recurring.nextDate) {
        const next = task.recurring.nextDate.toDate()
        const freq = task.recurring.frequency
        let newDate: Date
        if (freq === 'daily')   newDate = new Date(next.setDate(next.getDate() + 1))
        else if (freq === 'weekly')  newDate = new Date(next.setDate(next.getDate() + 7))
        else if (freq === 'monthly') newDate = new Date(next.setMonth(next.getMonth() + 1))
        else if (freq === 'yearly')  newDate = new Date(next.setFullYear(next.getFullYear() + 1))
        else newDate = next

        const { id: _id, completedAt: _ca, completedBy: _cb, ...rest } = snapshot
        await createTask({
          ...rest,
          completed: false,
          completedAt: null,
          completedBy: null,
          dateStart: Timestamp.fromDate(newDate),
          dateEnd: task.dateEnd
            ? Timestamp.fromDate(
                new Date(newDate.getTime() + (task.dateEnd.toMillis() - (task.dateStart?.toMillis() ?? newDate.getTime())))
              )
            : null,
          recurring: { ...task.recurring, nextDate: Timestamp.fromDate(newDate) },
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        })
      }

      setToast({
        id: `undo-${task.id}`,
        message: `Completed: ${task.title}`,
        type: 'info',
        undoAction: async () => {
          await updateTaskField(task.id, 'completed', false, user.uid, user.name, true, boardType)
          await updateTaskField(task.id, 'completedAt', null, user.uid, user.name, snapshot.completedAt, boardType)
          await updateTaskField(task.id, 'completedBy', null, user.uid, user.name, snapshot.completedBy, boardType)
        },
        duration: 5000,
      })
    }
  } finally {
    setTimeout(() => completingRef.current.delete(task.id), 2000)
  }
}, [user, setToast, boardType])
```

ALSO: Make sure the checkbox visual reflects the current state. Check
`TaskCard.tsx` — the checkbox button should look filled/green when
`task.completed === true` and empty when false. This already seems
correct based on the existing code:
```tsx
<button className={`... ${task.completed ? 'border-green-500 bg-green-500' : 'border-gray-300 ...'}`}>
```

And the card itself should have reduced opacity when completed:
```tsx
<div className={`... ${task.completed ? 'opacity-40' : ''}`}>
```

Verify these visual states update in real-time when uncompleting
(Firestore real-time listener should trigger re-render).

ALSO: Check `ListView.tsx` if it has a similar checkbox. Apply the same
fix if it also calls `onComplete` — the toggle logic is in useTasks.ts
so all callers benefit automatically.

Run `npm run typecheck` — must pass.
Test:
1. Create a task → click checkbox → task completes (opacity fades, moves to bottom) ✅
2. Click "Show completed" → find the completed task → click its checkbox again
3. Task should uncomplete: opacity returns to 100%, moves back to active list ✅
4. Complete a recurring task → new instance created → uncomplete the original →
   the new instance should remain (we don't delete the recurring copy)
Commit: "fix: checkbox toggle to uncomplete tasks without requiring undo"
