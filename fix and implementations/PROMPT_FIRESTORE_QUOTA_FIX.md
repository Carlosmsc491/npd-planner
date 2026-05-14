# FIRESTORE QUOTA FIX — Lock Heartbeat Removal + Override Modal + Presence 60s

## CONTEXT
The app is hitting the Firestore free tier write limit (20k/day) due to:
1. Lock heartbeat firing every 15s per claimed recipe → 5,760 writes/day per recipe
2. `updateRecipeHeartbeat` uses `runTransaction` (1 read + 1 write per beat)
3. Presence heartbeat also fires every 15s

This prompt eliminates the lock heartbeat entirely, replaces timeout-based expiry
with a manual override modal, and reduces presence writes by 75%.

---

## FILES TO READ BEFORE WRITING ANY CODE

```
src/renderer/src/hooks/useRecipeLock.ts
src/renderer/src/lib/recipeFirestore.ts
src/renderer/src/lib/repositories/interfaces/IRecipeRepository.ts
src/renderer/src/lib/repositories/firebase/FirebaseRecipeRepository.ts
src/renderer/src/components/recipes/RecipeProjectPage.tsx
src/renderer/src/components/recipes/RecipeDetailPanel.tsx
src/renderer/src/components/recipes/RecipeFolderSection.tsx
src/renderer/src/types/index.ts
CLAUDE.md
```

---

## CHANGES — READ EVERY SECTION BEFORE TOUCHING ANY FILE

---

### CHANGE 1 — `src/renderer/src/hooks/useRecipeLock.ts`

**Remove** the entire heartbeat `useEffect` (the one with `setInterval` at 15_000).
**Remove** the import of `updateRecipeHeartbeat`.
**Keep** everything else exactly as-is: `claimFile`, `unclaimFile`, the unmount cleanup effect.

Result: the hook only writes to Firestore on explicit claim and unclaim. Zero periodic writes.

```typescript
// REMOVE this entire block:
useEffect(() => {
  if (!currentLock) return
  const interval = setInterval(() => {
    updateRecipeHeartbeat(
      currentLock.projectId,
      currentLock.fileId,
      currentLock.lockToken
    ).catch(console.error)
  }, 15_000)
  return () => clearInterval(interval)
}, [currentLock])

// REMOVE updateRecipeHeartbeat from the import line
```

---

### CHANGE 2 — `src/renderer/src/lib/recipeFirestore.ts`

#### 2A — Simplify `claimRecipeFile`

Replace the current `runTransaction` logic with a simpler version that:
- Uses `runTransaction` ONLY to check if already locked by someone else (not us)
- If locked → throws `Error("Locked by {lockedBy}")` with the locker's name so the UI can show the override modal
- If not locked (pending, lock_expired, or locked by same user) → claims it
- Does NOT check `lockHeartbeatAt` or timeout — heartbeat is gone

```typescript
export async function claimRecipeFile(
  projectId: string,
  fileId: string,
  userName: string
): Promise<string> {
  const lockToken = nanoid()
  const fileRef = doc(db, RECIPE_PROJECTS, projectId, RECIPE_FILES, fileId)

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(fileRef)
    if (!snap.exists()) throw new Error('Recipe file not found')

    const data = snap.data() as RecipeFile

    // Blocked only if someone else currently has it claimed
    if (
      data.status === 'in_progress' &&
      data.lockedBy !== null &&
      data.lockedBy !== userName
    ) {
      throw new Error(`Locked by ${data.lockedBy}`)
    }

    tx.update(fileRef, {
      status:          'in_progress' as RecipeFileStatus,
      lockedBy:        userName,
      lockClaimedAt:   serverTimestamp(),
      lockHeartbeatAt: serverTimestamp(), // keep field for schema compat, not used for expiry
      lockToken,
      version:         (data.version ?? 0) + 1,
      updatedAt:       serverTimestamp(),
    })
  })

  return lockToken
}
```

#### 2B — Add `forceClaimRecipeFile`

New function that bypasses the lock check — used when user confirms the override modal.
Place it right after `claimRecipeFile`.

```typescript
/**
 * Force-claim a recipe file regardless of who currently holds the lock.
 * Only called after the user confirms the "X is working on this" override modal.
 */
export async function forceClaimRecipeFile(
  projectId: string,
  fileId: string,
  userName: string
): Promise<string> {
  const lockToken = nanoid()
  const fileRef = doc(db, RECIPE_PROJECTS, projectId, RECIPE_FILES, fileId)

  await updateDoc(fileRef, {
    status:          'in_progress' as RecipeFileStatus,
    lockedBy:        userName,
    lockClaimedAt:   serverTimestamp(),
    lockHeartbeatAt: serverTimestamp(),
    lockToken,
    updatedAt:       serverTimestamp(),
  })

  return lockToken
}
```

#### 2C — Mark `updateRecipeHeartbeat` as deprecated (do NOT delete)

Add a `@deprecated` JSDoc comment above `updateRecipeHeartbeat`. Leave the function body intact for schema compatibility.

```typescript
/**
 * @deprecated Lock heartbeat removed in v1.7.0. Locks are now permanent until
 * explicitly released or force-claimed. This function is kept for schema
 * compatibility only and will be removed in a future version.
 */
export async function updateRecipeHeartbeat(...) { ... }
```

#### 2D — Mark `checkAndExpireLocks` as deprecated (do NOT delete, do NOT call it)

Add a `@deprecated` JSDoc above `checkAndExpireLocks`. The function stays but is never called again.

```typescript
/**
 * @deprecated Lock expiry by timeout removed in v1.7.0. Locks are now
 * released only by explicit unclaim or force-claim override.
 * Kept for schema compatibility only.
 */
export async function checkAndExpireLocks(...) { ... }
```

---

### CHANGE 3 — `src/renderer/src/hooks/useRecipeLock.ts`

Add `forceClaimFile` action alongside `claimFile` and `unclaimFile`:

```typescript
import {
  claimRecipeFile,
  unclaimRecipeFile,
  forceClaimRecipeFile,   // ADD
} from '../lib/recipeFirestore'

// Inside useRecipeLock, add after unclaimFile:
const forceClaimFile = useCallback(
  async (projectId: string, fileId: string, userName: string): Promise<string> => {
    const lockToken = await forceClaimRecipeFile(projectId, fileId, userName)
    const lock = { projectId, fileId, lockToken }
    setCurrentLock(lock)
    lockRef.current = lock
    return lockToken
  },
  []
)

return { currentLock, claimFile, unclaimFile, forceClaimFile }
```

---

### CHANGE 4 — `src/renderer/src/components/recipes/RecipeProjectPage.tsx`

#### 4A — Remove `checkAndExpireLocks` call

Find and remove the call to `checkAndExpireLocks(projectId)` (it's called somewhere on project open). Remove the import too if it's only used there.

#### 4B — Add override modal state

Add state for the override confirmation modal near the other modal states:

```typescript
const [overrideClaimModal, setOverrideClaimModal] = useState<{
  file: RecipeFile
  lockedBy: string
} | null>(null)
```

#### 4C — Update `handleClaimForFile` to catch the lock error and show the modal

```typescript
const handleClaimForFile = useCallback(async (file: RecipeFile) => {
  if (!projectId || !user) return
  setSelectedFile(file)
  try {
    await claimFile(projectId, file.id, user.name)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.startsWith('Locked by ')) {
      const lockedBy = msg.replace('Locked by ', '')
      setOverrideClaimModal({ file, lockedBy })
    } else {
      console.error('claimFile error:', err)
    }
  }
}, [projectId, user, claimFile])
```

#### 4D — Add `handleForceClaimOverride` handler

```typescript
const { currentLock, claimFile, unclaimFile, forceClaimFile } = useRecipeLock()

const handleForceClaimOverride = useCallback(async () => {
  if (!overrideClaimModal || !projectId || !user) return
  const { file } = overrideClaimModal
  setOverrideClaimModal(null)
  try {
    await forceClaimFile(projectId, file.id, user.name)
    setSelectedFile(file)
  } catch (err) {
    console.error('forceClaimFile error:', err)
  }
}, [overrideClaimModal, projectId, user, forceClaimFile])
```

#### 4E — Render the override modal

Add this modal in the JSX return, alongside the other modals (before the closing `</AppLayout>`):

```tsx
{overrideClaimModal && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
    <div className="w-[400px] rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-2xl p-6 space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
          <Lock size={16} className="text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Recipe in use
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            <span className="font-medium text-gray-700 dark:text-gray-300">
              {overrideClaimModal.lockedBy}
            </span>{' '}
            is currently working on{' '}
            <span className="font-medium text-gray-700 dark:text-gray-300">
              {overrideClaimModal.file.displayName}
            </span>
            . Do you want to claim it anyway?
          </p>
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button
          onClick={() => setOverrideClaimModal(null)}
          className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleForceClaimOverride}
          className="px-4 py-2 text-sm rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-semibold transition-colors"
        >
          Claim Anyway
        </button>
      </div>
    </div>
  </div>
)}
```

Make sure `Lock` is imported from `lucide-react` (it likely already is).

#### 4F — Presence heartbeat: change 15_000 → 60_000

In the presence `useEffect`:

```typescript
// CHANGE:
}, 15_000)
// TO:
}, 60_000)
```

---

### CHANGE 5 — `src/renderer/src/components/recipes/RecipeDetailPanel.tsx`

#### 5A — Remove the "Force unlock" admin button

Find and remove the block that renders the "Force unlock" button (the one gated by `isAdmin`).
This path is now superseded by the override modal. Admins can use "Claim Anyway" like everyone else.

The locked state banner (showing "Locked by {name}") should STAY — it's still useful info.
Only remove the button inside it.

#### 5B — Rename "Unclaim" button to "Release"

Search for any button with text "Unclaim" or calling `onUnclaim` and change the label to **"Release"**.

---

### CHANGE 6 — `src/renderer/src/components/recipes/RecipeFolderSection.tsx`

If `RecipeFolderSection` has its own claim error handling (check for `"Locked by"` string handling or a local modal), update it to also call the parent's `onClaimError` or propagate the error up so the override modal in `RecipeProjectPage` handles it.

If it calls `onClaim` directly and swallows errors silently, make sure the error is re-thrown or passed to a prop like `onClaimError?: (file: RecipeFile, lockedBy: string) => void`.

Check the component carefully — do NOT break existing claim flow for unlocked recipes.

---

### CHANGE 7 — `src/renderer/src/lib/repositories/interfaces/IRecipeRepository.ts`

Add `forceClaimRecipeFile` to the interface:

```typescript
claimRecipeFile(projectId: string, fileId: string, userName: string): Promise<string>
forceClaimRecipeFile(projectId: string, fileId: string, userName: string): Promise<string>  // ADD
unclaimRecipeFile(projectId: string, fileId: string, lockToken: string): Promise<void>
```

---

### CHANGE 8 — `src/renderer/src/lib/repositories/firebase/FirebaseRecipeRepository.ts`

Add `forceClaimRecipeFile` to the class:

```typescript
import {
  // existing imports...
  forceClaimRecipeFile,  // ADD
} from '../../recipeFirestore'

export class FirebaseRecipeRepository implements IRecipeRepository {
  // existing...
  forceClaimRecipeFile = forceClaimRecipeFile  // ADD
}
```

---

## VERIFICATION CHECKLIST

```
[ ] npm run typecheck — must pass with zero errors
[ ] Open a recipe project — no console errors on load
[ ] Claim a recipe — status changes to in_progress for all users (onSnapshot)
[ ] Release (unclaim) a recipe — status returns to pending for all users
[ ] Claim a recipe that someone else has claimed:
    - Override modal appears with correct name and recipe name
    - Cancel: modal closes, original locker keeps the recipe
    - Claim Anyway: current user takes over, visible to all
[ ] No setInterval heartbeat in useRecipeLock (check React DevTools or console)
[ ] Presence still shows who is online (60s interval, not 15s)
[ ] "Force unlock" button gone from RecipeDetailPanel for admins
[ ] "Release" button visible where "Unclaim" was
[ ] lock_expired status: confirm it's handled gracefully in UI
    (recipe with lock_expired should be claimable normally without the override modal)
```

---

## FIRESTORE WRITES AFTER THIS FIX

| Operation | Before | After |
|---|---|---|
| Lock heartbeat | 5,760/day per claimed recipe | **0** |
| Presence heartbeat | 5,760/day per active user | 1,440/day per user |
| Claim | 2 ops (transaction) | 2 ops (transaction) |
| Force claim | N/A | 1 op (updateDoc) |
| Release | 2 ops (transaction) | 2 ops (transaction) |

**Net result:** ~95% reduction in periodic writes. 
With 4 users working simultaneously: ~5,760 writes/day → well within free tier.

---

## COMMIT MESSAGE

```
perf: remove lock heartbeat, add force-claim override modal, presence 15s→60s

- Remove setInterval heartbeat from useRecipeLock (was 5,760 writes/day per recipe)
- claimRecipeFile: simplified — blocks only if another user holds the lock
- Add forceClaimRecipeFile: bypasses lock check, called after user confirms modal
- Override modal: "[Name] is working on this recipe. Claim anyway?"
- Presence heartbeat: 15,000ms → 60,000ms (75% reduction in presence writes)
- Deprecate updateRecipeHeartbeat and checkAndExpireLocks (not deleted)
- Rename "Unclaim" → "Release" in RecipeDetailPanel
- Remove admin "Force unlock" button (superseded by override modal for all users)
```

---

## AFTER COMPLETING — UPDATE THESE FILES

1. **`CLAUDE.md`** — check off lock heartbeat removal, add note about override modal
2. **`DOCUMENTACION_TECNICA_NPD_PLANNER.md`** — update Section 12 (Recipe Manager):
   - Lock system: remove mention of heartbeat timeout
   - Add: "Locks are permanent until released by the holder or force-claimed via override modal"
   - Presence: update interval to 60s
