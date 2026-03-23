# NPD Planner — Prompt 5b: Recipe File Manager Dialog
# Correr DESPUÉS del Prompt 5 (Settings + Pulido)
# Completa la migración de EliteQuote agregando el explorador de archivos del proyecto

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT 5b — Recipe File Manager Dialog
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lee CLAUDE.md y RECIPE_MANAGER_SPEC.md completamente antes de empezar.

Implementa el explorador de archivos del proyecto NPD — equivalente al
ProjectFileManagerDialog de EliteQuote. Se abre desde el botón
"Files & Folders" en RecipeProjectPage.

---

## IPC HANDLERS NUEVOS

Primero agrega estos handlers en src/main/ipc/recipeIpcHandlers.ts:

```typescript
// Listar contenido de una carpeta (un nivel, no recursivo)
ipcMain.handle('recipe:listFolder', async (_, folderPath: string) => {
  // Leer contenido de la carpeta con fs.readdirSync
  // Por cada entry: retornar { name, isDirectory, size, modifiedAt, fullPath }
  // Excluir: carpetas _project/, archivos que empiecen con ~$ (Excel lock files)
  // Retornar ordenado: carpetas primero, luego archivos, ambos alfabéticos
  // Si la carpeta no existe: retornar array vacío
})

ipcMain.handle('recipe:deleteItem', async (_, itemPath: string) => {
  // Si es carpeta: fs.rmSync(itemPath, { recursive: true, force: true })
  // Si es archivo: fs.unlinkSync(itemPath)
  // Retornar: { success: boolean, error?: string }
})

ipcMain.handle('recipe:renameItem', async (_, oldPath: string, newPath: string) => {
  // fs.renameSync(oldPath, newPath)
  // Si el archivo está abierto en Excel (~$nombre): retornar error específico
  // Retornar: { success: boolean, error?: string }
})

ipcMain.handle('recipe:createFileFromTemplate', async (
  _,
  templatePath: string,
  destFolder: string,
  fileName: string
) => {
  // Verificar que templatePath existe
  // Construir destPath con path.join(destFolder, fileName)
  // Si no tiene extensión .xlsx: agregar automáticamente
  // Si el archivo ya existe: retornar error "File already exists"
  // fs.copyFileSync(templatePath, destPath)
  // Retornar: { success: boolean, destPath?: string, error?: string }
})
```

Exponer en preload/index.ts y preload/index.d.ts:
```typescript
recipeListFolder: (folderPath) => ipcRenderer.invoke('recipe:listFolder', folderPath),
recipeDeleteItem: (itemPath) => ipcRenderer.invoke('recipe:deleteItem', itemPath),
recipeRenameItem: (old, next) => ipcRenderer.invoke('recipe:renameItem', old, next),
recipeCreateFileFromTemplate: (t, d, f) => ipcRenderer.invoke('recipe:createFileFromTemplate', t, d, f),
```

---

## TIPOS NUEVOS

Agrega al final de src/renderer/src/types/index.ts:

```typescript
export interface RecipeFSEntry {
  name: string
  isDirectory: boolean
  size: number           // bytes, 0 para directorios
  modifiedAt: Date
  fullPath: string
}
```

---

## COMPONENTE PRINCIPAL

Crea src/renderer/src/components/recipes/RecipeFileManagerDialog.tsx:

### Props
```typescript
interface RecipeFileManagerDialogProps {
  isOpen: boolean
  onClose: () => void
  projectRootPath: string
  projectConfig: RecipeProjectConfig   // para saber la ruta del template
  onFileRenamed: (oldPath: string, newPath: string) => void
  // callback para que RecipeProjectPage refresque su lista de archivos
}
```

### Layout general
Modal de pantalla completa (o muy grande — mínimo 900px de ancho).
Usar el patrón de modal existente en NPD Planner.

Header:
- Título "Files & Folders"
- Breadcrumb de navegación: "ProjectName / Valentine / SubFolder"
  Cada segmento del breadcrumb es clickeable para navegar arriba
- Botón X para cerrar

Toolbar (debajo del header):
- Botón "+ New Folder" (abre inline input para nombre)
- Botón "+ New Recipe File" (abre dialog de nombre, copia desde template)
- Botón "Open in Explorer" → shell.openPath(currentFolderPath) para abrir
  en el explorador nativo de Windows/Mac
- Separador
- Campo de búsqueda: filtra la lista actual por nombre en tiempo real

Lista de archivos (área principal):
- Tabla con columnas: [icono] Nombre | Tipo | Tamaño | Modificado | Acciones
- Carpetas: icono de carpeta (Lucide FolderOpen), sin tamaño, doble click navega dentro
- Archivos .xlsx: icono verde de hoja (Lucide FileSpreadsheet)
- Otros archivos: icono gris (Lucide File)
- Columna acciones: botones pequeños "Rename" | "Delete" por cada fila
- Fila seleccionada: highlight sutil

### Comportamiento de navegación
- Estado: currentPath (empieza en projectRootPath)
- Al montar: llamar recipe:listFolder(projectRootPath)
- Doble click en carpeta: actualizar currentPath, llamar recipe:listFolder(newPath)
- Click en breadcrumb: navegar a esa ruta, actualizar currentPath
- La carpeta _project/ nunca aparece en la lista (filtrada en IPC)

### Crear carpeta nueva
- Click "+ New Folder":
  - Agregar al inicio de la lista una fila especial con un input de texto inline
  - El input está pre-enfocado
  - Enter o click fuera confirma el nombre
  - Llamar recipe:createFolder(path.join(currentPath, newName))
  - Si el nombre está vacío: cancelar sin crear
  - Si ya existe: mostrar error inline "A folder with that name already exists"
  - Al confirmar: refrescar lista

### Crear archivo desde template
- Click "+ New Recipe File":
  - Abrir mini dialog (no cerrar el file manager):
    - Input: nombre del archivo (sin extensión)
    - Preview del nombre final: "MiReceta.xlsx"
    - Botón "Create" | "Cancel"
  - Al confirmar: llamar recipe:createFileFromTemplate(
      projectConfig.templatePath,
      currentPath,
      nombreIngresado
    )
  - Si éxito: refrescar lista + toast "Recipe file created"
  - Si error: mostrar mensaje de error inline

### Renombrar
- Click "Rename" en una fila:
  - La celda de nombre de esa fila se convierte en input editable (inline)
  - El input tiene el nombre actual pre-seleccionado
  - Enter confirma, Escape cancela
  - Llamar recipe:renameItem(oldFullPath, newFullPath)
  - Si el archivo es .xlsx y está abierto en Excel: mostrar error
    "Close the file in Excel before renaming"
  - Si éxito y es .xlsx: llamar onFileRenamed(oldPath, newPath) para que
    RecipeProjectPage actualice el tracker en Firestore
  - Refrescar lista

### Eliminar
- Click "Delete" en una fila:
  - Mostrar dialog de confirmación inline (no usar browser confirm):
    "Delete {nombre}? This cannot be undone."
    Si es carpeta: "Delete folder {nombre} and all its contents?"
    Botones: "Delete" (rojo) | "Cancel"
  - Al confirmar: llamar recipe:deleteItem(fullPath)
  - Si el archivo es .xlsx y tiene un lock activo en Firestore:
    mostrar error "This recipe is currently locked by {userName}"
    NO permitir eliminar archivos bloqueados
  - Si éxito: refrescar lista + toast "{nombre} deleted"

### Estados de carga y error
- Skeleton loading mientras carga la carpeta (5 filas grises animadas)
- Si la carpeta no existe: banner rojo "Folder not found: {path}"
- Si error de permisos: banner rojo "Cannot access this folder"
- Loading spinner en el botón de acción mientras se ejecuta

### Sincronización con RecipeProjectPage
Cuando el usuario renombra un archivo .xlsx, hay que actualizar Firestore:
- El archivo tenía un fileId = "{projectId}::{oldRelativePath}"
- Después del rename el fileId debe ser "{projectId}::{newRelativePath}"
- Llamar onFileRenamed(oldPath, newPath) y en RecipeProjectPage:
  - Calcular oldRelativePath y newRelativePath relativo a projectRootPath
  - Llamar a recipeFirestore: updateRecipeFileId(projectId, oldFileId, newFileId, newRelativePath)
  - Agregar esta función a recipeFirestore.ts:
    ```typescript
    export async function updateRecipeFileId(
      projectId: string,
      oldFileId: string,
      newFileId: string,
      newRelativePath: string,
      newDisplayName: string
    ): Promise<void>
    // Buscar doc con fileId === oldFileId en recipeFiles subcolección
    // Actualizar: fileId, relativePath, displayName
    ```

---

## INTEGRACIÓN EN RecipeProjectPage

En el botón "Files & Folders" del header de RecipeProjectPage:
```typescript
const [fileManagerOpen, setFileManagerOpen] = useState(false)

// Botón existente en header:
<button onClick={() => setFileManagerOpen(true)}>
  Files & Folders
</button>

// Al final del JSX:
<RecipeFileManagerDialog
  isOpen={fileManagerOpen}
  onClose={() => setFileManagerOpen(false)}
  projectRootPath={project.rootPath}
  projectConfig={project.config}
  onFileRenamed={(oldPath, newPath) => {
    // calcular fileIds y llamar updateRecipeFileId
    // luego refrescar archivos con el hook useRecipeFiles
  }}
/>
```

---

## VERIFICACIÓN FINAL

Corre npm run typecheck → 0 errores.
Corre npm run dev y verificar:
□ Botón "Files & Folders" abre el dialog
□ Se listan carpetas y archivos del proyecto
□ Navegación por carpetas funciona con breadcrumb
□ Crear carpeta nueva funciona
□ Crear archivo desde template funciona
□ Renombrar archivo .xlsx actualiza el tracker en Firestore
□ Eliminar archivo pide confirmación y no permite borrar archivos bloqueados
□ "Open in Explorer" abre el explorador nativo en la carpeta correcta

Commit:
"feat: recipe file manager dialog - full project file explorer

- Browse, navigate, create, rename, delete files and folders
- Inline rename with Excel lock detection
- Delete protection for locked recipe files
- New recipe file from template
- Firestore tracker sync on file rename
- Open in native Explorer/Finder

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
