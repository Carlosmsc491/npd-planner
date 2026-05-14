# FIX — Restore claimRecipeFile broken by previous session

## CONTEXT — What went wrong

The previous Claude Code session made changes attempting to fix a slow Firestore
connection by removing all `await` from writes (fire-and-forget) and refactoring
`claimRecipeFile` to accept a `currentFile` object instead of reading from Firestore.

The result is a broken app with three active errors:

1. `Cannot read properties of undefined (reading 'status')` — claimRecipeFile
   expects a `currentFile` object but callers are passing wrong arguments
2. `Cannot read properties of undefined (reading 'indexOf')` — `fileId` is
   arriving as `undefined` at the Firestore `doc()` call
3. Timeout fires even after a successful claim — cancel logic is broken

---

## FILES TO READ BEFORE WRITING ANY CODE

```
src/renderer/src/lib/recipeFirestore.ts          (lines 1–300)
src/renderer/src/hooks/useRecipeLock.ts
src/renderer/src/components/recipes/RecipeProjectPage.tsx
src/renderer/src/components/recipes/RecipeDetailPanel.tsx
CLAUDE.md
```

Read ALL of them completely before touching anything.

---

## THE FIX — Restore correct function signatures

### GOAL
Restore `claimRecipeFile`, `unclaimRecipeFile`, `forceClaimRecipeFile`, and
`markRecipeDone` to their correct signatures. Remove ALL fire-and-forget
antipatterns introduced by the previous session. Keep the `getDocCacheFirst`
helper since it is a valid optimization (cache-first read).

---

### CHANGE 1 — `src/renderer/src/lib/recipeFirestore.ts`

#### 1A — Restore `claimRecipeFile` to original signature

The function must accept `(projectId, fileId, userName)` — NOT a `currentFile`
object. It reads the document itself using `getDocCacheFirst`.

The correct implementation (restore to this exactly):

```typescript
export async function claimRecipeFile(
  projectId: string,
  fileId: string,
  userName: string
): Promise<string> {
  const lockToken = nanoid()
  const fileRef = doc(db, RECIPE_PROJECTS, projectId, RECIPE_FILES, fileId)

  console.log('[NPD] claimRecipeFile START', { projectId, fileId, userName })

  console.log('[NPD] claimRecipeFile calling getDocCacheFirst...')
  const snap = await getDocCacheFirst(fileRef)
  console.log('[NPD] claimRecipeFile getDoc done —', 'exists:', snap.exists(), 'fromCache:', snap.metadata?.fromCache)

  if (!snap.exists()) throw new Error('Recipe file not found')

  const data = snap.data() as RecipeFile
  console.log('[NPD] claimRecipeFile current status:', data.status, 'lockedBy:', data.lockedBy)

  // Block only if another user currently holds the lock
  if (
    data.status === 'in_progress' &&
    data.lockedBy !== null &&
    data.lockedBy !== userName
  ) {
    throw new Error(`Locked by ${data.lockedBy}`)
  }

  console.log('[NPD] claimRecipeFile firing updateDoc (no await)...')
  updateDoc(fileRef, {
    status:          'in_progress' as RecipeFileStatus,
    lockedBy:        userName,
    lockClaimedAt:   serverTimestamp(),
    lockHeartbeatAt: serverTimestamp(),
    lockToken,
    version:         (data.version ?? 0) + 1,
    updatedAt:       serverTimestamp(),
  }).catch(err => console.error('[NPD] claimRecipeFile updateDoc error:', err))

  console.log('[NPD] claimRecipeFile returning lockToken immediately:', lockToken)
  return lockToken
}
```

Note: `updateDoc` stays fire-and-forget (no await) — this is intentional and
correct. We confirmed the file data from cache, we don't need to await the write.

#### 1B — Restore `unclaimRecipeFile` to original signature

```typescript
export async function unclaimRecipeFile(
  projectId: string,
  fileId: string,
  lockToken: string
): Promise<void> {
  const fileRef = doc(db, RECIPE_PROJECTS, projectId, RECIPE_FILES, fileId)

  const snap = await getDocCacheFirst(fileRef)
  if (!snap.exists()) return

  const data = snap.data() as RecipeFile
  if (data.lockToken !== lockToken) return // someone else claimed it

  updateDoc(fileRef, {
    status:          'pending' as RecipeFileStatus,
    lockedBy:        null,
    lockClaimedAt:   null,
    lockHeartbeatAt: null,
    lockToken:       null,
    updatedAt:       serverTimestamp(),
  }).catch(err => console.error('[NPD] unclaimRecipeFile updateDoc error:', err))
}
```

#### 1C — Restore `forceClaimRecipeFile` to original signature

```typescript
export async function forceClaimRecipeFile(
  projectId: string,
  fileId: string,
  userName: string
): Promise<string> {
  const lockToken = nanoid()
  const fileRef = doc(db, RECIPE_PROJECTS, projectId, RECIPE_FILES, fileId)

  updateDoc(fileRef, {
    status:          'in_progress' as RecipeFileStatus,
    lockedBy:        userName,
    lockClaimedAt:   serverTimestamp(),
    lockHeartbeatAt: serverTimestamp(),
    lockToken,
    updatedAt:       serverTimestamp(),
  }).catch(err => console.error('[NPD] forceClaimRecipeFile updateDoc error:', err))

  return lockToken
}
```

#### 1D — Restore `markRecipeDone` and `reopenRecipeFile`

Check if these functions also had their signatures changed to accept a `version`
or `currentFile` parameter. If so, restore them to their original signatures
`(projectId, fileId, ...)` without extra parameters.

For `markRecipeDone`, the write should also be fire-and-forget (no await on
the updateDoc call itself, but still use getDocCacheFirst to verify the lock
token before writing).

#### 1E — Restore `createRecipeProject` and `upsertRecipeFile`

These two functions MUST use `await` — they are NOT fire-and-forget.

Check if the previous session changed them to fire-and-forget. If so, restore
`await` to both:

```typescript
// createRecipeProject — MUST await the write:
const projectRef = doc(collection(db, RECIPE_PROJECTS))
await setDoc(projectRef, { ... })
return projectRef.id

// upsertRecipeFile — MUST await the write:
await setDoc(fileRef, { ... }, { merge: true })
```

Rationale: the wizard uses `createRecipeProject` to get the projectId, then
immediately passes it to `upsertRecipeFile` for each recipe. If either call
is fire-and-forget, the wizard appears to complete but the project and files
never land in Firestore. The user sees success but the data is lost.

---

### CHANGE 2 — `src/renderer/src/hooks/useRecipeLock.ts`

#### 2A — Restore `claimFile` signature to `(projectId, fileId, userName)`

The previous session changed it to accept `file: RecipeFile`. Restore it:

```typescript
const claimFile = useCallback(
  async (projectId: string, fileId: string, userName: string): Promise<string> => {
    const lockToken = await claimRecipeFile(projectId, fileId, userName)
    const lock = { projectId, fileId, lockToken }
    setCurrentLock(lock)
    lockRef.current = lock
    return lockToken
  },
  []
)
```

#### 2B — Restore `unclaimFile` to call `unclaimRecipeFile(projectId, fileId, lockToken)`

Remove the `version` parameter that was added:

```typescript
const unclaimFile = useCallback(async (): Promise<void> => {
  const lock = lockRef.current
  if (!lock) return
  await unclaimRecipeFile(lock.projectId, lock.fileId, lock.lockToken)
  setCurrentLock(null)
  lockRef.current = null
}, [])
```

#### 2C — Fix the timeout — cancel it when claim succeeds

The current timeout fires even after a successful claim. Fix:

```typescript
const claimFile = useCallback(
  async (projectId: string, fileId: string, userName: string): Promise<string> => {
    console.log('[NPD] useRecipeLock.claimFile called', { projectId, fileId, userName })

    let timedOut = false
    const timeoutId = setTimeout(() => {
      timedOut = true
      console.warn('[NPD] useRecipeLock.claimFile TIMED OUT after 8s')
    }, 8_000)

    try {
      const lockToken = await claimRecipeFile(projectId, fileId, userName)

      clearTimeout(timeoutId)   // ← cancel timeout on success

      if (timedOut) {
        // Claim succeeded but timeout already fired — still update state
        console.warn('[NPD] useRecipeLock.claimFile — completed after timeout, updating state anyway')
      }

      console.log('[NPD] useRecipeLock.claimFile SUCCESS — lockToken:', lockToken)
      const lock = { projectId, fileId, lockToken }
      setCurrentLock(lock)
      lockRef.current = lock
      return lockToken
    } catch (err) {
      clearTimeout(timeoutId)   // ← also cancel on error
      console.error('[NPD] useRecipeLock.claimFile ERROR:', err)
      throw err
    }
  },
  []
)
```

Note: Remove the `throw new Error('Claim timed out...')` from the timeout
callback. The timeout should only log a warning, not throw — the actual claim
may still complete successfully after the warning.

#### 2D — Remove `version` from `LockState` interface

The previous session added `version: number` to the interface. Remove it:

```typescript
interface LockState {
  projectId: string
  fileId: string
  lockToken: string
  // no version here
}
```

---

### CHANGE 3 — `src/renderer/src/components/recipes/RecipeProjectPage.tsx`

#### 3A — Restore all `claimFile` calls to `(projectId, file.id, user.name)`

Search for all `claimFile(` calls. The previous session may have changed them
to pass `file` instead of `file.id`. Restore to original:

```typescript
// CORRECT:
await claimFile(projectId, file.id, user.name)

// NOT:
await claimFile(projectId, file, user.name)
```

#### 3B — Restore all `unclaimFile` calls — remove version parameter

If any `unclaimFile(version)` calls exist, restore to `unclaimFile()`.

#### 3C — Restore `markRecipeDone` and `reopenRecipeFile` call signatures

If the previous session changed these calls to pass extra parameters (version,
currentFile), restore to their original signatures.

---

## VERIFICATION CHECKLIST

```
[ ] npm run typecheck — must pass with zero errors
[ ] Open an existing recipe project
[ ] Click Claim on a pending recipe:
    - Must respond in < 2 seconds
    - Console shows: START → getDocCacheFirst → from cache → firing updateDoc → SUCCESS
    - NO "TIMED OUT" message
    - Recipe row shows "In Progress" + your name immediately
[ ] Click Release on that recipe:
    - Recipe returns to "Pending"
[ ] Click "Claim Anyway" override on a recipe claimed by someone else:
    - Modal appears with correct name
    - Confirm → recipe transfers to you
[ ] Create a NEW project via wizard:
    - Wizard completes and project appears in the projects list
    - Opening the project shows all the recipe files created
    - (This verifies createRecipeProject and upsertRecipeFile are awaited)
[ ] Mark a recipe Done:
    - Status changes to Done
    - Other users see the change via onSnapshot
```

---

## WHAT TO KEEP FROM PREVIOUS SESSION (do NOT revert these)

- `getDocCacheFirst` helper function in `recipeFirestore.ts` — keep it, it's valid
- `clearFirebaseCache` function in `firebase.ts` — keep it
- The Firebase Cache reset button in `SettingsPage.tsx` — keep it
- All `@deprecated` annotations on presence functions — keep them
- `forceClaimRecipeFile` function — keep it (used by override modal)

---

## ROOT CAUSE SUMMARY (for CLAUDE.md)

The original hang was caused by a corrupted IndexedDB write queue on the
user's machine from the Firestore quota exhaustion period. The `getDocCacheFirst`
helper (reads from IndexedDB cache first, falls back to server) is the correct
fix for the read latency.

The fire-and-forget pattern is ONLY appropriate for lock heartbeat writes
(claim/unclaim status updates) where we have already validated the data from
cache and a transient write failure is recoverable via onSnapshot.

It is NOT appropriate for `createRecipeProject` or `upsertRecipeFile` because
those create records that the app immediately depends on — a silent failure
means data loss with no recovery path.

---

## COMMIT MESSAGE

```
fix: restore claimRecipeFile signatures broken by fire-and-forget refactor

- claimRecipeFile: restore (projectId, fileId, userName) signature
- unclaimRecipeFile: restore (projectId, fileId, lockToken) signature  
- useRecipeLock.claimFile: restore (projectId, fileId, userName) call
- useRecipeLock: fix timeout — clear on success, don't throw on timeout
- createRecipeProject: restore await (data loss prevention)
- upsertRecipeFile: restore await (data loss prevention)
- Keep getDocCacheFirst, clearFirebaseCache, forceClaimRecipeFile
```
