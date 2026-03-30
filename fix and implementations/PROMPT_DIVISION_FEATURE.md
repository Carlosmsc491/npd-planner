━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT — Division Feature (Client Sub-level)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read KIMI_READ_FIRST.md and CLAUDE.md completely before starting.

Then read these files in full:
- src/renderer/src/types/index.ts
- src/renderer/src/lib/firestore.ts
- src/renderer/src/lib/sharepointLocal.ts
- src/renderer/src/components/ui/NewTaskModal.tsx
- src/renderer/src/components/task/TaskPage.tsx
- src/renderer/src/pages/SettingsPage.tsx
- src/renderer/src/components/settings/ClientManager.tsx
- firestore.rules

---

## Context

The task hierarchy is being extended. Previously:
  Year → Client → Task Name

New hierarchy:
  Year → Client → Division → Task Name

Real example: 2026 > Publix > Salt Lake > Task Name

Division is an optional sub-level under a client. Existing tasks without a
division continue working identically (backward compatible). The SharePoint
file path gains an extra folder when a division is set.

---

## Checklist — implement in this exact order

### 1 — types/index.ts
- [ ] Add `Division` interface:
  ```typescript
  export interface Division {
    id: string
    clientId: string
    name: string
    active: boolean
    createdAt: Timestamp
    updatedAt: Timestamp
    createdBy: string
  }
  ```
- [ ] Add `divisionId?: string | null` to the existing `Task` interface

### 2 — firestore.ts
Add these functions (follow the exact same pattern as client functions):
- [ ] `subscribeToDivisions(clientId: string, callback): Unsubscribe`
  — queries `divisions` collection where `clientId == clientId && active == true`
  — ordered by `name` ascending
- [ ] `subscribeToAllDivisions(callback): Unsubscribe`
  — all active divisions, no clientId filter (used in Settings)
- [ ] `createDivision(data: Omit<Division, 'id' | 'createdAt' | 'updatedAt'>): Promise<string>`
  — uses nanoid for id, sets createdAt/updatedAt = serverTimestamp()
- [ ] `updateDivision(id: string, data: Partial<Pick<Division, 'name' | 'active'>>): Promise<void>`
  — updates updatedAt = serverTimestamp()

### 3 — firestore.rules
- [ ] Add rule for `divisions` collection:
  ```
  match /divisions/{divisionId} {
    allow read: if isActiveUser();
    allow write: if isActiveUser();
  }
  ```

### 4 — hooks/useDivisions.ts (new file)
- [ ] Create `src/renderer/src/hooks/useDivisions.ts`
- [ ] Hook signature: `useDivisions(clientId: string | null | undefined)`
- [ ] Returns `{ divisions: Division[], loading: boolean }`
- [ ] When `clientId` is null/undefined/empty → `divisions = []`, skip subscription
- [ ] When `clientId` changes → unsubscribe previous, subscribe new
- [ ] Uses `subscribeToDivisions` from firestore.ts

### 5 — NewTaskModal.tsx
- [ ] Import `useDivisions` hook and `createDivision` from firestore
- [ ] Add state: `divisionId`, `showNewDivision`, `newDivisionName`
- [ ] Call `useDivisions(clientId)` — reactive to client selection
- [ ] After the Client field, add Division field:
  - Hidden when no `clientId` is selected
  - If `showNewDivision` is true: show inline input (same pattern as New Client)
  - If `showNewDivision` is false: show select with active divisions + `+ New Division` last option
  - If no divisions exist for the client: show only `+ New Division` option
  - Selecting `__new__` triggers `setShowNewDivision(true)`
- [ ] `handleCreateDivision`: creates division via `createDivision`, auto-selects it, closes inline input
- [ ] When client changes: reset `divisionId` to `''`
- [ ] Include `divisionId: divisionId || null` in `createTask` call

### 6 — TaskPage.tsx
- [ ] Import `useDivisions` and `updateDivision`
- [ ] Call `useDivisions(task.clientId)`
- [ ] Add Division PropRow below the Client PropRow:
  - Icon: `<Layers size={14} />` (import from lucide-react)
  - Label: "Division"
  - If `task.clientId` is empty: render `<span className="text-sm text-gray-400 italic">Select a client first</span>`
  - Otherwise: same select + inline new pattern as the client field
- [ ] When client changes in TaskPage: update task with `{ clientId: newId, divisionId: null }`
  (clear division when client changes)
- [ ] Update SharePoint path display breadcrumb:
  - Current: `📁 {year} / {clientName} / {taskTitle}`
  - New: `📁 {year} / {clientName} / {divisionName} / {taskTitle}` when divisionId is set
  - Resolve divisionName from the `divisions` array via divisionId

### 7 — sharepointLocal.ts
- [ ] Update `buildDestinationPath` signature to accept optional `divisionName?: string`
- [ ] When `divisionName` is provided: path becomes `root/year/client/division/task/file`
- [ ] When `divisionName` is absent: path stays `root/year/client/task/file` (backward compatible)
- [ ] Update `buildRelativePath` with the same logic
- [ ] Find all callers of `buildDestinationPath` and `buildRelativePath` in the codebase
- [ ] Update callers to resolve `divisionName` from the client/division data available at call site

### 8 — DivisionManager.tsx (new file)
Create `src/renderer/src/components/settings/DivisionManager.tsx`:
- [ ] Uses `subscribeToAllDivisions` to get all divisions
- [ ] Uses `subscribeToClients` (or existing store) to populate client filter dropdown
- [ ] Client filter dropdown at top: "All clients" + each client alphabetically
- [ ] Table columns: Name | Client | Status | Actions
- [ ] Actions: edit (inline rename, same pattern as ClientManager) + deactivate (sets active: false)
- [ ] "+ Add Division" button → opens inline form: Name input + Client dropdown → calls `createDivision`
- [ ] Admin only (wrap with `isAdmin` check, same as ClientManager)

### 9 — SettingsPage.tsx
- [ ] Import `DivisionManager`
- [ ] Add `'divisions'` to the tabs array, between `'clients'` and `'labels'`:
  ```typescript
  { id: 'divisions', label: 'Divisions' }
  ```
- [ ] Add render block for `activeTab === 'divisions'`:
  ```tsx
  {activeTab === 'divisions' && isAdmin && (
    <div>
      <h2 className="text-base font-semibold ...">Division Management</h2>
      <p className="text-sm text-gray-500 ... mb-5">
        Manage divisions per client. Divisions appear as a sub-level under clients in tasks.
      </p>
      <DivisionManager />
    </div>
  )}
  ```

### 10 — Verification
- [ ] Run `npm run typecheck` — zero errors
- [ ] Test: create a task, select client, divisions appear below, "+ New Division" works
- [ ] Test: task with division shows correct breadcrumb path
- [ ] Test: changing client in existing task clears division
- [ ] Test: Settings → Divisions tab shows all divisions filterable by client
- [ ] Test: SharePoint path includes division folder when division is set
- [ ] Test: tasks without division still work identically (no regression)

### 11 — Post-completion
- [ ] Update `CLAUDE.md` — mark this feature as complete in Phase checklist
- [ ] Update `DOCUMENTACION_TECNICA_NPD_PLANNER.md`:
  - Add `Division` to Firebase Collections Schema
  - Update SharePoint Path Structure to show: `{root}/{year}/{client}/{division?}/{task}/{file}`
  - Update task hierarchy description

---

## Commit message

```
feat: add division as client sub-level (year > client > division > task)

- Division Firestore collection with CRUD operations
- useDivisions hook reactive to clientId changes
- NewTaskModal: division dropdown appears after client selection
- TaskPage: division PropRow with inline create, auto-clear on client change
- SharePoint path: year/client/division/task/file when division is set
- Settings: Divisions tab with DivisionManager (filter by client)
- Backward compatible: tasks without division unaffected
```
