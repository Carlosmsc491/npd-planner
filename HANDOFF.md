# HANDOFF — Sesión Mac → Laptop Windows (12 jun 2026)

> **Para el agente nuevo:** lee este archivo COMPLETO antes de tocar código.
> Luego lee `CLAUDE.md` (reglas del proyecto). Si trabajas en la plataforma
> teams, lee también `TEAMS_PLATFORM.md` (existe en la branch `feature/teams`).
> Responde a Carlos SIEMPRE en español. UI strings siempre en inglés.

---

## 1. Contexto de quién y cómo

- **Usuario:** Carlos Salazar (NPD MIAMI, Elite Flower). Repo: `Carlosmsc491/npd-planner`.
- **Workflow que Carlos exige:** auditar → explicar el plan → esperar su ✅ antes de tocar código… EXCEPTO cuando él dice explícitamente "arranca con todo" (como en esta sesión): ahí trabajas autónomo, tomas decisiones tú, y solo le avisas si algo es un gran cambio o afecta funcionamiento.
- **Disciplina obligatoria:** typecheck (`npm run typecheck`) + tests (`npm run test`) después de CADA implementación. Commit por feature con mensaje descriptivo. Nada de `any` en TS. Cuota free-tier de Firebase: listeners siempre scoped.
- **Dos líneas de trabajo:**
  - `main` (carpeta principal) = PRODUCCIÓN. Fixes y features de esta lista.
  - `feature/teams` (worktree separada) = plataforma multi-equipos, Firebase DEV (`npd-project-teams`), NO producción. Fases 1–3 COMPLETAS (founder/owners, teams, sample requests, notificaciones). Todo documentado en `TEAMS_PLATFORM.md` de esa branch.

## 2. Setup en la laptop Windows (primero)

```
git clone https://github.com/Carlosmsc491/npd-planner.git   (o git pull si ya existe)
cd npd-planner && npm install
```
- Copiar el `.env` de producción (Carlos lo trae en un zip — NO está en git).
- Para teams (opcional, solo si se va a trabajar esa branch):
  `git worktree add ..\npd-planner-teams feature/teams` + `npm install` ahí + su `.env` (el del zip, archivo `.env.teams` → renombrar a `.env`).
- Verificar que todo corre: `npm run typecheck && npm run test` (deben pasar 23 tests en main).

## 3. LO COMPLETADO HOY EN MAIN (commits pusheados)

| Commit | Qué |
|---|---|
| `b8f2723` | **Task report PDF rediseñado**: selector de propiedades (checkbox por cada una: client, division, bucket, assignees, fechas, typed dates, labels, POs, AWBs, description, notes, subtasks, follow-ups, custom fields, comments, activity log — las vacías deshabilitadas), picker VISUAL de attachments (thumbnails para fotos, tiles por tipo para el resto, select-all por grupo), y el PDF ordena attachments por tipo con página separadora por sección: Photos → Emails → PDF → Word → Excel → Other. Se mantuvo el modo embedded vs ZIP. Archivos: `TaskReportModal.tsx`, `taskReportGenerator.ts`, `taskReportSaver.ts`, `reportHandlers.ts` (main), `env.d.ts`, `preload/index.ts`. El reporte ahora incluye Division, taskDates, followUps y customFields que antes NO salían. |
| `8a7cf69` | **Clients/Divisions en Settings**: ClientManager ahora tiene "Add Client" (antes solo se podían crear desde un task — la queja de Carlos). DivisionManager tenía 2 bugs reales: `subscribeToAllDivisions` filtraba `active==true` (las inactivas desaparecían del panel, el toggle "Show inactive" nunca funcionó) y el efecto se re-suscribía con cada snapshot de clients. Arreglados. Se agregó delete de division (bloqueado con mensaje claro si hay tasks que la usan: `getDivisionTaskCount`). |
| `6739b38` | **Welcome wizard**: tip de OneDrive en el paso de SharePoint — click derecho a la carpeta → "Always keep on this device". |

## 4. TAREA A MEDIO INVESTIGAR (sin código tocado) — botones de recetas congelados

**Síntoma (Carlos):** en NPD Projects, los botones reassign/assign, reclaim/claim, reopen/open se quedan congelados.

**Hallazgos de la investigación (continúa desde aquí):**
- `RecipeDetailPanel.tsx` (`src/renderer/src/components/recipes/`): los botones usan `runAction(state, fn)` con `finally { setActionState('idle') }` — el estado busy SÍ se resetea… cuando la promesa termina. **El congelamiento = promesas que nunca resuelven.**
- `src/renderer/src/lib/recipeFirestore.ts`:
  - `claimRecipeFile` (L243) y `forceClaimRecipeFile` (L290): hacen `getDocCacheFirst()` primero. Si hay cache-miss, cae a `getDoc()` del servidor → **se cuelga indefinidamente sin red**. El updateDoc de estas dos es fire-and-forget (no bloquea).
  - `unclaimRecipeFile` (L310), `markRecipeDone` (L341), `reopenRecipeFile` (L371), `forceUnlockRecipeFile` (L399): usan `runTransaction` → **requieren servidor; con red mala se cuelgan o reintentan largo**.
  - `assignRecipeFile` (L641): `await updateDoc` → **offline nunca resuelve** (espera ack del server).
- **Fix recomendado (patrón ya existente en el repo):** commit `37cfd85` resolvió EXACTAMENTE esto para el save de permisos con un timeout de 15s vía `Promise.race`. Crear helper `withTimeout(promise, ms, mensaje)` en recipeFirestore (o utils) y envolver: el getDoc de claim/forceClaim, las 4 transacciones, y el updateDoc de assign. Al expirar → throw con mensaje legible ("No connection — try again") → `runAction` lo captura → botón se libera y muestra error.
- Probar: con DevTools → Network offline, click en Claim/Assign/Reopen → el botón debe liberarse en ~15s con error visible, nunca congelado.

## 5. BACKLOG RESTANTE (pedidos textuales de Carlos, en orden)

### 5a. Auditoría completa de Settings + permisos (tarea grande)
- Revisar CADA tab de Settings: entender qué hace, confirmar que sirve, arreglar lo raro sin preguntar si está claro.
- **Verificar que los permisos se aplican de verdad:** hay permisos default (DefaultPermissionsPanel) y por usuario (AccessPermissionsModal). Probar: si a un usuario le das permiso de ver UN solo apartado de Settings, ¿lo ve y nada más? ¿Se actualizan en vivo?
- **Quitar view/edit en áreas de settings:** Carlos dice que no tiene sentido — "si le doy acceso a ese setting es para que lo use". Para las áreas `settings_*` el control debe ser binario (acceso sí/no). Internamente mapear a 'edit'.
- **Fix crítico de performance:** Members tarda ~3 MINUTOS en cargar. Sospechas a investigar: `subscribeToUsers` + algo que bloquea (¿`getClientTaskCount`-style N+1?, ¿AreaPermissionsEditor cargando algo pesado?, ¿pendingApprovals?). Medir primero.
- **Áreas dinámicas:** cuando se agregue un board o tab de settings nuevo, debe aparecer SOLO en el editor de Access (derivar la lista de boards reales + registry de tabs, no listas hardcodeadas). Constantes actuales: `DEFAULT_PERM_AREAS`, `ALL_TABS` en SettingsPage/DefaultPermissionsPanel.

### 5b. Módulo Directory (nuevo)
- Entrada en el sidebar (ubicación a criterio del agente, donde haga sentido — p.ej. arriba de Boards o cerca de Master Calendar).
- Base de datos de contactos: nombre y apellido, correo, teléfono, location, y un campo tipo "Contact for" (clientes/warehouses/locations que maneja — multi-select). Ejemplo de Carlos: "Jhon Salazar, jsalazar@eliteflower.com, 123-456-7744, publix, texas warehouse, bloomstar".
- **Columnas custom agregables** por el usuario: tipos text, droplist, multi-select (mínimo).
- **Filtros + search bar.**
- Colección Firestore nueva (p.ej. `directoryContacts` + doc de settings para columnas custom) + reglas (read: usuarios activos; write: ¿activos o admin? — decisión: write para activos, columnas custom solo admin) + actualizar `firestore.rules` y desplegar a producción (`firebase deploy --only firestore:rules` — ¡CUIDADO! en la carpeta main el default es el proyecto de PRODUCCIÓN, verificar `.firebaserc`).

### 5c. Web app móvil (PWA) — Carlos ya aprobó ejecutarla
- Web app ligera, MISMO backend Firebase de producción (es seguro: las API keys web de Firebase son públicas, las reglas protegen).
- Solo: login, boards (view/edit), crear tasks. Nada más.
- Deploy gratis en GitHub Pages (carpeta `web/` en el repo o repo aparte + GitHub Actions), PWA con manifest para "Add to Home Screen" desde Safari (sin Apple Developer).
- **Requiere que Carlos agregue el dominio de Pages a Firebase Auth → Authorized domains** (avisarle cuando esté listo).

### 5d. Modal de bienvenida "What you missed"
- Al abrir el app: saludo + lo que se perdió desde su última sesión (usar `lastSeen` del usuario).
- Secciones: notificaciones no vistas (agradables a la vista), próximos 7 días de tasks/eventos ordenados por due date, urgentes (priority high), y llegadas de vuelos (datos AWB — ver `useAwbLookup`/flight status del Dashboard).
- Visualmente cuidado. Mostrar una vez por sesión.

### 5e. Al terminar TODO
- Suite de tests completa + `npm run build` (typecheck + bundle).
- Commit + push.
- **Merge `main` → `feature/teams`** para que la plataforma teams reciba todos estos cambios (resolver conflictos si los hay; el `.firebaserc` y `TEAMS_MODULE_ENABLED` de esa branch NO deben cambiar).
- Actualizar el checklist de `CLAUDE.md` con lo nuevo.

## 6. Decisiones ya tomadas (no re-litigar)

- Reporte PDF: orden de secciones de attachments = Photos → Emails → PDF → Word → Excel → Other, con página divisoria por tipo.
- Divisions: delete bloqueado si hay tasks que la referencian (desactivar es el camino suave).
- Settings areas → acceso binario (pendiente de implementar, decidido).
- Web app: GitHub Pages + mismo Firebase prod. Directory: colección nueva con columnas custom en un doc de settings.
- Correos automáticos de teams = Fase 4 con plan Blaze, al final de todo.

## 7. Estado de verificación al cierre

- `main`: typecheck limpio, 23/23 tests, 3 commits nuevos pusheados.
- `feature/teams`: typecheck limpio, 47/47 tests, 13 commits pusheados, reglas+índices desplegados al Firebase dev.
- Working tree de main: limpio (hay 4 archivos untracked previos de Carlos: `.venv/`, `check_boards.js`, 2 imágenes en "fix and implementations" — NO tocarlos ni commitearlos).
