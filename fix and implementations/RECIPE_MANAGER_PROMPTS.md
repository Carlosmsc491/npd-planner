# Recipe Manager — Prompts para Kimi
# Implementar EliteQuote dentro de NPD Planner como módulo Recipe Manager
# Copiar cada prompt en orden al agente Kimi — siempre en el repo NPD-PLANNER

# ═══════════════════════════════════════════════════════════════════
# ANTES DE EMPEZAR
# ═══════════════════════════════════════════════════════════════════
# 1. Abrir VS Code en el repo NPD-PLANNER (no en EliteQuote)
# 2. Copiar RECIPE_MANAGER_SPEC.md a la raíz del repo NPD-PLANNER
# 3. Instalar dependencia nueva:
#    npm install exceljs
#    npm run typecheck (debe pasar antes de empezar)
# 4. Hacer commit limpio antes de comenzar:
#    git add . && git commit -m "chore: add recipe manager spec"
# ═══════════════════════════════════════════════════════════════════


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT 1 — Tipos, Firestore e IPC
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lee CLAUDE.md y RECIPE_MANAGER_SPEC.md completamente antes de empezar.

Implementa la capa de datos del módulo Recipe Manager:

1. TIPOS TYPESCRIPT
   Abre src/renderer/src/types/index.ts y agrega al final, sin modificar nada
   existente, todos los tipos de la sección 12 de RECIPE_MANAGER_SPEC.md:
   - RecipeFileStatus, RecipeDistribution, RecipeProjectConfig
   - RecipeProject, RecipeFile, RecipePresence
   - RecipeRuleCells, RecipeSettings, RecipeSpec
   - ValidationChange, ValidationResult
   - DEFAULT_RECIPE_RULE_CELLS, DEFAULT_RECIPE_DISTRIBUTION
   - RECIPE_CUSTOMER_OPTIONS, RECIPE_HOLIDAY_OPTIONS
   NO uses `any` en ningún tipo.

2. FIRESTORE OPERATIONS
   Crea src/renderer/src/lib/recipeFirestore.ts con estas funciones:
   - subscribeToRecipeProjects(callback) → listener en tiempo real de recipeProjects
   - createRecipeProject(data: Omit<RecipeProject, 'id' | 'createdAt'>) → string (nuevo id)
   - updateRecipeProject(id, updates: Partial<RecipeProject>) → void
   - subscribeToRecipeFiles(projectId, callback) → listener de recipeFiles subcolección
   - claimRecipeFile(projectId, fileId, userName) → usa runTransaction para lock atómico
     Si ya está locked: lanzar Error("Locked by {lockedBy}")
   - unclaimRecipeFile(projectId, fileId, lockToken) → liberar lock
   - markRecipeDone(projectId, fileId, userName, changes) → status=done + doneBy + doneAt + liberar lock
   - reopenRecipeFile(projectId, fileId) → status=pending, limpiar lock y done fields
   - updateRecipeHeartbeat(projectId, fileId, lockToken) → actualizar lockHeartbeatAt
   - updatePresence(projectId, userId, userName) → upsert en recipePresence
   - removePresence(projectId, userId) → eliminar de recipePresence
   - getRecipeSettings(userId) → RecipeSettings | null
   - saveRecipeSettings(userId, settings: RecipeSettings) → void
   - checkAndExpireLocks(projectId) → leer todos los files, si lockHeartbeatAt > 300s → status=lock_expired
   Usa serverTimestamp() para todos los timestamps de escritura.
   Importa tipos desde types/index.ts.

3. IPC HANDLERS (main process)
   Crea src/main/ipc/recipeIpcHandlers.ts con todos los handlers de la sección 8
   de RECIPE_MANAGER_SPEC.md:
   - recipe:readCells → leer celdas con exceljs (import ExcelJS from 'exceljs')
   - recipe:writeCells → escribir celdas con exceljs
   - recipe:generateFromTemplate → copiar template + escribir recipeData
   - recipe:renameFile → fs.rename
   - recipe:isFileOpen → intentar abrir exclusivamente, retornar boolean
   - recipe:createFolder → fs.mkdir recursive: true
   - recipe:scanProject → walk recursivo buscando .xlsx, excluir _project/
     Para cada .xlsx: parsear displayName desde el nombre de archivo
     Retornar array con { relativePath, displayName, price, option, name }
   - recipe:openInExcel → shell.openPath(filePath)
   Registrar todos los handlers en src/main/index.ts importando registerRecipeHandlers().
   Exponer todas las APIs en src/preload/index.ts y src/preload/index.d.ts.

4. ZUSTAND STORE
   Crea src/renderer/src/store/recipeStore.ts con la interface de la sección 9
   de RECIPE_MANAGER_SPEC.md. Usar Zustand (ya instalado).

5. REGLAS FIRESTORE
   Agrega las reglas de la sección 4.2 de RECIPE_MANAGER_SPEC.md a firestore.rules.
   No elimines las reglas existentes.

Después de cada archivo, corre: npm run typecheck
Si hay errores, corrígelos antes de continuar.
Commit: "feat: recipe manager - types, firestore, ipc layer"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT 2 — Sidebar + Home de Proyectos + Wizard
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lee CLAUDE.md y RECIPE_MANAGER_SPEC.md completamente antes de empezar.

Implementa la navegación y pantalla de inicio del módulo Recipe Manager:

1. SIDEBAR — AppLayout.tsx
   Abre src/renderer/src/components/ui/AppLayout.tsx.
   Debajo de la sección de navegación existente (Dashboard, Boards, Calendar, etc.),
   agrega una nueva sección "RECETAS NPD" con estos items:
   - 🌸 Proyectos NPD → /recipes
   - ⚙️ Configuración → /settings (tab de recetas)
   Usa el mismo estilo visual que los items existentes.
   El item activo debe tener el mismo estilo highlight que los otros.

2. RUTAS — App.tsx
   Agrega rutas protegidas (ProtectedRoute existente):
   - /recipes → RecipeHomePage
   - /recipes/:projectId → RecipeProjectPage (placeholder por ahora — solo título)
   - /recipes/new → NewRecipeProjectWizard

3. RECIPE HOME PAGE
   Crea src/renderer/src/components/recipes/RecipeHomePage.tsx:

   Header:
   - Título "Proyectos NPD"
   - Botón "Nuevo Proyecto" (abre /recipes/new)

   Filtros (pills):
   - All | Active | Completed | Archived
   - El filtro activo tiene highlight

   Búsqueda:
   - Input de búsqueda en tiempo real por nombre de proyecto
   - Usa subscribeToRecipeProjects de recipeFirestore.ts

   Tabla de proyectos:
   - Columnas: Nombre, Ubicación (rootPath), Recetas (count), Progreso, Actualizado
   - Progreso: mini progress bar + "X/Y done"
   - Click en fila → navegar a /recipes/:projectId
   - Hover en fila: highlight sutil

   Estado vacío:
   - Icono + "No hay proyectos NPD" + botón "Crear el primero"

4. WIZARD — 3 PASOS
   Crea los 4 archivos del wizard según la sección 6.4 de RECIPE_MANAGER_SPEC.md:

   NewRecipeProjectWizard.tsx:
   - Stepper visual: 3 pasos con indicador de progreso
   - Estado: currentStep (1/2/3), wizardData (acumulado entre pasos)
   - Botones: "Back" (deshabilitado en paso 1) | "Next" / "Create Project" (paso 3)
   - En "Create Project": llamar createRecipeProject + ipcRenderer recipe:createFolder
     para cada carpeta del árbol + recipe:generateFromTemplate para cada receta
     Mostrar loading spinner durante la creación
     Al terminar, navegar a /recipes/:newProjectId

   WizardStepBasics.tsx:
   - Input: nombre del proyecto (required)
   - Botón "Browse" para seleccionar carpeta padre: usa window.electronAPI.selectFolder()
   - Botón "Browse" para seleccionar template Excel: usa window.electronAPI.selectFolder()
     (o un file picker similar si existe en preload)
   - Toggle: "Create From Scratch" | "Import From Excel" (solo mostrar, import es fase 2)
   - "Next" habilitado solo cuando nombre + carpeta + template están llenos

   WizardStepRules.tsx:
   - Select: Customer Default (RECIPE_CUSTOMER_OPTIONS)
   - Select: Holiday Default (RECIPE_HOLIDAY_OPTIONS)
   - Toggle: Wet Pack (Yes/No)
   - DistributionEditor component (crear en este mismo archivo o aparte):
     6 inputs numéricos para Miami, New Jersey, California, Chicago, Seattle, Texas
     Step de 5, rango 0-100
     Mostrar suma total. Si > 100: error rojo.
     Regla Miami: si Miami = 100, deshabilitar otros y poner en 0.

   WizardStepStructure.tsx:
   - Lista de carpetas con botón "+ Add Folder"
   - Por cada carpeta: nombre editable + lista de recetas + botón "+ Add Recipe"
   - Por cada receta: inputs para precio, opción (A/B/C o vacío), nombre
   - Preview en tiempo real: mostrar nombre normalizado ej. "$12.99 A VALENTINE"
     (usar la función normalizeRecipeName que crearás en recipeNaming.ts)

5. recipeNaming.ts
   Crea src/renderer/src/utils/recipeNaming.ts con la función normalizeRecipeName:
   - Input: precio, opción, nombre
   - Output: "$PRECIO OPCION NOMBRE" (todo mayúsculas, $ si no tiene)
   - Si option está vacío: "$PRECIO NOMBRE"
   
   También exportar: parseRecipeNameFromFilename(filename: string) que hace el proceso
   inverso: dado "$12.99 A VALENTINE.xlsx" → { price: "$12.99", option: "A", name: "VALENTINE" }

Corre npm run typecheck después de cada archivo. Corrige todos los errores.
Commit: "feat: recipe manager - sidebar, home page, new project wizard"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT 3 — Ventana de Proyecto + Sistema de Locks
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lee CLAUDE.md y RECIPE_MANAGER_SPEC.md completamente antes de empezar.

Implementa la ventana principal de proyecto y el sistema de locks colaborativos:

1. RECIPE PROJECT PAGE
   Crea src/renderer/src/components/recipes/RecipeProjectPage.tsx:

   Al montar:
   - Cargar proyecto desde Firestore por :projectId
   - Llamar recipe:scanProject vía IPC para obtener lista de archivos del sistema
   - Suscribirse a subscribeToRecipeFiles para obtener estados en tiempo real
   - Llamar checkAndExpireLocks para limpiar locks expirados
   - Llamar updatePresence cada 15 segundos (intervalo, limpiar en unmount)
   - Al desmontar: removePresence + liberar lock si se tiene uno

   Layout (2 columnas):
   - Columna izquierda (2/3 del ancho): lista de carpetas + archivos
   - Columna derecha (1/3): RecipeDetailPanel

   Header del proyecto:
   - Nombre del proyecto (grande)
   - Indicador de presencia: avatares de usuarios online (usando recipePresence)
   - Botón "Files & Folders" (placeholder, abre explorador del SO en rootPath)

   Tarjetas de resumen (RecipeProgressCard.tsx):
   - 4 tarjetas: Total | Done | In Progress | Pending
   - Contar desde los recipeFiles del store
   - Barra de progreso global: done / total * 100%

   Lista de carpetas:
   Crea RecipeFolderSection.tsx:
   - Header colapsable con nombre de carpeta + contador "X/Y done"
   - Al expandir: lista de RecipeRowItem
   - Animación de colapso suave (usa Tailwind transition)

   Crea RecipeRowItem.tsx según la sección 7.1 de RECIPE_MANAGER_SPEC.md:
   - Columnas: nombre de receta, precio, opción, badge de estado, locked by
   - Colores de fondo según estado (pending/in_progress_own/in_progress_other/expired/done)
   - Click → setSelectedFile en recipeStore
   - Resaltar fila seleccionada
   - Double click en own lock → llamar openInExcel directamente

2. RECIPE DETAIL PANEL
   Crea src/renderer/src/components/recipes/RecipeDetailPanel.tsx:

   Estado vacío: "Select a recipe to see details"

   Con archivo seleccionado mostrar:
   - Nombre del archivo (grande)
   - Badge de estado con color
   - Precio, opción, holiday, customer
   - Distribución (6 campos, read-only en este panel)

   Botones de acción según estado:
   - pending → botón primario "Claim Recipe" (llama claimRecipeFile)
   - in_progress (own) → botón "Open in Excel" + botón "Mark Done" + botón outline "Unclaim"
   - in_progress (other) → mensaje "🔒 Locked by {lockedBy}" en rojo, sin botones de acción
   - lock_expired → botón "Reclaim" (mismo que claim, para lock expirado)
   - done → texto gris "Completed by {doneBy} on {doneAt}" + botón outline "Reopen"

   Estados de loading: spinner mientras se ejecuta claim/unclaim/done

3. ACTIVITY FEED
   Crea src/renderer/src/components/recipes/RecipeActivityFeed.tsx:
   - Panel lateral o inferior (decidir según espacio)
   - Suscribirse a cambios en recipeFiles del proyecto
   - Mostrar feed de actividad: "{user} claimed {recipe}", "{user} finished {recipe}", etc.
   - Max 20 entradas recientes
   - Timestamps relativos (hace 2 minutos, etc.)

4. LOCK HOOK
   Crea src/renderer/src/hooks/useRecipeLock.ts:
   - currentLock: { projectId, fileId, lockToken } | null (guardado en state)
   - claimFile(projectId, fileId): llamar claimRecipeFile, guardar lock en state
   - unclaimFile(): llamar unclaimRecipeFile, limpiar state
   - Heartbeat: useEffect que corre cada 15 segundos si hay currentLock
     → llamar updateRecipeHeartbeat
   - Al desmontar: limpiar intervalo, liberar lock si existe

5. HOOK PRINCIPAL
   Crea src/renderer/src/hooks/useRecipeFiles.ts:
   - Suscribirse a subscribeToRecipeFiles
   - Mergear con lista del sistema de archivos (IPC scan)
   - Detectar archivos en FS que no están en Firestore → crearlos como 'pending'
   - Detectar archivos en Firestore que ya no están en FS → marcarlos como huérfanos
   - Retornar: { files, filesByFolder, isLoading }

Corre npm run typecheck. Corrige todos los errores.
Commit: "feat: recipe manager - project window, lock system, presence"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT 4 — Validación + Mark Done
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lee CLAUDE.md y RECIPE_MANAGER_SPEC.md completamente antes de empezar.

Implementa el sistema de validación y el flujo completo de Mark Done:

1. VALIDATION SERVICE
   Crea src/renderer/src/utils/recipeValidation.ts:

   Función principal: validateRecipeFile(
     filePath: string,
     projectConfig: RecipeProjectConfig,
     settings: RecipeSettings,
     currentUser: string
   ): Promise<ValidationResult>

   Pasos:
   a. Leer celdas del Excel vía window.electronAPI.recipeReadCells con todas las
      celdas de settings.ruleCells + K3 para stem count
   b. Aplicar cada regla y generar ValidationChange si hay discrepancia:

   REGLAS (porto directo de EliteQuote validation_service.py):

   R1 - Recipe Name Format:
     Leer D3 (o celda configurada). Parsear con parseRecipeNameFromFilename.
     Si el nombre normalizado difiere del actual → sugerir cambio en D3.
     autoApply: false (requiere revisión)

   R2 - Holiday Detection Alignment:
     Del D3 normalizado, buscar keyword en settings.holidayMap.
     Si detecta holiday y D6 difiere → sugerir cambio en D6.
     autoApply: true

   R3 - Dry Pack Sync:
     Si valor en Z9 difiere de AA9 → sugerir copiar Z9 a AA9.
     autoApply: true

   R4 - Wet Pack Sync:
     Si AA45 difiere de AB45 → sugerir copiar AA45 a AB45.
     autoApply: true

   R5 - Sleeve Price Correction:
     Buscar precio del archivo en settings.sleeveByPrice.
     Si no hay match, buscar stem count (K3) en settings.sleeveByStems.
     Si hay match y AB25 difiere → sugerir cambio en AB25.
     Si no hay match → marcar requiresManualUpdate = true.
     autoApply: false

   R6 - Sleeve Flag Enforcement:
     Si AB25 > 0 y AC25 !== "Y" → sugerir AC25 = "Y".
     autoApply: true

   R7 - Wet Pack Enforcement:
     Si projectConfig.wetPackDefault === true y AA40 !== "Y" → sugerir AA40 = "Y".
     autoApply: true

   R8 - Miami Override:
     Si distribución Miami = 100 y algún otro DC > 0 → sugerir poner en 0.
     autoApply: true

   R9 - Distribution Over 100%:
     Si suma de distribución > 100 → ValidationChange type 'error', autoApply: false.

   R10 - Customer Enforcement:
     Si D7 difiere de projectConfig.customerDefault → sugerir D7 = customerDefault.
     autoApply: true

   R11 - Final Naming:
     Leer D3 normalizado. Generar nombre final: "{D3_NORMALIZADO} DONE BY {currentUser}.xlsx"
     Retornar como change separado de tipo 'info' (informativo, no es error).
     autoApply: true

2. VALIDATION DIALOG
   Crea src/renderer/src/components/recipes/RecipeValidationDialog.tsx
   según la sección 7.2 de RECIPE_MANAGER_SPEC.md:

   Props:
   - isOpen: boolean
   - recipeName: string
   - changes: ValidationChange[]
   - onApply: (acceptedCells: string[]) => Promise<void>
   - onCancel: () => void

   Layout:
   - Modal centrado (usar el patrón modal existente en NPD Planner)
   - Header: "Review Changes — {recipeName}"
   - Subtitle: "{autoApply count} auto-fixes + {manual count} manual changes"
   
   Tabla de cambios:
   Columnas: [checkbox] | Campo | Celda | Valor Actual → Valor Sugerido | Tipo
   - autoApply: pre-checked, fondo verde claro, badge "Auto-fix"
   - manual: pre-unchecked, fondo amarillo, badge "Review"
   - error: fondo rojo claro, badge "Error"
   
   Footer:
   - Contador dinámico: "X changes will be applied"
   - Botón primary: "Apply & Mark Done"
   - Botón outline: "Cancel"
   - Si hay requiresManualUpdate: warning "Some fields need manual attention in Excel"

3. FLUJO MARK DONE COMPLETO
   En RecipeDetailPanel.tsx, implementar el handler del botón "Mark Done":

   Paso 1 - PREPARE:
   - Mostrar loading "Checking file..."
   - Llamar recipe:isFileOpen vía IPC
   - Si está abierto: mostrar error "Close Excel before finishing" + detener

   Paso 2 - VALIDATE:
   - Mostrar loading "Validating recipe..."
   - Llamar validateRecipeFile con config del proyecto + settings del usuario
   - Si hay changes: abrir RecipeValidationDialog

   Paso 3 - APPLY (cuando usuario confirma en dialog):
   - Mostrar loading "Applying changes..."
   - Construir array de {cell, value} con los cambios aceptados
   - Llamar recipe:writeCells vía IPC

   Paso 4 - FINALIZE:
   - Mostrar loading "Finishing..."
   - Llamar recipe:renameFile con el nuevo nombre final ("{D3} DONE BY {user}.xlsx")
   - Llamar markRecipeDone en Firestore
   - Limpiar lock del store
   - Cerrar dialog
   - Toast de éxito: "Recipe marked as done ✓" (usar el sistema de toast existente en NPD Planner)

   Manejo de errores en cada paso:
   - Si Excel está abierto → mensaje específico
   - Si error de red → "Connection error, try again"
   - Si error de renombrado → "Could not rename file, check it's not open"

4. RECIPE EXCEL UTILS
   Crea src/renderer/src/lib/recipeExcel.ts con wrappers tipados sobre los IPC calls:
   - readExcelCells(filePath, cells): Promise<Record<string, string>>
   - writeExcelCells(filePath, changes): Promise<void>
   - isExcelFileOpen(filePath): Promise<boolean>
   - openInExcel(filePath): Promise<void>
   
   Estos wrappers llaman a window.electronAPI.recipeReadCells, etc.
   Así los componentes no llaman IPC directamente.

Corre npm run typecheck. Corrige todos los errores.
Commit: "feat: recipe manager - validation engine, mark done flow"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT 5 — Settings, Pulido y Tests
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lee CLAUDE.md y RECIPE_MANAGER_SPEC.md completamente antes de empezar.

Implementa la configuración del módulo y el pulido final de UX:

1. RECIPE SETTINGS TAB
   Abre src/renderer/src/components/settings/SettingsPage.tsx (o el archivo de settings
   existente en NPD Planner). Agrega un nuevo tab "Recipe Manager" con 5 sub-secciones
   según la sección 11 de RECIPE_MANAGER_SPEC.md:

   Crea src/renderer/src/components/recipes/settings/RecipeSettingsTab.tsx:

   Sub-sección "Rule Cells":
   - Grid de inputs: label (ej. "Recipe Name") + input de texto con la celda (ej. "D3")
   - Celdas: Recipe Name, Holiday, Customer, Dry Pack Suggested, Dry Pack Actual,
     Wet Pack Flag, Wet Pack Suggested, Wet Pack Actual, Sleeve Price, Sleeve Flag,
     Stem Count, Distribution Start
   - Botón "Restore Defaults" → volver a DEFAULT_RECIPE_RULE_CELLS

   Sub-sección "Holiday Dictionary":
   - Tabla editable: keyword (editable) → holiday value (select de RECIPE_HOLIDAY_OPTIONS)
   - Botón "+ Add Keyword"
   - Botón de eliminar por fila (icono X)
   - Pre-cargar con DEFAULT_HOLIDAY_MAP

   Sub-sección "Sleeve by Price":
   - Tabla editable: precio (string, ej. "$12.99") → sleeve price (número)
   - Botón "+ Add" | botón eliminar por fila

   Sub-sección "Sleeve by Stem Count":
   - Igual que sleeve by price pero con stem count como key

   Sub-sección "General":
   - Lock Timeout: input numérico + texto "seconds (min 120, max 3600)"
   - Distribution Defaults: DistributionEditor component (reutilizar del wizard)

   Al montar: cargar settings con getRecipeSettings(currentUser.uid)
   Botón "Save Settings": llamar saveRecipeSettings. Toast de confirmación.
   Si no hay settings: inicializar con defaults y guardar.

2. INICIALIZACIÓN DE SETTINGS EN PRIMER USO
   En useRecipeFiles.ts o en RecipeProjectPage.tsx:
   Al cargar el módulo por primera vez, si getRecipeSettings retorna null:
   - Crear settings con todos los defaults del spec
   - Guardar en Firestore

3. ESTADOS DE CARGA Y ERROR

   En RecipeHomePage.tsx:
   - Skeleton loading mientras cargan los proyectos (3 filas grises animadas)
   - Toast de error si falla la carga

   En RecipeProjectPage.tsx:
   - Estado "Scanning files..." mientras el IPC scanea el sistema de archivos
   - Estado "Loading project..." mientras carga Firestore
   - Si rootPath no existe en el sistema de archivos:
     Banner rojo: "Project folder not found: {rootPath}"
     Botón "Browse" para reasignar la carpeta

   En RecipeDetailPanel.tsx:
   - Deshabilitar todos los botones mientras se ejecuta cualquier operación
   - Mostrar spinner inline dentro del botón que se está ejecutando

4. INTEGRACIÓN EN DASHBOARD
   Abre DashboardPage.tsx (o el dashboard existente en NPD Planner).
   Agrega una sección "NPD Recipes" con:
   - Widget pequeño que muestra: proyectos activos, total de recetas pendientes hoy
   - Link "View all recipes →" que navega a /recipes
   - Solo mostrar si el usuario tiene al menos 1 proyecto en recipeProjects

5. PUNTOS DE PULIDO UI

   RecipeRowItem.tsx:
   - Tooltip en hover del badge de estado con más detalle
   - Tooltip "Locked by {user} since {time}" para archivos en lock ajeno

   RecipeProjectPage.tsx:
   - Contador de archivos actualmente online: "3 users online" con avatares apilados
   - Botón de refresh manual (ícono de reload) para re-escanear archivos

   RecipeValidationDialog.tsx:
   - Animación de entrada del modal (ya existe en NPD Planner, usar el mismo)
   - Contar total de cambios aceptados dinámicamente al hacer check/uncheck

   General:
   - Todos los textos de acción en inglés (consistente con NPD Planner)
   - Todos los mensajes de error son específicos (no "Something went wrong")
   - Ningún botón queda habilitado mientras hay una operación en curso

6. VERIFICACIÓN FINAL

   Checklist antes del commit final:
   □ npm run typecheck → 0 errores
   □ npm run lint → 0 warnings
   □ npm run dev → la app abre sin errores en consola
   □ Se puede navegar a /recipes desde el sidebar
   □ Se puede crear un proyecto nuevo con el wizard (3 pasos)
   □ Se puede ver la lista de proyectos
   □ Al abrir un proyecto, se ven las recetas con sus estados
   □ Claim/unclaim funciona y actualiza en tiempo real
   □ Mark Done ejecuta la validación y muestra el diálogo
   □ Settings de Recipe Manager abre y guarda correctamente
   □ No hay console.error en ningún flujo normal

Commit final:
"feat: recipe manager v1.0 - NPD recipe workflow integrated into NPD Planner

- New Recipe Manager module ported from EliteQuote (Python/PySide6 → TypeScript/React)
- Project management: create, list, open NPD recipe projects
- Collaborative locking: claim/unclaim/heartbeat/lock expiry via Firebase
- Validation engine: 11 rules, auto-fix suggestions, review dialog
- Mark Done: validate → review → apply → rename → close
- Real-time presence: see who's working on each project
- Settings: configurable rule cells, holiday map, sleeve pricing
- Integrated into NPD Planner sidebar and dashboard

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SI KIMI SE BLOQUEA — Reset prompt
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Stop. Lee CLAUDE.md y RECIPE_MANAGER_SPEC.md.
Responde en una oración por punto:
1. ¿Qué intentabas implementar?
2. ¿Qué hiciste?
3. ¿Dónde exactamente estás bloqueado?
Luego propón el siguiente paso más simple posible.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DEPENDENCIAS NUEVAS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

npm install exceljs
# Todo lo demás (Firebase, Zustand, Electron, React, Tailwind) ya está instalado


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ARCHIVOS DE REFERENCIA EN ELITEQUOTE (NO MODIFICAR, SOLO LEER)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Para entender la lógica de negocio exacta al portar, revisar en el repo EliteQuote:
- services/validation_service.py    → lógica de todas las reglas de validación
- services/lock_service.py          → algoritmo de claim/unclaim/heartbeat
- services/recipe_service.py        → normalización de nombres de recetas
- models/entities.py                → modelos de datos originales
- assets/defaults/holiday_map.json  → mapa de holidays por defecto
- assets/defaults/sleeve_map.json   → precios de sleeve por defecto
- assets/defaults/rules_general.json → celdas por defecto
