# NPD Planner — Claude Code Master Context

> READ THIS ENTIRE FILE BEFORE WRITING ANY CODE.
> Update checkboxes as features are completed.
> Never skip this file, even for small tasks.

---

## App Identity

- **Name:** NPD Planner
- **Company:** Elite Flower
- **Platform:** Desktop — Windows (.exe) + Mac (.dmg)
- **Purpose:** Central operations hub for team task management, trips, vacations, and file coordination
- **Auth domain:** @eliteflower.com ONLY — all other domains are rejected at registration and login

---

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Desktop | Electron 28+ | Windows + Mac. Use electron-vite for dev |
| Frontend | React 18 + TypeScript | Strict mode. No `any` types ever |
| Styling | Tailwind CSS | Dark mode via `class` strategy |
| Database | Firebase Firestore | Real-time sync. Free tier |
| Auth | Firebase Auth | Email/password. @eliteflower.com only |
| File storage | SharePoint (local sync folder) | No cloud upload — copy to local SharePoint folder |
| Calendar | FullCalendar.js | Day/week/month views + drag resize |
| Charts | Recharts | Analytics dashboard + annual reports |
| PDF Export | jsPDF + html2canvas | Annual summary with charts |
| Search | Fuse.js | Global fuzzy search Ctrl+K |
| Auto-update | electron-updater | Silent background updates |
| Path handling | Node path.join() | ALWAYS use path.join — never hardcode / or \ |

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
├── src/
│   ├── main/                    ← Electron main process
│   │   ├── index.ts             ← App entry, window creation
│   │   ├── ipc/                 ← IPC handlers (files, notifications, SharePoint)
│   │   │   ├── fileHandlers.ts
│   │   │   ├── notificationHandlers.ts
│   │   │   └── sharepointHandlers.ts
│   │   └── updater.ts           ← electron-updater config
│   ├── renderer/                ← React app (runs in Electron window)
│   │   ├── index.html
│   │   ├── main.tsx             ← React entry
│   │   ├── App.tsx              ← Router setup
│   │   ├── components/
│   │   │   ├── ui/              ← Reusable: Button, Modal, Badge, Avatar, Toast
│   │   │   ├── board/           ← BoardView, TaskCard, BoardColumn, GroupBySelector
│   │   │   ├── task/            ← TaskPage, SubtaskList, ActivityLog, CommentSection
│   │   │   ├── calendar/        ← MasterCalendar, BoardCalendar, CalendarFilters
│   │   │   ├── notifications/   ← NotificationBell, NotificationCenter
│   │   │   ├── search/          ← GlobalSearch (Ctrl+K)
│   │   │   ├── analytics/       ← AnalyticsDashboard, AnnualSummary, Charts
│   │   │   └── settings/        ← MembersPanel, LabelManager, ClientManager, SharePointSetup
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx
│   │   │   ├── AwaitingApprovalPage.tsx
│   │   │   ├── DashboardPage.tsx
│   │   │   ├── BoardPage.tsx
│   │   │   ├── CalendarPage.tsx
│   │   │   ├── AnalyticsPage.tsx
│   │   │   ├── SettingsPage.tsx
│   │   │   └── EmergencyPage.tsx    ← Hidden route /emergency
│   │   ├── hooks/
│   │   │   ├── useAuth.ts
│   │   │   ├── useBoard.ts
│   │   │   ├── useTasks.ts
│   │   │   ├── useClients.ts
│   │   │   ├── useLabels.ts
│   │   │   ├── useNotifications.ts
│   │   │   ├── useSharePoint.ts
│   │   │   ├── useOfflineSync.ts
│   │   │   └── useKeyboardShortcuts.ts
│   │   ├── store/
│   │   │   ├── authStore.ts         ← Zustand auth state
│   │   │   ├── boardStore.ts
│   │   │   ├── taskStore.ts
│   │   │   └── settingsStore.ts
│   │   ├── lib/
│   │   │   ├── firebase.ts          ← Firebase init (reads from .env)
│   │   │   ├── firestore.ts         ← All Firestore operations
│   │   │   ├── firestoreRules.ts    ← Rules documentation
│   │   │   └── sharepointLocal.ts   ← Local SharePoint file operations
│   │   ├── types/
│   │   │   └── index.ts             ← All TypeScript interfaces
│   │   └── utils/
│   │       ├── dateUtils.ts
│   │       ├── colorUtils.ts
│   │       ├── exportUtils.ts       ← PDF + CSV export
│   │       └── hashUtils.ts         ← SHA-256 for emergency key
│   └── shared/
│       └── constants.ts             ← Shared between main and renderer
├── firestore.rules                  ← Firebase security rules
└── electron-builder.yml             ← Build config for .exe and .dmg
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
    sharePointPath: string  // local path to SharePoint folder
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
4. Save the verified path in user preferences (Firestore + localStorage)
5. When user attaches a file to a task:
   - Compute destination: `path.join(sharePointRoot, year, clientName, taskTitle, fileName)`
   - Create folders if they don't exist: `fs.mkdirSync(dest, { recursive: true })`
   - Copy file: `fs.copyFileSync(sourcePath, destPath)`
   - Save relative path in task attachment (relative to SharePoint root)
   - Show status: uploading → synced (SharePoint syncs to cloud automatically)
6. If copy fails: mark attachment as 'error', add to retry queue
7. Retry queue checks every 30 seconds

**Path example:**
```
/Users/carlos/OneDrive - Elite Flower/REPORTS (NPD-SECURE)/2026/Publix/PUBLIX - MAMA MIA/spec.xlsx
```

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
- [ ] Firebase Auth Rules deployed
- [x] Members panel (Settings) — list, approve, reject, change role, suspend
- [x] Emergency access (/emergency route + SHA-256 key check)
- [ ] Auto-update configured (electron-updater)

### Phase 3 — Boards & Tasks Core
- [ ] Sidebar with Planner, Trips, Vacations boards
- [ ] Cards view with Group By selector
- [ ] List view (table)
- [ ] Task card with labels, checkbox, assignee avatars, date, priority
- [ ] Completed tasks: fade, move to bottom, show/hide toggle
- [ ] 3-dot menu: Duplicate, Make Recurring, Delete
- [ ] Recurring task modal (daily/weekly/monthly/yearly/custom)
- [ ] Task page (full modal): all properties editable
- [ ] Subtasks checklist with progress bar
- [ ] Comments section with @mentions
- [ ] Activity log (append-only, auto-generated on each field change)
- [ ] Client required field + New Client inline creation
- [ ] Labels assignment in task
- [ ] Empty states for all board views

### Phase 4 — Sync & Offline
- [ ] Firebase Persistence (enableMultiTabIndexedDbPersistence)
- [ ] Connection status indicator (bottom corner)
- [ ] Offline mode: queue writes, sync on reconnect
- [ ] Simultaneous edit merge with conflict resolution dialog
- [ ] Undo toast (5 seconds) for task deletion

### Phase 5 — Calendar
- [ ] FullCalendar installed and configured
- [ ] Day / Week / Month view switcher per board
- [ ] Events draggable + resizable (drag edge to change dates)
- [ ] + button on day hover (top-left of cell) → board type selector
- [ ] Master Calendar page: all boards unified
- [ ] Board filter toggles on Master Calendar
- [ ] Timeline (Gantt) view

### Phase 6 — SharePoint & Files
- [ ] First-launch SharePoint path setup wizard
- [ ] Path verification (checks for REPORTS (NPD-SECURE) subfolder)
- [ ] SharePoint path editable in Settings
- [ ] File attach in task: copies to year/client/task folder
- [ ] Folder auto-creation on attach
- [ ] Attachment status icons: uploading / synced / error
- [ ] Retry queue (every 30 seconds) for failed copies
- [ ] PDF preview (pdf.js)
- [ ] Image preview
- [ ] Office files: show icon + "Open in app" button

### Phase 7 — Notifications & UX
- [ ] Desktop notifications (Electron Notification API) — Planner only
- [ ] Sound on notification
- [ ] DND schedule respected (no sound/popup during DND hours)
- [ ] Notification bell with unread badge
- [ ] Notification center (dropdown from bell)
- [ ] Notification on: task update, task complete, assigned, @mention
- [ ] Global search Ctrl+K / Cmd+K (Fuse.js)
- [ ] Search across tasks, clients, comments
- [ ] Keyboard shortcuts configurable per user in Settings
- [ ] Dark mode / Light mode toggle per user

### Phase 8 — Analytics & Build
- [ ] Analytics dashboard (admin only): tasks/week, load by person, top clients
- [ ] Annual archive: auto-detect tasks > 12 months old on startup
- [ ] Archive generates summary document
- [ ] Annual summary page with Recharts charts (bar, line)
- [ ] Export PDF (jsPDF + html2canvas) with Elite Flower header
- [ ] Export CSV (all filterable data)
- [ ] Client management page in Settings
- [ ] Label management page in Settings
- [ ] electron-builder config for Windows (.exe) + Mac (.dmg)
- [ ] Test build on both platforms
- [ ] Final QA pass

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
