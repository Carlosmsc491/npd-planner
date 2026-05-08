
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT R1 — Types + Firestore + permissions helper
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read these files completely before writing any code:
- CLAUDE.md
- src/renderer/src/types/index.ts
- src/renderer/src/lib/firestore.ts
- firestore.rules

─── TASK ───────────────────────────────────────────────────────

1. In `src/renderer/src/types/index.ts`, ADD these types
   (do NOT remove any existing types):

```typescript
export type AccessLevel = 'none' | 'view' | 'edit'

export interface AreaPermissions {
  boards:   Record<string, AccessLevel>
  projects: AccessLevel
  recipes:  AccessLevel
  analytics: AccessLevel
  settings: 'none'
}

export const DEFAULT_AREA_PERMISSIONS: AreaPermissions = {
  boards:   {},
  projects: 'view',
  recipes:  'none',
  analytics:'none',
  settings: 'none',
}

export interface PendingApproval {
  uid:          string
  displayName:  string
  email:        string
  registeredAt: import('firebase/firestore').Timestamp
  reviewingBy:  string | null
}
```

   In the existing `AppUser` interface, add the optional field:
   ```typescript
   areaPermissions?: AreaPermissions
   ```

2. Create `src/renderer/src/lib/permissions.ts`:

```typescript
// src/renderer/src/lib/permissions.ts
// Centralized permission helpers — no component should check role directly

import type { AppUser, AccessLevel } from '../types'

export function isPrivileged(user: AppUser): boolean {
  return user.role === 'owner' || user.role === 'admin'
}

export function canViewBoard(user: AppUser, boardId: string): boolean {
  if (isPrivileged(user)) return true
  const access = user.areaPermissions?.boards?.[boardId] ?? 'none'
  return access === 'view' || access === 'edit'
}

export function canEditBoard(user: AppUser, boardId: string): boolean {
  if (isPrivileged(user)) return true
  return (user.areaPermissions?.boards?.[boardId] ?? 'none') === 'edit'
}

export function canViewArea(
  user: AppUser,
  area: 'projects' | 'recipes' | 'analytics'
): boolean {
  if (isPrivileged(user)) return true
  const access = user.areaPermissions?.[area] ?? 'none'
  return access === 'view' || access === 'edit'
}

export function canEditArea(
  user: AppUser,
  area: 'projects' | 'recipes' | 'analytics'
): boolean {
  if (isPrivileged(user)) return true
  return (user.areaPermissions?.[area] ?? 'none') === 'edit'
}

export function canApproveUsers(user: AppUser): boolean {
  return isPrivileged(user)
}

export function canChangeRole(
  actor: AppUser,
  target: AppUser
): boolean {
  if (actor.role === 'owner') return target.role !== 'owner' || actor.uid !== target.uid
  if (actor.role === 'admin') return target.role === 'member'
  return false
}

export function canDeleteUser(actor: AppUser): boolean {
  return actor.role === 'owner'
}

export function canSuspendUser(actor: AppUser, target: AppUser): boolean {
  if (actor.role === 'owner') return actor.uid !== target.uid
  if (actor.role === 'admin') return target.role === 'member'
  return false
}
```

3. In `src/renderer/src/lib/firestore.ts`, ADD these functions
   (keep all existing functions intact):

```typescript
// ─── Pending Approvals ──────────────────────────────────────────

export async function createPendingApproval(
  uid: string,
  displayName: string,
  email: string
): Promise<void> {
  await setDoc(doc(db, 'pendingApprovals', uid), {
    uid,
    displayName,
    email,
    registeredAt: serverTimestamp(),
    reviewingBy: null,
  })
}

export async function deletePendingApproval(uid: string): Promise<void> {
  await deleteDoc(doc(db, 'pendingApprovals', uid))
}

export async function setReviewingBy(
  uid: string,
  reviewerUid: string | null
): Promise<void> {
  await updateDoc(doc(db, 'pendingApprovals', uid), { reviewingBy: reviewerUid })
}

export function subscribePendingApprovals(
  callback: (approvals: PendingApproval[]) => void
): () => void {
  return onSnapshot(collection(db, 'pendingApprovals'), (snap) => {
    const approvals = snap.docs.map((d) => d.data() as PendingApproval)
    callback(approvals)
  })
}

// ─── User approval / rejection ──────────────────────────────────

export async function approveUser(
  uid: string,
  role: 'member' | 'admin',
  areaPermissions: AreaPermissions
): Promise<void> {
  await Promise.all([
    updateDoc(doc(db, 'users', uid), {
      status: 'active',
      role,
      areaPermissions,
    }),
    deletePendingApproval(uid),
  ])
}

export async function rejectUser(uid: string): Promise<void> {
  await Promise.all([
    updateDoc(doc(db, 'users', uid), { status: 'rejected' }),
    deletePendingApproval(uid),
  ])
}

export async function updateAreaPermissions(
  uid: string,
  areaPermissions: AreaPermissions
): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { areaPermissions })
}
```

   Make sure `PendingApproval`, `AreaPermissions` are imported from types.
   Add `deleteDoc` to the existing firestore imports if not already present.

4. In `firestore.rules`, ADD the pendingApprovals match block
   inside the existing `match /databases/{database}/documents` block:

```javascript
match /pendingApprovals/{uid} {
  allow read:   if isAdmin();
  allow create: if isAuthenticated() && request.auth.uid == uid;
  allow update: if isAdmin();
  allow delete: if isAdmin();
}
```

5. Run `npm run typecheck` — must pass with zero errors.

6. Commit:
   ```
   feat(roles): add AreaPermissions types, permissions helpers, pendingApprovals Firestore layer
   ```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT R2 — usePendingApprovals hook + registration update
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read these files completely before writing any code:
- CLAUDE.md
- src/renderer/src/hooks/useAuth.ts  (or wherever auth state lives)
- src/renderer/src/lib/firestore.ts
- src/renderer/src/types/index.ts
- The file where new user registration is handled (login page or auth hook)

─── TASK ───────────────────────────────────────────────────────

1. Create `src/renderer/src/hooks/usePendingApprovals.ts`:

```typescript
// src/renderer/src/hooks/usePendingApprovals.ts
// Real-time listener for pending user approvals.
// Only active for admin and owner users.

import { useEffect, useState } from 'react'
import { subscribePendingApprovals } from '../lib/firestore'
import type { AppUser, PendingApproval } from '../types'
import { isPrivileged } from '../lib/permissions'

export function usePendingApprovals(currentUser: AppUser | null) {
  const [pending, setPending] = useState<PendingApproval[]>([])

  useEffect(() => {
    if (!currentUser || !isPrivileged(currentUser)) {
      setPending([])
      return
    }

    const unsub = subscribePendingApprovals((approvals) => {
      // Sort by registeredAt ascending (oldest first)
      const sorted = [...approvals].sort((a, b) => {
        const at = a.registeredAt?.toMillis?.() ?? 0
        const bt = b.registeredAt?.toMillis?.() ?? 0
        return at - bt
      })
      setPending(sorted)
    })

    return unsub
  }, [currentUser?.uid])

  return pending
}
```

2. Find the registration/signup code (where a new user document is created
   with status: 'awaiting'). After creating the user document, also call
   `createPendingApproval(uid, displayName, email)`.

   The two writes should be in a Promise.all so they happen together:

   ```typescript
   await Promise.all([
     setDoc(doc(db, 'users', uid), userDoc),
     createPendingApproval(uid, displayName, email),
   ])
   ```

3. Run `npm run typecheck` — must pass with zero errors.

4. Commit:
   ```
   feat(roles): add usePendingApprovals hook and create pendingApproval on registration
   ```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT R3 — ApprovalModal component
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read these files completely before writing any code:
- CLAUDE.md
- src/renderer/src/types/index.ts
- src/renderer/src/lib/firestore.ts
- src/renderer/src/lib/permissions.ts
- src/renderer/src/hooks/usePendingApprovals.ts
- src/renderer/src/components/ui/   (check what UI primitives exist)

─── TASK ───────────────────────────────────────────────────────

Create `src/renderer/src/components/auth/ApprovalModal.tsx`.

Requirements:
- Opens automatically when `pending.length > 0` (driven by usePendingApprovals)
- Overlay with backdrop blur, does NOT block interaction with rest of UI
  (pointer-events on overlay: none, pointer-events on modal panel: auto)
- Modal is dismissible with [×] button — user can reopen from notification bell
- If pending.length > 1, shows counter "1 of N" with Prev / Next navigation
- Role selector: Member (default) | Admin — radio buttons or segmented control
- areaPermissions editor: one row per area with [None][View][Edit] toggle buttons
  - Boards shown individually (list existing boards from Firestore or use board constants)
  - Areas: Projects, Recipe Manager, Analytics
  - Default state: all None when role=Member, skip when role=Admin
  - When role=Admin is selected, hide the permissions editor (admins have full access)
- "Approve" button: disabled until a role is selected
- "Reject" button: always enabled, triggers rejectUser() with confirmation step
- On approve: calls approveUser(uid, role, areaPermissions), closes modal
- On reject: shows inline confirmation "Reject this user?" [Cancel] [Yes, reject],
  then calls rejectUser(uid)
- When another admin approves/rejects (real-time), auto-advances to next pending user
  or closes modal if queue is empty

Design:
- Width: 480px, max-height: 85vh, scrollable content area
- Use app color scheme: primary green #1D9E75 for Approve button
- Role indicator chips same as MembersPanel (purple=owner, green=admin, gray=member)
- Access level toggle: [None]=gray, [View]=blue, [Edit]=green
- Avatar circle with initials (same pattern as rest of app)

```typescript
// Skeleton — implement the full component
interface ApprovalModalProps {
  pending: PendingApproval[]
  currentUser: AppUser
  boards: Board[]  // existing boards for per-board permissions
  onClose: () => void
}

export function ApprovalModal({ pending, currentUser, boards, onClose }: ApprovalModalProps) {
  // currentIndex state for queue navigation
  // selectedRole state: 'member' | 'admin'
  // areaPermissions state initialized to DEFAULT_AREA_PERMISSIONS
  // confirmReject state: boolean
  // ... full implementation
}
```

5. Run `npm run typecheck` — must pass with zero errors.

6. Commit:
   ```
   feat(roles): add ApprovalModal with role selector, area permissions, and real-time queue
   ```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT R4 — Wire ApprovalModal into app shell + update MembersPanel
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read these files completely before writing any code:
- CLAUDE.md
- src/renderer/src/App.tsx  (or main layout/shell component)
- src/renderer/src/components/settings/MembersPanel.tsx
- src/renderer/src/components/auth/ApprovalModal.tsx
- src/renderer/src/hooks/usePendingApprovals.ts
- src/renderer/src/lib/permissions.ts
- src/renderer/src/lib/firestore.ts
- src/renderer/src/types/index.ts

─── TASK ───────────────────────────────────────────────────────

1. In the main layout/shell component (wherever the sidebar and main content render):

   a) Import and call `usePendingApprovals(currentUser)` — assign to `pendingApprovals`

   b) Add local state:
      ```typescript
      const [showApprovalModal, setShowApprovalModal] = useState(false)
      ```

   c) useEffect: when `pendingApprovals.length > 0`, set `showApprovalModal(true)`

   d) Render at the bottom of the layout (after all other content):
      ```tsx
      {showApprovalModal && isPrivileged(currentUser) && (
        <ApprovalModal
          pending={pendingApprovals}
          currentUser={currentUser}
          boards={boards}  // pass boards from store
          onClose={() => setShowApprovalModal(false)}
        />
      )}
      ```

   e) In the notification bell / NotificationCenter, add a button to reopen
      the modal when `pendingApprovals.length > 0`:
      ```tsx
      {isPrivileged(currentUser) && pendingApprovals.length > 0 && (
        <button onClick={() => setShowApprovalModal(true)}>
          {pendingApprovals.length} pending approval{pendingApprovals.length > 1 ? 's' : ''}
        </button>
      )}
      ```

2. Update `MembersPanel.tsx` to add an AreaPermissionsEditor for member users:

   Create `src/renderer/src/components/settings/AreaPermissionsEditor.tsx`:
   - Props: `user: AppUser`, `boards: Board[]`, `currentUser: AppUser`
   - Renders the same area permissions grid as inside ApprovalModal
   - Calls `updateAreaPermissions(user.uid, newPermissions)` on change (debounced 500ms)
   - Only visible/enabled when `canChangeRole(currentUser, user)` returns true
   - Hidden for owner and admin users (they have full access)

   In `MembersPanel.tsx`:
   - Below each member row (role=member), show a collapsible AreaPermissionsEditor
   - Toggle with a chevron or "Edit permissions" link
   - Owner/admin rows: show "Full access" badge instead

3. Ensure the role-change dropdown in MembersPanel uses `canChangeRole()` to
   control which options appear:
   - Owner viewing member → can promote to admin or keep as member
   - Admin viewing member → can promote to admin or keep as member
   - Admin viewing admin  → no role change (disable dropdown or hide)
   - No one can touch an owner's role (hide controls entirely for owner rows)

4. Run `npm run typecheck` — must pass with zero errors.

5. Deploy updated Firestore rules:
   ```bash
   firebase deploy --only firestore:rules
   ```

6. Update CLAUDE.md — mark these items as [x]:
   - Role-based access control (owner / admin / member)
   - areaPermissions per user (none / view / edit per module)
   - ApprovalModal with real-time queue
   - pendingApprovals Firestore collection

7. Update `DOCUMENTACION_TECNICA_NPD_PLANNER.md` — Section 4 (Usuarios, Roles y Permisos):
   - Replace existing permission matrix with the full one from SPEC_ROLES_PERMISSIONS.md
   - Add areaPermissions schema
   - Add ApprovalModal behavior description
   - Add pendingApprovals collection schema

8. Commit:
   ```
   feat(roles): wire ApprovalModal into shell, add AreaPermissionsEditor in MembersPanel, enforce canChangeRole
   ```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT R5 — Enforce permissions in routes and UI (guard layer)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read these files completely before writing any code:
- CLAUDE.md
- src/renderer/src/App.tsx
- src/renderer/src/lib/permissions.ts
- src/renderer/src/components/board/BoardView.tsx  (or equivalent)
- src/renderer/src/pages/  (all page-level components)
- src/renderer/src/components/ui/  (check for existing guard patterns)

─── TASK ───────────────────────────────────────────────────────

1. In `App.tsx` (or route definitions), wrap analytics and settings routes
   with admin-only guard:

   ```tsx
   // Analytics route — admins only
   <Route path="/analytics" element={
     <ProtectedRoute requireAdmin>
       <AnalyticsPage />
     </ProtectedRoute>
   } />

   // Settings route — admins only
   <Route path="/settings" element={
     <ProtectedRoute requireAdmin>
       <SettingsPage />
     </ProtectedRoute>
   } />
   ```

   Update `ProtectedRoute` to accept `requireAdmin?: boolean` prop.
   When `requireAdmin=true` and user is a member → redirect to `/dashboard`
   with a toast: "You don't have access to this section."

2. In the sidebar navigation, hide or disable links based on permissions:
   - "Analytics" link: visible only if `canViewArea(user, 'analytics')` OR `isPrivileged(user)`
   - "Settings" link: visible only if `isPrivileged(user)`
   - Board links: visible only if `canViewBoard(user, boardId)` OR `isPrivileged(user)`
   - NPD Projects: visible only if `canViewArea(user, 'projects')` OR `isPrivileged(user)`
   - Recipe Manager: visible only if `canViewArea(user, 'recipes')` OR `isPrivileged(user)`

3. In board views (BoardView or equivalent):
   - If `!canViewBoard(user, boardId)` → show "Access restricted" empty state
     with message "You don't have access to this board. Contact an admin."
   - If `canViewBoard` but `!canEditBoard` → hide "+ New Task" button,
     disable drag-and-drop, show tasks as read-only (no checkboxes, no edit)

4. In NPD Projects and Recipe Manager entry points:
   - If `!canViewArea(user, 'projects')` → show "Access restricted" empty state
   - If `canViewArea` but `!canEditArea` → hide create/edit/delete controls

5. Run `npm run typecheck` — must pass with zero errors.

6. Manual test checklist (do this in dev before committing):
   - [ ] Member with no board permissions sees "Access restricted" on all boards
   - [ ] Member with view-only on Planner board sees tasks but cannot create/edit
   - [ ] Member with edit on Planner board can create tasks
   - [ ] Admin sees all boards, all areas, all controls
   - [ ] Owner sees everything, can change any member's role
   - [ ] New user registration triggers ApprovalModal for logged-in admins
   - [ ] Approving with role=admin skips areaPermissions (full access)
   - [ ] Approving with role=member saves areaPermissions correctly

7. Commit:
   ```
   feat(roles): enforce areaPermissions in routes, sidebar, board views, and NPD modules
   ```
