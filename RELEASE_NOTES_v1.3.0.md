# NPD Planner v1.3.0 — Release Notes
**Release date:** April 24, 2026  
**Platforms:** Windows (.exe) · macOS (.dmg)

---

## What's New

### Photo Manager — Fase 2, 3 & 4

A complete 4-tab workflow for managing product photography from capture to Excel.

#### Tabs
| Tab | Purpose |
|---|---|
| 1. CAMERA | All captured photos grouped by recipe |
| 2. SELECTED | Starred candidate photos |
| 3. CLEANED | Drop background-removed PNGs per recipe |
| 4. READY | Final retouched files, ready for export and Excel insertion |

#### KPI Strip
Five live counters at the top:
- **Photographed** — recipes with at least one photo captured
- **Selected** — recipes with a candidate starred
- **Warnings** — recipes with unresolved notes
- **Cleaned** — recipes with a cleaned PNG pending retouch
- **Ready** — recipes with a final PNG + JPG processed

#### Selection & Export
- Hover over any photo → checkbox appears top-left + "Select" button top-right
- **Select All** — selects everything in the current tab
- **All from "[Recipe]"** — selects all photos belonging to the last-touched recipe
- **Delete** — removes selected photos from disk + Firestore (with confirmation)
- **Save As** — copies to a folder you choose, preserving the `RecipeName/PNG/` and `RecipeName/JPG/` folder structure
- **Download ZIP** — same structure inside a `.zip` file (no extra dependencies — uses native `zip` on Mac, PowerShell `Compress-Archive` on Windows)
- **Format dialog (READY tab)** — choose PNG, JPG, or both before exporting

#### Warning badges
Every recipe with active notes shows an amber `⚠ N` badge next to its name in **all 4 tabs**. Click the badge or the count to open the Notes modal without leaving the current tab. The badge disappears automatically when all notes are resolved.

#### Insertar en Excel (Fase 4)
On each READY card, a blue **"Insertar en Excel"** button inserts the processed JPG into cell `G8:M35` of the "Spec Sheet" worksheet using Python (`openpyxl` + `Pillow`).

**Requires (one-time setup):**
```bash
pip3 install openpyxl pillow
```

Button states:
1. **Blue — "Insertar en Excel"** — not yet inserted
2. **Spinner — "Insertando…"** — Python script running
3. **Green — "✓ Insertado [date]"** + small "Reinsertar" link — done

If the Excel file is open in Microsoft Excel, you'll see an error asking you to close it first.

---

### Default Recipe Template — ELITE QUOTE BOUQUET 2026

The template file **"ELITE QUOTE BOUQUET 2026.xlsx"** is now bundled with every installation.

**How it works:**
- When you create a new Recipe Project, the Master Template field is **pre-filled automatically** — no manual browsing needed
- The field shows a green **"Default"** badge when using the bundled template
- Use **Browse** to override with a custom template at any time
- On update/reinstall, the template is always available even offline

---

### Notes — Real-time & Fixed

Notes posted in the Recipe Detail Panel now work correctly and update in real-time across all sessions.

**Previous issue:** Notes were stuck in a loading spinner forever.  
**Root cause:** Firestore security rules for the `notes` subcollection were missing.  
**Fix:** Rules deployed + `onSnapshot` error handler added so the UI never freezes.

**How to post a note:**
1. Open a recipe → scroll to **Notes** section
2. Type your note → press **Post Note** or `Cmd/Ctrl + Enter`
3. Note appears instantly for all users
4. Resolve a note by clicking the ✕ delete button (author or admin only)

---

### Real-time Warning Sync

Warning counts (`⚠`) in the Photo Manager now update **without refreshing**. When a note is resolved in the Recipe Detail Panel, the badge disappears from the Photo Manager within seconds.

**Before:** Photo Manager loaded recipe data once (snapshot). Resolving notes required a full page reload to see the badge disappear.  
**After:** Uses `onSnapshot` listener — changes propagate automatically.

---

### Stability — React StrictMode Removed

**Symptom:** `FIRESTORE INTERNAL ASSERTION FAILED: Unexpected state (ID: b815)` error in console, causing occasional crashes.  
**Root cause:** React StrictMode double-invokes `useEffect` hooks in development, which races against Firebase 12's `persistentLocalCache` watch stream.  
**Fix:** `<React.StrictMode>` removed from `main.tsx`. This is the documented solution for Firebase SDK 12 + offline persistence.

---

## Security Fixes

| Severity | Issue | Fix |
|---|---|---|
| **Critical** | Path traversal in `SHAREPOINT_RESOLVE_PATH` IPC handler — a crafted `relativePath` like `../../etc/passwd` could escape the SharePoint root | Now uses the existing `safeJoin()` validator (same protection as `FILE_COPY`) |
| **Critical** | Command injection in PowerShell ZIP export — `destZipPath` was interpolated directly into a PowerShell string | Now passes paths as separate `-args` so no shell interpolation occurs |
| **High** | Notification IPC handler had no try/catch — a bad `Notification()` call could crash the main process silently | Wrapped in try/catch; input sanitized (title ≤256 chars, body ≤512 chars) |
| **High** | `appBootstrap` Firestore rule allowed any unauthenticated write when document didn't exist | Now requires `isAuthenticated() && isEliteFlowerEmail()` for bootstrap writes |
| **Medium** | `handleOpenInExcel` used hardcoded `\` separators (`.replace(/\//g, '\\')`) — broke on macOS | Now uses the `resolveSharePointPath` IPC call which handles platform separators via Node `path.join()` |

---

## How to Update

### Windows
1. Download `npd-planner-1.3.0-setup.exe`
2. Run the installer — it upgrades in-place, no uninstall needed
3. Your data, SharePoint path, and settings are preserved

### macOS
1. Download `npd-planner-1.3.0.dmg`
2. Open the DMG and drag NPD Planner to Applications (replace existing)
3. Launch normally

### After updating (one-time)
Deploy the updated Firestore security rules:
```bash
firebase deploy --only firestore:rules
```
This enables notes to work for all users.

---

## Full Workflow — Recipe Project from Start to Finish

### Step 1 — Create a Project
1. Open **Recipe Manager** → click **+ New Project**
2. Choose **Creation Mode**: "Create From Scratch" or "Import From Excel"
3. Enter a **Project Name** (e.g., "Valentine's Day 2026")
4. Select the **Parent Folder** — the project subfolder is created automatically
5. **Master Template** — pre-filled with "ELITE QUOTE BOUQUET 2026" (bundled). Click Browse to use a different one
6. Set an optional **Project Deadline**
7. Click **Next** → configure folders, recipes, customer defaults
8. Click **Create** — folders and Excel files are generated automatically

### Step 2 — Edit Recipes
1. Click a project → recipe list appears
2. Click a recipe row → Detail Panel opens on the right
3. Edit **Customer, Holiday, Wet Pack, Box Type, Pick Needed, Distribution**
4. Click **Save** → changes write back to the Excel file via IPC
5. Click **Open in Excel** → opens the file in Microsoft Excel / Numbers for manual editing

### Step 3 — Add Notes / Warnings
1. In the Detail Panel → scroll to **Notes**
2. Type a note → **Post Note** (Cmd/Ctrl+Enter)
3. The recipe row shows an amber `⚠` badge visible to all team members
4. Resolve notes after the issue is addressed → badge disappears everywhere

### Step 4 — Photography
1. Click **📷 Tomar Fotos** on a recipe row → opens Capture Page
2. Connect a camera (Mac only, gphoto2 required: `brew install gphoto2`)
3. Or use **Watch Folder** mode — place photos in the watched folder
4. Star the best shot → click **Done**
5. Photos save to `CAMERA/` and `Pictures/` inside the project

### Step 5 — Photo Manager
1. Open a project → click **Photo Manager** tab
2. **CAMERA tab** — review all captured photos grouped by recipe
3. **SELECTED tab** — see only starred candidates
4. **CLEANED tab** — drag a background-removed PNG to the recipe row → it saves to `PICTURES/3. CLEANED/`
5. **READY tab** — drag the final retouched PNG → it converts to JPG and saves to `PICTURES/4. READY/`

### Step 6 — Export & Excel Insertion
1. In the **READY tab** → select recipes (click card)
2. **Save As** — copy PNG + JPG to a folder
3. **Download ZIP** — same files in a `.zip`
4. **Insertar en Excel** button on each card → inserts the JPG into "Spec Sheet" G8:M35

### Step 7 — Rename Recipes
1. Open Detail Panel → click the **pencil icon ✏** next to the recipe name
2. Enter the new name → **Rename** — the Excel file, all photo filenames, and Firestore all update atomically

---

## Known Limitations

| Item | Status |
|---|---|
| Camera tethering (gphoto2) | Mac only. Windows users use Watch Folder mode |
| Excel photo insertion | Requires `pip3 install openpyxl pillow` (one-time) |
| Auto-update | Checks GitHub Releases on startup. Skipped in development |
| Offline mode | Reads from local cache. Writes queue and sync on reconnect |

---

## Minimum Requirements

| | Windows | macOS |
|---|---|---|
| OS | Windows 10 v1903+ | macOS 10.15 Catalina+ |
| RAM | 4 GB | 4 GB |
| Disk | 500 MB | 500 MB |
| Network | Required for Firestore sync | Required for Firestore sync |
| Python | 3.8+ (for Excel photo insertion) | 3.8+ (pre-installed on macOS) |
