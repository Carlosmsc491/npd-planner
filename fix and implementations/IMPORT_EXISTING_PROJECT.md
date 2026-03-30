# NPD Planner — Split Button: New Project + Import Existing
# Para: Claude Code o Kimi
# Lee KIMI_READ_FIRST.md antes de empezar

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT — New Project split button + Import Existing Project
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lee KIMI_READ_FIRST.md antes de empezar.

ARCHIVOS A LEER PRIMERO:
- src/renderer/src/components/recipes/RecipeHomePage.tsx
- src/renderer/src/lib/recipeFirestore.ts
- src/renderer/src/main/ipc/recipeIpcHandlers.ts
- src/preload/index.ts y index.d.ts
- src/renderer/src/types/index.ts (RecipeProject, RecipeProjectConfig)

OBJETIVO: Reemplazar el botón "+ New Project" por un botón split que
muestra un dropdown con dos opciones:
1. "New Project" → abre el wizard existente (sin cambios)
2. "Import Existing Project" → selecciona carpeta, valida que exista
   _project/, carga la config y registra en Firestore

---

## PARTE 1 — Split Button UI

### RecipeHomePage.tsx — reemplazar el botón actual

ANTES:
```tsx
<button onClick={() => navigate('/recipes/new')} className="...verde...">
  + New Project
</button>
```

DESPUÉS — split button con dropdown:
```tsx
<div className="relative" ref={dropdownRef}>
  <div className="flex items-center">
    {/* Botón principal */}
    <button
      onClick={() => navigate('/recipes/new')}
      className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600
                 text-white text-sm font-medium rounded-l-lg transition-colors"
    >
      + New Project
    </button>
    {/* Divisor vertical */}
    <div className="w-px h-full bg-green-400" style={{ minHeight: '36px' }}/>
    {/* Flecha dropdown */}
    <button
      onClick={() => setDropdownOpen(prev => !prev)}
      className="flex items-center px-2 py-2 bg-green-500 hover:bg-green-600
                 text-white rounded-r-lg transition-colors"
    >
      <ChevronDown size={16} />
    </button>
  </div>

  {/* Dropdown menu */}
  {dropdownOpen && (
    <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-gray-800
                    border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg
                    z-50 overflow-hidden">
      <button
        onClick={() => { navigate('/recipes/new'); setDropdownOpen(false) }}
        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left
                   hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      >
        <FolderPlus size={16} className="text-green-500" />
        <div>
          <div className="font-medium text-gray-900 dark:text-white">New Project</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Create from scratch with wizard
          </div>
        </div>
      </button>
      <div className="border-t border-gray-100 dark:border-gray-700"/>
      <button
        onClick={() => { handleImportExisting(); setDropdownOpen(false) }}
        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left
                   hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      >
        <FolderOpen size={16} className="text-blue-500" />
        <div>
          <div className="font-medium text-gray-900 dark:text-white">
            Import Existing Project
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Load a folder with _project/ config
          </div>
        </div>
      </button>
    </div>
  )}
</div>
```

Estado y cierre al hacer click fuera:
```typescript
const [dropdownOpen, setDropdownOpen] = useState(false)
const dropdownRef = useRef<HTMLDivElement>(null)

useEffect(() => {
  const handleClickOutside = (e: MouseEvent) => {
    if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
      setDropdownOpen(false)
    }
  }
  document.addEventListener('mousedown', handleClickOutside)
  return () => document.removeEventListener('mousedown', handleClickOutside)
}, [])
```

Imports necesarios:
```typescript
import { ChevronDown, FolderPlus, FolderOpen } from 'lucide-react'
```

---

## PARTE 2 — IPC Handler: recipe:validateProjectFolder

### recipeIpcHandlers.ts — nuevo handler

```typescript
ipcMain.handle(
  'recipe:validateProjectFolder',
  async (_, folderPath: string): Promise<{
    valid: boolean
    config?: {
      projectName: string
      createdAt: string
      customerDefault: string
      holidayDefault: string
      wetPackDefault: boolean
      distributionDefault: Record<string, number>
      templatePath: string
      notes: string
    }
    error?: string
  }> => {
    try {
      // 1. Verificar que la carpeta existe
      if (!fs.existsSync(folderPath)) {
        return { valid: false, error: 'Folder not found' }
      }

      // 2. Verificar que existe _project/
      const projectDir = path.join(folderPath, '_project')
      if (!fs.existsSync(projectDir)) {
        return {
          valid: false,
          error: 'No _project/ folder found. This does not appear to be an NPD project.'
        }
      }

      // 3. Leer project_config.json
      const configPath = path.join(projectDir, 'project_config.json')
      if (!fs.existsSync(configPath)) {
        return {
          valid: false,
          error: '_project/ folder found but missing project_config.json'
        }
      }

      const raw = fs.readFileSync(configPath, 'utf-8')
      const config = JSON.parse(raw)

      return {
        valid: true,
        config: {
          projectName: config.project_name ?? config.projectName ?? path.basename(folderPath),
          createdAt: config.created_at ?? config.createdAt ?? new Date().toISOString(),
          customerDefault: config.customer_default ?? config.customerDefault ?? 'OPEN DESIGN',
          holidayDefault: config.holiday_default ?? config.holidayDefault ?? 'EVERYDAY',
          wetPackDefault: config.wet_pack_default ?? config.wetPackDefault ?? false,
          distributionDefault: config.distribution_default ?? config.distributionDefault ?? {},
          templatePath: config.template_path ?? config.templatePath ?? '',
          notes: config.notes ?? '',
        }
      }
    } catch (err) {
      return { valid: false, error: `Failed to read project: ${String(err)}` }
    }
  }
)
```

Exponer en preload/index.ts:
```typescript
recipeValidateProjectFolder: (folderPath) =>
  ipcRenderer.invoke('recipe:validateProjectFolder', folderPath),
```

Agregar al preload/index.d.ts:
```typescript
recipeValidateProjectFolder: (folderPath: string) => Promise<{
  valid: boolean
  config?: {
    projectName: string
    createdAt: string
    customerDefault: string
    holidayDefault: string
    wetPackDefault: boolean
    distributionDefault: Record<string, number>
    templatePath: string
    notes: string
  }
  error?: string
}>
```

---

## PARTE 3 — handleImportExisting en RecipeHomePage.tsx

```typescript
const [importing, setImporting] = useState(false)
const [importError, setImportError] = useState<string | null>(null)

const handleImportExisting = async () => {
  // 1. Abrir file picker para seleccionar carpeta
  const folderPath = await window.electronAPI.selectFolder()
  if (!folderPath) return

  setImporting(true)
  setImportError(null)

  try {
    // 2. Validar que tiene _project/ y project_config.json
    const result = await window.electronAPI.recipeValidateProjectFolder(folderPath)

    if (!result.valid || !result.config) {
      setImportError(result.error ?? 'Invalid project folder')
      setImporting(false)
      return
    }

    const cfg = result.config

    // 3. Verificar que no está ya importado (mismo rootPath)
    const existing = projects.find(p => p.rootPath === folderPath)
    if (existing) {
      setImportError('This project is already imported.')
      setImporting(false)
      return
    }

    // 4. Registrar en Firestore
    const projectData: Omit<RecipeProject, 'id' | 'createdAt'> = {
      name: cfg.projectName,
      rootPath: folderPath,
      status: 'active',
      createdBy: currentUser?.uid ?? '',
      config: {
        customerDefault: cfg.customerDefault,
        holidayDefault: cfg.holidayDefault,
        wetPackDefault: cfg.wetPackDefault,
        wetPackFalseValue: 'N',
        distributionDefault: {
          miami:       cfg.distributionDefault['miami'] ?? 0,
          newJersey:   cfg.distributionDefault['new_jersey'] ?? cfg.distributionDefault['newJersey'] ?? 0,
          california:  cfg.distributionDefault['california'] ?? 0,
          chicago:     cfg.distributionDefault['chicago'] ?? 0,
          seattle:     cfg.distributionDefault['seattle'] ?? 0,
          texas:       cfg.distributionDefault['texas'] ?? 0,
        },
        templatePath: cfg.templatePath,
        sourceMode: 'import',
        notes: cfg.notes,
        dueDate: null,
      }
    }

    const newId = await recipeRepository.createRecipeProject(projectData)

    // 5. Navegar al proyecto importado
    navigate(`/recipes/${newId}`)

  } catch (err) {
    setImportError(`Import failed: ${String(err)}`)
  } finally {
    setImporting(false)
  }
}
```

Mostrar el error de importación si existe:
```tsx
{importError && (
  <div className="flex items-center gap-2 mt-2 px-4 py-2 bg-red-50 dark:bg-red-900/20
                  border border-red-200 dark:border-red-800 rounded-lg text-sm
                  text-red-700 dark:text-red-300">
    <span>{importError}</span>
    <button onClick={() => setImportError(null)} className="ml-auto">✕</button>
  </div>
)}

{importing && (
  <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
    Importing project...
  </div>
)}
```

---

## CHECKLIST DE VERIFICACIÓN

- [ ] npm run typecheck → 0 errores
- [ ] npm run dev → app abre sin errores
- [ ] Botón "+ New Project" tiene flecha ▼ al lado derecho
- [ ] Click en "+ New Project" (parte izquierda) → abre wizard como antes
- [ ] Click en ▼ → dropdown con 2 opciones
- [ ] "Import Existing Project" → abre file picker de carpetas
- [ ] Seleccionar carpeta SIN _project/ → error "No _project/ folder found"
- [ ] Seleccionar carpeta CON _project/ y project_config.json → proyecto aparece en la lista
- [ ] Proyecto importado ya existente → error "This project is already imported"
- [ ] Click fuera del dropdown → se cierra
- [ ] git add solo archivos modificados
- [ ] git commit con mensaje descriptivo

Commit:
"feat: split button New Project + Import Existing Project

- Split button with dropdown: New Project (wizard) + Import Existing
- Import validates _project/ folder and project_config.json exist
- Reads config from EliteQuote-compatible project_config.json format
- Registers imported project in Firestore and navigates to it
- Duplicate detection prevents importing same folder twice
- Error states with dismissible inline messages

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
