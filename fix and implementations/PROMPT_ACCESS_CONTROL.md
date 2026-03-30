━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT — Granular Area Access Control (Per-Module Permissions)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read KIMI_READ_FIRST.md and CLAUDE.md completely before starting.

Then read these files in full before writing any code:
- src/renderer/src/types/index.ts
- src/renderer/src/lib/firestore.ts
- firestore.rules
- src/renderer/src/hooks/useAuth.ts  (or useAuthStore.ts)
- src/renderer/src/store/authStore.ts
- src/renderer/src/components/ui/AppLayout.tsx
- src/renderer/src/components/ui/ProtectedRoute.tsx
- src/renderer/src/components/settings/MembersPanel.tsx
- src/renderer/src/pages/BoardPage.tsx
- src/renderer/src/pages/SettingsPage.tsx

---

## Context

The current role system (owner / admin / member) stays UNCHANGED.
You are adding a new ACCESS CONTROL LAYER that controls which areas/modules
a `member` user can see and interact with.

Rules:
- `owner` → always full access to everything, areaPermissions do not apply
- `admin`  → always full access to everything, areaPermissions do not apply
- `member` → access controlled by `areaPermissions` field in their user document

Area permission levels:
- `'none'`  → area hidden from sidebar; navigating to its route redirects to /dashboard
- `'view'`  → read-only access (no create/edit/delete actions shown)
- `'edit'`  → full write access within the limits of the member role

---

## Checklist — implement in this exact order

### 1 — types/index.ts

- [ ] Add:
  ```typescript
  export type AreaPermission = 'none' | 'view' | 'edit'
  export type AreaPermissions = Record<string, AreaPermission>
  ```
- [ ] Add `areaPermissions?: AreaPermissions` to the `AppUser` interface

### 2 — firestore.ts

Add these functions (with try/catch, no `any`):

- [ ] `updateUserAreaPermissions(uid: string, areaPermissions: AreaPermissions): Promise<void>`
  — updates only the `areaPermissions` field on the user doc + `updatedAt`
- [ ] `getDefaultPermissions(): Promise<AreaPermissions | null>`
  — reads `settings/defaultPermissions` doc, returns `data.areaPermissions` or null
- [ ] `saveDefaultPermissions(areaPermissions: AreaPermissions): Promise<void>`
  — writes to `settings/defaultPermissions` with `{ areaPermissions, updatedAt }`

### 3 — firestore.rules

- [ ] Find the `allow update` rule for `users/{uid}` that has the `isSelf` branch
- [ ] Add `'areaPermissions'` to the list of protected fields that a user cannot change on themselves:
  ```javascript
  !request.resource.data.diff(resource.data)
    .affectedKeys()
    .hasAny(['role', 'status', 'email', 'uid', 'areaPermissions'])
  ```
- [ ] Add read/write rule for the settings doc:
  ```javascript
  match /settings/{docId} {
    allow read: if isActiveUser();
    allow write: if isAdmin();
  }
  ```
  (Verify this rule doesn't already exist — do not duplicate it)

### 4 — hooks/useAreaPermission.ts (new file)

Create `src/renderer/src/hooks/useAreaPermission.ts`:

```typescript
import { useAuthStore } from '../store/authStore'
import type { AreaPermission } from '../types'

export function useAreaPermission(areaId: string): AreaPermission {
  const { user } = useAuthStore()
  if (!user) return 'none'
  if (user.role === 'owner' || user.role === 'admin') return 'edit'
  return user.areaPermissions?.[areaId] ?? 'none'
}

export function useBoardPermission(boardId: string): AreaPermission {
  return useAreaPermission(`board_${boardId}`)
}
```

### 5 — ProtectedRoute.tsx

- [ ] Add optional prop `areaId?: string` to the component
- [ ] When `areaId` is provided:
  - Get permission via `useAreaPermission(areaId)`
  - If `permission === 'none'` → `<Navigate to="/dashboard" replace />`
  - Otherwise → render children normally
- [ ] Do NOT break existing behavior when `areaId` is not provided

### 6 — AppLayout.tsx — sidebar filtering

- [ ] Import `useAreaPermission` hook
- [ ] For static nav items (Dashboard, My Tasks, My Space, Master Calendar, Analytics):
  - Map each item to its areaId:
    - `/dashboard`  → `'dashboard'`
    - `/my-tasks`   → `'my_tasks'`
    - `/my-space`   → `'my_space'`
    - `/calendar`   → `'calendar'`
    - `/analytics`  → `'analytics'`
  - Filter: only render items where `useAreaPermission(areaId) !== 'none'`
  - `analytics` is already admin-only — keep that check in addition to area permission
- [ ] For boards in the sidebar:
  - Filter: only render boards where `useAreaPermission('board_' + board.id) !== 'none'`
  - Admin/owner still see all boards (hook returns 'edit' for them)

### 7 — BoardPage.tsx — view-only mode

- [ ] Call `useBoardPermission(boardId)` at the top of the component
- [ ] Store result as `boardAccess` ('none' | 'view' | 'edit')
- [ ] When `boardAccess === 'view'`:
  - Hide "+ New Task" button in topbar
  - Show small "View only" badge in topbar (next to board name)
  - Hide column "+ Add" buttons
  - Disable task card 3-dot menu (or hide it entirely)
  - Task cards still clickable — they open TaskPage but in read-only mode
- [ ] When `boardAccess === 'edit'`: no change from current behavior
- [ ] When `boardAccess === 'none'`: redirect to `/dashboard` (ProtectedRoute handles this,
  but add a fallback `useEffect` redirect as belt-and-suspenders)
- [ ] Pass `readOnly={boardAccess === 'view'}` prop down to TaskPage when opened from BoardPage

### 8 — TaskPage.tsx — read-only mode

- [ ] Add optional prop `readOnly?: boolean` to TaskPage
- [ ] When `readOnly === true`:
  - All field inputs become non-editable (show as text, not inputs)
  - Hide "Add subtask" input
  - Hide comment input / send button
  - Hide attachment "+ Attach" button
  - Hide 3-dot menu (duplicate/recurring/delete)
  - Show subtle "View only" label in the header area
- [ ] When `readOnly === false` or undefined: current behavior, no change

### 9 — AccessPermissionsModal.tsx (new component)

Create `src/renderer/src/components/settings/AccessPermissionsModal.tsx`

This modal is opened from MembersPanel when clicking "Manage Access" on a member.

Props:
```typescript
interface Props {
  targetUser: AppUser
  boards: Board[]
  onClose: () => void
}
```

UI layout:
```
Modal header: "Access Permissions — {user.name}"
Subtitle: "Role: Member · Changes apply immediately"

Section: Core Areas
  Row per area: [Area name]  [None ○]  [View ●]  [Edit ○]
  
  Areas in this section:
  - Dashboard         → areaId: 'dashboard'      → options: None, View
  - My Tasks          → areaId: 'my_tasks'        → options: None, View
  - My Space          → areaId: 'my_space'         → options: None, View
  - Master Calendar   → areaId: 'calendar'         → options: None, View
  - Analytics         → areaId: 'analytics'        → options: None, View

Section: Boards
  Row per board: [● dot + board name]  [None ○]  [View ●]  [Edit ○]
  Dynamically built from boards prop

Section: Modules
  Row per module: [Module name]  [None ○]  [View ●]  [Edit ○]
  - EliteQuote        → areaId: 'elitequote'       → options: None, View, Edit
  - Files (Settings)  → areaId: 'settings_files'   → options: None, View

Footer: [Cancel]  [Save Changes]
```

Behavior:
- Local state initialized from `targetUser.areaPermissions ?? {}`
- Radio button group per row — clicking a level updates local state immediately (not saved yet)
- "Save Changes" → calls `updateUserAreaPermissions(targetUser.uid, localState)` → closes modal
- "Cancel" → closes without saving
- Show loading spinner on Save button while saving
- Show success/error toast after save

For radio button styling: use inline radio inputs styled consistently with the rest of the app.
Each row is a flex row: `justify-between items-center py-2 border-b border-gray-100`.
Radio option groups: `flex gap-4 items-center`.
Each option: `flex items-center gap-1.5 text-sm cursor-pointer`.

If `targetUser.role === 'admin' || targetUser.role === 'owner'`:
- Do not show the form at all
- Show: "This user has full access based on their admin role. Area permissions only apply to members."

### 10 — MembersPanel.tsx — add "Manage Access" button

- [ ] Import `AccessPermissionsModal` and `Board` type
- [ ] Subscribe to boards in MembersPanel: `const boards = useBoardStore(s => s.boards)` (or equivalent)
- [ ] Add state: `accessUser: AppUser | null = null`
- [ ] In each active member row (MemberRow), add "Manage Access" button alongside the existing role dropdown:
  - Only show for members (not for other admins/owners if current user is admin)
  - Only show when current user `isAdmin`
  - Button style: small, outlined, same style as existing buttons in the panel
  - `onClick`: `setAccessUser(user)`
- [ ] Render modal when `accessUser !== null`:
  ```tsx
  {accessUser && (
    <AccessPermissionsModal
      targetUser={accessUser}
      boards={boards}
      onClose={() => setAccessUser(null)}
    />
  )}
  ```

### 11 — SettingsPage.tsx — Default Permissions section

- [ ] In the "Members" tab content (only visible to admins), add a collapsible or separated section
  below the MembersPanel titled "Default Permissions for New Members"
- [ ] Description: "When a new member is approved, they receive these permissions automatically.
  You can always customize per user afterward."
- [ ] Show the same area/module rows as AccessPermissionsModal but without the boards section
  (boards are too dynamic for a default — admins should set those per user)
- [ ] Load current defaults via `getDefaultPermissions()` on mount
- [ ] Save via `saveDefaultPermissions(currentState)` on "Save Default Template" button click
- [ ] Apply in `updateUserStatus(uid, 'active')`: before or after setting status, read defaults
  and if they exist, also set `areaPermissions` on the user being approved

### 12 — Apply areaId to existing routes in App.tsx

For each route that has a corresponding area, wrap with `areaId`:
- [ ] `/dashboard`    → ProtectedRoute areaId="dashboard"
- [ ] `/my-tasks`     → ProtectedRoute areaId="my_tasks"
- [ ] `/my-space`     → ProtectedRoute areaId="my_space"
- [ ] `/calendar`     → ProtectedRoute areaId="calendar"
- [ ] `/analytics`    → ProtectedRoute areaId="analytics"
- [ ] `/board/:boardId` → ProtectedRoute with dynamic areaId — read boardId from params
  This requires a small wrapper component since hooks can't be used directly in the route:
  ```tsx
  function BoardRoute() {
    const { boardId } = useParams()
    const permission = useAreaPermission(`board_${boardId}`)
    if (permission === 'none') return <Navigate to="/dashboard" replace />
    return <BoardPage />
  }
  ```

### 13 — Verification

- [ ] Run `npm run typecheck` — zero errors
- [ ] Test as member with no permissions: sidebar shows only items with access
- [ ] Test "Manage Access" modal: toggle permissions, save, user's sidebar updates immediately
- [ ] Test board view-only: no create/edit actions visible
- [ ] Test board none: redirects to dashboard
- [ ] Test owner/admin: never affected, always full access
- [ ] Test Default Permissions: approve a new member, they inherit the template
- [ ] Test Firestore rules: member cannot update own areaPermissions via direct write

### 14 — Post-completion

- [ ] Update `CLAUDE.md` — mark this feature as complete
- [ ] Update `DOCUMENTACION_TECNICA_NPD_PLANNER.md`:
  - Update section 4 (Usuarios, Roles y Permisos) with the new area permissions matrix
  - Add `areaPermissions` to the users collection schema
  - Document `AreaPermission` type and `useAreaPermission` hook

---

## Commit message

```
feat: granular area access control for member users

- AreaPermission type: none | view | edit per module/board
- useAreaPermission hook: returns 'edit' for admin/owner always
- AppLayout sidebar filtered by area permission per user
- ProtectedRoute supports areaId prop for route-level enforcement
- BoardPage: view-only mode hides all write actions when view permission
- TaskPage: readOnly prop propagates no-edit UI state
- AccessPermissionsModal: per-user config with None/View/Edit radio groups
- MembersPanel: "Manage Access" button opens modal for any member
- Settings Members tab: Default Permissions template for new approvals
- firestore.rules: blocks self-update of areaPermissions
- Backward compatible: owner/admin unaffected, existing members default to none
```
