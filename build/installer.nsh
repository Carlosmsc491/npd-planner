; build/installer.nsh — custom NSIS hooks (auto-included by electron-builder)
;
; Updating from versions ≤1.7.x can leave windowless zombie NPD Planner
; processes (and orphaned Traze Chromium children) that don't respond to the
; installer's graceful close request, so users hit:
;   "NPD Planner cannot be closed. Please close it manually and click Retry."
; Force-kill the app process tree up front so the install never blocks.
; /T also takes down child processes (the bundled Traze Chromium runs as a
; child of npd-planner.exe and otherwise keeps install files locked).

!macro customInit
  nsExec::Exec 'taskkill /F /T /IM "npd-planner.exe"'
  Sleep 800
!macroend

!macro customUnInit
  nsExec::Exec 'taskkill /F /T /IM "npd-planner.exe"'
  Sleep 800
!macroend
