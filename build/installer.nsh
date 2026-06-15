; build/installer.nsh — custom NSIS hooks (auto-included by electron-builder)
;
; Goal: silent auto-updates must never stall on the running app, and must never
; kill the updater itself.
;
; electron-updater launches the new setup.exe as a CHILD of the running
; npd-planner.exe (which is still alive for a moment while it quits). So we must
; NOT use `taskkill /T` here: /T kills the whole process tree of npd-planner.exe,
; and since setup.exe is a child of it, /T terminates the updater mid-install —
; the previous version gets uninstalled but the new one never installs.
;
; Instead force-kill by image name only. That stops the app plus its Electron
; helper processes (main/GPU/renderer are all "npd-planner.exe") and releases
; their file locks, WITHOUT touching setup.exe (a different image name) or its
; descendants. Because customInit runs before the previous version's uninstaller
; is invoked, the app is already gone by then, so even an older uninstaller that
; still uses /T finds nothing to kill and leaves the updater alone.
;
; (The bundled Traze Chromium is closed by the app's before-quit handler, so it
; isn't holding install files by the time the updater runs.)

!macro killNpdPlanner
  nsExec::Exec 'taskkill /F /IM "npd-planner.exe"'
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
; we force-kill (no tree, no dialog) so updates never stall on a running instance.
!macro customCheckAppRunning
  !insertmacro killNpdPlanner
!macroend
