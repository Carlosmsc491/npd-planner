# Background Removal — Integration Status

Branch: `feature/bg-removal` · Mac-only (Apple Silicon) · main untouched.

This is the source of truth for what's done and what's left on the
NPD-Planner ↔ background-removal integration. Update it as work lands.

---

## 1. What the module is

A sidebar item **Background Removal** (NPD Recipes section) that runs the local
bouquet cut-out engine: pick photos → AI cut-out → transparent PNG 3600 @300dpi →
optional Photoshop RETOUCH. The heavy engine (Python + torch + models, ~2 GB) is
**not** shipped in the app — the module downloads a prebuilt package once.

Pipeline (unchanged Python): `tools/bg-removal/train/batch_run.py` →
`infer.py` + `birefnet_model.py` + root `pipeline.py`, writes `_status.json`
that the app renders live.

---

## 2. DONE (committed on this branch)

### App integration (thin GUI)
- `src/shared/bgRemoval.ts` — shared types incl. install types (`BgInstallState`,
  `BgInstallProgress`), `BG_RUNTIME_VERSION`, asset/repo constants.
- `src/main/ipc/bgRemovalHandlers.ts` — IPC: `default-tool-dir`, `select-files`,
  `check-setup`, `run` (spawns batch_run, polls `_status.json` @700ms, retouch
  phase), `cancel`, `open-output`, `read-thumb`, **install** (`install-state`,
  `install`, `install-cancel`, `install-progress` push). Mac+arm64 guarded.
- `src/main/index.ts` — `registerBgRemovalHandlers()`.
- `src/preload/index.ts` — exposes the API **and** `electronAPI.platform`
  (the renderer had no `window.process`; that's why the item was invisible).
- `src/renderer/src/env.d.ts` — types for the above.
- `src/renderer/src/App.tsx` — lazy route `/background-removal`, own
  `ProtectedRoute areaId="background_removal"`, Mac-only element guard.
- `src/renderer/src/components/ui/AppLayout.tsx` — sidebar item, Scissors icon,
  gated by `platform==='darwin'` + `getAreaPermission('background_removal')`.
- `src/renderer/src/pages/BackgroundRemovalPage.tsx` — install gate (Download
  button + live progress) → idle (drop/select) → processing (real bar/ETA +
  previews) → done. **All English.**

### Permissions — `background_removal` area
- Default-on for **owner/admin** (privileged) and **photographer**
  (`PHOTOGRAPHER_DEFAULTS` in `hooks/useAreaPermission.ts`); members: `none`
  unless granted.
- Rows added to all three editors: `SettingsPage.tsx` (CORE_PERM_AREAS),
  `AccessPermissionsModal.tsx` (MODULE_AREAS), `AreaPermissionsEditor.tsx`.
- `ProtectedRoute.tsx` — `/background-removal` added to `PHOTOGRAPHER_ALLOWED`.

### Engine package tooling
- `tools/bg-removal/requirements-runtime.txt` — exact inference deps, pinned to
  the validated dev `.venv` versions.
- `tools/bg-removal/package/build-runtime.sh` — builds
  `bg-removal-runtime-mac-arm64.tar.gz` (+ `.sha256`): relocatable Python
  (python-build-standalone), offline wheels, `train/` + root `pipeline.py`/
  `remove_bg.py` + checkpoint + config, pre-downloaded models (HF + rembg).

Typecheck (`typecheck:node` + `typecheck:web`) green.

---

## 3. How install works (download path)

1. First visit → `install-state` reports not installed → page shows
   **"Download engine (~2 GB)"**.
2. `install` IPC: download asset from the GitHub Release
   (`Carlosmsc491/npd-planner`, tag `bg-runtime-v1`) → verify `.sha256` →
   extract to `userData/bg-removal-runtime/` → create `.venv` from bundled
   `python/` → `pip install --no-index --find-links wheels` (offline) → delete
   `wheels/` → write `.ready.json`. Live progress streamed to the modal.
3. Runtime models live in `<runtime>/models`; `run` sets `HF_HOME` /
   `U2NET_HOME` so the first cut-out needs no network.
4. **Dev fallback:** if not installed, `defaultToolDir()` uses the repo
   `tools/bg-removal` (with its `.venv` + checkpoint), so the module works on
   this dev machine without downloading anything.

---

## 4. TODO / PENDING

- [ ] **Build the package:** `bash tools/bg-removal/package/build-runtime.sh`
      (~15–20 min, ~2 GB out). Produces `package/dist/…tar.gz` + `.sha256`.
- [ ] **Create the release + upload** (Carlos, billed/outward-facing):
      ```
      gh release create bg-runtime-v1 \
        tools/bg-removal/package/dist/bg-removal-runtime-mac-arm64.tar.gz \
        tools/bg-removal/package/dist/bg-removal-runtime-mac-arm64.tar.gz.sha256 \
        --repo Carlosmsc491/npd-planner \
        --title "BG Removal engine v1" --notes "Runtime for Background Removal"
      ```
- [ ] **End-to-end test on a clean Mac** (no dev repo): open module → Download →
      install → cut-out → retouch.
- [ ] Intel (x86_64) package — deferred; arm64 only for now.
- [ ] Optional: code-signing implications for the spawned Python (Gatekeeper may
      quarantine downloaded binaries — test; may need `xattr -dr com.apple.quarantine`
      on the extracted runtime during install).
- [ ] Bump `BG_RUNTIME_VERSION` + rebuild/upload when the engine changes.

---

## 5. Next feature — Photo Manager integration (DESIGN LOCKED, not built)

Goal: in NPD Projects → Photo Manager, selecting a candidate auto-runs the
cut-out so the cleaned PNG lands in CLEANED; promote to READY via the RETOUCH
action, with an optional Photoshop round-trip edit.

### Flow (approved 2026-06-18)
```
CAPTURE → CAMERA
SELECT (star) → mirrors to SELECTED  +  enqueues an auto cut-out  ← AUTOMATIC (toggle per project, default ON)
AUTO-CLEAN → engine cuts the single photo → PNG to CLEANED (needs_retouch)
REVIEW (CLEANED):
  • default: Auto-retouch (RETOUCH action) → promotes to READY (PNG+JPG)
  • option: Edit in Photoshop → "save & return" → then Send to READY
READY → PNG + JPG + Excel insert (existing)
```

### Decisions (Carlos)
1. Auto-clean = **automatic on select** (per-project toggle, default ON).
2. Promote to READY = **auto-retouch (RETOUCH action) default**; manual Photoshop optional.
3. Photoshop round-trip = **scripted "save & return"** (ExtendScript saveAs, no
   dialog) + fs-watch fallback for manual Cmd+S.

### Key design points
- **One engine, two entry points:** reuse the installed runtime (section 3); the
  Photo Manager shows the same Download gate if the engine isn't installed. On the
  dev machine the dev fallback makes it usable without the package.
- **Single-image engine call:** add a `--single <img> --out <png>` fast path
  (or reuse batch_run with a 1-file input dir) so each selected photo is cut
  independently and lands at the exact CLEANED path.
- **Queue with concurrency 1–2** on M-series; per-photo status chip
  (Selected → Cleaning → Cleaned → Editing → Ready).
- **Save-back:** `photoshop:open-and-edit(path)` opens in PS; "save & return"
  runs ExtendScript `saveAs(PNG, same path)` + close; app regenerates thumbnail
  + (for READY) the JPG, and resets the Excel-inserted flag.
- **Re-editing READY** invalidates JPG + excelInserted → auto-regenerate/flag.
- **Bulk actions:** Clean all selected · Retouch all cleaned · Send all done to READY.

### Files to touch (implementation plan)
- `train/batch_run.py` — accept a single-image fast path (or app stages 1-file dir).
- `src/main/ipc/bgRemovalHandlers.ts` — `bgremoval:clean-one(projectRoot, recipe, filename)`
  → cut-out to CLEANED path; queue; progress events keyed by filename.
- New `src/main/ipc/photoshopHandlers.ts` — `photoshop:open-and-edit`,
  `photoshop:save-return` (ExtendScript), fs.watch on the open file.
- `src/renderer/src/lib/photoManifestApi.ts` — already has appendCleanedEntry /
  markCleanedDone / setReady; add edited provenance + JPG regen trigger.
- `PhotoManagerView.tsx` — auto-clean on `toggleCameraSelected`, per-photo status
  chips, "Edit in Photoshop" / "save & return", bulk actions, shared install gate.
- Project setting `autoCleanOnSelect` (default true).
