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

## 5. Next feature — Photo Manager integration (PLANNED, not started)

Goal: in NPD Projects → Photo Manager, selecting a candidate auto-runs the
cut-out so the cleaned PNG lands in CLEANED; round-trip editing via Photoshop
to promote to READY. Full flow design lives in this section once approved.
(See chat plan dated 2026-06-18.)
