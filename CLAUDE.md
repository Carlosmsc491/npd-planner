# NPD Planner — Claude Code Master Context

> READ THIS ENTIRE FILE BEFORE WRITING ANY CODE.
> Update checkboxes as features are completed.
> Never skip this file, even for small tasks.

---

## Knowledge Graph (graphify)

A pre-built knowledge graph of this codebase lives in `graphify-out/`.
**Before exploring files or grepping, query the graph first.**

- `graphify-out/GRAPH_REPORT.md` — god nodes, community map, suggested questions
- `graphify-out/graph.json` — full queryable graph
- `graphify-out/graph.html` — interactive visual (open in browser)

**God nodes (highest connectivity — touch carefully):**
- `useAuthStore` — 98 edges, touches the entire app
- `Task` — 51 edges, bridge between 23 communities
- `useBoardStore` — 37 edges
- `RecipeFile` — 31 edges
- `useTaskStore` — 28 edges
- `useSettingsStore` — 21 edges

**Surprising cross-cutting connections:**
- `insert_photo.py` → `ReadyEntry` — Python Excel script is coupled to the TypeScript photo manifest
- `npd-workflow Skill` → `NPD Planner App` — CLAUDE.md skill is documentally tied to the product

Run `/graphify .` to regenerate the graph after significant changes.

---

## Critical Rules (NEVER violate)

- `createRecipeProject` and `upsertRecipeFile` must **always be awaited** — skipping await breaks app state silently
- Never delete or modify `lottie.min.js` — it's a bundled vendor file
- Firebase reads belong in **stores**, never directly in components
- Free-tier Firebase quota is active — avoid unbounded `onSnapshot` listeners; scope queries tightly
- `path.join()` always — never concatenate paths with `/` or `\`
- No `any` in TypeScript — define interfaces for everything
- **Mac platform guards required** — all platform-specific code must use `process.platform === 'win32'` guards (see §13 of DOCUMENTACION_TECNICA)

---

## App Identity

- **Name:** NPD Planner
- **Company:** Elite Flower
- **Platform:** Desktop — Windows (.exe) + Mac (.dmg)
- **Purpose:** Central operations hub for team task management, trips, vacations, and file coordination
- **Auth domain:** @eliteflower.com ONLY — all other domains are rejected at registration and login
- **Language:** ALL user-facing text must be in English. No Spanish strings anywhere in the UI.

---

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Desktop | Electron 25 | Windows + Mac. Use electron-vite for dev |
| Frontend | React 18 + TypeScript | Strict mode. No `any` types ever |
| Styling | Tailwind CSS | Dark mode via `class` strategy |
| Database | Firebase Firestore | Real-time sync. Free tier |
| Auth | Firebase Auth | Email/password. @eliteflower.com only |
| File storage | SharePoint (local sync folder) | No cloud upload — copy to local SharePoint folder |
| Calendar | FullCalendar.js | Day/week/month views + drag resize |
| Charts | Recharts | Analytics dashboard + annual reports |
| PDF Export | jsPDF + html2canvas | Annual summary with charts |
| Search | Fuse.js | Global fuzzy search Ctrl+K |
| Auto-update | electron-updater | Manual confirm on Mac, silent on Windows |
| Path handling | Node path.join() | ALWAYS use path.join — never hardcode / or \ |
| Photo tethering | gPhoto2 + chokidar | Mac only (Fase 1). gPhoto2 via Homebrew |
| AWB tracking | Traze (Playwright) | Background service, credentials in OS keychain |
| Recipe Excel | PowerShell COM (Win) / AppleScript (Mac) | Requires Microsoft Excel installed |

---

## Project Structure

```
npd-planner/
├── CLAUDE.md                    ← THIS FILE — read first always
├── .env                         ← Firebase credentials — NEVER commit this
├── .env.example                 ← Template with key names, no values
├── .gitignore                   ← Must include .env
├── package.json
├── electron.vite.config.ts
├── graphify-out/                ← Pre-built knowledge graph (query before grepping)
│   ├── graph.html
│   ├── graph.json
│   └── GRAPH_REPORT.md
├── src/
│   ├── main/                    ← Electron main process
│   │   ├── index.ts             ← App entry, window creation, IPC registration
│   │   ├── updater.ts           ← electron-updater (autoDownload=false on Mac)
│   │   ├── splash.ts            ← Splash screen
│   │   ├── camera/
│   │   │   └── CameraManager.ts ← gPhoto2 + chokidar (Mac only)
│   │   ├── ipc/
│   │   │   ├── fileHandlers.ts          ← File copy, SharePoint verify, open
│   │   │   ├── notificationHandlers.ts  ← Desktop notifications
│   │   │   ├── cameraHandlers.ts        ← Camera tethering IPC + photo export
│   │   │   ├── excelHandlers.ts         ← Python insert_photo.py wrapper
│   │   │   ├── recipeIpcHandlers.ts     ← Recipe XLSX + project discovery
│   │   │   ├── photoManifestHandlers.ts ← Per-recipe JSON manifest read/write
│   │   │   ├── emailHandlers.ts         ← .msg / .eml parsing
│   │   │   ├── awbIpcHandlers.ts        ← AWB CSV lookup
│   │   │   └── crashReportHandlers.ts   ← Error reporting
│   │   └── services/
│   │       ├── trazeIntegrationService.ts  ← Traze scheduler
│   │       ├── trazePlaywrightService.ts   ← Playwright browser automation
│   │       ├── trazeCredentialsService.ts  ← OS keychain credentials
│   │       ├── trazeStatusService.ts
│   │       ├── trazePreferencesService.ts
│   │       ├── trazeWindowManager.ts
│   │       ├── awbLookupService.ts
│   │       ├── errorReporter.ts
│   │       └── trashCleanupService.ts
│   ├── preload/
│   │   ├── index.ts             ← contextBridge — all IPC exposed here
│   │   └── index.d.ts
│   ├── renderer/                ← React app (runs in Electron window)
│   │   ├── index.html
│   │   ├── main.tsx             ← React entry (no StrictMode — Firebase 12 incompatible)
│   │   ├── App.tsx              ← Router setup
│   │   ├── components/
│   │   │   ├── ui/              ← AppLayout, NewTaskModal, ConflictDialog, WhatsNewModal...
│   │   │   ├── board/           ← BoardView, TaskCard, BoardColumn, GanttView, ListView
│   │   │   ├── task/            ← TaskPage, SubtaskList, ActivityLog, CommentSection, AttachmentPanel
│   │   │   ├── calendar/        ← MasterCalendar, BoardCalendar
│   │   │   ├── notifications/   ← NotificationBell, NotificationCenter
│   │   │   ├── search/          ← GlobalSearch (Ctrl+K / Cmd+K)
│   │   │   ├── analytics/       ← AnalyticsDashboard, HistoricalAnalytics
│   │   │   ├── auth/            ← ApprovalModal
│   │   │   ├── recipes/         ← RecipeHomePage, RecipeProjectPage, PhotoManagerView, CapturePage...
│   │   │   └── settings/        ← MembersPanel, LabelManager, ClientManager, SharePointSetup...
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx
│   │   │   ├── AwaitingApprovalPage.tsx
│   │   │   ├── DashboardPage.tsx
│   │   │   ├── BoardPage.tsx
│   │   │   ├── CalendarPage.tsx
│   │   │   ├── AnalyticsPage.tsx
│   │   │   ├── SettingsPage.tsx
│   │   │   ├── CapturePage.tsx          ← /capture/:recipeId
│   │   │   ├── MyTasksPage.tsx
│   │   │   ├── MySpacePage.tsx
│   │   │   └── EmergencyPage.tsx        ← Hidden route /emergency
│   │   ├── hooks/
│   │   │   ├── useAuth.ts
│   │   │   ├── useBoard.ts
│   │   │   ├── useTasks.ts
│   │   │   ├── useClients.ts
│   │   │   ├── useLabels.ts
│   │   │   ├── useNotifications.ts
│   │   │   ├── useSharePoint.ts         ← sharePointPath localStorage-only on Mac (ADR-006)
│   │   │   ├── useKeyboardShortcuts.ts
│   │   │   ├── useCameraStatus.ts
│   │   │   ├── useProjectRootPath.ts    ← 4-step cross-machine path resolution
│   │   │   ├── useRecipeFiles.ts
│   │   │   ├── useRecipeLock.ts
│   │   │   ├── useRecipeNotes.ts
│   │   │   ├── usePendingApprovals.ts
│   │   │   ├── useMyTasks.ts
│   │   │   ├── useMySpace.ts
│   │   │   ├── useSearch.ts
│   │   │   ├── useAwbLookup.ts
│   │   │   ├── useTrazeSettings.ts
│   │   │   └── useTrazeRefresh.ts
│   │   ├── store/
│   │   │   ├── authStore.ts         ← Zustand auth state
│   │   │   ├── boardStore.ts
│   │   │   ├── taskStore.ts
│   │   │   ├── notificationStore.ts
│   │   │   └── settingsStore.ts
│   │   ├── lib/
│   │   │   ├── firebase.ts              ← Firebase init (reads from .env)
│   │   │   ├── firestore.ts             ← All Firestore operations
│   │   │   ├── recipeFirestore.ts       ← Recipe-specific Firestore ops
│   │   │   ├── recipeExcel.ts           ← Excel read/write via IPC
│   │   │   ├── permissions.ts           ← Role/area permission helpers
│   │   │   ├── photoManifestApi.ts      ← Manifest IPC wrappers
│   │   │   ├── photoManifestProjection.ts
│   │   │   ├── sharepointLocal.ts       ← Local SharePoint file operations
│   │   │   ├── sharepointTemplates.ts
│   │   │   ├── emailAttachments.ts
│   │   │   ├── plannerImporter.ts
│   │   │   └── repositories/            ← Repository pattern (IRecipeRepository etc.)
│   │   ├── types/
│   │   │   └── index.ts                 ← All TypeScript interfaces
│   │   └── utils/
│   │       ├── dateUtils.ts
│   │       ├── colorUtils.ts
│   │       ├── exportUtils.ts           ← PDF + CSV export
│   │       ├── hashUtils.ts             ← SHA-256 for emergency key
│   │       └── photoUtils.ts            ← Path resolution for photos (getLibraryRoot etc.)
│   ├── shared/
│   │   ├── constants.ts                 ← Shared between main and renderer
│   │   └── photoManifest.ts             ← PhotoManifest types + mergeManifests
│   └── types/
│       └── index.ts                     ← Global types (shared)
├── resources/
│   ├── scripts/
│   │   └── insert_photo.py              ← Python: insert JPG into Excel Spec Sheet
│   └── templates/
│       └── ELITE QUOTE BOUQUET 2026.xlsx ← Default recipe template (bundled)
├── firestore.rules                      ← Firebase security rules
└── electron-builder.yml                 ← Build config for .exe and .dmg
```

---

## Firebase Collections Schema

### `users`
```typescript
{
  uid: string           // Firebase Auth UID
  email: string         // Must end in @eliteflower.com
  name: string
  role: 'admin' | 'member'
  status: 'active' | 'awaiting' | 'suspended'
  createdAt: Timestamp
  lastSeen: Timestamp
  preferences: {
    theme: 'light' | 'dark' | 'system'
    dndStart: string    // "22:00" — do not disturb start
    dndEnd: string      // "08:00" — do not disturb end
    shortcuts: Record<string, string>  // action → key binding
    sharePointPath: string  // local path — Windows only writes to Firestore (ADR-006)
  }
}
```

### `boards`
```typescript
{
  id: string
  name: string
  color: string         // hex color
  type: 'planner' | 'trips' | 'vacations' | 'custom'
  order: number
  createdBy: string     // uid
  createdAt: Timestamp
}
```

### `tasks`
```typescript
{
  id: string
  boardId: string
  title: string
  clientId: string      // REQUIRED — reference to clients collection
  status: 'todo' | 'inprogress' | 'review' | 'done'
  priority: 'normal' | 'high'
  assignees: string[]   // array of uids
  labelIds: string[]    // array of label ids
  bucket: string        // group/column name
  dateStart: Timestamp | null
  dateEnd: Timestamp | null
  notes: string
  poNumber: string
  awbNumber: string
  subtasks: {
    id: string
    title: string
    completed: boolean
    assigneeUid: string | null
  }[]
  attachments: {
    id: string
    name: string
    sharePointRelativePath: string  // relative to SharePoint root
    uploadedBy: string
    uploadedAt: Timestamp
    status: 'synced' | 'pending' | 'error'
  }[]
  recurring: {
    enabled: boolean
    frequency: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom'
    customDays: number[] | null   // 0=Sun, 1=Mon... for custom
    nextDate: Timestamp | null
  } | null
  completed: boolean
  completedAt: Timestamp | null
  completedBy: string | null
  createdBy: string
  createdAt: Timestamp
  updatedAt: Timestamp
  updatedBy: string
}
```

### `clients`
```typescript
{
  id: string
  name: string
  active: boolean
  createdAt: Timestamp
  createdBy: string
}
```

### `labels`
```typescript
{
  id: string
  name: string
  color: string         // hex background color
  textColor: string     // hex text color (auto-computed dark/light)
  boardId: string | null  // null = global label
  createdAt: Timestamp
}
```

### `taskHistory`
```typescript
{
  id: string
  taskId: string
  userId: string
  userName: string
  action: 'created' | 'updated' | 'completed' | 'reopened' | 'deleted'
  field: string | null        // which field changed
  oldValue: string | null
  newValue: string | null
  timestamp: Timestamp
}
```

### `comments`
```typescript
{
  id: string
  taskId: string
  authorId: string
  authorName: string
  text: string
  mentions: string[]    // uids mentioned with @
  createdAt: Timestamp
  editedAt: Timestamp | null
}
```

### `notifications`
```typescript
{
  id: string
  userId: string        // recipient
  taskId: string
  boardId: string
  boardType: string     // 'planner' | 'trips' | 'vacations' | 'custom'
  type: 'assigned' | 'updated' | 'completed' | 'comment' | 'mentioned'
  message: string
  read: boolean
  createdAt: Timestamp
  triggeredBy: string   // uid of who caused the notification
}
```

### `archive`
```typescript
{
  id: string            // format: "2025"
  year: number
  generatedAt: Timestamp
  summary: {
    totalTasks: number
    totalTrips: number
    totalVacations: number
    byBoard: Record<string, number>
    byClient: Record<string, number>
    byAssignee: Record<string, number>
    byMonth: number[]   // index 0=Jan, 11=Dec
    completionRate: number
  }
}
```

### `settings` (single document: "global")
```typescript
{
  sharePointVerificationFolder: 'REPORTS (NPD-SECURE)'
  archiveAfterMonths: 12
  notificationsEnabled: true
}
```

### `settings` (single document: "emergency")
```typescript
{
  masterKeyHash: string   // SHA-256 hash — NEVER store plain text
}
```

---

## Firebase Security Rules (firestore.rules)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isAuth() {
      return request.auth != null;
    }

    function isActiveUser() {
      return isAuth() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.status == 'active';
    }

    function isAdmin() {
      return isActiveUser() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }

    function isEliteFlowerEmail() {
      return request.auth.token.email.matches('.*@eliteflower\\.com$');
    }

    // Users collection
    match /users/{uid} {
      allow read: if isActiveUser();
      allow create: if isAuth() && isEliteFlowerEmail() && uid == request.auth.uid;
      allow update: if isAdmin() ||
        (uid == request.auth.uid && !request.resource.data.diff(resource.data).affectedKeys().hasAny(['role', 'status']));
    }

    // Boards
    match /boards/{boardId} {
      allow read: if isActiveUser();
      allow write: if isAdmin();
    }

    // Tasks
    match /tasks/{taskId} {
      allow read: if isActiveUser();
      allow create: if isActiveUser();
      allow update: if isActiveUser();
      allow delete: if isAdmin() ||
        resource.data.createdBy == request.auth.uid;
    }

    // Clients
    match /clients/{clientId} {
      allow read: if isActiveUser();
      allow write: if isActiveUser();
    }

    // Labels
    match /labels/{labelId} {
      allow read: if isActiveUser();
      allow write: if isAdmin();
    }

    // Comments
    match /comments/{commentId} {
      allow read: if isActiveUser();
      allow create: if isActiveUser();
      allow update, delete: if isActiveUser() &&
        resource.data.authorId == request.auth.uid;
    }

    // Task history (append-only)
    match /taskHistory/{historyId} {
      allow read: if isActiveUser();
      allow create: if isActiveUser();
      allow update, delete: if false;
    }

    // Notifications
    match /notifications/{notifId} {
      allow read: if isActiveUser() && resource.data.userId == request.auth.uid;
      allow create: if isActiveUser();
      allow update: if isActiveUser() && resource.data.userId == request.auth.uid;
      allow delete: if false;
    }

    // Archive (read all, write admin only)
    match /archive/{archiveId} {
      allow read: if isActiveUser();
      allow write: if isAdmin();
    }

    // Settings
    match /settings/{docId} {
      allow read: if isActiveUser();
      allow write: if isAdmin();
    }
  }
}
```

---

## SharePoint Local File Strategy

The app does NOT upload to SharePoint via API. Instead:

1. On first launch, ask user: "Select your local SharePoint sync folder"
2. Verify the selected folder contains a subfolder named exactly: `REPORTS (NPD-SECURE)`
3. If not found: show error "Folder not recognized. Please select the correct SharePoint folder."
4. Save the verified path in localStorage (Mac) or localStorage + Firestore (Windows)
5. When user attaches a file to a task:
   - Compute destination: `path.join(sharePointRoot, year, clientName, taskTitle, fileName)`
   - Create folders if they don't exist: `fs.mkdirSync(dest, { recursive: true })`
   - Copy file: `fs.copyFileSync(sourcePath, destPath)`
   - Save relative path in task attachment (relative to SharePoint root)
   - Show status: uploading → synced (SharePoint syncs to cloud automatically)
6. If copy fails: mark attachment as 'error', add to retry queue
7. Retry queue checks every 30 seconds

**Mac path example:**
```
/Users/carlos/Library/CloudStorage/OneDrive-SharedLibraries-EliteFlower/NPD-SECURE - Documents/REPORTS/NPD-PLANNER
```

**Windows path example:**
```
C:\Users\carlos\OneDrive - Elite Flower\Documents - NPD-SECURE\REPORTS\NPD-PLANNER
```

**ADR-006:** `sharePointPath` is machine-local. On Mac, it lives in `localStorage` only — never written to Firestore. On Windows, it also syncs to Firestore for compatibility.

---

## Key Business Rules

### Notifications (IMPORTANT)
- **Only Planner board tasks trigger desktop notifications + sound**
- Trips and Vacations: NO desktop notifications
- Notify ONLY users listed in task.assignees
- Also notify on: being newly assigned to a task, @mention in a comment
- Respect user's DND schedule (dndStart/dndEnd in preferences)
- All notifications go to notification center (bell) regardless of DND

### Task Completion
- Click circle checkbox → task.completed = true, completedAt = now
- Completed tasks fade to 40% opacity and move to bottom of column
- "Show completed (N)" toggle appears at column bottom when N > 0
- Undo: show toast for 5 seconds with "Undo" button — if clicked, revert

### Recurring Tasks
- When a recurring task is completed, auto-create next instance with new date
- Frequencies: daily (+1 day), weekly (+7 days), monthly (+1 month), yearly (+1 year), custom (specific weekdays)
- Next instance inherits all properties except completion status

### Simultaneous Edit Merge
- Use Firestore transactions for field-level updates
- If two users edit DIFFERENT fields simultaneously: merge both changes
- If two users edit THE SAME field simultaneously: show conflict dialog
  - "Carlos changed title to X" vs "Laura changed title to Y" → let current user choose

### Annual Archive
- Run check on app startup: find tasks where completed=true AND completedAt < (now - 12 months)
- Generate summary document in `archive` collection
- Move tasks to `archivedTasks` sub-collection
- Only admins can trigger manual archive from Settings

### Client Required
- `clientId` is required on every task — form cannot submit without it
- Client dropdown: active clients alphabetically + "+ New Client" as last option
- New Client modal: just a name field → creates client → auto-selects it

---

## Environment Variables (.env)

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_APP_VERSION=1.0.0
VITE_ALLOWED_DOMAIN=eliteflower.com
```

---

## Color Palette

```typescript
const BOARD_COLORS = {
  planner:   '#1D9E75',
  trips:     '#378ADD',
  vacations: '#D4537E',
}

const STATUS_COLORS = {
  todo:       { bg: '#F1EFE8', text: '#444441' },
  inprogress: { bg: '#FAEEDA', text: '#633806' },
  review:     { bg: '#E6F1FB', text: '#0C447C' },
  done:       { bg: '#E1F5EE', text: '#085041' },
}

const PRIORITY_COLORS = {
  high:   '#E24B4A',
  normal: '#888780',
}
```

---

## Release Process

### Windows release
1. Bump version in `package.json`
2. Update WhatsNewModal version constant
3. Commit all changes
4. Run: `npm run release:win`
   - Builds the app and publishes directly to GitHub Releases
   - Requires `GH_TOKEN` environment variable (already configured)
   - Creates the release with `latest.yml` so auto-updater works
5. Windows users receive the update automatically within 1 hour

**IMPORTANT:** Never manually upload `.exe` files to GitHub Releases.
Always use `npm run release:win` to keep `latest.yml` in sync.

### Mac release
1. Bump version in `package.json`
2. Update WhatsNewModal version constant
3. Commit all changes
4. Run: `npm run build:mac`
   - Generates `dist-electron/npd-planner-X.Y.Z.dmg` and `dist-electron/latest-mac.yml`
5. Upload **both files** to the GitHub Release manually:
   ```bash
   gh release upload vX.Y.Z dist-electron/npd-planner-X.Y.Z.dmg dist-electron/latest-mac.yml --clobber
   ```
6. Mac users see an "Update available" notification — they confirm to install

**IMPORTANT:** Always upload `latest-mac.yml` alongside the `.dmg` or the Mac auto-updater won't find the new version.

---

## Build Configuration (electron-builder.yml)

```yaml
appId: com.eliteflower.npdplanner
productName: NPD Planner
directories:
  output: dist-electron
files:
  - dist/**/*
  - node_modules/**/*
win:
  target: nsis
  icon: resources/icon.ico
mac:
  target: dmg
  icon: resources/icon.icns
  category: public.app-category.productivity
publish:
  provider: github
  owner: eliteflower
  repo: npd-planner
```

---

## Feature Completion Checklist

Update these as you complete each feature. Add [x] when done.

### Phase 1 — Foundation
- [x] Electron + React + TypeScript scaffold (electron-vite)
- [x] Firebase initialized with .env variables
- [x] Tailwind CSS configured with dark mode class strategy
- [x] React Router with all page routes
- [x] TypeScript interfaces for all data types (types/index.ts)
- [x] Zustand stores scaffolded

### Phase 2 — Auth & Members
- [x] Login page with @eliteflower.com validation
- [x] New user → status: awaiting → sees approval pending screen
- [x] Suspended user → sees access revoked screen
- [x] Firebase Auth Rules deployed (June 2026 — `firebase deploy --only firestore:rules`, covers all collections incl. recipeProjects subtree + deny-all catch)
- [x] Members panel (Settings) — list, approve, reject, change role, suspend
- [x] Role-based access control (owner / admin / member) with full hierarchy
- [x] areaPermissions per user (none / view / edit per board and module)
- [x] ApprovalModal with real-time queue — auto-opens for admin/owner on new registration
- [x] pendingApprovals Firestore collection — created on register, deleted on approve/reject
- [x] AreaPermissionsEditor — inline collapsible widget in MembersPanel
- [x] canChangeRole / canSuspendUser / canDeleteUser permission helpers (permissions.ts)
- [x] Settings route and sidebar link hidden from non-admin users
- [x] Board view read-only mode for view-only area permission (no create/edit/delete)
- [x] Emergency access (/emergency route + SHA-256 key check)
- [x] Auto-update configured (electron-updater)

### Phase 3 — Boards & Tasks Core
- [x] Sidebar with Planner, Trips, Vacations boards
- [x] Cards view with Group By selector
- [x] List view (table)
- [x] Task card with labels, checkbox, assignee avatars, date, priority
- [x] Completed tasks: fade, move to bottom, show/hide toggle
- [x] 3-dot menu: Duplicate, Make Recurring, Delete
- [x] Recurring task modal (daily/weekly/monthly/yearly/custom)
- [x] Task page (full modal): all properties editable
- [x] Subtasks checklist with progress bar
- [x] Comments section with @mentions
- [x] Activity log (append-only, auto-generated on each field change)
- [x] Client required field + New Client inline creation
- [x] Labels assignment in task
- [x] Empty states for all board views

### Phase 4 — Sync & Offline
- [x] Firebase Persistence (persistentLocalCache + persistentMultipleTabManager)
- [x] Connection status indicator (bottom corner)
- [x] Offline mode: queue writes, sync on reconnect
- [x] Simultaneous edit merge with conflict resolution dialog
- [x] Undo toast (5 seconds) for task deletion
- [x] **Optimistic updates** — task changes reflect instantly in UI, Firestore sync in background
- [x] **Board properties sync** — add/delete properties in Settings reflects immediately app-wide

### Phase 5 — Calendar
- [x] FullCalendar installed and configured
- [x] Day / Week / Month view switcher per board
- [x] Events draggable + resizable (drag edge to change dates)
- [x] + button on day hover (top-left of cell) → opens NewTaskModal with date pre-filled
- [x] Master Calendar page: all boards unified
- [x] Board filter toggles on Master Calendar (persisted to localStorage)
- [x] Timeline (Gantt) view
- [x] **Timezone fix** — dates display correctly in all timezones
- [x] **Multi-date tags** — tasks can have typed dates (Preparation, Ship, Set up, Show day)
- [x] **Calendar markers** — taskDates shown as positioned markers inside the main event bar (single row per task)

### Phase 6 — SharePoint & Files
- [x] First-launch SharePoint path setup wizard
- [x] Path verification (checks for REPORTS (NPD-SECURE) subfolder)
- [x] SharePoint path editable in Settings
- [x] File attach in task: copies to year/client/task folder
- [x] Folder auto-creation on attach
- [x] Attachment status icons: uploading / synced / error
- [x] Retry queue (every 30 seconds) for failed copies
- [x] PDF preview (pdf.js)
- [x] Image preview (base64 lightbox)
- [x] Office files: show icon + "Open in app" button

### Phase 7 — Notifications & UX
- [x] Desktop notifications (Electron Notification API) — Planner only
- [ ] Sound on notification
- [x] DND schedule respected (no sound/popup during DND hours)
- [x] Notification bell with unread badge
- [x] Notification center (dropdown from bell)
- [x] Notification on: task update, task complete, assigned, @mention
- [x] Global search Ctrl+K / Cmd+K (Fuse.js)
- [x] Search across tasks, clients, comments
- [x] Keyboard shortcuts configurable per user in Settings
- [x] Dark mode / Light mode toggle per user
- [x] **What's New modal** — shown once per version on update, highlights new features

### Phase 9 — Photo Capture Module (Fase 1)
- [x] Types: `CapturedPhoto`, `photoStatus`, `capturedPhotos` fields on `RecipeFile`
- [x] Role: `photographer` added to `UserRole` — restricted to Recipe Manager + capture
- [x] `GlobalSettings.ssdPhotoPath` — external SSD backup path
- [x] IPC channels: `camera:check-connection`, `camera:start-tethering`, `camera:stop-tethering`, `camera:status-changed`, `camera:photo-received`
- [x] IPC utilities: `app:get-user-data-path`, `app:read-file-as-dataurl`, `storage:test-write-access`
- [x] `CameraManager` — gPhoto2 process + chokidar watcher (Mac only)
- [x] `useCameraStatus` hook — real-time camera connect/disconnect events
- [x] `CameraBadge` — green/gray pill in sidebar for owner + photographer
- [x] "Tomar Fotos" button on recipe rows (green=pending, amber=in_progress, disabled=complete)
- [x] Route `/capture/:recipeId` — full tethering page
- [x] `CapturePage` — preview area, filmstrip, DONE modal, file copy to CAMERA/ + Pictures/ + SSD
- [x] `firestore.ts`: `updateRecipePhotoStatus`, `addCapturedPhoto`, `updateGlobalSettings`
- [x] Settings → Photography tab — SSD path input, browse, test write access, save
- [x] photoStatus badges on recipe rows (📷 En progreso / 📷 Listo)
- [x] Photographer role restrictions: sidebar filtered, redirected from non-recipe routes
- [x] MembersPanel: Photographer option in role dropdown + role badge

**System requirement (Mac only):** `brew install gphoto2`

**New routes:** `/capture/:recipeId`

**New IPC channels (camera):**
- `camera:check-connection` → `{ connected, model }`
- `camera:start-tethering(outputDir)` → `{ success, error? }`
- `camera:stop-tethering` → void
- `camera:status-changed` (push) → `{ connected, model }`
- `camera:photo-received` (push) → `{ tempPath, filename }`

**Folder structure on disk:**
```
{projectFolder}/
├── CAMERA/{subfolder}/{recipeName} - {n}.jpg   ← raw tethered files
└── Pictures/{subfolder}/{recipeName} - {n}.jpg ← permanent copies
```

### Phase 9 — Photo Manager (Fase 2–4)
- [x] `PhotoManagerView.tsx` — 4-tab manager: CAMERA · SELECTED · CLEANED · READY
- [x] KPI cards: Photographed, Selected, Warnings, Cleaned, Ready + progress bar
- [x] CAMERA & SELECTED tabs: per-recipe grouped grid with STAR toggle
- [x] CLEANED tab: per-recipe drop zones (drag retouched PNG/JPG → promotes to READY)
- [x] READY tab: processed recipes grid (PNG + JPG preview cards)
- [x] Selection: checkbox overlay on hover, Select All, Select All from Recipe, Deselect All
- [x] Delete selected with confirmation dialog
- [x] Save As (copies files to chosen folder maintaining recipe folder structure)
- [x] Download ZIP (zip/PowerShell, same structure, no extra npm packages)
- [x] Format dialog for READY exports: PNG + JPG checkboxes (both must be chosen)
- [x] Warning dialog before accepting READY drop (shows open recipe notes)
- [x] Notes subcollection Firestore rules added (fixes notes-not-posting bug)
- [x] **Fase 4 — Excel insertion**: `insert_photo.py` Python script (openpyxl + Pillow)
  - Inserts JPG into "Spec Sheet" G8:M35 using AbsoluteAnchor (pixel-precise, EMU)
  - IPC: `excel:check-dependencies`, `excel:insert-photo` in `excelHandlers.ts`
  - `RecipeFile` fields: `excelInsertedAt: Timestamp | null`, `excelInsertedBy: string | null`
  - Firestore: `updateRecipeExcelInserted(recipeId, userId)`
  - UI: "Insertar en Excel" button on each READY card (blue → spinner → green ✓ + Reinsertar)
  - Python script bundled via `electron-builder.yml` extraResources → `scripts/insert_photo.py`

**System requirement:** `pip3 install openpyxl pillow`

**New IPC channels (excel):**
- `excel:check-dependencies` → `{ available, error? }`
- `excel:insert-photo({ excelPath, jpgPath })` → `{ success, error? }`

**New IPC channels (photo export):**
- `photo:save-as(entries, destFolder)` → `{ success, errors[] }`
- `photo:show-save-dialog(defaultFilename)` → `string | null`
- `photo:export-zip(entries, destZipPath)` → `{ success, error? }`

### Phase 9 — Cross-Machine Project Discovery (v1.6.3+)
- [x] `_project/project.json` written on project create/import with `{ projectId }`
- [x] `useProjectRootPath` hook — 4-step resolution: cache → scan → legacy → pathNotFound
- [x] `npd:projects_root` localStorage key — root folder where all NPD projects live
- [x] `npd:project_path_{id}` localStorage key — per-machine cache of resolved absolute path
- [x] IPC: `recipe:find-project-folder` — scans up to 3 levels for `_project/project.json` match
- [x] IPC: `recipe:write-project-json` — writes/merges `_project/project.json`
- [x] `RecipeHomePage` setup banner (amber/dashed) when `npd:projects_root` not set
- [x] `RecipeHomePage` status bar (green) showing configured root with "Change" button
- [x] `NewRecipeProjectWizard` pre-fills Parent Folder from `npd:projects_root`
- [x] `NewRecipeProjectWizard` validates folder name doesn't already exist before step 2

**localStorage keys:**
- `npd:projects_root` → absolute path to root folder (set once per machine)
- `npd:project_path_{projectId}` → absolute path to specific project on this machine

### Phase 9 — Mac Compatibility Fixes (v1.7.2)
- [x] `updater.ts`: `autoDownload=false` on Mac; `autoInstallOnAppQuit` Windows-only; `quitAndInstall` guarded per platform
- [x] `useSharePoint.ts`: Firestore write and seed guarded to `win32` only (ADR-006)
- [x] `photoUtils.ts`: `console.warn` when `getLibraryRoot` fallback triggers on Mac
- [x] `photoManifestHandlers.ts`: `PICTURES_FOLDERS` values normalized to forward slashes

### Phase 10 — v1.8.0 Stability & Security (June 2026)
- [x] RTF parser rebuilt (`parseRtf` in emailHandlers.ts) — fonttbl/colortbl skipped, htmltag escapes processed, cp1252 decoded; fixes \par-littered emails
- [x] Email bodySnippet sanitized (HTML + RTF stripped)
- [x] Email "expand window" renders inside sandboxed iframe (script-execution fix)
- [x] Updater: transient network errors silenced + 30s/2min/10min backoff; manual checks show readable message
- [x] Mac update flow: banner offers Download → opens GitHub release (unsigned build cannot auto-install a DMG — needs `zip` target + code signing to ever auto-update)
- [x] Task modal: debounced saves with flush-on-unmount; snapshot overlay prevents typing clobber; PO/AWB no longer write per keystroke (quota)
- [x] Tiptap v3 `useEditorState` — placeholder + toolbar states react to typing
- [x] Attachments: busyRef re-entry guards, arrayUnion atomic appends, dedup by path/subject+date, drop attaches dropped file directly
- [x] Lifecycle: session-end defers NSIS install (no more half-deleted installs on laptop close); zombie windowless instance recovers with a new window
- [x] Security: trash cleanup path validation (`isSafeTrashPath`) replaces bypassable `.includes()` check

### Phase 8 — Analytics & Build
- [ ] Analytics dashboard (admin only): tasks/week, load by person, top clients
- [x] Annual archive: auto-detect tasks > 12 months old on startup
- [x] Archive generates summary document
- [ ] Annual summary page with Recharts charts (bar, line)
- [x] Export PDF (jsPDF + html2canvas) with Elite Flower header
- [x] Export CSV (all filterable data)
- [x] Client management page in Settings
- [x] Label management page in Settings
- [x] electron-builder config for Windows (.exe) + Mac (.dmg)
- [x] Test build on both platforms
- [x] Final QA pass

---

## Coding Rules (NEVER violate these)

1. **No hardcoded credentials** — all secrets in .env, read via import.meta.env
2. **No `any` in TypeScript** — define interfaces for everything
3. **Always use path.join()** for file paths — never concatenate strings with / or \
4. **Every Firestore operation needs try/catch** with user-visible error handling
5. **Commit after every completed feature** with descriptive message
6. **Update this file's checklist** when a feature is completed
7. **Test on both Windows and Mac** before marking a phase complete
8. **No console.log in production** — use a proper logger utility
9. **All user-facing strings** should be in a constants file (for future i18n)
10. **Run `npm run build` and fix all errors** before starting next phase
11. **`createRecipeProject` and `upsertRecipeFile` must always be awaited** — missing await causes silent broken state
12. **Firebase reads in stores only** — never fire Firestore queries directly from components
13. **Scope all Firestore listeners tightly** — free-tier quota is active; unbounded `onSnapshot` calls will exhaust quota
