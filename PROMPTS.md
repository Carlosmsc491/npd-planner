# NPD Planner — Claude Code Prompts
# Copy each prompt exactly as written into Claude Code terminal
# Always run prompts IN ORDER — each phase depends on the previous

# ═══════════════════════════════════════════════════════════════
# BEFORE YOU START — One-time setup
# ═══════════════════════════════════════════════════════════════
# 1. Install Node.js 20 LTS from nodejs.org
# 2. Install Git from git-scm.com
# 3. Create Firebase project at console.firebase.google.com
#    → Enable: Firestore Database, Authentication (Email/Password)
#    → Copy Web App credentials
# 4. Run: npm install -g @anthropic-ai/claude-code
# 5. Create folder: npd-planner
# 6. Open terminal in that folder
# 7. Run: git init && claude
# ═══════════════════════════════════════════════════════════════


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT 0 — Copy project files into Claude's context
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

I'm giving you the starter files for NPD Planner. Copy all of these files exactly into the project:

1. CLAUDE.md → project root
2. src/types/index.ts → type definitions
3. src/lib/firebase.ts → Firebase init
4. src/lib/firestore.ts → Firestore operations
5. src/lib/sharepointLocal.ts → SharePoint file handling
6. src/main/ipc/fileHandlers.ts → Electron IPC file ops
7. src/main/ipc/notificationHandlers.ts → Electron notifications
8. src/utils/utils.ts → utilities (hash, color, date, export)
9. firestore.rules → Firebase security rules
10. .env.example → environment variable template
11. .gitignore → Git ignore file

After copying, confirm each file exists at its correct path.
Do NOT modify any of these files yet.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT 1 — Project Scaffold
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read CLAUDE.md completely before starting.

Set up the NPD Planner project scaffold:

1. Initialize with electron-vite:
   npm create @quick-start/electron@latest . -- --template react-ts

2. Install all required dependencies:
   npm install firebase zustand react-router-dom @fullcalendar/react @fullcalendar/daygrid @fullcalendar/timegrid @fullcalendar/interaction @fullcalendar/list recharts jspdf html2canvas fuse.js electron-updater
   npm install -D tailwindcss postcss autoprefixer @types/node

3. Configure Tailwind CSS:
   npx tailwindcss init -p
   Set darkMode: 'class' in tailwind.config.js
   Add Tailwind directives to main CSS file

4. Copy .env.example to .env and remind me to fill in Firebase credentials

5. Create the complete folder structure from CLAUDE.md exactly

6. Create src/renderer/App.tsx with React Router routes:
   - /login
   - /awaiting-approval
   - /emergency
   - /dashboard (protected — requires active user)
   - /board/:boardId (protected)
   - /calendar (protected)
   - /analytics (protected — admin only)
   - /settings (protected)

7. Create a basic ProtectedRoute component that checks:
   - User is authenticated
   - User status is 'active'
   - Redirects to /login if not authenticated
   - Redirects to /awaiting-approval if status is 'awaiting'
   - Redirects to /login if status is 'suspended'

8. Create Electron preload.ts that exposes window.electronAPI with:
   - copyFile
   - verifySharePointFolder
   - selectFolder
   - sendNotification
   - getAppVersion
   - onUpdateAvailable

9. Register IPC handlers from fileHandlers.ts and notificationHandlers.ts in main/index.ts

10. Verify the app compiles and opens a window: npm run dev

11. Commit: "feat: project scaffold with Electron + React + TypeScript + Firebase"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT 2 — Auth & Members
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read CLAUDE.md completely before starting.

Build the complete authentication system:

1. LOGIN PAGE (/login)
   - Clean design: NPD Planner logo/name, email + password inputs
   - On submit: validate email ends with @eliteflower.com
   - If wrong domain: show error "Only @eliteflower.com accounts are allowed"
   - If correct domain: attempt Firebase signInWithEmailAndPassword
   - If no account exists: create account with createUserWithEmailAndPassword,
     then create user document in Firestore with status: 'awaiting', role: 'member'
   - After login: check user status in Firestore, route accordingly
   - Show loading state during auth operations

2. AWAITING APPROVAL PAGE (/awaiting-approval)
   - Message: "Your account is pending approval"
   - Sub-message: "An admin will review your request. You'll be notified when approved."
   - Sign out button

3. SUSPENDED PAGE (show on /login when status === 'suspended')
   - Message: "Your access has been revoked"
   - Sub-message: "Contact your administrator for assistance."

4. useAuth HOOK (src/hooks/useAuth.ts)
   - Subscribe to Firebase onAuthStateChanged
   - Load user document from Firestore when auth changes
   - Expose: user, isAdmin, isLoading, signOut
   - Store in authStore (Zustand)

5. MEMBERS PANEL (src/components/settings/MembersPanel.tsx)
   - Only visible to admins
   - Sections: "Awaiting Approval" (shown first if any), "Active Members", "Suspended"
   - Each member row: avatar (initials + color), name, email, role badge, status badge
   - Awaiting: "Approve" button (sets status: active), "Reject" button (sets status: suspended)
   - Active members: dropdown → "Make Admin" | "Make Member" | "Suspend"
   - Show member count in each section header
   - Real-time updates via subscribeToUsers from firestore.ts

6. EMERGENCY PAGE (/emergency — hidden, no sidebar link)
   - Simple page: password input + "Verify" button
   - On submit: call verifyEmergencyKey from firestore.ts
   - If valid: show list of all users with option to set any as admin
   - If invalid: show "Incorrect key"

7. Deploy Firestore rules:
   Print the command: firebase deploy --only firestore:rules
   And tell me to run it manually

8. Mark completed features in CLAUDE.md with [x]

9. Commit: "feat: auth system with @eliteflower.com validation and members panel"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT 3 — Boards & Tasks Core
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read CLAUDE.md completely before starting.

Build the complete board and task system. This is the core of the app.

LAYOUT & NAVIGATION:
- Main app layout: sidebar (220px) + topbar (44px) + content area
- Sidebar: NPD Planner logo, nav items (Dashboard, Master Calendar),
  boards section with colored dots (Planner green, Trips blue, Vacations pink),
  + New Board button, user avatar + name at bottom
- Topbar: board name, view switcher (Cards | List), Group By dropdown,
  Fields button, + New Task button
- Responsive to window resize

BOARDS PAGE (/board/:boardId):

Cards View:
- Columns based on Group By selection (default: bucket)
- Column header: name (uppercase), task count badge, + Add button
- Task cards: labels as color pills, circle checkbox (click = complete),
  title, date badge (red if overdue), attachment count if any,
  priority ! icon if high, assignee avatar stack
- Completed tasks: 40% opacity, pushed to bottom of column
- "Show completed (N)" toggle at column bottom — collapses/expands with fade
- 3-dot menu on each card: Duplicate, Make Recurring, Delete

List View:
- Table with columns: checkbox, title, client, date, assigned to, status, labels, →
- Group headers (same grouping as cards view)
- Completed rows: strikethrough + reduced opacity
- "Show completed" toggle per group

Group By options: Bucket, Client, Assigned To, Date, Status, Priority

TASK PAGE (full-screen modal or side panel):
- Title: large, editable, click to edit
- Properties section (icon + label + value, each row editable):
  • Project/Board (badge)
  • Client (required — dropdown of active clients + "+ New Client")
  • Date (date range picker — start → end)
  • Assigned To (multi-select with user avatars)
  • Priority (Normal / High with ! icon)
  • Status (Todo / In Progress / In Review / Done)
  • Labels (multi-select from label list)
  • AWB / Notes (text)
  • P.O. / Order # (text)
  • + Add property button (for custom text/number/date/checkbox fields)
- Subtasks section:
  • "+ Add subtask" input
  • Each subtask: checkbox, text, optional assignee
  • Progress bar: "X of Y completed"
- Files section (placeholder — implemented in Phase 6)
- Activity Log section (read-only, from taskHistory)
- Comments section (at bottom):
  • List of comments: avatar, name, relative time, text with @mentions highlighted
  • Input: textarea with @mention support (@ triggers user dropdown)
  • Send button
- Close button (X), task is auto-saved on every field change

3-DOT MENU (Duplicate, Make Recurring, Delete):
Duplicate:
- Creates copy with same properties, clears dates, adds "Copy of" prefix
- Immediately opens the duplicated task

Make Recurring modal:
- Options: Every day / Every week / Every month / Every year / Custom
- Custom: day-of-week checkboxes (Mon–Sun)
- "Save" sets task.recurring config

Delete:
- Confirmation dialog: "Delete [task name]? This cannot be undone."
- Shows undo toast for 5 seconds after deletion
- Calls deleteTask from firestore.ts

CLIENT MANAGEMENT:
- "+ New Client" in dropdown opens inline modal: just a name field
- Creates client in Firestore, auto-selects in current task
- subscribeToClients keeps dropdown updated in real-time

LABELS:
- Assigned as color pills in task page and on cards
- Multi-select in task page shows checkboxes with color preview
- subscribeToLabels keeps labels updated in real-time

EMPTY STATES:
- Empty board column: "+ Add task" only (no other message)
- Empty board (no columns): illustration + "No tasks yet · Create the first one"

SEED DATA (only if Firestore has no boards):
- Create default boards: Planner, Trips, Vacations with correct colors and types
- Create default buckets for Planner: SAMPLES/SHIP OUT, FedEx, IN HOUSE MEETING,
  PICTURES, WORKSHOPS, SHOWS, EVENTS

Mark completed features in CLAUDE.md. Commit: "feat: boards and tasks core"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT 4 — Sync, Offline & Conflict Resolution
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read CLAUDE.md completely before starting.

Build the sync infrastructure. Firebase Persistence is already configured in firebase.ts.

1. CONNECTION STATUS INDICATOR
   - Component: src/components/ui/ConnectionStatus.tsx
   - Position: fixed bottom-right corner, subtle
   - States: connected (green dot, hidden after 2s), reconnecting (amber dot + "Reconnecting..."),
     offline (red dot + "Offline — changes saved locally")
   - Use Firebase onSnapshot error + window online/offline events

2. OFFLINE QUEUE
   - Firebase Persistence handles this automatically (already enabled)
   - Add visual indicator: when offline, show "X pending changes" near connection status
   - Clear indicator when reconnected and changes synced

3. SIMULTANEOUS EDIT MERGE
   All task field updates must use updateTaskField from firestore.ts (which uses transactions).
   
   Conflict detection:
   - When user starts editing a field, record: { fieldName, originalValue, timestamp }
   - On save, use runTransaction:
     a. Read current task from Firestore
     b. Compare current Firestore value vs originalValue
     c. If they differ AND are different from the user's new value → CONFLICT
     d. If no conflict, write the update + history entry atomically

   Conflict UI (ConflictDialog component):
   - Modal: "Editing conflict detected"
   - Shows: field name, "Your version: [value]", "Team version: [value] (saved by [name])"
   - Two buttons: "Keep my version" | "Use team version"
   - Whichever wins gets written to Firestore with a new history entry

4. UNDO TOAST
   - Component: src/components/ui/UndoToast.tsx
   - Triggered by: task deletion, task completion
   - Shows: "Task deleted · Undo" with 5-second countdown bar
   - Undo action: restore task document to Firestore (store snapshot before delete)
   - After 5 seconds: dismiss automatically
   - Only one toast active at a time (new one replaces old)

5. ACTIVITY LOG AUTO-GENERATION
   - Every call to updateTaskField already writes to taskHistory (done in firestore.ts)
   - Add history writes for: task creation, completion, file attachment, assignee changes
   - ActivityLog component: reads from subscribeToTaskHistory, formats entries as:
     "[Name] [action] [field] from [old] → [new]" or "[Name] [action]"
   - Show avatar, relative timestamp

Mark completed features in CLAUDE.md. Commit: "feat: offline sync, conflict resolution, undo"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT 5 — Calendar System
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read CLAUDE.md completely before starting.

Build the calendar system using FullCalendar.js.

1. BOARD CALENDAR (view switcher: day | week | month)
   - Add "Calendar" to the view switcher in the topbar (alongside Cards, List)
   - Use FullCalendar with plugins: dayGrid, timeGrid, interaction
   - Day view: timeGrid with 1-day duration
   - Week view: timeGrid with 7-day duration
   - Month view: dayGrid
   - Events = tasks with dates. Color = board color
   - Event click → open task page modal
   - Drag event → update task dateStart/dateEnd via updateTaskField
   - Resize event edge → update dateEnd (or dateStart for left edge)
   - + BUTTON on hover: show + in top-left of each day cell on mouseover
     On click: open "New Task" modal with that date pre-filled
     Before opening modal, show small popup: "Create in:" with board selector
     (shows Planner, Trips, Vacations, + any other boards)

2. MASTER CALENDAR (/calendar)
   - Combines ALL boards into one FullCalendar instance
   - Each board has its own color (from BOARD_COLORS in colorUtils)
   - Filter toggles at top: one pill per board, click to show/hide
   - Default: all boards visible
   - Filter state saved per user in localStorage
   - Month view by default, with day/week switcher
   - Same drag/resize behavior as board calendar

3. GANTT / TIMELINE VIEW
   - Add "Timeline" to view switcher
   - Use a horizontal Gantt chart for tasks that have both dateStart and dateEnd
   - X axis: dates (current month range, scrollable)
   - Y axis: task titles grouped by bucket/group
   - Bars are draggable left/right to shift dates
   - Bars are resizable from right edge to extend dateEnd
   - Tasks without dates are shown at bottom with a "No date" label
   - Use react-gantt-task library or build with SVG + drag events

4. CALENDAR LEGEND
   - Small legend below filter toggles: colored dot + board name

Mark completed features in CLAUDE.md. Commit: "feat: calendar system with master calendar and gantt"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT 6 — SharePoint File System
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read CLAUDE.md completely before starting.

Build the file attachment system using local SharePoint folder.

1. FIRST-LAUNCH SETUP WIZARD
   - Trigger: on first login, check if user.preferences.sharePointPath is empty
   - Full-screen overlay wizard (not skippable):
     Step 1: "Welcome to NPD Planner" + brief description
     Step 2: "Set up your SharePoint folder"
       - Explanation: "Select the folder where SharePoint is synced on your computer.
         We'll look for a folder called 'REPORTS (NPD-SECURE)' inside it."
       - "Browse" button → calls window.electronAPI.selectFolder()
       - Shows selected path
       - "Verify" button → calls verifySharePointPath from sharepointLocal.ts
       - If valid: green checkmark + "Folder verified"
       - If invalid: red X + specific error message
       - "Next" only enabled when verified
     Step 3: "You're all set" → go to dashboard

2. SHAREPOINT PATH IN SETTINGS
   - Settings page has a "Files" section
   - Shows current path
   - "Change folder" button → re-runs folder picker + verification
   - Updates user.preferences.sharePointPath in Firestore

3. FILE SECTION IN TASK PAGE
   - "Attach file" button (+ icon) → opens native file picker
   - No size limits
   - On file selected:
     a. Show file row immediately with status "uploading" (spinner icon)
     b. Call buildDestinationPath from sharepointLocal.ts using:
        year = current year, clientName from task, taskTitle from task
     c. Call copyFileToSharePoint via IPC
     d. On success: update attachment in Firestore with status 'synced'
     e. On error: update status to 'error', add to retry queue
   - File row shows: file icon (by type), file name, status icon
     Status icons: spinner (uploading), cloud-check green (synced), cloud-x red (error)
   - Click on synced file: calls window.electronAPI.openFile() to open with system app

4. FILE PREVIEW
   - PDF files: show preview using pdf.js (pdfjs-dist package)
     Small embedded preview in task page, click to enlarge
   - Images (.jpg, .jpeg, .png, .gif, .webp): show <img> tag
   - Other files (xlsx, docx, etc.): show file type icon + "Open in [Excel/Word/...]" button

5. RETRY QUEUE
   - Retry worker is started in sharepointLocal.ts addToRetryQueue
   - When app comes back online or SharePoint folder becomes available,
     pending files are retried every 30 seconds
   - Max 5 retries then marked permanently as 'error'
   - User can manually retry by clicking the error icon

6. PATH DISPLAY IN TASK
   - Below attachments, show: "📁 2026 / ClientName / TaskTitle"
   - This is informational — shows where files are saved

Mark completed features in CLAUDE.md. Commit: "feat: sharepoint local file system"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT 7 — Notifications & UX Polish
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read CLAUDE.md completely before starting.

Build notifications and all UX polish features.

1. DESKTOP NOTIFICATIONS (Planner board ONLY)
   Trigger notifications for these events on Planner tasks:
   - Task assigned to user
   - Task updated (any field)
   - Task completed
   - Comment added (to assignees)
   - @mention in comment (to mentioned user)

   Implementation:
   - In each Firestore subscription, detect changes and check:
     a. Is this a Planner board task? (board.type === 'planner')
     b. Is current user in task.assignees OR mentioned?
     c. Is current user within DND hours? (use isWithinDNDHours from notificationHandlers.ts)
   - If all checks pass: call window.electronAPI.sendNotification()
   - Also write notification document to Firestore (for notification center)

2. NOTIFICATION BELL (topbar)
   - Bell icon in topbar, right side
   - Badge shows unread count (red pill)
   - Badge disappears when all read
   - Click opens notification center dropdown

3. NOTIFICATION CENTER (dropdown panel)
   - Max height 400px, scrollable
   - Header: "Notifications" + "Mark all read" button
   - Each notification: avatar (of who triggered), message text, relative time, board color dot
   - Unread notifications: slightly highlighted background
   - Click notification: marks as read + navigates to the task
   - Empty state: "No notifications yet"

4. @MENTIONS IN COMMENTS
   - When user types @ in comment textarea:
     Show dropdown of team members (filter by characters typed after @)
   - Click member: inserts @Name into text, stores uid in mentions array
   - @Name appears highlighted (colored text) in rendered comments
   - Mentioned user receives notification even if not assigned to task

5. GLOBAL SEARCH (Ctrl+K / Cmd+K)
   - Keyboard shortcut opens search overlay
   - Large centered input with search icon
   - Search across: task titles, client names, comment text
   - Uses Fuse.js for fuzzy matching
   - Results grouped: Tasks, Clients, Comments
   - Each result: icon, title, subtitle (board name / task name), keyboard hint
   - Click result: navigate to board/task
   - Esc closes search
   - Recent searches stored in localStorage (max 5)

6. KEYBOARD SHORTCUTS
   Settings page → "Keyboard Shortcuts" section:
   - Table of actions with current binding and "Edit" button
   - Click "Edit": captures next keypress and saves
   - Defaults from DEFAULT_SHORTCUTS in types/index.ts
   - useKeyboardShortcuts hook applies shortcuts globally

7. DARK MODE
   Settings page → "Appearance" section: Light / Dark / System toggle
   - Uses Tailwind's class strategy ('dark' class on <html>)
   - Saved in user.preferences.theme in Firestore
   - System option follows OS preference (window.matchMedia)
   - Smooth transition: transition-colors duration-200 on body

8. DO NOT DISTURB
   Settings page → "Notifications" section:
   - Enable/disable DND toggle
   - If enabled: time range picker (Start / End)
   - Saved in user.preferences.dndStart and dndEnd
   - isWithinDNDHours check in notification sending

Mark completed features in CLAUDE.md. Commit: "feat: notifications, search, shortcuts, dark mode"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT 8 — Analytics, Archive & Final Build
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read CLAUDE.md completely before starting.

Build analytics, archiving, settings management, and the final production build.

1. ANALYTICS DASHBOARD (/analytics — admin only)
   Redirect non-admins to /dashboard.

   Real-time stats (from live Firestore data):
   - Tasks completed this week vs last week (% change badge)
   - Total active tasks across all boards
   - Tasks by assignee (bar chart — who has most workload)
   - Tasks by client (horizontal bar chart — top 10)
   - Tasks by board (pie/donut chart)
   - Tasks by month this year (line chart)

   Use Recharts for all charts. Charts are responsive (100% width).

2. ANNUAL ARCHIVE SYSTEM
   On app startup (after user is authenticated), run archiveCheck():
   - Query tasks where completed=true AND completedAt < (now - 12 months)
   - If any found: generate AnnualSummary object (see types/index.ts)
   - Save summary to archive collection (year as document ID)
   - Delete archived tasks from tasks collection (use writeBatch)
   - Only run if user is admin

   Manual trigger in Settings → "Archive" section:
   - "Archive completed tasks older than 12 months" button
   - Shows count of tasks that will be archived
   - Confirmation dialog
   - Progress indicator while running

3. ANNUAL SUMMARY PAGE
   In Analytics, "Annual Reports" tab:
   - Year selector dropdown (shows available years from archive collection)
   - Summary cards: total tasks, completion rate, top client, busiest month
   - Charts: same as dashboard but for the selected year
   - "Export PDF" button
   - "Export CSV" button

4. PDF EXPORT
   Uses jsPDF + html2canvas.
   - Capture the summary page (or specific charts div)
   - Add header: "NPD Planner — Annual Summary [Year]" + "Elite Flower" logo text
   - Add date: "Generated [date]"
   - Download as: "NPD-Planner-Summary-[Year].pdf"

5. CSV EXPORT
   Uses exportSummaryToCSV from utils/utils.ts.
   - Download as: "NPD-Planner-Summary-[Year].csv"

6. SETTINGS — CLIENT MANAGEMENT
   Settings → "Clients" tab:
   - List all clients (active + inactive)
   - Each client: name, status badge, task count, edit + deactivate buttons
   - Edit: inline name change
   - Deactivate: sets active=false (historical tasks preserved)
   - Reactivate button for inactive clients
   - Search/filter input

7. SETTINGS — LABEL MANAGEMENT
   Settings → "Labels" tab:
   - List all labels with color preview pill
   - Create: name input + color picker
   - Edit: click label to edit name/color inline
   - Delete: with confirmation (warn if label is used in tasks)
   - Color picker: simple grid of preset colors + hex input

8. AUTO-UPDATE (electron-updater)
   In src/main/updater.ts:
   - autoUpdater.checkForUpdatesAndNotify()
   - On update available: send IPC to renderer
   - Renderer shows toast: "Update available — will install on restart"
   - autoUpdater.on('update-downloaded') → show "Restart to update" button in topbar

9. FINAL PRODUCTION BUILD
   Set up electron-builder.yml (already in CLAUDE.md):
   
   a. Install electron-builder: npm install -D electron-builder
   b. Add build scripts to package.json:
      "build:win": "electron-vite build && electron-builder --win"
      "build:mac": "electron-vite build && electron-builder --mac"
      "build": "electron-vite build && electron-builder --win --mac"
   c. Create resources/ folder with placeholder icon files
   d. Run build and verify:
      - Windows: generates .exe installer in dist-electron/
      - Mac: generates .dmg in dist-electron/

10. FINAL QA CHECKLIST
    Run through every item in the checklist at the bottom of CLAUDE.md.
    Fix any failing items before declaring done.

Mark ALL completed features in CLAUDE.md. 
Final commit: "feat: analytics, archive, export, auto-update — v1.0.0 complete"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IF CLAUDE GETS STUCK — use this reset prompt
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Stop. Read CLAUDE.md. Then answer in one sentence:
1. What were you trying to build?
2. What did you try?
3. Where exactly are you blocked?
Then propose the simplest possible next step.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DEPENDENCIES REFERENCE — if needed manually
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

npm install firebase zustand react-router-dom
npm install @fullcalendar/react @fullcalendar/daygrid @fullcalendar/timegrid @fullcalendar/interaction
npm install recharts jspdf html2canvas fuse.js
npm install pdfjs-dist
npm install electron-updater
npm install -D electron-builder tailwindcss postcss autoprefixer @types/node
