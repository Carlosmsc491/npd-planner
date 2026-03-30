━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT — Boxes in Flight Status + Dashboard Cleanup + Auto-Updater Fix
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read CLAUDE.md before starting.

Read these files in full before writing any code:
- src/renderer/src/components/dashboard/FlightStatusPanel.tsx
- src/renderer/src/pages/DashboardPage.tsx
- src/main/updater.ts
- electron-builder.yml
- package.json
- src/preload/index.ts
- src/renderer/src/App.tsx

---

## Fix 1 — Boxes column in Flight Status panel

The `boxes` field already exists on `AwbEntry`. It just needs to be shown in the table.

### Checklist

- [ ] In `FlightStatusPanel.tsx`, find the row object built from tasks + awbs.
  Add `boxes: number` to it and set `boxes: awb.boxes ?? 0` when building each row.
- [ ] In `<thead>`, add `<th>` for "Boxes" between the AWB column and the Status column:
  ```tsx
  <th className="text-left px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wide">Boxes</th>
  ```
- [ ] In each `<tr>` body, add the `<td>` in the same position:
  ```tsx
  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
    {row.boxes > 0 ? row.boxes : '—'}
  </td>
  ```

---

## Fix 2 — Remove "NPD Recipes" section from Dashboard

The Dashboard shows a "NPD RECIPES" section (visible in screenshot). This section must be
removed entirely. The Boards section stays — only remove the NPD Recipes block.

### Checklist

- [ ] Open `DashboardPage.tsx`
- [ ] Find the JSX block that renders the "NPD RECIPES" heading and its content
- [ ] Delete the entire block — heading + cards/content below it
- [ ] Do not remove or touch the "BOARDS" section above it
- [ ] Verify the Dashboard still renders cleanly with no empty gaps

---

## Fix 3 — Auto-updater not working (critical)

A GitHub release was published but no installed machines received the update.
There are multiple root causes to diagnose and fix.

### Read first
Read the current `src/main/updater.ts` and `electron-builder.yml` carefully.

### Known issues to check and fix

**A) `electron-builder.yml` is missing `publish` with `releaseType`**

The current publish config is:
```yaml
publish:
  provider: github
  owner: Carlosmsc491
  repo: npd-planner
```

It must also include `releaseType: release` (not draft) so electron-updater knows
the channel to check. Update to:
```yaml
publish:
  provider: github
  owner: Carlosmsc491
  repo: npd-planner
  releaseType: release
```

**B) The build must include `latest.yml` in the GitHub release assets**

When you run `npm run build:win`, electron-builder generates `latest.yml` in `dist-electron/`.
This file MUST be uploaded to GitHub releases as an asset alongside the installer.
If it's missing from the release, electron-updater cannot detect the new version.

Add a checklist item for Claude to verify `latest.yml` is referenced in the build output.

**C) `updater.ts` must only run in production**

The current code calls `checkForUpdates()` in development too (with a catch), which is
acceptable but noisy. Add a production guard so it only runs when packaged:

```typescript
import { app } from 'electron'

// Only run auto-updater in production builds
if (!app.isPackaged) {
  console.log('[Updater] Skipping — running in development mode')
  return
}
```

Add this guard at the very top of `setupAutoUpdater`, before setting up any listeners
or calling `checkForUpdates`.

**D) Verify `autoUpdater.logger` is set for debugging**

Add logging so update errors appear in the app's log file:

```typescript
import log from 'electron-log'
autoUpdater.logger = log
;(autoUpdater.logger as typeof log).transports.file.level = 'info'
```

Check if `electron-log` is already installed in `package.json` — it often is with
electron-builder. If not, add the import as a fallback using `console`:
```typescript
autoUpdater.logger = console
```

**E) The update banner in the renderer must actually be wired**

Verify in `App.tsx` (or wherever `onUpdateDownloaded` is handled) that:
- The IPC event `IPC.UPDATE_DOWNLOADED` is listened to
- When received, a visible banner/toast appears with a "Restart to update" button
- The button calls `window.electronAPI.restartToUpdate()` or equivalent IPC

If this wiring is missing or broken, the update downloads silently but the user
never knows to restart. Fix it so the banner is visible and functional.

**F) Check `package.json` version matches the build**

The `version` field in `package.json` must be lower than the version in the GitHub
release for electron-updater to trigger a download. Verify the current version
and document what it should be bumped to before the next release.

Print a comment in the code: `// Current version: X.Y.Z — bump before next release build`

### Checklist

- [ ] Add `releaseType: release` to `publish` block in `electron-builder.yml`
- [ ] Add `app.isPackaged` guard in `updater.ts` — skip all setup in dev mode
- [ ] Set `autoUpdater.logger` to `electron-log` or `console`
- [ ] Verify `App.tsx` has working `onUpdateDownloaded` → visible banner → restart button
  - If the banner/toast is missing: add a simple fixed banner at the top of the app:
    ```tsx
    {updateReady && (
      <div className="fixed top-0 left-0 right-0 z-50 bg-green-600 text-white text-sm px-4 py-2 flex items-center justify-between">
        <span>A new version is ready to install.</span>
        <button
          onClick={() => window.electronAPI.restartToUpdate()}
          className="ml-4 rounded bg-white text-green-700 px-3 py-1 text-xs font-semibold hover:bg-green-50"
        >
          Restart now
        </button>
      </div>
    )}
    ```
- [ ] Verify `window.electronAPI.restartToUpdate()` is exposed in `preload/index.ts`
  - If missing: add IPC channel `app:restart-to-update` to preload and main process
- [ ] Add comment in `updater.ts` with current package.json version
- [ ] Run `npm run typecheck` — zero errors

### Manual steps for Carlos (print these as comments at end of updater.ts)

```
// ── RELEASE CHECKLIST (run before every release) ─────────────────────────
// 1. Bump version in package.json
// 2. Run: npm run build:win
// 3. Check dist-electron/ contains: latest.yml + npd-planner-X.Y.Z-setup.exe
// 4. Go to GitHub → Releases → Create new release → tag vX.Y.Z
// 5. Upload BOTH files: latest.yml AND the .exe installer
// 6. Set release as "Latest release" (not draft, not pre-release)
// 7. Publish — installed apps will detect update within 10 seconds of next launch
// ─────────────────────────────────────────────────────────────────────────
```

---

## Verification

- [ ] `npm run typecheck` — zero errors
- [ ] Dashboard no longer shows "NPD RECIPES" section
- [ ] Flight Status table shows "Boxes" column with values or "—"
- [ ] In dev mode: updater logs "Skipping — running in development mode" and exits cleanly
- [ ] Update banner in renderer is visible (can test by temporarily forcing `updateReady = true`)

---

## Commit message

```
fix: boxes in flight status, remove NPD recipes from dashboard, fix auto-updater

- FlightStatusPanel: add Boxes column per AWB row
- DashboardPage: remove NPD Recipes section
- updater.ts: skip in dev, add logger, add release checklist comment
- electron-builder.yml: add releaseType: release to publish config
- App.tsx: ensure update-ready banner is visible with restart button
- preload: ensure restartToUpdate IPC is exposed
```
