# Revisión Profunda — Recipe Manager
# Resultado del análisis de los Prompts 1-5 completados
# Fecha: 2026-03-22

---

## HALLAZGOS CRÍTICOS

---

ROL: Analista de Producto + Programador Senior
CATEGORÍA: Crítico
TÍTULO: R10 y R7 ignoran los overrides por receta — siempre usan el default del proyecto

PROBLEMA: En `recipeValidation.ts`, la regla R10 compara `currentCustomer` contra
`projectConfig.customerDefault`, y R7 usa `projectConfig.wetPackDefault`. Ambas ignoran
`recipe.customerOverride` y `recipe.wetPackOverride` que se guardan en Firestore y que el
wizard de Step 3 permite configurar por receta. Si una receta tiene
`customerOverride = "OPEN DESIGN"` y el proyecto tiene `customerDefault = "WALMART"`,
la validación la "corregirá" de vuelta a WALMART.
IMPACTO: Todo el sistema de overrides por receta (implementado en el wizard) es inútil —
la validación lo destruye al marcar done. El diseñador marca done, el sistema "corrige"
el customer al default, y el Excel queda incorrecto.
SOLUCIÓN PROPUESTA: `validateRecipeFile` necesita recibir el objeto `RecipeFile` completo
como parámetro adicional. R10 debe comparar contra `file.customerOverride ?? projectConfig.customerDefault`.
R7 debe comparar contra `file.wetPackOverride`. Afecta `recipeValidation.ts` y el
llamador en `RecipeDetailPanel.tsx`.
ESFUERZO: Bajo
DEPENDENCIAS: Ninguna — fix inmediato

---

ROL: Analista de Producto
CATEGORÍA: Crítico
TÍTULO: No existe fecha de entrega (deadline) en el proyecto

PROBLEMA: `RecipeProject.config` no tiene ningún campo `dueDate` o `targetDate`.
`RecipeProjectPage` muestra total/done/in_progress/pending, pero no hay countdown,
no hay indicador de riesgo, no hay "les quedan 2 días y tienen 60 recetas pendientes".
IMPACTO: El escenario real tiene deadlines duros (el viernes). El supervisor no puede ver
en la pantalla si el equipo va bien o está en peligro. Solo puede contar manualmente.
SOLUCIÓN PROPUESTA: Agregar `dueDate: Timestamp | null` a `RecipeProject.config` en
`types/index.ts`. En `RecipeProjectPage` agregar un componente `DeadlineCountdown` que
muestre días/horas restantes con color (verde → amarillo → rojo según cercanía). En el
wizard Step 1 agregar un date picker. Calcular velocidad proyectada:
`(recetasPendientes / recetasHechas) * tiempoTranscurrido` → "a este ritmo terminas el jueves".
ESFUERZO: Medio
DEPENDENCIAS: Ninguna

---

ROL: Analista de Producto + Diseñador UX
CATEGORÍA: Crítico
TÍTULO: No hay asignación de recetas — es solo "quien llega primero"

PROBLEMA: No existe ningún campo `assignedTo: string | null` en `RecipeFile`. Las 4
personas ven la misma lista y cada una toma lo que quiere. El supervisor no puede
distribuir carga: "Carlos hace WALMART ROSES, Laura hace WALMART TULIPS".
IMPACTO: Sin distribución explícita, hay riesgo de que todos tomen las recetas fáciles
y dejen las difíciles. El supervisor no puede balancear la carga. Si hay 100 recetas y
alguien falta un día, el supervisor no sabe cuáles eran "de esa persona".
SOLUCIÓN PROPUESTA: Agregar `assignedTo: string | null` y `assignedToName: string | null`
a `RecipeFile`. En `RecipeProjectPage` agregar un dropdown de asignación por receta
(visible para admins/supervisores). En `RecipeRowItem` mostrar el avatar del asignado.
No bloquear claim si no hay asignación (mantener flexibilidad), pero sí mostrar
advertencia visual si alguien toma una receta asignada a otro.
ESFUERZO: Medio
DEPENDENCIAS: Ninguna

---

ROL: Programador Senior
CATEGORÍA: Crítico
TÍTULO: `useRecipeFiles` re-escanea el filesystem en cada snapshot Firestore

PROBLEMA: En `useRecipeFiles.ts`, la función `subscribeToRecipeFiles` tiene un callback
que llama a `window.electronAPI.recipeScanProject(rootPath)` cada vez que cambia
CUALQUIER archivo en Firestore. Con 4 usuarios activos marcando done, creando locks,
actualizando heartbeats — cada cambio en Firestore dispara un escaneo completo del disco.
IMPACTO: Con 100 archivos y 4 usuarios activos, puede haber un escaneo de disco por IPC
cada 15 segundos (frecuencia de heartbeats). En proyectos en SharePoint (red), un escaneo
puede tomar 1-2 segundos. La UI puede laggearse mientras tanto.
SOLUCIÓN PROPUESTA: Separar la lógica: el `onSnapshot` de Firestore actualiza solo los
datos Firestore. El escaneo de disco se hace solo en el mount inicial y cuando el usuario
hace clic en "Refresh" (ya existe ese botón). Usar `scanKey` (ya existe) como único
trigger del escaneo, no el snapshot. Firestore y filesystem se mergean en `useMemo`.
ESFUERZO: Bajo
DEPENDENCIAS: Ninguna

---

ROL: Programador Senior
CATEGORÍA: Crítico
TÍTULO: Settings de validación son por usuario, no por proyecto — el equipo puede validar diferente

PROBLEMA: `RecipeSettings` (incluye `ruleCells`, `holidayMap`, `sleeveByPrice`,
`sleeveByStems`) está guardado en `recipeSettings/{userId}` — una colección global por
usuario. Si Carlos tiene `sleeveByPrice["$12.99"] = 2.99` y Laura no lo tiene configurado,
el mismo archivo generará resultados de validación diferentes según quién haga Mark Done.
IMPACTO: Inconsistencia de datos entre compañeros. Una receta puede pasar la validación
de Carlos y fallar la de Laura. El supervisor no puede garantizar consistencia.
SOLUCIÓN PROPUESTA: Las `RecipeSettings` deben ser por proyecto, no por usuario. Mover
`ruleCells`, `holidayMap`, `sleeveByPrice`, `sleeveByStems` al documento
`recipeProjects/{projectId}` (o a una subcolección `recipeProjects/{projectId}/settings/main`).
Solo `lockTimeoutSeconds` y preferencias de UI pueden quedar por usuario. El supervisor
configura las reglas del proyecto una vez, todos validan igual.
ESFUERZO: Medio
DEPENDENCIAS: Requiere migración del modelo de datos

---

## HALLAZGOS IMPORTANTES

---

ROL: Diseñador UX + Analista de Producto
CATEGORÍA: Importante
TÍTULO: Sin filtros ni búsqueda dentro del proyecto — 100 recetas en lista plana

PROBLEMA: `RecipeProjectPage` no tiene ningún input de búsqueda ni filtros de estado
(pending / in_progress / done) dentro del proyecto. `RecipeFolderSection` renderiza todas
las recetas de una carpeta sin filtrar. Con 100 recetas en 5-6 carpetas, encontrar una
receta específica requiere scroll manual.
IMPACTO: Pérdida de tiempo. Si un diseñador quiere ver "qué recetas pending me quedan
en WALMART ROSES", tiene que revisar visualmente fila por fila.
SOLUCIÓN PROPUESTA: Agregar a `RecipeProjectPage` una barra de búsqueda + toggles de
filtro (All / Pending / In Progress / Done / Mine). Filtrar `files` antes de pasarlos
a `RecipeFolderSection`. La búsqueda debe ser por `displayName` fuzzy. "Mine" filtra
las que `lockedBy === currentUserName || doneBy === currentUserName`.
ESFUERZO: Bajo
DEPENDENCIAS: Ninguna

---

ROL: Analista de Producto + Diseñador UX
CATEGORÍA: Importante
TÍTULO: Sin duplicación de proyectos — Valentine's 2025 no se puede clonar a 2026

PROBLEMA: `RecipeHomePage` solo tiene el botón "New Project" que abre el wizard desde
cero. No hay opción "Duplicate project". Los proyectos se repiten cada año (Valentine's
Day, Mother's Day, etc.) con las mismas recetas y reglas.
IMPACTO: Cada año el equipo debe recrear manualmente el mismo proyecto: mismo wizard,
mismas reglas, mismas carpetas, mismas recetas. Con 100 recetas, eso es 100 entradas
manuales en Step 3.
SOLUCIÓN PROPUESTA: Agregar un menú "…" en cada fila de `ProjectRow` con opción
"Duplicate". Al duplicar: copiar la config del proyecto (reglas, distribución, customer,
holiday), copiar la estructura de carpetas y recetas reseteando todos los estados a
`pending` y borrando locks/done. No copiar archivos físicos — solo los metadatos Firestore.
La nueva carpeta física debe crearse vacía (el usuario la llena con templates).
ESFUERZO: Medio
DEPENDENCIAS: Ninguna

---

ROL: Analista de Producto
CATEGORÍA: Importante
TÍTULO: Modo "Import from Excel" del wizard no está implementado

PROBLEMA: En `WizardStepBasics`, existe `sourceMode: 'from_scratch' | 'import'`. En
`NewRecipeProjectWizard`, el Step 3 siempre muestra `WizardStepStructure` (entrada manual),
independientemente del `sourceMode`. El modo "import" nunca se implementó. El equipo de
ventas entrega el listado de bouquets en un Excel — actualmente hay que transcribir cada
uno a mano.
IMPACTO: Con 100 recetas, la entrada manual en el wizard puede tomar 2-3 horas. Es el
cuello de botella #1 antes de empezar a trabajar. Un import desde Excel lo reduciría
a 5 minutos.
SOLUCIÓN PROPUESTA: Cuando `sourceMode === 'import'`, en Step 3 mostrar un modo
alternativo: (1) seleccionar el Excel del equipo de ventas, (2) seleccionar la columna
con nombres de bouquets, (3) auto-parsear precio/opción/nombre con
`parseRecipeNameFromFilename`, (4) agrupar por carpeta según otra columna o prefijo.
Usar exceljs (ya instalado) en el main process via IPC.
ESFUERZO: Alto
DEPENDENCIAS: Nuevo IPC handler `recipe:parseImportExcel`

---

ROL: Programador Senior
CATEGORÍA: Importante
TÍTULO: Lock timeout de 300s puede expirar durante edición activa en Excel

PROBLEMA: El heartbeat actualiza cada 15 segundos, pero solo cuando la app NPD Planner
está en primer plano (React ejecutando). Si el diseñador cierra la laptop, la conexión
se pierde, y en 300s el lock expira. Al volver, otra persona puede haber tomado la receta.
IMPACTO: El diseñador puede perder su trabajo en progreso. Otro usuario toma la receta,
la marca done, y el primero vuelve con su Excel a medio llenar.
SOLUCIÓN PROPUESTA:
  (1) Aumentar el timeout a 900s (15 min).
  (2) Mostrar una advertencia en la app cuando quedan 2 minutos para expirar:
      "Tu lock en $12.99 A VALENTINE expirará en 2 minutos".
  (3) Al reclamar un lock expirado, mostrar un dialog de confirmación:
      "Este archivo fue editado por X hace N minutos — ¿confirmar que empiezas desde cero?"
ESFUERZO: Bajo
DEPENDENCIAS: Ninguna

---

ROL: Diseñador UX
CATEGORÍA: Importante
TÍTULO: El doble-click en `RecipeRowItem` no abre Excel

PROBLEMA: `RecipeRowItem` acepta `onDoubleClick` prop, pero en `RecipeFolderSection`
probablemente no está conectado a `handleOpenInExcelForFile`. El doble-click debería
ser el gesto principal del flujo rápido en una app de Windows.
IMPACTO: El diseñador hace doble-click esperando que abra Excel y no pasa nada.
Tiene que ir al panel derecho y hacer clic en "Open in Excel" — 2 acciones extra.
SOLUCIÓN PROPUESTA: Verificar y conectar `onDoubleClick` de cada fila a
`handleOpenInExcelForFile` en `RecipeFolderSection`. Flujo ideal: doble-click →
(1) seleccionar receta, (2) auto-claim si está pending, (3) abrir Excel.
ESFUERZO: Bajo
DEPENDENCIAS: Ninguna

---

ROL: Analista de Producto
CATEGORÍA: Importante
TÍTULO: `RecipeActivityFeed` no persiste — se pierde al recargar

PROBLEMA: El feed de actividad se genera comparando snapshots consecutivos en memoria
local. Al recargar la página o cerrar y abrir el proyecto, el historial desaparece.
Solo muestra actividad a partir de cuando el usuario abrió la página.
IMPACTO: El supervisor llega por la mañana y quiere ver "qué hicieron ayer" — el feed
está vacío. No hay auditoría de quién hizo qué y cuándo.
SOLUCIÓN PROPUESTA: Crear una subcolección `recipeProjects/{projectId}/activity` donde
se guarden los eventos (claim, done, reopen, expired) al momento de ocurrir, con un
campo `createdAt`. Limitar a los últimos 7 días. `RecipeActivityFeed` se suscribe a
esta subcolección en lugar de derivar de diferencias de estado local.
ESFUERZO: Medio
DEPENDENCIAS: Nuevo handler Firestore + nuevo listener

---

ROL: Programador Senior
CATEGORÍA: Importante
TÍTULO: `rootPath` no se valida al abrir el proyecto — falla silenciosamente

PROBLEMA: En `useRecipeFiles`, si `recipeScanProject` falla (carpeta no encontrada,
SharePoint no montado), el error se captura con `console.error` y `scanned` queda vacío.
El resultado: la lista muestra vacío sin ningún mensaje al usuario.
IMPACTO: El diseñador abre el proyecto, ve la lista vacía, no entiende por qué. Puede
pensar que el proyecto está vacío y crear archivos duplicados.
SOLUCIÓN PROPUESTA: Si `scanned` está vacío y `rootPath` no es string vacío, verificar
si la ruta existe con un IPC `recipe:pathExists`. Si no existe, exponer un estado de
error: `{ files: [], error: 'Project folder not found at <path>' }`. `RecipeProjectPage`
muestra este error con un botón "Update folder path".
ESFUERZO: Bajo
DEPENDENCIAS: IPC handler `recipe:pathExists` (fs.existsSync)

---

## MEJORAS

---

ROL: Diseñador UX
CATEGORÍA: Mejora
TÍTULO: Sin atajos de teclado dentro del proyecto

PROBLEMA: No hay shortcuts para las acciones del flujo. El flujo rápido requiere mouse
en cada paso.
SOLUCIÓN PROPUESTA: En `RecipeProjectPage`, cuando hay un archivo seleccionado:
  O → Open in Excel
  C → Claim
  D → Mark Done (si claimed)
  R → Reopen (si done)
  ↑/↓ → navegar entre recetas
  F → Focus search (cuando se agregue)
ESFUERZO: Bajo
DEPENDENCIAS: Ninguna

---

ROL: Analista de Producto
CATEGORÍA: Mejora
TÍTULO: Sin velocidad proyectada — el supervisor no sabe si van a tiempo

PROBLEMA: Los 4 cards de `RecipeProgressCard` muestran Total / Done / In Progress /
Pending. No hay "velocidad": recetas/hora ni proyección de fin.
SOLUCIÓN PROPUESTA: Calcular `velocity = doneCount / horasTranscurridas`. Proyectar
`horasRestantes = pendingCount / velocity`. Mostrar "A este ritmo: terminas el jueves
a las 3pm" en color verde/amarillo/rojo según el deadline.
ESFUERZO: Bajo (solo cálculo en frontend)
DEPENDENCIAS: Requiere campo `dueDate` del hallazgo Crítico #2

---

ROL: Analista de Producto
CATEGORÍA: Mejora
TÍTULO: Sin notificación desktop cuando alguien termina una receta

PROBLEMA: La app ya tiene el sistema de notificaciones desktop de NPD Planner. Pero
cuando un compañero termina una receta, no hay notificación Electron.
SOLUCIÓN PROPUESTA: En `RecipeActivityFeed`, cuando se detecta una transición → done
y `doneBy !== currentUserName`, emitir una notificación desktop via
`window.electronAPI.showNotification`. Respetar el DND schedule (ya implementado).
ESFUERZO: Bajo
DEPENDENCIAS: Ninguna (API ya existe)

---

ROL: Diseñador UX
CATEGORÍA: Mejora
TÍTULO: El Mark Done flow de 4 fases no tiene barra de progreso de pasos visible

PROBLEMA: El usuario ve un label que cambia en el botón ("Checking file…" → "Validating…")
pero no una barra de 4 pasos. Si el paso 2 tarda (Excel grande), el usuario no sabe
si hay problema o es normal.
SOLUCIÓN PROPUESTA: Mostrar debajo del botón un stepper mientras está en progreso:
  [✓] Check → [•] Validate → [ ] Apply → [ ] Finish
Cada step en gris hasta que empieza, verde cuando termina, con spinner en el actual.
ESFUERZO: Bajo
DEPENDENCIAS: Ninguna

---

ROL: Analista de Producto
CATEGORÍA: Mejora
TÍTULO: Sin integración con Analytics de NPD Planner

PROBLEMA: Las recetas "Done" no aparecen en ningún reporte del módulo de Analytics.
SOLUCIÓN PROPUESTA: Cuando un proyecto llega al 100%, auto-marcar como `completed`.
Agregar al dashboard de Analytics una sección "Recipe Manager": recetas completadas
esta semana, proyectos completados por mes, diseñador con más recetas done.
ESFUERZO: Medio
DEPENDENCIAS: Requiere Analytics dashboard implementado

---

ROL: Diseñador UX
CATEGORÍA: Mejora
TÍTULO: `RecipeDetailPanel` no tiene confirmación antes de Reopen

PROBLEMA: El botón "Reopen" no tiene confirmación. Un click accidentalmente reabre
una receta done, generando trabajo innecesario.
SOLUCIÓN PROPUESTA: Popover de confirmación: "Reopen this recipe? It will go back to
pending." con botones Cancel / Confirm.
ESFUERZO: Bajo
DEPENDENCIAS: Ninguna

---

## GAPS VS ELITEQUOTE ORIGINAL

---

ROL: Analista de Producto
CATEGORÍA: Crítico
TÍTULO: `customerOverride` y `wetPackOverride` por receta no llegan a la validación

PROBLEMA: EliteQuote original tiene un sistema donde cada receta puede tener su propio
customer y wet pack. El wizard lo implementa correctamente. Pero `validation_service.py`
equivalente (R10, R7) ignora estos overrides. Ya detallado arriba como Crítico #1.

---

ROL: Analista de Producto
CATEGORÍA: Importante
TÍTULO: `lock_service.py` de EliteQuote no fue portado completamente — falta "force unlock" de supervisor

PROBLEMA: En EliteQuote, los administradores pueden forzar la liberación de un lock sin
esperar expiración. En el módulo actual, el único camino es esperar 300 segundos.
`checkAndExpireLocks` se llama solo en el mount del proyecto.
SOLUCIÓN PROPUESTA: En `RecipeDetailPanel` o en una vista de supervisor, mostrar a
admins un botón "Force unlock" para archivos `in_progress` con lock de otro usuario.
Llamar a `unclaimRecipeFile` con el lockToken del archivo.
ESFUERZO: Bajo
DEPENDENCIAS: Ninguna

---

ROL: Analista de Producto
CATEGORÍA: Importante
TÍTULO: El modo "Import from Excel" es realmente necesario, no opcional

PROBLEMA: En `WizardStepBasics` existe `sourceMode: 'from_scratch' | 'import'`.
El modo import nunca se implementó. En EliteQuote, importar el listado del equipo de
ventas era el flujo principal. Con 100 recetas, la entrada manual no es viable a largo
plazo — es un workaround temporal.
IMPACTO: Si no se implementa, cada proyecto nuevo requiere 2-3 horas de entrada manual.

---

## ROADMAP SUGERIDO

### Semana 1 — Fixes Críticos (antes del próximo show)
1. Fix R10/R7: pasar `RecipeFile` a `validateRecipeFile` y usar overrides por receta
2. Fix `useRecipeFiles`: separar scan de disco del snapshot Firestore
3. Fix doble-click: conectar a Open in Excel + auto-claim
4. Fix `rootPath` vacío: mostrar error claro si la carpeta no se encuentra
5. Force unlock para admins: botón en el detail panel para supervisores

### Semana 2 — Features de Producción
6. Deadline y countdown: `dueDate` en proyecto + widget de tiempo restante
7. Settings por proyecto: migrar `ruleCells` / `holidayMap` del user al proyecto
8. Filtros dentro del proyecto: búsqueda + toggle pending/in_progress/done/mine
9. Confirmación en Reopen: popover de 2 clicks
10. Warning de lock por expirar: aviso cuando quedan 2 min

### Mes 1 — Features Estratégicos
11. Asignación de recetas: campo `assignedTo` + UI para supervisores
12. Velocidad proyectada: recetas/hora + ETA dado deadline
13. Duplicar proyecto: para reutilizar Valentine's año a año
14. Activity Feed persistente: subcolección Firestore en lugar de estado local

### Mes 2 — Completar la Visión
15. Import from Excel: cargar listado de bouquets desde el Excel del equipo de ventas
16. Notificaciones desktop: avisar cuando compañero termina una receta
17. Export de progreso: CSV del estado actual del proyecto
18. Integración con Analytics: recetas completadas por semana/diseñador

---

## LISTA DE PROMPTS ADICIONALES NECESARIOS

Fix-A | Fix: Validation uses per-recipe overrides
        Pasar `RecipeFile` a `validateRecipeFile`; R10 usa `customerOverride`,
        R7 usa `wetPackOverride`

Fix-B | Fix: Scan filesystem only on demand
        `useRecipeFiles` no llama `recipeScanProject` en cada snapshot —
        solo en mount y cuando `scanKey` cambia

Fix-C | Fix: rootPath validation on project open
        Detectar si la carpeta del proyecto no existe y mostrar error accionable

P7  | Feature: Project deadline + velocity tracker
      Campo `dueDate`, countdown widget, velocidad recetas/hora, ETA proyectado

P8  | Feature: Recipe search + filters inside project
      Barra de búsqueda + toggles de estado + filtro "Mine" en `RecipeProjectPage`

P9  | Feature: Settings per project (not per user)
      Migrar `ruleCells`, `holidayMap`, `sleeveByPrice`, `sleeveByStems`
      al documento del proyecto

P10 | Feature: Recipe assignment by supervisor
      Campo `assignedTo` en `RecipeFile` + UI de asignación para admins
      + badge en filas + warning si alguien toma una receta de otro

P11 | Feature: Duplicate project
      Opción "Duplicate" en `RecipeHomePage` que clona config, estructura
      y recetas en `pending`

P12 | Feature: Import bouquet list from Excel
      Implementar `sourceMode: 'import'` en Step 3 del wizard usando exceljs IPC

P13 | Feature: Persistent activity feed
      Subcolección `activity` en Firestore por proyecto; `RecipeActivityFeed`
      se suscribe a ella en lugar de derivar de estado local

P14 | Feature: Admin force unlock
      Botón "Force unlock" en `RecipeDetailPanel` para admins cuando el archivo
      está bloqueado por otro usuario
