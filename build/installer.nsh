; build/installer.nsh — custom NSIS hooks (auto-included by electron-builder)
;
; Updating could leave the running app — plus its Electron helper processes
; (main/GPU/renderer are all "npd-planner.exe") and the orphaned Traze Chromium
; child — holding file locks, so users hit:
;   "NPD Planner cannot be closed. Please close it manually and click Retry."
;   "Failed to uninstall old application files. Please try ... again.: 2"
;
; electron-builder's default guard (_CHECK_APP_RUNNING) kills only
; "npd-planner.exe" *without* /T, so it leaves the bundled Chromium child alive,
; then — if any process lingers — falls back to a blocking "cannot be closed /
; Retry" MessageBox (the 1.9.0 bug). We replace that guard with an
; unconditional force-kill of the whole process tree, and run the same kill on
; install/uninstall init so the previous version's uninstaller finds nothing
; running when it executes during an update.
;
; /T takes down child processes too — the bundled Traze Chromium runs as a
; child of npd-planner.exe and otherwise keeps install files locked.
; (The installer's own image is "npd-planner-<ver>-setup.exe", not
; "npd-planner.exe", so /IM never targets the running installer.)

!macro killNpdPlanner
  nsExec::Exec 'taskkill /F /T /IM "npd-planner.exe"'
  ; Give Windows time to release file locks before touching the install dir.
  Sleep 1500
!macroend

!macro customInit
  !insertmacro killNpdPlanner
!macroend

!macro customUnInit
  !insertmacro killNpdPlanner
!macroend

; Replaces electron-builder's default _CHECK_APP_RUNNING. The default shows a
; blocking "cannot be closed / Retry" dialog when any npd-planner.exe lingers;
; we force-kill the whole tree instead so updates never stall on a running
; instance.
!macro customCheckAppRunning
  !insertmacro killNpdPlanner
!macroend
