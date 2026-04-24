# FIX: Splash se cierra antes de que termine la animación

## Problema

El splash muestra la flor correctamente pero se cierra ANTES de que aparezca el texto "NPD Planner" / "AN NPD APP". La animación Lottie dura 5 segundos (150 frames a 30fps), el texto aparece en frame 88 (2.9s), pero el `splashMinTime` de 3 segundos no es suficiente porque la main window carga rápido en dev y el splash se cierra apenas pasan los 3s — justo cuando el texto apenas empieza a aparecer.

## Solución

Cambiar la estrategia: en vez de usar un timer arbitrario, **esperar a que la animación Lottie termine** (evento `complete`) y LUEGO cerrar el splash. Esto se logra con un IPC message desde el splash HTML hacia el main process.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## AGENT PROMPT — Claude Code (Terminal)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### Prompt: Fix Splash — Wait for Lottie animation to complete before closing

**Read these files first:**
- [ ] `src/main/splash.ts`
- [ ] `resources/splash.html`
- [ ] `src/main/index.ts`

**Problem:** The splash screen closes too early — before the Lottie animation finishes. The animation is 5 seconds (150 frames at 30fps). The text "NPD Planner" / "AN NPD APP" appears at frame 88 (2.9s) and needs time to fade in fully. The current `splashMinTime = 3000` is not enough.

**Solution:** Use `splashMinTime = 5500` (5.5 seconds — full 5s animation + 0.5s to hold on the final frame so the user can read the text). The splash should NOT close before this time, even if the main window is ready earlier. After the minimum time, wait for main window ready-to-show, THEN close splash.

**Tasks — in order:**

1. **Modify `src/main/index.ts`:**
   
   Change `splashMinTime` from `3000` to `5500`:
   
   ```typescript
   splashMinTime = Date.now() + 5500  // Full animation (5s) + 0.5s hold on final frame
   ```
   
   That's it. The rest of the logic (wait for remaining time, then close splash, then show main window) stays the same.

2. **Test:**
   ```bash
   npm run dev
   ```
   Expected behavior:
   - White splash appears with the flower drawing animation
   - At ~3 seconds, the illustration transitions to "NPD Planner" / "AN NPD APP" text
   - Text stays visible for ~2 seconds so the user can read it
   - Splash fades out, main window appears
   - Total splash time: ~5.5 seconds minimum

3. **If the Lottie text ("NPD Planner" / "AN NPD APP") still doesn't appear:**
   
   The issue might be that lottie-web can't find the Montserrat font. Check the browser console in the splash window for errors. To debug:
   
   ```typescript
   // Temporarily in splash.ts, add this to createSplashWindow():
   splashWindow.webContents.openDevTools({ mode: 'detach' })
   ```
   
   If fonts are the issue, the `<link>` to Google Fonts in splash.html might be blocked because the app is offline or the request fails silently. In that case, you need to **bundle the Montserrat font locally**:
   
   a. Download the font files:
      - `Montserrat-SemiBoldItalic.woff2`
      - `Montserrat-ThinItalic.woff2`
   b. Save them in `resources/fonts/`
   c. Update `splash.html` to use local `@font-face` instead of Google Fonts `<link>`:
   
   ```html
   <style>
     @font-face {
       font-family: 'Montserrat';
       font-style: italic;
       font-weight: 600;
       src: url('./fonts/Montserrat-SemiBoldItalic.woff2') format('woff2');
     }
     @font-face {
       font-family: 'Montserrat';
       font-style: italic;
       font-weight: 100;
       src: url('./fonts/Montserrat-ThinItalic.woff2') format('woff2');
     }
     /* ... rest of styles ... */
   </style>
   ```
   
   This is the safer approach since it works offline and in production builds.

**Commit message:**
```
fix: splash screen minimum time 5.5s to show full Lottie animation with text
```