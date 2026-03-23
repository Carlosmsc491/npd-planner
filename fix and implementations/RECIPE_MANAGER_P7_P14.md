# Recipe Manager — Prompts P7–P14 (sin P11)
# Para Kimi — leer KIMI_READ_FIRST.md antes de ejecutar cualquier prompt

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
P14 — Force Unlock para admins
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lee KIMI_READ_FIRST.md antes de empezar.

ARCHIVOS A LEER PRIMERO:
- src/renderer/src/components/recipes/RecipeDetailPanel.tsx
- src/renderer/src/lib/recipeFirestore.ts
- src/renderer/src/store/authStore.ts (para verificar role del usuario)
- src/renderer/src/types/index.ts

OBJETIVO: Los admins pueden liberar el lock de cualquier receta sin esperar
la expiración de 300s. El diseñador de turno ve "Locked by Carlos" y si es
admin, también ve el botón "Force unlock".

IMPLEMENTACIÓN:

1. recipeFirestore.ts — nueva función forceUnlockRecipeFile
   Agregar al final del archivo:
   ```typescript
   export async function forceUnlockRecipeFile(
     projectId: string,
     fileId: string
   ): Promise<void> {
     try {
       const fileRef = doc(
         db,
         'recipeProjects', projectId,
         'recipeFiles', fileId
       )
       await updateDoc(fileRef, {
         status: 'pending',
         lockedBy: null,
         lockClaimedAt: null,
         lockHeartbeatAt: null,
         lockToken: null,
         updatedAt: serverTimestamp(),
       })
     } catch (err) {
       throw new Error(`Failed to force unlock: ${err}`)
     }
   }
   ```

2. IRecipeRepository.ts — agregar a la interfaz
   ```typescript
   forceUnlockRecipeFile(projectId: string, fileId: string): Promise<void>
   ```

3. FirebaseRecipeRepository.ts — agregar implementación
   ```typescript
   forceUnlockRecipeFile = forceUnlockRecipeFile
   ```

4. RecipeDetailPanel.tsx — botón Force unlock para admins
   - Importar `useAuthStore` para obtener `user.role`
   - En la sección donde se muestra "Locked by {lockedBy}" (estado in_progress de otro),
     agregar debajo del mensaje, solo si `user.role === 'admin'`:

   ```tsx
   {user?.role === 'admin' && (
     <button
       onClick={() => handleForceUnlock()}
       disabled={isLoading}
       className="text-xs text-red-600 dark:text-red-400 underline mt-1
                  hover:text-red-800 dark:hover:text-red-300 disabled:opacity-50"
     >
       Force unlock
     </button>
   )}
   ```

   Handler:
   ```typescript
   const handleForceUnlock = async () => {
     if (!selectedFile || !project) return
     const confirmed = window.confirm(
       `Force unlock "${selectedFile.displayName}"?\n` +
       `This will release the lock held by ${selectedFile.lockedBy}.`
     )
     if (!confirmed) return
     setIsLoading(true)
     try {
       await recipeRepository.forceUnlockRecipeFile(project.id, selectedFile.id)
     } catch (err) {
       console.error('Force unlock failed:', err)
     } finally {
       setIsLoading(false)
     }
   }
   ```

CHECKLIST DE VERIFICACIÓN:
- [ ] npm run typecheck → 0 errores
- [ ] npm run dev → app abre sin errores en consola
- [ ] Login como admin: en archivo locked por otro usuario, aparece "Force unlock"
- [ ] Login como member: en archivo locked por otro usuario, NO aparece "Force unlock"
- [ ] Force unlock libera el lock y el archivo vuelve a Pending en tiempo real
- [ ] git add solo los archivos modificados
- [ ] git commit con mensaje descriptivo

Commit:
"feat: admin force unlock for recipe files

- forceUnlockRecipeFile in recipeFirestore.ts
- IRecipeRepository + FirebaseRecipeRepository updated
- Force unlock button visible only for admin role in RecipeDetailPanel
- Releases lock to pending status instantly

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
P8 — Búsqueda y filtros dentro del proyecto
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lee KIMI_READ_FIRST.md antes de empezar.

ARCHIVOS A LEER PRIMERO:
- src/renderer/src/components/recipes/RecipeProjectPage.tsx
- src/renderer/src/components/recipes/RecipeFolderSection.tsx
- src/renderer/src/store/recipeStore.ts
- src/renderer/src/types/index.ts

OBJETIVO: Con 100 recetas en varias carpetas, el usuario necesita buscar y
filtrar sin scroll manual. Agregar barra de búsqueda + filtros de estado
encima de la lista de carpetas en RecipeProjectPage.

IMPLEMENTACIÓN:

1. Estado local en RecipeProjectPage.tsx
   Agregar estos estados encima del return:
   ```typescript
   const [searchQuery, setSearchQuery] = useState('')
   const [statusFilter, setStatusFilter] = useState<
     'all' | 'pending' | 'in_progress' | 'done' | 'mine'
   >('all')
   ```

2. Lógica de filtrado con useMemo
   ```typescript
   const filteredFiles = useMemo(() => {
     return files.filter(file => {
       // Filtro de búsqueda (fuzzy simple por displayName)
       const matchesSearch = searchQuery.trim() === '' ||
         file.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
         file.price.toLowerCase().includes(searchQuery.toLowerCase())

       // Filtro de estado
       const matchesStatus = (() => {
         if (statusFilter === 'all') return true
         if (statusFilter === 'mine') {
           return file.lockedBy === currentUserName ||
                  file.doneBy === currentUserName ||
                  file.assignedTo === currentUser?.uid
         }
         return file.status === statusFilter
       })()

       return matchesSearch && matchesStatus
     })
   }, [files, searchQuery, statusFilter, currentUserName, currentUser?.uid])
   ```

3. UI — barra de búsqueda y filtros
   Agregar ENCIMA de la lista de carpetas (antes del map de folders):

   ```tsx
   {/* Search + filters bar */}
   <div className="flex items-center gap-2 mb-3 flex-wrap">
     {/* Search input */}
     <div className="relative flex-1 min-w-[200px]">
       <input
         type="text"
         placeholder="Search recipes..."
         value={searchQuery}
         onChange={e => setSearchQuery(e.target.value)}
         className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border
                    border-gray-200 dark:border-gray-700
                    bg-white dark:bg-gray-800
                    text-gray-900 dark:text-white
                    focus:outline-none focus:border-green-500"
       />
       {/* Search icon (Lucide Search) */}
     </div>

     {/* Status filter pills */}
     {(['all', 'pending', 'in_progress', 'done', 'mine'] as const).map(f => (
       <button
         key={f}
         onClick={() => setStatusFilter(f)}
         className={`px-3 py-1 text-xs rounded-full border transition-colors ${
           statusFilter === f
             ? 'bg-green-500 text-white border-green-500'
             : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400'
         }`}
       >
         {f === 'all' ? 'All' :
          f === 'in_progress' ? 'In Progress' :
          f.charAt(0).toUpperCase() + f.slice(1)}
         {/* Contar y mostrar número: ({filteredFiles.filter(...).length}) */}
       </button>
     ))}

     {/* Limpiar filtros — solo si hay algo activo */}
     {(searchQuery || statusFilter !== 'all') && (
       <button
         onClick={() => { setSearchQuery(''); setStatusFilter('all') }}
         className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline"
       >
         Clear
       </button>
     )}
   </div>

   {/* Mensaje si no hay resultados */}
   {filteredFiles.length === 0 && (searchQuery || statusFilter !== 'all') && (
     <div className="text-center py-8 text-sm text-gray-400 dark:text-gray-500">
       No recipes match your search
     </div>
   )}
   ```

4. Pasar filteredFiles a RecipeFolderSection
   Agrupar `filteredFiles` por carpeta (igual que antes con `files`) y pasar
   el resultado filtrado al map de carpetas. Si una carpeta queda con 0 recetas
   después del filtro, no renderizarla.

   ```typescript
   const filteredFilesByFolder = useMemo(() => {
     return filesByFolder
       .map(folder => ({
         ...folder,
         files: folder.files.filter(f =>
           filteredFiles.some(ff => ff.id === f.id)
         )
       }))
       .filter(folder => folder.files.length > 0)
   }, [filesByFolder, filteredFiles])
   ```

CHECKLIST DE VERIFICACIÓN:
- [ ] npm run typecheck → 0 errores
- [ ] npm run dev → app abre sin errores en consola
- [ ] Escribir en búsqueda filtra recetas en tiempo real
- [ ] Filtro "Pending" muestra solo recetas pendientes
- [ ] Filtro "Mine" muestra recetas locked/done por el usuario actual
- [ ] Carpetas vacías después del filtro no se muestran
- [ ] Botón "Clear" resetea búsqueda y filtro
- [ ] Sin filtros activos: comportamiento idéntico al anterior
- [ ] git add solo los archivos modificados
- [ ] git commit con mensaje descriptivo

Commit:
"feat: search and status filters in recipe project view

- Real-time fuzzy search by recipe name and price
- Status filter pills: All / Pending / In Progress / Done / Mine
- Empty folders hidden when filter is active
- Clear button resets all filters

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
P7 — Deadline del proyecto + velocidad proyectada
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lee KIMI_READ_FIRST.md antes de empezar.

ARCHIVOS A LEER PRIMERO:
- src/renderer/src/types/index.ts (RecipeProject, RecipeProjectConfig)
- src/renderer/src/components/recipes/RecipeProjectPage.tsx
- src/renderer/src/components/recipes/wizard/WizardStepBasics.tsx
- src/renderer/src/lib/recipeFirestore.ts

OBJETIVO: El equipo necesita saber si va a tiempo para el show. Agregar
fecha de entrega al proyecto y un widget que muestre countdown + velocidad
proyectada.

IMPLEMENTACIÓN:

1. types/index.ts — agregar dueDate a RecipeProjectConfig
   ```typescript
   export interface RecipeProjectConfig {
     // ... campos existentes, NO modificar ...
     dueDate: string | null   // ISO string "2026-04-14" — al final del objeto
   }
   ```

2. recipeFirestore.ts — ya soporta Partial<RecipeProject> en updateRecipeProject,
   no requiere cambios.

3. WizardStepBasics.tsx — agregar date picker
   En el formulario del Step 1, agregar debajo del campo de nombre del proyecto:
   ```tsx
   <div className="flex flex-col gap-1">
     <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
       Project deadline (optional)
     </label>
     <input
       type="date"
       value={data.config?.dueDate ?? ''}
       onChange={e => onChange({ ...data, config: {
         ...data.config,
         dueDate: e.target.value || null
       }})}
       min={new Date().toISOString().split('T')[0]}
       className="w-full px-3 py-2 text-sm rounded-lg border
                  border-gray-200 dark:border-gray-700
                  bg-white dark:bg-gray-800
                  text-gray-900 dark:text-white
                  focus:outline-none focus:border-green-500"
     />
     <p className="text-xs text-gray-400">
       Date of the show or client delivery
     </p>
   </div>
   ```

4. Crear DeadlineWidget.tsx
   Crear src/renderer/src/components/recipes/DeadlineWidget.tsx:

   ```typescript
   interface DeadlineWidgetProps {
     dueDate: string | null
     doneCount: number
     totalCount: number
     projectCreatedAt: Date
   }
   ```

   Lógica de cálculo:
   ```typescript
   // Días transcurridos desde que se creó el proyecto
   const daysElapsed = Math.max(
     1,
     (Date.now() - projectCreatedAt.getTime()) / (1000 * 60 * 60 * 24)
   )
   // Velocidad actual: recetas por día
   const velocity = doneCount / daysElapsed

   // Recetas pendientes
   const pending = totalCount - doneCount

   // Días necesarios al ritmo actual
   const daysNeeded = velocity > 0 ? Math.ceil(pending / velocity) : null
   const projectedEnd = daysNeeded
     ? new Date(Date.now() + daysNeeded * 24 * 60 * 60 * 1000)
     : null

   // Días hasta el deadline
   const dueDate = config.dueDate ? new Date(config.dueDate) : null
   const daysUntilDue = dueDate
     ? Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
     : null

   // Estado: on_track | at_risk | late | no_deadline
   const status = !dueDate ? 'no_deadline'
     : daysUntilDue !== null && daysUntilDue < 0 ? 'late'
     : daysNeeded !== null && daysNeeded > (daysUntilDue ?? 0) ? 'at_risk'
     : 'on_track'
   ```

   UI del widget:
   ```
   Si no hay deadline:
     Solo mostrar "X recipes/day" como dato informativo en gris

   Si hay deadline:
     [color según status] "{N} days left"
     Subtexto: "At current pace: done {projectedDate}"
     Si on_track: texto verde
     Si at_risk: texto amarillo + icono de advertencia
     Si late: texto rojo + "Deadline passed"
   ```

5. RecipeProjectPage.tsx — integrar DeadlineWidget
   Agregar el widget al header del proyecto, al lado derecho de las tarjetas
   de resumen (Total/Done/In Progress/Pending):
   ```tsx
   <DeadlineWidget
     dueDate={project.config.dueDate}
     doneCount={doneCount}
     totalCount={totalCount}
     projectCreatedAt={project.createdAt.toDate()}
   />
   ```

CHECKLIST DE VERIFICACIÓN:
- [ ] npm run typecheck → 0 errores
- [ ] npm run dev → app abre sin errores en consola
- [ ] Crear proyecto nuevo: el wizard Step 1 muestra date picker
- [ ] Proyecto sin deadline: widget muestra velocidad en gris sin alerta
- [ ] Proyecto con deadline próximo y poco progreso: texto amarillo
- [ ] Proyecto con deadline pasado: texto rojo "Deadline passed"
- [ ] Proyecto con buen ritmo: texto verde
- [ ] Proyectos existentes (dueDate = null): no rompen nada
- [ ] git add solo los archivos modificados
- [ ] git commit con mensaje descriptivo

Commit:
"feat: project deadline and velocity tracker

- dueDate field added to RecipeProjectConfig
- Date picker in wizard Step 1
- DeadlineWidget: days remaining, current pace, projected completion
- Color-coded: green on track, amber at risk, red overdue

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
P9 — Settings por proyecto (no por usuario)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lee KIMI_READ_FIRST.md antes de empezar.

ARCHIVOS A LEER PRIMERO:
- src/renderer/src/types/index.ts (RecipeSettings, RecipeProject)
- src/renderer/src/lib/recipeFirestore.ts
- src/renderer/src/components/recipes/settings/RecipeSettingsTab.tsx
- src/renderer/src/components/recipes/RecipeProjectPage.tsx
- src/renderer/src/lib/repositories/interfaces/IRecipeRepository.ts

OBJETIVO: holidayMap, sleeveByPrice, sleeveByStems y ruleCells deben ser
iguales para todo el equipo en el mismo proyecto. Actualmente están en
recipeSettings/{userId} — moverlos al proyecto para garantizar consistencia.

IMPLEMENTACIÓN:

1. types/index.ts — separar settings en dos partes

   Settings del proyecto (compartidas por todo el equipo):
   ```typescript
   export interface RecipeProjectSettings {
     ruleCells: RecipeRuleCells
     holidayMap: Record<string, string>
     sleeveByPrice: Record<string, number>
     sleeveByStems: Record<string, number>
   }
   ```

   Settings del usuario (preferencias personales):
   ```typescript
   export interface RecipeUserPreferences {
     lockTimeoutSeconds: number   // única preferencia que queda por usuario
   }
   ```

   Mantener RecipeSettings como antes para compatibilidad — hacerlo un alias:
   ```typescript
   // Para compatibilidad con código existente que usa RecipeSettings
   export interface RecipeSettings extends RecipeProjectSettings {
     userId: string
     lockTimeoutSeconds: number
   }
   ```

2. types/index.ts — agregar projectSettings a RecipeProject
   ```typescript
   export interface RecipeProject {
     // ... campos existentes ...
     projectSettings: RecipeProjectSettings | null  // null = usar defaults
   }
   ```

   Agregar default export:
   ```typescript
   export const DEFAULT_RECIPE_PROJECT_SETTINGS: RecipeProjectSettings = {
     ruleCells: DEFAULT_RECIPE_RULE_CELLS,
     holidayMap: DEFAULT_HOLIDAY_MAP,
     sleeveByPrice: {},
     sleeveByStems: {},
   }
   ```

3. recipeFirestore.ts — nuevas funciones

   ```typescript
   export async function getRecipeProjectSettings(
     projectId: string
   ): Promise<RecipeProjectSettings | null> {
     try {
       const snap = await getDoc(
         doc(db, 'recipeProjects', projectId, 'settings', 'main')
       )
       return snap.exists() ? (snap.data() as RecipeProjectSettings) : null
     } catch (err) {
       throw new Error(`Failed to get project settings: ${err}`)
     }
   }

   export async function saveRecipeProjectSettings(
     projectId: string,
     settings: RecipeProjectSettings
   ): Promise<void> {
     try {
       await setDoc(
         doc(db, 'recipeProjects', projectId, 'settings', 'main'),
         settings
       )
     } catch (err) {
       throw new Error(`Failed to save project settings: ${err}`)
     }
   }

   export async function initDefaultRecipeProjectSettings(
     projectId: string
   ): Promise<RecipeProjectSettings> {
     const settings = { ...DEFAULT_RECIPE_PROJECT_SETTINGS }
     await saveRecipeProjectSettings(projectId, settings)
     return settings
   }
   ```

4. IRecipeRepository.ts — agregar nuevas firmas
   ```typescript
   getRecipeProjectSettings(projectId: string): Promise<RecipeProjectSettings | null>
   saveRecipeProjectSettings(projectId: string, s: RecipeProjectSettings): Promise<void>
   initDefaultRecipeProjectSettings(projectId: string): Promise<RecipeProjectSettings>
   ```

5. FirebaseRecipeRepository.ts — agregar implementaciones
   ```typescript
   getRecipeProjectSettings = getRecipeProjectSettings
   saveRecipeProjectSettings = saveRecipeProjectSettings
   initDefaultRecipeProjectSettings = initDefaultRecipeProjectSettings
   ```

6. RecipeProjectPage.tsx — cargar project settings al montar
   ```typescript
   const [projectSettings, setProjectSettings] =
     useState<RecipeProjectSettings | null>(null)

   useEffect(() => {
     if (!project) return
     recipeRepository.getRecipeProjectSettings(project.id)
       .then(s => {
         if (!s) {
           return recipeRepository.initDefaultRecipeProjectSettings(project.id)
         }
         return s
       })
       .then(setProjectSettings)
   }, [project?.id])
   ```

   Pasar `projectSettings` a los componentes que necesitan validación
   (RecipeDetailPanel → validateRecipeFile).

7. RecipeSettingsTab.tsx — dividir en dos secciones
   - Sección "Project Rules" (edita projectSettings del proyecto activo):
     ruleCells, holidayMap, sleeveByPrice, sleeveByStems
     Nota: solo admins pueden editar estas secciones
   - Sección "My Preferences" (edita recipeSettings del usuario):
     Solo lockTimeoutSeconds

8. Firestore rules — agregar reglas para la subcolección settings
   En firestore.rules, dentro del match de recipeProjects:
   ```javascript
   match /settings/{doc} {
     allow read: if isActiveUser();
     allow write: if isAdmin();   // solo admins modifican reglas del proyecto
   }
   ```

CHECKLIST DE VERIFICACIÓN:
- [ ] npm run typecheck → 0 errores
- [ ] npm run dev → app abre sin errores en consola
- [ ] Abrir proyecto existente → projectSettings se carga (o se inicializa con defaults)
- [ ] Abrir RecipeSettings como admin → puede editar ruleCells y holidayMap
- [ ] Abrir RecipeSettings como member → sección "Project Rules" visible pero no editable
- [ ] Cambiar holidayMap como admin → el cambio aplica para todos al hacer Mark Done
- [ ] lockTimeoutSeconds sigue siendo por usuario
- [ ] Proyectos sin projectSettings se inicializan con defaults automáticamente
- [ ] git add solo los archivos modificados
- [ ] git commit con mensaje descriptivo

Commit:
"feat: recipe settings per project instead of per user

- RecipeProjectSettings type for shared rules (ruleCells, holidayMap, sleeve maps)
- RecipeUserPreferences type for personal settings (lockTimeoutSeconds)
- getRecipeProjectSettings/saveRecipeProjectSettings in recipeFirestore.ts
- IRecipeRepository + FirebaseRecipeRepository updated
- RecipeProjectPage loads project settings on mount
- RecipeSettingsTab split: Project Rules (admin only) + My Preferences
- Firestore rules: only admins can write project settings

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
P10 — Asignación de recetas a personas
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lee KIMI_READ_FIRST.md antes de empezar.

ARCHIVOS A LEER PRIMERO:
- src/renderer/src/types/index.ts (RecipeFile)
- src/renderer/src/lib/recipeFirestore.ts
- src/renderer/src/components/recipes/RecipeRowItem.tsx
- src/renderer/src/components/recipes/RecipeDetailPanel.tsx
- src/renderer/src/store/authStore.ts

OBJETIVO: El supervisor puede asignar recetas a personas del equipo.
Los diseñadores ven "sus" recetas con el filtro Mine del P8.
Si alguien toma una receta asignada a otro, ve una advertencia.

IMPLEMENTACIÓN:

1. types/index.ts — agregar campos a RecipeFile
   ```typescript
   export interface RecipeFile {
     // ... campos existentes ...
     assignedTo: string | null       // uid del usuario asignado
     assignedToName: string | null   // nombre display (para mostrar sin query)
   }
   ```

2. recipeFirestore.ts — nueva función assignRecipeFile
   ```typescript
   export async function assignRecipeFile(
     projectId: string,
     fileId: string,
     assignedTo: string | null,
     assignedToName: string | null
   ): Promise<void> {
     try {
       const fileRef = doc(
         db,
         'recipeProjects', projectId,
         'recipeFiles', fileId
       )
       await updateDoc(fileRef, {
         assignedTo,
         assignedToName,
         updatedAt: serverTimestamp(),
       })
     } catch (err) {
       throw new Error(`Failed to assign recipe: ${err}`)
     }
   }
   ```

3. IRecipeRepository.ts — agregar firma
   ```typescript
   assignRecipeFile(
     projectId: string,
     fileId: string,
     assignedTo: string | null,
     assignedToName: string | null
   ): Promise<void>
   ```

4. FirebaseRecipeRepository.ts
   ```typescript
   assignRecipeFile = assignRecipeFile
   ```

5. RecipeRowItem.tsx — mostrar avatar del asignado
   - Si `file.assignedTo` no es null: mostrar un círculo con las iniciales
     del `assignedToName` al final de la fila (columna adicional pequeña)
   - El círculo es pequeño (24px), color basado en hash del nombre
     (reutilizar la función de colorUtils.ts si existe)
   - Tooltip: "Assigned to {assignedToName}"

6. RecipeRowItem.tsx — warning si alguien toma receta ajena
   Cuando el usuario hace Claim en una receta asignada a otra persona,
   mostrar advertencia visual (NO bloquear — solo avisar):
   ```typescript
   // Solo mostrar si: hay assignedTo, assignedTo !== currentUser.uid, y el archivo está pending
   {file.assignedTo && file.assignedTo !== currentUser?.uid && file.status === 'pending' && (
     <span className="text-xs text-amber-600 dark:text-amber-400">
       Assigned to {file.assignedToName}
     </span>
   )}
   ```

7. RecipeDetailPanel.tsx — asignación para admins
   En el panel de detalle, para admins solamente, agregar una sección
   "Assigned to" debajo de las propiedades de la receta:

   ```tsx
   {user?.role === 'admin' && (
     <div className="flex items-center gap-2 mt-3">
       <span className="text-xs text-gray-500 dark:text-gray-400 min-w-[80px]">
         Assigned to
       </span>
       <select
         value={selectedFile.assignedTo ?? ''}
         onChange={e => handleAssign(e.target.value)}
         className="flex-1 text-xs rounded border border-gray-200 dark:border-gray-700
                    bg-white dark:bg-gray-800 py-1 px-2"
       >
         <option value="">Unassigned</option>
         {teamMembers.map(member => (
           <option key={member.uid} value={member.uid}>
             {member.name}
           </option>
         ))}
       </select>
     </div>
   )}
   ```

   Handler:
   ```typescript
   const handleAssign = async (uid: string) => {
     if (!selectedFile || !project) return
     const member = teamMembers.find(m => m.uid === uid) ?? null
     await recipeRepository.assignRecipeFile(
       project.id,
       selectedFile.id,
       uid || null,
       member?.name ?? null
     )
   }
   ```

   Para obtener `teamMembers`: usar `subscribeToUsers` de firestore.ts
   (ya existe en NPD Planner) dentro de un useEffect en RecipeDetailPanel.

8. Filtro "Mine" en P8 ya implementado
   El filtro "Mine" del P8 ya cubre: `file.assignedTo === currentUser?.uid`.
   Verificar que la condición también incluye el assignedTo.

CHECKLIST DE VERIFICACIÓN:
- [ ] npm run typecheck → 0 errores
- [ ] npm run dev → app abre sin errores en consola
- [ ] Como admin: en RecipeDetailPanel aparece dropdown "Assigned to"
- [ ] Asignar receta a Carlos → la fila muestra avatar con iniciales de Carlos
- [ ] Como Laura: intentar claim de receta de Carlos → advertencia amarilla visible
- [ ] Laura puede hacer claim aunque la advertencia esté — NO está bloqueada
- [ ] Filtro "Mine" muestra las recetas asignadas al usuario actual
- [ ] Como member: NO aparece dropdown de asignación
- [ ] Recetas existentes (assignedTo = null): sin cambios visuales
- [ ] git add solo los archivos modificados
- [ ] git commit con mensaje descriptivo

Commit:
"feat: recipe assignment by supervisor

- assignedTo + assignedToName fields in RecipeFile type
- assignRecipeFile in recipeFirestore.ts + repository updated
- Avatar badge in RecipeRowItem showing assigned person
- Warning when claiming a recipe assigned to someone else
- Assignment dropdown in RecipeDetailPanel (admin only)
- Mine filter in P8 now includes assignedTo field

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
P12 — Import bouquets desde Excel (modo import en wizard)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lee KIMI_READ_FIRST.md antes de empezar.

ARCHIVOS A LEER PRIMERO:
- src/renderer/src/components/recipes/wizard/NewRecipeProjectWizard.tsx
- src/renderer/src/components/recipes/wizard/WizardStepBasics.tsx
- src/renderer/src/components/recipes/wizard/WizardStepStructure.tsx
- src/renderer/src/utils/recipeNaming.ts
- src/main/ipc/recipeIpcHandlers.ts
- src/renderer/src/types/index.ts

OBJETIVO: Cuando el equipo de ventas entrega un Excel con 100 bouquets,
el usuario puede importarlo en el wizard en lugar de entrar cada receta
manualmente. Implementar el modo "Import from Excel" en Step 3 del wizard.

IMPLEMENTACIÓN:

1. recipeIpcHandlers.ts — nuevo handler recipe:parseImportExcel
   ```typescript
   ipcMain.handle(
     'recipe:parseImportExcel',
     async (_, filePath: string): Promise<{
       success: boolean
       rows?: Array<{
         rawName: string
         price: string
         option: string
         name: string
         folder: string
       }>
       error?: string
     }> => {
       try {
         const ExcelJS = await import('exceljs')
         const workbook = new ExcelJS.Workbook()
         await workbook.xlsx.readFile(filePath)

         const sheet = workbook.worksheets[0]
         if (!sheet) return { success: false, error: 'No worksheet found' }

         const rows: Array<{
           rawName: string; price: string; option: string;
           name: string; folder: string
         }> = []

         sheet.eachRow((row, rowNumber) => {
           if (rowNumber === 1) return // saltar header

           const rawName = String(row.getCell(1).value ?? '').trim()
           const folder  = String(row.getCell(2).value ?? 'General').trim()

           if (!rawName) return

           // Parsear precio/opción/nombre usando la misma lógica de recipeNaming
           // Importar parseRecipeNameFromFilename del renderer no es posible en main
           // Re-implementar la lógica de parsing aquí (copiar de recipeNaming.ts):
           const priceMatch = rawName.match(/^\$?(\d+(?:\.\d{1,2})?)/)
           const price = priceMatch ? `$${priceMatch[1]}` : ''
           const afterPrice = rawName.replace(/^\$?\d+(?:\.\d{1,2})?\s*/, '')
           const optionMatch = afterPrice.match(/^([ABC])\s+/i)
           const option = optionMatch ? optionMatch[1].toUpperCase() : ''
           const name = afterPrice
             .replace(/^[ABC]\s+/i, '')
             .toUpperCase()
             .trim()

           rows.push({ rawName, price, option, name, folder })
         })

         return { success: true, rows }
       } catch (err) {
         return { success: false, error: String(err) }
       }
     }
   )
   ```

   Exponer en preload/index.ts:
   ```typescript
   recipeParseImportExcel: (path) =>
     ipcRenderer.invoke('recipe:parseImportExcel', path),
   ```

   Agregar al preload/index.d.ts:
   ```typescript
   recipeParseImportExcel: (path: string) => Promise<{
     success: boolean
     rows?: Array<{
       rawName: string; price: string; option: string;
       name: string; folder: string
     }>
     error?: string
   }>
   ```

2. WizardStepStructure.tsx — modo import alternativo
   Cuando `wizardData.sourceMode === 'import'`, en lugar del editor manual,
   mostrar el flujo de importación:

   ESTADO A: Sin archivo cargado
   ```tsx
   <div className="flex flex-col items-center gap-4 py-8">
     <p className="text-sm text-gray-500 dark:text-gray-400">
       Select the Excel file from the sales team
     </p>
     <p className="text-xs text-gray-400 dark:text-gray-500">
       Expected columns: A = Recipe name (e.g. "$12.99 A VALENTINE"),
       B = Folder name (e.g. "Valentine")
     </p>
     <button onClick={handleSelectImportFile} className="...">
       Browse Excel file
     </button>
   </div>
   ```

   ESTADO B: Archivo seleccionado, parsing en progreso
   ```tsx
   <div className="flex items-center gap-2 text-sm text-gray-500">
     {/* spinner */} Parsing {fileName}...
   </div>
   ```

   ESTADO C: Parsing completado — preview de recetas importadas
   ```tsx
   {/* Header con resumen */}
   <div className="text-sm text-gray-700 dark:text-gray-300 mb-3">
     Found {importedRows.length} recipes in {folders.length} folders
     <button onClick={() => setImportFile(null)} className="ml-2 text-xs underline">
       Change file
     </button>
   </div>

   {/* Preview agrupada por carpeta */}
   {foldersFromImport.map(folder => (
     <div key={folder.name} className="mb-3">
       <div className="text-xs font-medium text-gray-500 mb-1">
         {folder.name} ({folder.recipes.length})
       </div>
       {folder.recipes.map(r => (
         <div key={r.rawName} className="flex items-center gap-2 text-xs py-1
                                         border-b border-gray-100 dark:border-gray-800">
           <span className="text-green-600 dark:text-green-400 font-mono">
             {r.price}
           </span>
           <span className="text-gray-400">{r.option}</span>
           <span>{r.name}</span>
           {/* Preview del nombre normalizado */}
           <span className="ml-auto text-gray-400">
             → {[r.price, r.option, r.name].filter(Boolean).join(' ')}
           </span>
         </div>
       ))}
     </div>
   ))}

   ESTADO D: Error de parsing
   Mensaje de error con botón para seleccionar otro archivo.
   ```

   Lógica del handler:
   ```typescript
   const handleSelectImportFile = async () => {
     const filePath = await window.electronAPI.selectFile()
     if (!filePath) return
     setIsParsingImport(true)
     const result = await window.electronAPI.recipeParseImportExcel(filePath)
     setIsParsingImport(false)
     if (!result.success || !result.rows) {
       setImportError(result.error ?? 'Could not parse file')
       return
     }
     // Convertir rows a estructura de folders con RecipeSpecs
     // usando los defaults del wizardData (Step 2)
     const folderMap = new Map<string, RecipeSpec[]>()
     result.rows.forEach(row => {
       if (!folderMap.has(row.folder)) folderMap.set(row.folder, [])
       folderMap.get(row.folder)!.push({
         recipeId: crypto.randomUUID(),
         relativePath: '',
         displayName: [row.price, row.option, row.name].filter(Boolean).join(' '),
         price: row.price,
         option: row.option,
         name: row.name,
         holidayOverride: wizardData.holidayDefault,
         customerOverride: wizardData.customerDefault,
         wetPackOverride: wizardData.wetPackDefault ? 'Y' : 'N',
         distributionOverride: { ...wizardData.distributionDefault },
         requiresManualUpdate: false,
       })
     })
     setImportedFolders(Array.from(folderMap.entries()).map(([name, recipes]) => ({
       name, recipes
     })))
   }
   ```

3. NewRecipeProjectWizard.tsx — usar importedFolders en Finish
   En el handler de "Create Project", cuando `sourceMode === 'import'`,
   usar `importedFolders` del WizardStepStructure en lugar del árbol manual.
   El resto del flujo de creación (crear carpetas, generar Excel, registrar
   en Firestore) es idéntico.

CHECKLIST DE VERIFICACIÓN:
- [ ] npm run typecheck → 0 errores
- [ ] npm run dev → app abre sin errores en consola
- [ ] Crear proyecto con sourceMode "from_scratch" → wizard funciona igual que antes
- [ ] Crear proyecto con sourceMode "import" → Step 3 muestra el flujo de import
- [ ] Seleccionar un Excel con columnas A (nombre) y B (carpeta) → preview correcta
- [ ] Los precios se parsean: "$12.99 A VALENTINE" → price=$12.99, option=A, name=VALENTINE
- [ ] Carpetas se agrupan correctamente según columna B
- [ ] Hacer click en "Create Project" con datos importados → proyecto se crea con todas las recetas
- [ ] Excel con formato incorrecto → mensaje de error claro
- [ ] git add solo los archivos modificados
- [ ] git commit con mensaje descriptivo

Commit:
"feat: import bouquet list from Excel in wizard

- New IPC handler recipe:parseImportExcel using exceljs
- WizardStepStructure shows import flow when sourceMode=import
- Parses price/option/name from column A, folder from column B
- Preview shows grouped recipes before confirming
- Inherits project defaults (customer, holiday, wet pack, distribution)
- Create Project works identically with imported or manual recipes

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
P13 — Activity feed persistente en Firestore
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lee KIMI_READ_FIRST.md antes de empezar.

ARCHIVOS A LEER PRIMERO:
- src/renderer/src/components/recipes/RecipeActivityFeed.tsx
- src/renderer/src/lib/recipeFirestore.ts
- src/renderer/src/types/index.ts
- src/renderer/src/lib/repositories/interfaces/IRecipeRepository.ts

OBJETIVO: El feed de actividad se pierde al recargar. El supervisor necesita
ver "qué hicieron ayer". Persistir eventos en Firestore y suscribirse a ellos.

IMPLEMENTACIÓN:

1. types/index.ts — nuevo tipo RecipeActivityEvent
   ```typescript
   export type RecipeActivityType =
     | 'claimed'
     | 'unclaimed'
     | 'done'
     | 'reopened'
     | 'lock_expired'
     | 'force_unlocked'
     | 'assigned'

   export interface RecipeActivityEvent {
     id: string
     projectId: string
     fileId: string
     displayName: string        // nombre de la receta
     type: RecipeActivityType
     userName: string           // quién hizo la acción
     userId: string
     targetUserName?: string    // para 'assigned': a quién se asignó
     createdAt: Timestamp
   }
   ```

2. recipeFirestore.ts — funciones de actividad
   ```typescript
   export async function addRecipeActivity(
     projectId: string,
     event: Omit<RecipeActivityEvent, 'id' | 'createdAt'>
   ): Promise<void> {
     try {
       await addDoc(
         collection(db, 'recipeProjects', projectId, 'activity'),
         { ...event, createdAt: serverTimestamp() }
       )
     } catch (err) {
       // No lanzar error — la actividad es secundaria, no debe romper el flujo
       console.error('Failed to log activity:', err)
     }
   }

   export function subscribeToRecipeActivity(
     projectId: string,
     callback: (events: RecipeActivityEvent[]) => void
   ): Unsubscribe {
     return onSnapshot(
       query(
         collection(db, 'recipeProjects', projectId, 'activity'),
         orderBy('createdAt', 'desc'),
         limit(50)
       ),
       snap => callback(
         snap.docs.map(d => ({ id: d.id, ...d.data() }) as RecipeActivityEvent)
       ),
       err => console.error('subscribeToRecipeActivity error:', err)
     )
   }
   ```

3. recipeFirestore.ts — llamar addRecipeActivity en las operaciones existentes
   En cada función que genera un evento, agregar la llamada DESPUÉS del
   updateDoc/runTransaction principal (no dentro del transaction):

   - `claimRecipeFile` → addRecipeActivity type: 'claimed'
   - `unclaimRecipeFile` → type: 'unclaimed'
   - `markRecipeDone` → type: 'done'
   - `reopenRecipeFile` → type: 'reopened'
   - `forceUnlockRecipeFile` → type: 'force_unlocked'
   - `assignRecipeFile` → type: 'assigned' con targetUserName

   Ejemplo en claimRecipeFile:
   ```typescript
   // Después del transaction exitoso:
   await addRecipeActivity(projectId, {
     projectId,
     fileId,
     displayName: '', // no tenemos el displayName aquí — pasarlo como parámetro
     type: 'claimed',
     userName,
     userId: userName, // ajustar si tienes el uid disponible
   })
   ```

   NOTA: Para pasar displayName, agregar el parámetro opcional a las funciones
   que lo necesiten, sin cambiar las firmas obligatorias existentes:
   ```typescript
   export async function claimRecipeFile(
     projectId: string,
     fileId: string,
     userName: string,
     displayName?: string  // opcional, para el activity log
   ): Promise<void>
   ```

4. IRecipeRepository.ts — agregar firmas
   ```typescript
   addRecipeActivity(
     projectId: string,
     event: Omit<RecipeActivityEvent, 'id' | 'createdAt'>
   ): Promise<void>
   subscribeToRecipeActivity(
     projectId: string,
     callback: (events: RecipeActivityEvent[]) => void
   ): Unsubscribe
   ```

5. FirebaseRecipeRepository.ts
   ```typescript
   addRecipeActivity = addRecipeActivity
   subscribeToRecipeActivity = subscribeToRecipeActivity
   ```

6. RecipeActivityFeed.tsx — reescribir para usar Firestore
   Reemplazar la lógica de derivar actividad de diferencias de estado local
   por una suscripción a la subcolección:

   ```typescript
   useEffect(() => {
     if (!projectId) return
     const unsub = recipeRepository.subscribeToRecipeActivity(
       projectId,
       setEvents
     )
     return unsub
   }, [projectId])
   ```

   Formato de cada evento en la UI:
   ```
   claimed:        "{userName} claimed {displayName}"
   unclaimed:      "{userName} released {displayName}"
   done:           "{userName} finished {displayName}"
   reopened:       "{userName} reopened {displayName}"
   lock_expired:   "{displayName} lock expired (was {userName})"
   force_unlocked: "{userName} force-unlocked {displayName}"
   assigned:       "{userName} assigned {displayName} to {targetUserName}"
   ```

   Timestamp relativo: "2 min ago", "1 hr ago", "yesterday" — usar
   la función de dateUtils.ts si existe, si no crear una simple.

7. Firestore rules — agregar reglas para la subcolección activity
   ```javascript
   match /activity/{eventId} {
     allow read: if isActiveUser();
     allow create: if isActiveUser();
     allow update, delete: if false;  // immutable
   }
   ```

CHECKLIST DE VERIFICACIÓN:
- [ ] npm run typecheck → 0 errores
- [ ] npm run dev → app abre sin errores en consola
- [ ] Hacer claim de una receta → aparece en el feed
- [ ] Cerrar la app, reabrir el proyecto → el feed muestra actividad previa
- [ ] 4 usuarios activos: todos ven el feed actualizado en tiempo real
- [ ] Mark Done → aparece en el feed con el nombre correcto
- [ ] Feed muestra máximo 50 eventos, los más recientes primero
- [ ] Timestamps relativos correctos ("2 min ago", etc.)
- [ ] Actividad no bloquea el flujo si Firestore falla (try/catch sin throw)
- [ ] git add solo los archivos modificados
- [ ] git commit con mensaje descriptivo

Commit:
"feat: persistent activity feed stored in Firestore

- RecipeActivityEvent type with 7 event types
- addRecipeActivity + subscribeToRecipeActivity in recipeFirestore.ts
- Activity logged on: claim, unclaim, done, reopen, force-unlock, assign
- RecipeActivityFeed subscribes to Firestore instead of local state diffs
- Feed persists across reloads — supervisor sees full history
- Firestore rules: immutable activity records, readable by all active users

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
