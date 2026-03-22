# NPD PLANNER — PHASE 0: TECHNICAL DEBT & INCOMPLETE FEATURES
# ═══════════════════════════════════════════════════════════════
# INSTRUCCIONES PARA KIMI AGENT:
#
# 1. Lee CLAUDE.md COMPLETO antes de hacer cualquier cosa.
# 2. Ejecuta el AUDIT PROMPT primero — revisa cada item, marca lo que ya
#    está implementado y lo que falta.
# 3. Luego ejecuta los IMPLEMENTATION PROMPTS en orden, SOLO para los
#    items que el audit marcó como incompletos.
# 4. Después de cada prompt: `npm run typecheck` — debe pasar.
# 5. Commit después de cada prompt completado.
# ═══════════════════════════════════════════════════════════════


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT P0-AUDIT — Full Phase 0 Code Audit
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read CLAUDE.md completely before starting.

You are auditing NPD Planner's Phase 0 — incomplete features that are
marked with [ ] in CLAUDE.md. Your job is to check the actual codebase
and determine what's TRULY implemented vs what's missing or broken.

Go through EVERY item below. For each one:
- Read the actual source file(s)
- Check if the feature works (component renders, function exists, logic is correct)
- Mark it: ✅ DONE, ⚠️ PARTIAL (exists but has bugs/gaps), or ❌ MISSING

Print your findings as a checklist. Do NOT modify any code yet.

═══════════════════════════════
AREA 1: DESKTOP NOTIFICATIONS
═══════════════════════════════

Check these files:
- src/main/ipc/notificationHandlers.ts
- src/renderer/src/hooks/useNotifications.ts
- src/renderer/src/store/notificationStore.ts
- src/renderer/src/components/notifications/NotificationBell.tsx
- src/renderer/src/components/notifications/NotificationCenter.tsx
- src/renderer/src/components/ui/AppLayout.tsx (bell placement)
- src/preload/index.ts (sendNotification exposed?)
- src/preload/index.d.ts (types match?)

Items to verify:
[ ] Desktop notifications fire via Electron Notification API for Planner tasks
[ ] Sound plays on notification (check if audio file exists in resources/sounds/)
[ ] DND schedule respected — silent flag passed when within DND hours
[ ] NotificationBell renders in sidebar with unread count badge
[ ] NotificationCenter dropdown opens from bell, shows list, mark-read works
[ ] Notification created on: task assigned to user
[ ] Notification created on: task completed (notifies other assignees)
[ ] Notification created on: comment added (notifies assignees)
[ ] Notification created on: @mention in comment (notifies mentioned user)
[ ] Notification created on: task field updated (notifies assignees) — check updateTaskField
[ ] Click notification in center → navigates to task
[ ] Click desktop notification → navigates to task (check onNotificationClicked handler in App.tsx)
[ ] Notification for new_user_pending when new user registers (check createUser flow)

═══════════════════════════════
AREA 2: ANALYTICS DASHBOARD
═══════════════════════════════

Check these files:
- src/renderer/src/pages/AnalyticsPage.tsx
- src/renderer/src/lib/firestore.ts (subscribeToAllTasks, subscribeToArchive, getArchiveByYear)

Items to verify:
[ ] /analytics route exists and redirects non-admins
[ ] DashboardTab renders with real-time Firestore data
[ ] StatCards: completed this week, active tasks, total tasks, completion rate
[ ] Bar chart: tasks by assignee (workload) — uses Recharts
[ ] Bar chart: tasks by client (top 10) — horizontal
[ ] Pie/donut chart: tasks by board
[ ] Line chart: tasks by month this year
[ ] Charts are responsive (100% width ResponsiveContainer)
[ ] Loading state while fetching
[ ] Empty states when no data

═══════════════════════════════
AREA 3: ANNUAL ARCHIVE SYSTEM
═══════════════════════════════

Check these files:
- src/renderer/src/lib/firestore.ts (archiveOldTasks, subscribeToArchive, getArchiveByYear, saveAnnualSummary)
- src/renderer/src/pages/AnalyticsPage.tsx (AnnualReportsTab)
- src/renderer/src/pages/SettingsPage.tsx (Archive section)
- src/renderer/src/types/index.ts (AnnualSummary type)

Items to verify:
[ ] archiveOldTasks() function exists and works — queries completed tasks > 12 months
[ ] archiveOldTasks() generates AnnualSummary with all required fields
[ ] archiveOldTasks() moves tasks to archive subcollection + deletes from tasks
[ ] Auto-trigger on app startup for admin users — check App.tsx or DashboardPage
[ ] Manual trigger button in Settings → Archive section
[ ] Confirmation dialog before archive
[ ] Progress indicator during archive
[ ] Shows count of tasks that will be archived
[ ] AnnualReportsTab: year selector dropdown
[ ] AnnualReportsTab: summary cards (total tasks, completion rate, top client, busiest month)
[ ] AnnualReportsTab: charts for selected year
[ ] AnnualReportsTab: empty state when no archives exist

═══════════════════════════════
AREA 4: PDF & CSV EXPORT
═══════════════════════════════

Check these files:
- src/renderer/src/pages/AnalyticsPage.tsx (handleExportPDF, handleExportCSV)
- src/renderer/src/utils/utils.ts (exportSummaryToCSV)
- src/renderer/src/utils/exportUtils.ts

Items to verify:
[ ] jsPDF and html2canvas are in package.json and importable
[ ] handleExportPDF exists and runs without error
[ ] PDF has Elite Flower branded header (NPD Planner + year + company + date)
[ ] PDF handles multi-page content (canvas slicing, not single addImage)
[ ] PDF forces light mode capture (no dark background)
[ ] PDF has page numbers
[ ] handleExportCSV exists and triggers download
[ ] exportSummaryToCSV produces valid CSV with all summary sections
[ ] CSV escapes values with commas (test: client named "Bloom, Inc.")
[ ] CSV has UTF-8 BOM for Excel Windows compatibility (\uFEFF prefix)
[ ] Export buttons show loading state during PDF generation
[ ] Empty state in Annual Reports when no archives exist (no broken buttons)

═══════════════════════════════
AREA 5: PDF PREVIEW IN ATTACHMENTS
═══════════════════════════════

Check these files:
- src/renderer/src/components/task/AttachmentPanel.tsx (PDFPreviewModal, isPDF, PdfThumbnail)
- electron.vite.config.ts (pdf.js worker copy plugin?)
- package.json (pdfjs-dist version and location — deps or devDeps?)

Items to verify:
[ ] pdfjs-dist is installed (check package.json)
[ ] pdf.js worker initialization works in dev mode (`npm run dev`)
[ ] pdf.js worker initialization works in production build
[ ] isPDF() helper correctly detects PDF files
[ ] PDFPreviewModal component exists with page rendering logic
[ ] PDFPreviewModal: page navigation (prev/next) works
[ ] PDFPreviewModal: loading state while rendering
[ ] PDFPreviewModal: error state on failure
[ ] Preview button (ZoomIn) appears on PDF attachment rows
[ ] Click preview → modal opens with rendered PDF page
[ ] Inline PDF thumbnail in attachment row (small page-1 image)
[ ] No `as any` casts in pdfjs render calls (TypeScript strict)

═══════════════════════════════
AREA 6: PRODUCTION BUILD
═══════════════════════════════

Check these files:
- electron-builder.yml
- package.json (build scripts)
- src/main/updater.ts
- src/main/index.ts (auto-updater registration)
- src/renderer/src/App.tsx (update banner)
- resources/ folder (icon files)

Items to verify:
[ ] electron-builder.yml exists with correct appId, productName, targets
[ ] package.json has build:win and build:mac scripts
[ ] resources/icon.ico exists (Windows)
[ ] resources/icon.icns exists (Mac)
[ ] electron-updater configured in updater.ts
[ ] Auto-update check on startup (production only)
[ ] "Update available" IPC sent to renderer
[ ] "Restart to update" banner in App.tsx
[ ] `npm run build:win` completes without error (if on Windows)
[ ] `npm run build:mac` completes without error (if on Mac)
[ ] Output .exe/.dmg appears in dist-electron/

After checking ALL items, print the complete results.
Then list ONLY the items marked ❌ MISSING or ⚠️ PARTIAL — those are the
ones we need to fix.

Do NOT write any code in this prompt. Just audit and report.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT P0-FIX-1 — Fix Desktop Notifications (anything marked ❌/⚠️)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read CLAUDE.md completely before starting.
Read your audit results from P0-AUDIT.

Fix ONLY the notification items that were marked ❌ MISSING or ⚠️ PARTIAL.
Skip anything already ✅ DONE.

KNOWN ISSUES TO CHECK AND FIX:

1. NOTIFICATION SOUND:
   - Check if resources/sounds/notification.wav (or .ogg) exists
   - If missing: we need a sound file. Create a placeholder note or skip sound for now.
   - If exists: verify notificationHandlers.ts plays it when silent=false
   - Sound should play via IPC event to renderer (renderer uses HTML Audio API)
   - The main process sends 'notification:play-sound' with the file path
   - Renderer listens and plays via `new Audio()`

2. NOTIFICATION ON TASK UPDATE:
   - updateTaskField() in firestore.ts currently only notifies on 'assignees' field changes
   - It should also notify task assignees when significant fields change:
     status, priority, dateStart, dateEnd, bucket
   - Do NOT notify on every tiny field change (title edits, description changes — too noisy)
   - Only notify other assignees, never the user who made the change
   - Only for Planner board tasks (check boardType === 'planner')

3. NOTIFICATION CLICK → NAVIGATE:
   - preload/index.ts exposes onNotificationClicked callback
   - Check if App.tsx (or AppLayout.tsx) listens for this and navigates
   - If missing: add useEffect in App.tsx that listens and calls navigate(`/task/${taskId}`)

4. NEW USER PENDING NOTIFICATION:
   - When a new user registers with status 'awaiting', admin/owner users should get notified
   - Check createUser flow in firestore.ts or LoginPage.tsx
   - If missing: after creating user doc, query all admin+owner users and createNotification for each

For each fix:
- State what was missing
- Show which file you're modifying
- Make the minimal change needed
- Run `npm run typecheck` after each file change

Update CLAUDE.md checkboxes for completed items.
Commit: "fix: complete desktop notification system — sound, updates, navigation"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT P0-FIX-2 — Fix Analytics Dashboard (anything marked ❌/⚠️)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read CLAUDE.md completely before starting.
Read your audit results from P0-AUDIT.

Fix ONLY the analytics items that were marked ❌ MISSING or ⚠️ PARTIAL.
Skip anything already ✅ DONE.

KNOWN ISSUES TO CHECK AND FIX:

1. DASHBOARD TAB — the DashboardTab component in AnalyticsPage.tsx should have:
   - 4 stat cards: Completed This Week (with % change vs last week), Active Tasks,
     Total Tasks, Completion Rate
   - Bar chart: workload by team member (horizontal, using Recharts BarChart)
   - Bar chart: top 10 clients (horizontal)
   - Pie/donut chart: tasks by board
   - Line chart: tasks by month this year
   - All using ResponsiveContainer width="100%" height={250}
   - Loading state, empty states per chart

2. ANNUAL REPORTS TAB — should have:
   - Year selector dropdown from archive collection
   - Summary cards: total tasks, completion rate, top client, busiest month
   - Charts: by board (pie), by month (line), by client (bar), top contributors
   - Empty state when no archives

3. If charts exist but have issues (wrong data, bad formatting, dark mode colors):
   - Recharts Tooltip should use white background for readability
   - Legend should be visible
   - Colors should match CHART_COLORS palette

Update CLAUDE.md checkboxes:
```
- [x] Analytics dashboard (admin only): tasks/week, load by person, top clients
- [x] Annual summary page with Recharts charts (bar, line)
```
Commit: "fix: complete analytics dashboard with all charts and annual reports"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT P0-FIX-3 — Fix Annual Archive System (anything marked ❌/⚠️)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read CLAUDE.md completely before starting.
Read your audit results from P0-AUDIT.

Fix ONLY the archive items that were marked ❌ MISSING or ⚠️ PARTIAL.
Skip anything already ✅ DONE.

KNOWN ISSUES TO CHECK AND FIX:

1. AUTO-TRIGGER ON STARTUP:
   - After user authenticates and is admin, run archiveCheck()
   - archiveCheck: query tasks where completed=true AND completedAt older than 12 months
   - If count > 0: show a non-blocking toast or log — do NOT auto-archive without asking
   - Best place: useEffect in DashboardPage.tsx or App.tsx, after user loads
   - Guard: only run for admin/owner, only run once per session (use a ref flag)

2. MANUAL TRIGGER IN SETTINGS:
   - Settings → Archive tab/section
   - Button: "Archive completed tasks older than 12 months"
   - On click: first query to get count, show confirmation dialog:
     "X tasks will be archived. This cannot be undone. Continue?"
   - On confirm: call archiveOldTasks() with progress callback
   - Show progress: "Archiving... X of Y" or simple spinner
   - On complete: success message + count

3. archiveOldTasks FUNCTION:
   - Should query completed tasks across ALL boards where completedAt < (now - 12 months)
   - Generate AnnualSummary with: totalTasks, totalTrips, totalVacations, completionRate,
     byBoard, byClient, byAssignee, byMonth, topClients, topAssignees
   - Save to archive collection with year as document ID
   - Move tasks to archive/{year}/archivedTasks subcollection
   - Delete original tasks from tasks collection
   - Use writeBatch (limit 500 ops per batch — handle large sets)

4. ARCHIVE EMPTY STATE:
   - When no archives exist in the Annual Reports tab, show helpful message
   - Explain how archives are created
   - Optionally link to Settings → Archive

Update CLAUDE.md checkboxes:
```
- [x] Annual archive: auto-detect tasks > 12 months old on startup
- [x] Archive generates summary document
```
Commit: "fix: complete annual archive system with auto-detect and manual trigger"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT P0-FIX-4 — Fix PDF & CSV Export (anything marked ❌/⚠️)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read CLAUDE.md completely before starting.
Read your audit results from P0-AUDIT.

Fix ONLY the export items that were marked ❌ MISSING or ⚠️ PARTIAL.
Skip anything already ✅ DONE.

KNOWN ISSUES TO CHECK AND FIX:

1. PDF MULTI-PAGE:
   - Current handleExportPDF likely uses single pdf.addImage() call
   - If content exceeds one A4 page, it squishes instead of paginating
   - Fix: slice canvas into page-height strips, addImage per page, addPage() between
   - First page: reserve 40mm for header, other pages: full height minus margins
   - Add page numbers: "Page N" centered at bottom of each page

2. PDF DARK MODE:
   - html2canvas captures whatever theme is active
   - Before capture: check if dark mode → temporarily remove 'dark' class from <html>
   - Wait 100ms for repaint
   - Capture with backgroundColor: '#ffffff'
   - Restore dark mode class after capture

3. PDF HEADER:
   - "NPD Planner" — 18pt bold centered
   - "Annual Summary {year}" — 12pt centered
   - "Elite Flower" — 9pt gray centered
   - "Generated: {date}" — 9pt gray centered
   - Separator line

4. PDF LOADING STATE:
   - Add `exporting` state boolean
   - Disable buttons + show spinner during generation
   - Set false in finally block

5. CSV ESCAPING:
   - Add csvEscape() helper: if value contains comma/quote/newline, wrap in double quotes
   - Double any existing quotes inside values
   - Apply to all user-data values (client names, member names)

6. CSV BOM:
   - Prepend \uFEFF to the CSV string for Excel Windows compatibility
   - This makes accented Spanish characters display correctly

7. CSV DOWNLOAD FIX:
   - After creating Blob, append <a> link to document.body before click
   - Remove after click (required for Firefox)
   - Revoke object URL

Update CLAUDE.md checkboxes:
```
- [x] Export PDF (jsPDF + html2canvas) with Elite Flower header
- [x] Export CSV (all filterable data)
```
Commit: "fix: PDF multi-page pagination and CSV escaping with BOM"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT P0-FIX-5 — Fix PDF Preview in Attachments (anything marked ❌/⚠️)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read CLAUDE.md completely before starting.
Read your audit results from P0-AUDIT.

Fix ONLY the PDF preview items that were marked ❌ MISSING or ⚠️ PARTIAL.
Skip anything already ✅ DONE.

KNOWN ISSUES TO CHECK AND FIX:

1. WORKER LOADING (CRITICAL — this is likely the main blocker):
   - pdfjs-dist v5.5.207 is in production deps
   - Current code: `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)`
   - This WORKS in dev mode but FAILS in production Electron build
   - Reason: electron-vite rewrites import.meta.url, worker .mjs not in output

   FIX OPTION A — Copy worker with Vite plugin:
   In electron.vite.config.ts, add an inline plugin to renderer.plugins:
   ```typescript
   import { copyFileSync, mkdirSync, existsSync } from 'fs'
   import { resolve, dirname } from 'path'

   function copyPdfWorker(): Plugin {
     return {
       name: 'copy-pdf-worker',
       writeBundle(options) {
         const outDir = options.dir || 'out/renderer'
         const src = resolve('node_modules/pdfjs-dist/build/pdf.worker.min.mjs')
         const dest = resolve(outDir, 'pdf.worker.min.mjs')
         if (!existsSync(dirname(dest))) mkdirSync(dirname(dest), { recursive: true })
         if (existsSync(src)) copyFileSync(src, dest)
       }
     }
   }
   ```

   Then in AttachmentPanel.tsx, update worker init:
   ```typescript
   if (import.meta.env.DEV) {
     pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
       'pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url
     ).toString()
   } else {
     pdfjsLib.GlobalWorkerOptions.workerSrc = './pdf.worker.min.mjs'
   }
   ```

   FIX OPTION B — If Option A fails, disable the worker entirely:
   ```typescript
   pdfjsLib.GlobalWorkerOptions.workerSrc = ''
   ```
   This runs pdf.js on the main thread (slower for huge PDFs but works everywhere).

   Try Option A first. Fall back to Option B only if worker still fails in production.

2. `as any` CAST ON RENDER:
   - Current: `page.render({ canvasContext, viewport } as any).promise`
   - pdfjs-dist v5 types may require different signature
   - Remove `as any`, fix with proper types
   - If TypeScript errors: check what pdfjs-dist v5 expects for RenderParameters
   - May need: `import type { RenderParameters } from 'pdfjs-dist/types/src/display/api'`

3. INLINE PDF THUMBNAIL (if missing):
   - CLAUDE.md spec says: "Small embedded preview in task page, click to enlarge"
   - Check if PdfThumbnail component exists in AttachmentPanel.tsx
   - If missing: create a small component that renders page 1 at scale 0.3
   - Show in AttachmentRow replacing the file icon for synced PDF attachments
   - Click thumbnail → opens full PDFPreviewModal
   - Cache thumbnails per attachment ID to avoid re-rendering

VERIFY after fixes:
1. `npm run dev` → attach a PDF → click preview → pages render
2. `npm run build:win` (or build:mac) → same test in production
3. Check DevTools console — no worker loading errors
4. `npm run typecheck` — no `as any` remaining in pdfjs calls

Update CLAUDE.md checkbox:
```
- [x] PDF preview (pdf.js)
```
Commit: "fix: pdf.js worker loading and PDF preview for dev and production"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT P0-FIX-6 — Fix Production Build Pipeline (anything marked ❌/⚠️)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read CLAUDE.md completely before starting.
Read your audit results from P0-AUDIT.

Fix ONLY the build items that were marked ❌ MISSING or ⚠️ PARTIAL.
Skip anything already ✅ DONE.

KNOWN ISSUES TO CHECK AND FIX:

1. ELECTRON-BUILDER CONFIG:
   - electron-builder.yml should exist with:
     appId: com.eliteflower.npdplanner
     productName: NPD Planner
     Win target: nsis
     Mac target: dmg
     publish: github provider with owner/repo
   - asarUnpack should include resources/**

2. BUILD SCRIPTS:
   - package.json must have:
     "build:win": runs typecheck + vite build + electron-builder --win
     "build:mac": runs typecheck + vite build + electron-builder --mac
   - Verify they exist and have correct command chains

3. ICON FILES:
   - resources/icon.ico (Windows) — must exist
   - resources/icon.icns (Mac) — must exist
   - If missing: create placeholders or note that user needs to add them

4. AUTO-UPDATER:
   - src/main/updater.ts should:
     a. Import autoUpdater from electron-updater
     b. Call checkForUpdatesAndNotify() (only in production, not dev)
     c. Listen for 'update-available' → send IPC to renderer
     d. Listen for 'update-downloaded' → send IPC to renderer
   - src/main/index.ts should call the updater setup on app ready
   - src/renderer/src/App.tsx should:
     a. Listen for 'update-downloaded' IPC event
     b. Show "Restart to update" banner
     c. Banner has "Restart now" button that sends 'app:restart-to-update'

5. TEST BUILD:
   - Run `npm run typecheck` — must pass
   - Run `npm run build:win` (if on Windows) or `npm run build:mac` (if on Mac)
   - Verify output exists in dist-electron/
   - Note any errors in the build log

Update CLAUDE.md checkboxes:
```
- [x] electron-builder config for Windows (.exe) + Mac (.dmg)
- [x] Test build on both platforms
```
Commit: "fix: production build pipeline with auto-updater and icons"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT P0-FINAL — Final QA Pass
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read CLAUDE.md completely.

Run through the ENTIRE Feature Completion Checklist in CLAUDE.md.
For every item that is now [ ] unchecked, verify if you completed it
in the previous prompts.

1. Run `npm run typecheck` — fix any errors
2. Run `npm run lint` — fix any warnings (if eslint is configured)
3. Search for `as any` in the codebase: `grep -r "as any" src/ --include="*.ts" --include="*.tsx"`
   - Fix any remaining ones (CLAUDE.md rule: "No `any` in TypeScript")
4. Search for hardcoded paths: `grep -rn "'/\|\"/" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v import`
   - Replace any with path.join (CLAUDE.md rule)
5. Verify all Firebase operations have try/catch

Update ALL checkboxes in CLAUDE.md to reflect current state.
Mark the Final QA pass checkbox:
```
- [x] Final QA pass
```

Print a summary: what's complete, what's still pending, and any blockers.

Commit: "chore: Phase 0 complete — final QA pass"
