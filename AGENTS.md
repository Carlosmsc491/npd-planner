# NPD Planner — Agent Development Guide

> This document provides essential information for AI coding agents working on the NPD Planner project. Read this file completely before making any code changes.

---

## Project Overview

**NPD Planner** is a desktop application built for **Elite Flower** — an operations hub for team task management, trips, vacations, and file coordination.

- **Company:** Elite Flower
- **Platform:** Desktop (Windows .exe + Mac .dmg)
- **Domain Restriction:** Only `@eliteflower.com` email addresses are allowed
- **Current Version:** 1.0.1
- **Repository:** https://github.com/Carlosmsc491/npd-planner

---

## Technology Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Desktop Framework | Electron | ^25.9.8 | Cross-platform desktop app |
| Build Tool | electron-vite | ^2.3.0 | Development and build orchestration |
| Frontend | React | ^18.3.1 | UI framework |
| Language | TypeScript | ^5.6.3 | Type-safe development |
| Routing | react-router-dom | ^6.28.0 | Client-side navigation |
| Styling | Tailwind CSS | ^3.4.14 | Utility-first CSS |
| State Management | Zustand | ^5.0.0 | Global state |
| Database | Firebase Firestore | ^11.0.0 | Real-time data sync |
| Authentication | Firebase Auth | ^11.0.0 | Email/password auth |
| Calendar | FullCalendar | ^6.1.15 | Calendar views |
| Charts | Recharts | ^2.13.3 | Analytics visualizations |
| Rich Text | Tiptap | ^3.20.4 | Task descriptions |
| Icons | Lucide React | ^0.577.0 | Icon library |
| Search | Fuse.js | ^7.0.0 | Fuzzy search (dev dependency) |
| PDF Export | jsPDF + html2canvas | ^2.5.2 / ^1.4.1 | Report generation |
| Auto-updater | electron-updater | ^6.3.9 | Silent background updates |
| Testing | Playwright | ^1.58.2 | Browser automation |

---

## Build Commands

All commands are run via npm:

```bash
# Development
npm run dev                    # Start development server with hot reload

# Code Quality
npm run format                 # Format code with Prettier
npm run lint                   # Run ESLint on all TypeScript files
npm run typecheck              # Run TypeScript compiler (node + web)
npm run typecheck:node         # Type-check main process only
npm run typecheck:web          # Type-check renderer process only

# Production Builds
npm run build                  # Full build: typecheck + vite build + electron-builder (win + mac)
npm run build:win              # Build for Windows (NSIS installer)
npm run build:mac              # Build for Mac (DMG)
npm run build:linux            # Build for Linux (AppImage, snap, deb)
npm run build:unpack           # Build unpackaged (for testing)

# Preview
npm run start                  # Preview production build locally
```

---

## Project Structure

```
npd-planner/
├── src/
│   ├── main/                    # Electron main process (Node.js)
│   │   ├── index.ts             # App entry, window creation
│   │   ├── updater.ts           # Auto-updater configuration
│   │   ├── ipc/                 # IPC handlers for renderer communication
│   │   │   ├── fileHandlers.ts      # File system operations
│   │   │   ├── notificationHandlers.ts  # Desktop notifications
│   │   │   └── awbIpcHandlers.ts    # AWB lookup IPC
│   │   ├── services/            # Background services
│   │   │   ├── trazeIntegrationService.ts   # Traze CSV integration
│   │   │   ├── trazePlaywrightService.ts    # Browser automation
│   │   │   ├── trazeCredentialsService.ts   # Secure credential storage
│   │   │   ├── trazeStatusService.ts        # Status tracking
│   │   │   ├── trazePreferencesService.ts   # User preferences
│   │   │   ├── trazeWindowManager.ts        # Window management
│   │   │   └── awbLookupService.ts          # AWB CSV processing
│   │   └── utils/               # Main process utilities
│   │       └── dateRange.ts
│   ├── preload/                 # Electron preload scripts (bridge)
│   │   ├── index.ts             # API exposure to renderer
│   │   └── index.d.ts           # TypeScript declarations
│   ├── renderer/                # React application
│   │   ├── index.html           # HTML entry point
│   │   ├── main.tsx             # React root render
│   │   ├── App.tsx              # Router and app shell
│   │   ├── assets/
│   │   │   └── main.css         # Global styles + Tailwind
│   │   ├── components/
│   │   │   ├── ui/              # Reusable UI components
│   │   │   │   ├── AppLayout.tsx
│   │   │   │   ├── NewBoardModal.tsx
│   │   │   │   ├── NewTaskModal.tsx
│   │   │   │   ├── RecurringModal.tsx
│   │   │   │   ├── ConflictDialog.tsx
│   │   │   │   ├── UndoToast.tsx
│   │   │   │   ├── ConnectionStatus.tsx
│   │   │   │   └── ProfileSetupModal.tsx
│   │   │   ├── board/           # Board view components
│   │   │   │   ├── BoardView.tsx
│   │   │   │   ├── BoardColumn.tsx
│   │   │   │   ├── TaskCard.tsx
│   │   │   │   ├── ListView.tsx
│   │   │   │   ├── BoardCalendar.tsx
│   │   │   │   ├── GanttView.tsx
│   │   │   │   └── GroupBySelector.tsx
│   │   │   ├── task/            # Task detail components
│   │   │   │   ├── TaskPage.tsx
│   │   │   │   ├── SubtaskList.tsx
│   │   │   │   ├── CommentSection.tsx
│   │   │   │   ├── ActivityLog.tsx
│   │   │   │   ├── AttachmentPanel.tsx
│   │   │   │   ├── RichTextEditor.tsx
│   │   │   │   └── OrderStatusSection.tsx
│   │   │   ├── notifications/   # Notification components
│   │   │   │   ├── NotificationBell.tsx
│   │   │   │   └── NotificationCenter.tsx
│   │   │   ├── search/          # Search components
│   │   │   │   └── GlobalSearch.tsx
│   │   │   └── settings/        # Settings components
│   │   │       ├── MembersPanel.tsx
│   │   │       ├── SharePointSetup.tsx
│   │   │       ├── TrazeSettings.tsx
│   │   │       ├── BoardTemplateEditor.tsx
│   │   │       ├── AddPropertyModal.tsx
│   │   │       └── IconPickerPopover.tsx
│   │   ├── pages/               # Route-level pages
│   │   │   ├── LoginPage.tsx
│   │   │   ├── AwaitingApprovalPage.tsx
│   │   │   ├── EmergencyPage.tsx
│   │   │   ├── DashboardPage.tsx
│   │   │   ├── BoardPage.tsx
│   │   │   ├── TaskFullPage.tsx
│   │   │   ├── CalendarPage.tsx
│   │   │   ├── AnalyticsPage.tsx
│   │   │   └── SettingsPage.tsx
│   │   ├── hooks/               # Custom React hooks
│   │   │   ├── useAuth.ts
│   │   │   ├── useBoard.ts
│   │   │   ├── useTasks.ts
│   │   │   ├── useClients.ts
│   │   │   ├── useLabels.ts
│   │   │   ├── useNotifications.ts
│   │   │   ├── useSharePoint.ts
│   │   │   ├── useKeyboardShortcuts.ts
│   │   │   ├── useAwbLookup.ts
│   │   │   ├── useTrazeSettings.ts
│   │   │   └── useTrazeRefresh.ts
│   │   ├── store/               # Zustand state stores
│   │   │   ├── authStore.ts
│   │   │   ├── boardStore.ts
│   │   │   ├── taskStore.ts
│   │   │   ├── notificationStore.ts
│   │   │   └── settingsStore.ts
│   │   ├── lib/                 # Core libraries
│   │   │   ├── firebase.ts          # Firebase initialization
│   │   │   ├── firestore.ts         # Firestore operations
│   │   │   └── sharepointLocal.ts   # SharePoint file operations
│   │   ├── types/               # TypeScript type definitions
│   │   │   └── index.ts
│   │   └── utils/               # Utility functions
│   │       ├── dateUtils.ts
│   │       ├── colorUtils.ts
│   │       ├── exportUtils.ts
│   │       ├── hashUtils.ts
│   │       ├── awbUtils.ts
│   │       ├── propertyUtils.tsx
│   │       └── utils.ts
│   ├── shared/                  # Shared between main and renderer
│   │   └── constants.ts
│   ├── types/                   # Global types
│   │   └── index.ts
│   └── utils/                   # Shared utilities
│       └── utils.ts
├── resources/                   # Build resources (icons, etc.)
├── dist/                        # Vite build output
├── dist-electron/               # Electron builder output
├── out/                         # Compiled main/preload
├── electron.vite.config.ts      # Electron-vite configuration
├── electron-builder.yml         # Electron builder config
├── tailwind.config.js           # Tailwind CSS config (darkMode: 'class')
├── postcss.config.js            # PostCSS config
├── tsconfig.json                # Root TypeScript config (references)
├── tsconfig.node.json           # Main process TypeScript config
├── tsconfig.web.json            # Renderer process TypeScript config
├── firebase.json                # Firebase configuration
├── firestore.rules              # Firestore security rules
├── firestore.indexes.json       # Firestore indexes
├── package.json
├── .env                         # Environment variables (NOT in git)
├── .env.example                 # Environment template
└── .gitignore
```

---

## Architecture Overview

### Electron Process Model

The app follows Electron's multi-process architecture:

1. **Main Process** (`src/main/`)
   - Node.js environment with full system access
   - Creates renderer windows
   - Handles file system operations
   - Runs background services (Traze integration)
   - Sends desktop notifications

2. **Renderer Process** (`src/renderer/`)
   - Chromium environment (React app)
   - UI rendering and user interactions
   - Communicates with main via IPC
   - Firebase client runs here

3. **Preload Script** (`src/preload/`)
   - Secure bridge between main and renderer
   - Exposes whitelisted APIs via `contextBridge`
   - All IPC channels must be explicitly defined

### Firebase Architecture

- **Authentication:** Email/password with domain restriction (@eliteflower.com)
- **Database:** Firestore with real-time listeners
- **Offline Support:** Multi-tab IndexedDB persistence enabled
- **Security:** Rules enforce role-based access (owner/admin/member)

### SharePoint File Strategy

Files are NOT uploaded via API. Instead:
1. User selects local SharePoint sync folder on first launch
2. App verifies folder contains `REPORTS (NPD-SECURE)` subfolder
3. Files are copied to organized subfolders: `{year}/{client}/{task}/`
4. SharePoint desktop client syncs to cloud automatically
5. App tracks sync status per attachment

---

## Environment Setup

### Required Environment Variables

Copy `.env.example` to `.env` and fill in:

```bash
# Firebase Configuration (from console.firebase.google.com)
VITE_FIREBASE_API_KEY=your_api_key_here

# App Configuration
VITE_APP_VERSION=1.0.1
VITE_ALLOWED_DOMAIN=eliteflower.com
VITE_SHAREPOINT_VERIFICATION_FOLDER=REPORTS (NPD-SECURE)
VITE_ARCHIVE_AFTER_MONTHS=12

# GitHub (for publishing releases)
GH_TOKEN=your_github_token
```

**CRITICAL:** Never commit `.env` to Git. It is already in `.gitignore`.

---

## Code Style Guidelines

### TypeScript Rules

1. **NO `any` types** — Define interfaces for all data structures
2. **Strict mode enabled** — All strict TypeScript compiler options
3. **Explicit return types** on exported functions
4. **Interface naming:** PascalCase, descriptive (e.g., `TaskAttachment`, not `Attachment`)

### Path Handling

**ALWAYS** use `path.join()` — never concatenate paths with `/` or `\`:

```typescript
// CORRECT
import { join } from 'path'
const fullPath = join(sharePointRoot, year, clientName, taskTitle, fileName)

// WRONG
const fullPath = `${sharePointRoot}/${year}/${clientName}`
```

### Error Handling

Every Firestore operation must have try/catch with user-visible error handling:

```typescript
try {
  await updateTask(taskId, updates)
} catch (error) {
  showToast({ type: 'error', message: 'Failed to update task' })
  console.error('updateTask error:', error)
}
```

### File Organization

- One component per file
- Co-locate related components in subdirectories
- Custom hooks in `hooks/` directory
- Utility functions in `utils/` directories
- Types in `types/index.ts`

### Naming Conventions

- **Components:** PascalCase (e.g., `TaskCard.tsx`)
- **Hooks:** camelCase with `use` prefix (e.g., `useAuth.ts`)
- **Utils:** camelCase (e.g., `dateUtils.ts`)
- **Types/Interfaces:** PascalCase (e.g., `TaskStatus`)
- **Constants:** UPPER_SNAKE_CASE for true constants

---

## UI Style Guide

### Tailwind Configuration

**Dark Mode:** `class` strategy (toggle via `document.documentElement.classList.add('dark')`)

**Primary Color:** Green (`#1D9E75` — Emerald 600)

### Color Palette

```typescript
// Board Colors
const BOARD_COLORS = {
  planner:   '#1D9E75',  // Emerald green
  trips:     '#378ADD',  // Blue
  vacations: '#D4537E',  // Pink/Rose
}

// Status Colors
const STATUS_COLORS = {
  todo:       { bg: '#F1EFE8', text: '#444441' },  // Warm gray
  inprogress: { bg: '#FAEEDA', text: '#633806' },  // Amber
  review:     { bg: '#E6F1FB', text: '#0C447C' },  // Blue
  done:       { bg: '#E1F5EE', text: '#085041' },  // Green
}

// Priority Colors
const PRIORITY_COLORS = {
  high:   '#E24B4A',  // Red
  normal: '#888780',  // Gray
}

// UI Accent Colors
const UI_COLORS = {
  primary:   '#1D9E75',  // Green buttons, links
  danger:    '#EF4444',  // Red for delete/errors
  warning:   '#F59E0B',  // Amber for warnings
  info:      '#378ADD',  // Blue for info
  success:   '#22C55E',  // Green success states
}
```

### Common Tailwind Patterns

**Cards/Containers:**
```tsx
// Light mode
cn("bg-white border border-gray-200 rounded-xl shadow-sm")

// Dark mode
cn("dark:bg-gray-800 dark:border-gray-700")

// Combined
cn("bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl")
```

**Section Headers:**
```tsx
// Small uppercase labels
cn("text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500")

// Page titles
cn("text-2xl font-bold text-gray-900 dark:text-white")
```

**Form Elements:**
```tsx
// Inputs
cn("w-full rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm",
   "dark:bg-gray-700 dark:text-white focus:outline-none focus:border-green-500")

// Buttons - Primary
cn("rounded-lg bg-green-500 px-4 py-2 text-sm font-semibold text-white",
   "hover:bg-green-600 disabled:opacity-50 transition-colors")

// Buttons - Secondary/Outline
cn("rounded-lg border border-gray-200 dark:border-gray-600 px-3 py-2",
   "text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700")
```

**List Items/Rows:**
```tsx
// Alternating rows
cn("px-4 py-2", index % 2 === 0 && "bg-gray-50 dark:bg-gray-700/50")

// Hover states
cn("hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors")
```

**Status Indicators:**
```tsx
// Active/Dot indicator
cn("h-2 w-2 rounded-full bg-green-500")

// Status badges
cn("rounded-full px-2.5 py-0.5 text-xs font-medium")
```

### Component Patterns

**Modal/Dialog:**
```tsx
<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
  <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 shadow-2xl p-6">
    {/* Content */}
  </div>
</div>
```

**Dropdown/Select:**
```tsx
<select className="w-full rounded-lg border border-gray-200 dark:border-gray-700 
                   bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                   px-3 py-2 text-sm focus:outline-none focus:border-green-500">
  <option value="">— Select option —</option>
  {/* Options */}
</select>
```

**Settings Panel:**
```tsx
<div className="bg-gray-50 dark:bg-gray-800/60 px-4 py-3 
                border-b border-gray-100 dark:border-gray-700">
  {/* Settings content */}
</div>
```

### Icon Guidelines

- **Library:** Lucide React (`lucide-react`)
- **Default size:** `size={16}` for inline, `size={20}` for buttons
- **Color:** Inherit from text color or explicit `text-gray-500`

```tsx
import { Plus, Trash2, Settings, GripVertical } from 'lucide-react'

<button className="text-gray-400 hover:text-gray-600">
  <Settings size={16} />
</button>
```

### Spacing Scale

- **xs:** 0.25rem (4px) — `gap-1`, `p-1`
- **sm:** 0.5rem (8px) — `gap-2`, `p-2`
- **md:** 1rem (16px) — `gap-4`, `p-4`
- **lg:** 1.5rem (24px) — `gap-6`, `p-6`
- **xl:** 2rem (32px) — `gap-8`, `p-8`

### Typography

```tsx
// Headings
<h1 className="text-2xl font-bold text-gray-900 dark:text-white">
<h2 className="text-xl font-bold text-gray-900 dark:text-white">
<h3 className="text-base font-semibold text-gray-900 dark:text-white">

// Body text
<p className="text-sm text-gray-700 dark:text-gray-300">
<span className="text-xs text-gray-500 dark:text-gray-400">

// Labels
<label className="text-xs font-medium text-gray-700 dark:text-gray-300">
```

### Dark Mode Classes

Always include both light and dark variants:

| Light | Dark |
|-------|------|
| `bg-white` | `dark:bg-gray-800` |
| `bg-gray-50` | `dark:bg-gray-800/60` |
| `bg-gray-100` | `dark:bg-gray-700` |
| `text-gray-900` | `dark:text-white` |
| `text-gray-700` | `dark:text-gray-300` |
| `text-gray-500` | `dark:text-gray-400` |
| `text-gray-400` | `dark:text-gray-500` |
| `border-gray-200` | `dark:border-gray-700` |
| `border-gray-300` | `dark:border-gray-600` |
| `hover:bg-gray-50` | `dark:hover:bg-gray-700` |

---

## Testing Strategy

Currently, the project uses:
- **ESLint** for code quality (`npm run lint`)
- **TypeScript** for type checking (`npm run typecheck`)
- **Prettier** for formatting (`npm run format`)
- **Playwright** is installed but primarily used for Traze integration

Before submitting changes:
1. Run `npm run typecheck` — must pass with zero errors
2. Run `npm run lint` — must pass with zero errors
3. Run `npm run build` — must complete successfully

---

## Security Considerations

### Authentication & Authorization

1. **Domain Restriction:** Only `@eliteflower.com` emails can register/login
2. **Role Hierarchy:** owner > admin > member
3. **Approval Flow:** New users start with `awaiting` status until approved
4. **Emergency Access:** Hidden `/emergency` route with SHA-256 hashed key

### Firestore Security Rules

Rules are in `firestore.rules`. Key protections:
- Users can only read/write their own notifications
- Only admins can manage boards and labels
- Task history is append-only (immutable)
- Comments can only be edited/deleted by their authors

Deploy rules with:
```bash
firebase deploy --only firestore:rules
```

### Secrets Management

- All secrets in `.env` file
- Firebase config exposed to renderer via `import.meta.env`
- GitHub token only used during build/publish

---

## Key Business Rules

### Notifications
- **Only Planner board tasks** trigger desktop notifications + sound
- Trips and Vacations: No desktop notifications
- Notify only users in `task.assignees`
- Respect user's DND schedule

### Task Completion
- Click checkbox → `completed = true`, record `completedAt`/`completedBy`
- Completed tasks fade to 40% opacity
- "Show completed (N)" toggle at column bottom
- 5-second undo toast for deletion

### Recurring Tasks
- On completion, auto-create next instance
- Frequencies: daily, weekly, monthly, yearly, custom
- Next instance inherits all properties except completion status

### Client Requirement
- Every task MUST have a `clientId`
- Form validation prevents submission without client
- "+ New Client" option in dropdown creates inline

---

## Deployment

### Building Releases

```bash
# Windows installer
npm run build:win

# Mac DMG
npm run build:mac

# Both
npm run build
```

Artifacts are created in `dist-electron/`.

### Auto-Update

The app uses `electron-updater` with GitHub releases:
- Checks for updates on startup (production only)
- Downloads in background
- Shows "Restart to update" banner when ready
- Configured in `electron-builder.yml` with GitHub provider

---

## Traze Integration

The app includes a background service that integrates with Traze (logistics platform):

- **Location:** `src/main/services/traze*.ts`
- **Purpose:** Automatically download AWB tracking CSVs
- **Method:** Playwright browser automation
- **Security:** Credentials stored in Windows Credential Manager / Mac Keychain
- **IPC Channels:** `traze:*` prefixed channels in `src/preload/index.ts`

---

## Useful Constants

From `src/shared/constants.ts`:

```typescript
ALLOWED_DOMAIN = 'eliteflower.com'
SHAREPOINT_VERIFICATION_FOLDER = 'REPORTS (NPD-SECURE)'
ARCHIVE_AFTER_MONTHS = 12
RETRY_INTERVAL_MS = 30_000  // Failed file copy retry
MAX_RETRY_COUNT = 5
APP_NAME = 'NPD Planner'
COMPANY_NAME = 'Elite Flower'
```

Board colors:
```typescript
BOARD_COLORS = {
  planner:   '#1D9E75',
  trips:     '#378ADD',
  vacations: '#D4537E',
}
```

Status colors:
```typescript
STATUS_COLORS = {
  todo:       { bg: '#F1EFE8', text: '#444441' },
  inprogress: { bg: '#FAEEDA', text: '#633806' },
  review:     { bg: '#E6F1FB', text: '#0C447C' },
  done:       { bg: '#E1F5EE', text: '#085041' },
}
```

---

## Common Tasks

### Adding a New IPC Channel

1. Add channel name to `IPC` object in `src/shared/constants.ts`
2. Add handler in `src/main/ipc/` (if main process)
3. Expose in `src/preload/index.ts` (add to appropriate channel list)
4. Use in renderer via `window.electronAPI`

### Adding a New Route

1. Create page component in `src/renderer/src/pages/`
2. Add route in `src/renderer/src/App.tsx`
3. Wrap in `<ProtectedRoute />` if authentication required

### Adding a Firebase Collection

1. Define interface in `src/renderer/src/types/index.ts`
2. Add Firestore operations in `src/renderer/src/lib/firestore.ts`
3. Add security rules in `firestore.rules`
4. Deploy rules: `firebase deploy --only firestore:rules`

---

## Troubleshooting

### Build Issues
- Delete `dist/`, `dist-electron/`, `out/` directories
- Run `npm run typecheck` to identify type errors
- Check `electron.vite.config.ts` for external dependencies

### Firebase Issues
- Verify `.env` file exists and has all required variables
- Check Firestore rules are deployed: `firebase deploy --only firestore:rules`
- Enable Firebase Persistence for offline support

### SharePoint Issues
- Verify folder contains `REPORTS (NPD-SECURE)` subfolder
- Check file permissions for write access
- Review retry queue status for failed uploads

---

## References

- [CLAUDE.md](./CLAUDE.md) — Detailed feature checklist and business rules
- [firestore.rules](./firestore.rules) — Security rules reference
- [electron-builder.yml](./electron-builder.yml) — Build configuration
- `package.json` — Dependencies and scripts
