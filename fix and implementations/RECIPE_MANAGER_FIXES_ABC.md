# Recipe Manager — Fixes Críticos (Fix-A, Fix-B, Fix-C)
# Correr ANTES de usar el módulo en producción
# Estos fixes corrigen bugs que dañan datos o confunden al usuario

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX-A — Validation usa overrides por receta (no defaults del proyecto)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lee CLAUDE.md antes de empezar.

PROBLEMA: `recipeValidation.ts` reglas R10 (Customer Enforcement) y R7
(Wet Pack Enforcement) usan `projectConfig.customerDefault` y
`projectConfig.wetPackDefault` ignorando los overrides por receta guardados
en Firestore. Si una receta tiene `customerOverride = "OPEN DESIGN"` y el
proyecto tiene `customerDefault = "WALMART"`, Mark Done "corrige" el Excel
de vuelta a WALMART destruyendo el trabajo del wizard.

ARCHIVOS A LEER PRIMERO:
- src/renderer/src/utils/recipeValidation.ts
- src/renderer/src/components/recipes/RecipeDetailPanel.tsx
- src/renderer/src/types/index.ts (interfaces RecipeFile, RecipeProjectConfig)

CAMBIOS REQUERIDOS:

### 1. recipeValidation.ts — firma de la función principal

Cambiar la firma de `validateRecipeFile` para recibir el RecipeFile completo:

ANTES:
```typescript
export async function validateRecipeFile(
  filePath: string,
  projectConfig: RecipeProjectConfig,
  settings: RecipeSettings,
  currentUser: string
): Promise<ValidationResult>
```

DESPUÉS:
```typescript
export async function validateRecipeFile(
  filePath: string,
  projectConfig: RecipeProjectConfig,
  settings: RecipeSettings,
  currentUser: string,
  recipeFile: RecipeFile        // ← nuevo parámetro
): Promise<ValidationResult>
```

### 2. recipeValidation.ts — Regla R7 (Wet Pack Enforcement)

Usar el override de la receta si existe, si no el default del proyecto.

ANTES:
```typescript
// R7 - Wet Pack Enforcement
if (projectConfig.wetPackDefault === true && cellValues[cells.wetPackFlag] !== 'Y') {
  changes.push({
    field: 'Wet Pack Flag',
    cell: cells.wetPackFlag,
    currentValue: String(cellValues[cells.wetPackFlag] ?? ''),
    suggestedValue: 'Y',
    autoApply: true,
    type: 'warning',
  })
}
```

DESPUÉS:
```typescript
// R7 - Wet Pack Enforcement
// Usar override de la receta si existe, si no el default del proyecto
const effectiveWetPack = recipeFile.wetPackOverride !== ''
  ? recipeFile.wetPackOverride === 'Y'
  : projectConfig.wetPackDefault

if (effectiveWetPack === true && cellValues[cells.wetPackFlag] !== 'Y') {
  changes.push({
    field: 'Wet Pack Flag',
    cell: cells.wetPackFlag,
    currentValue: String(cellValues[cells.wetPackFlag] ?? ''),
    suggestedValue: 'Y',
    autoApply: true,
    type: 'warning',
  })
}
```

### 3. recipeValidation.ts — Regla R10 (Customer Enforcement)

ANTES:
```typescript
// R10 - Customer Enforcement
if (cellValues[cells.customer] !== projectConfig.customerDefault) {
  changes.push({
    field: 'Customer',
    cell: cells.customer,
    currentValue: String(cellValues[cells.customer] ?? ''),
    suggestedValue: projectConfig.customerDefault,
    autoApply: true,
    type: 'warning',
  })
}
```

DESPUÉS:
```typescript
// R10 - Customer Enforcement
// Usar override de la receta si no está vacío, si no el default del proyecto
const effectiveCustomer = recipeFile.customerOverride !== ''
  ? recipeFile.customerOverride
  : projectConfig.customerDefault

if (cellValues[cells.customer] !== effectiveCustomer) {
  changes.push({
    field: 'Customer',
    cell: cells.customer,
    currentValue: String(cellValues[cells.customer] ?? ''),
    suggestedValue: effectiveCustomer,
    autoApply: true,
    type: 'warning',
  })
}
```

### 4. RecipeDetailPanel.tsx — pasar recipeFile al llamador

Buscar donde se llama `validateRecipeFile` en el flujo Mark Done y agregar
el `selectedFile` como último parámetro:

ANTES:
```typescript
const result = await validateRecipeFile(
  selectedFile.relativePath,   // o fullPath
  project.config,
  settings,
  currentUser.name
)
```

DESPUÉS:
```typescript
const result = await validateRecipeFile(
  selectedFile.relativePath,   // o fullPath
  project.config,
  settings,
  currentUser.name,
  selectedFile                 // ← agregar este parámetro
)
```

Corre npm run typecheck → 0 errores.

Commit:
"fix: validation R10/R7 respect per-recipe overrides

- validateRecipeFile now receives RecipeFile as parameter
- R10 uses customerOverride when set, falls back to projectDefault
- R7 uses wetPackOverride when set, falls back to wetPackDefault
- Prevents Mark Done from overwriting wizard-configured overrides

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX-B — useRecipeFiles no escanea disco en cada snapshot Firestore
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lee CLAUDE.md antes de empezar.

PROBLEMA: `useRecipeFiles.ts` llama `window.electronAPI.recipeScanProject`
dentro del callback de `subscribeToRecipeFiles`. Cada cambio en Firestore
(incluyendo heartbeats cada 15 segundos de cada usuario) dispara un escaneo
completo del disco. Con 4 usuarios activos y 100 archivos en SharePoint
(red), esto genera lag visible y puede generar 200+ scans por hora.

ARCHIVOS A LEER PRIMERO:
- src/renderer/src/hooks/useRecipeFiles.ts
- src/renderer/src/components/recipes/RecipeProjectPage.tsx

CAMBIOS REQUERIDOS:

### 1. useRecipeFiles.ts — separar scan de snapshot

El hook debe tener DOS efectos independientes:

EFECTO 1 — Escaneo del filesystem (solo cuando `scanKey` cambia):
```typescript
// Solo corre en mount inicial y cuando el usuario hace clic en Refresh
useEffect(() => {
  if (!projectId || !rootPath) return
  
  let cancelled = false
  setIsScanning(true)
  
  window.electronAPI.recipeScanProject(rootPath)
    .then((scanned) => {
      if (cancelled) return
      setFsFiles(scanned)   // estado local separado para archivos del filesystem
      setIsScanning(false)
    })
    .catch((err) => {
      if (cancelled) return
      console.error('recipeScanProject failed:', err)
      setScanError(String(err))
      setIsScanning(false)
    })
  
  return () => { cancelled = true }
}, [projectId, rootPath, scanKey])  // scanKey viene como prop, cambia solo en Refresh manual
```

EFECTO 2 — Suscripción Firestore (independiente del scan):
```typescript
// Solo actualiza datos de Firestore — nunca toca el filesystem
useEffect(() => {
  if (!projectId) return
  
  const unsub = subscribeToRecipeFiles(projectId, (firestoreFiles) => {
    setFirestoreFiles(firestoreFiles)  // estado local separado
  })
  
  return unsub
}, [projectId])
```

MERGE — Combinar los dos estados en un useMemo:
```typescript
// Merge filesystem + Firestore en tiempo real, sin re-escanear disco
const files = useMemo(() => {
  return mergeFilesWithFirestore(fsFiles, firestoreFiles, projectId)
}, [fsFiles, firestoreFiles, projectId])
```

La función `mergeFilesWithFirestore` ya debe existir o crearla si no existe:
- Para cada archivo del filesystem: buscar su estado en firestoreFiles por fileId
- Si no está en Firestore: tratarlo como 'pending'
- Si está en Firestore pero no en filesystem: ignorarlo (fue eliminado)
- Retornar el merge ordenado por carpeta y nombre

### 2. Tipos de estado interno a separar

```typescript
const [fsFiles, setFsFiles] = useState<RecipeFSEntry[]>([])
const [firestoreFiles, setFirestoreFiles] = useState<RecipeFile[]>([])
const [isScanning, setIsScanning] = useState(false)
const [scanError, setScanError] = useState<string | null>(null)
```

### 3. Retorno del hook — agregar scanError e isScanning

```typescript
return {
  files,           // merged
  filesByFolder,   // agrupado
  isLoading: isScanning && firestoreFiles.length === 0,
  isScanning,      // para mostrar "Refreshing..." sin bloquear la UI
  scanError,       // para mostrar el error de Fix-C
}
```

Corre npm run typecheck → 0 errores.
Corre npm run dev y verificar: abrir un proyecto, hacer cambios de estado —
la lista se actualiza sin el lag del scan.

Commit:
"fix: decouple filesystem scan from Firestore snapshot in useRecipeFiles

- Filesystem scan only runs on mount and manual Refresh
- Firestore subscription updates state independently
- Merged view via useMemo — no disk I/O on every heartbeat
- Eliminates 200+ unnecessary IPC scans per hour with 4 active users

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX-C — Validar rootPath al abrir proyecto y mostrar error accionable
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lee CLAUDE.md antes de empezar.

PROBLEMA: Si `rootPath` del proyecto no existe en el disco (SharePoint no
montado, carpeta movida, primera vez en otra PC), `recipeScanProject` falla
silenciosamente con `console.error` y la lista aparece vacía. El usuario no
sabe por qué está vacío y puede pensar que el proyecto no tiene archivos.

ARCHIVOS A LEER PRIMERO:
- src/main/ipc/recipeIpcHandlers.ts  (recipe:scanProject)
- src/renderer/src/hooks/useRecipeFiles.ts  (ya modificado en Fix-B)
- src/renderer/src/components/recipes/RecipeProjectPage.tsx

CAMBIOS REQUERIDOS:

### 1. recipeIpcHandlers.ts — agregar handler recipe:pathExists

```typescript
ipcMain.handle('recipe:pathExists', async (_, folderPath: string): Promise<boolean> => {
  try {
    return fs.existsSync(folderPath) && fs.statSync(folderPath).isDirectory()
  } catch {
    return false
  }
})
```

Exponer en preload/index.ts:
```typescript
recipePathExists: (path) => ipcRenderer.invoke('recipe:pathExists', path),
```

Agregar al preload/index.d.ts:
```typescript
recipePathExists: (path: string) => Promise<boolean>
```

### 2. useRecipeFiles.ts — detectar carpeta inexistente

Dentro del EFECTO 1 de escaneo (ya separado en Fix-B), antes de llamar
`recipeScanProject`, verificar que la carpeta existe:

```typescript
useEffect(() => {
  if (!projectId || !rootPath) return
  
  let cancelled = false
  setIsScanning(true)
  setScanError(null)
  
  // Verificar primero que la carpeta existe
  window.electronAPI.recipePathExists(rootPath)
    .then((exists) => {
      if (cancelled) return
      
      if (!exists) {
        setScanError(`Project folder not found: ${rootPath}`)
        setIsScanning(false)
        return
      }
      
      // La carpeta existe — proceder con el scan
      return window.electronAPI.recipeScanProject(rootPath)
    })
    .then((scanned) => {
      if (cancelled || !scanned) return
      setFsFiles(scanned)
      setIsScanning(false)
    })
    .catch((err) => {
      if (cancelled) return
      setScanError(`Cannot access project folder: ${String(err)}`)
      setIsScanning(false)
    })
  
  return () => { cancelled = true }
}, [projectId, rootPath, scanKey])
```

### 3. RecipeProjectPage.tsx — mostrar error accionable

Cuando `scanError` no es null, mostrar un banner en lugar de la lista vacía:

```typescript
{scanError && (
  <div style={{ /* banner rojo usando clases Tailwind del proyecto */ }}>
    <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20
                    border border-red-200 dark:border-red-800 rounded-lg mb-4">
      {/* Ícono de error */}
      <div className="flex-1">
        <p className="text-sm font-medium text-red-800 dark:text-red-200">
          Project folder not found
        </p>
        <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
          {scanError}
        </p>
        <p className="text-xs text-red-600 dark:text-red-400 mt-1">
          Make sure your SharePoint folder is mounted and the path is correct.
        </p>
      </div>
      <button
        onClick={() => handleUpdateFolderPath()}
        className="text-xs text-red-700 dark:text-red-300 underline"
      >
        Update folder path
      </button>
    </div>
  </div>
)}
```

### 4. RecipeProjectPage.tsx — función handleUpdateFolderPath

```typescript
const handleUpdateFolderPath = async () => {
  const newPath = await window.electronAPI.selectFolder()
  if (!newPath) return
  
  // Verificar que la nueva ruta existe
  const exists = await window.electronAPI.recipePathExists(newPath)
  if (!exists) {
    // Mostrar toast de error
    return
  }
  
  // Actualizar en Firestore
  await recipeRepository.updateRecipeProject(project.id, {
    rootPath: newPath,
  })
  
  // Disparar re-scan con la nueva ruta
  setScanKey(k => k + 1)
}
```

Corre npm run typecheck → 0 errores.
Corre npm run dev y verificar:
□ Abrir un proyecto con carpeta existente → lista normal, sin cambios
□ Cambiar temporalmente rootPath a una ruta falsa en Firestore → banner rojo
  con el mensaje correcto y botón "Update folder path"
□ Hacer click en "Update folder path" → file picker → lista se recarga

Commit:
"fix: detect missing project folder and show actionable error

- New IPC handler recipe:pathExists using fs.existsSync
- useRecipeFiles checks path exists before scanning
- RecipeProjectPage shows error banner with folder path details
- Update folder path button triggers re-scan with new path
- No more silent empty list when SharePoint is not mounted

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
