# NPD Planner — Unified Settings Page
# Para: Claude Code en terminal
# Lee CLAUDE.md antes de empezar

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT — Settings unificado: Planner + Recipe Manager
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lee CLAUDE.md completamente antes de empezar.

ARCHIVOS A LEER PRIMERO:
- src/renderer/src/components/settings/ (todos los archivos existentes)
- src/renderer/src/components/recipes/settings/RecipeSettingsTab.tsx
- src/renderer/src/pages/SettingsPage.tsx (o donde estén los tabs actuales)
- src/renderer/src/types/index.ts

OBJETIVO: El app es una plataforma centralizada de Elite Flower con dos
módulos principales: Planner y Recipe Manager. Ambos deben tener sus
settings en UNA sola página /settings, organizados en secciones claramente
separadas — no mezclados, pero juntos.

NO tocar la lógica de ningún setting existente — solo reorganizar la UI.

---

## ESTRUCTURA DE TABS NUEVA

La página /settings debe tener esta organización de tabs:

### SECCIÓN — GENERAL (aplica a toda la app)
- Profile          → datos del usuario (ya existe)
- Members          → gestión del equipo (ya existe)  
- Appearance       → dark/light mode (ya existe)
- Notifications    → DND, desktop alerts (ya existe)
- Keyboard         → shortcuts (ya existe)

### SECCIÓN — PLANNER (módulo de tareas)
- Boards           → gestión de boards (ya existe)
- Clients          → clientes (ya existe)
- Labels           → etiquetas (ya existe)
- Files            → SharePoint path (ya existe)
- Traze            → integración Traze AWB (ya existe)
- Archive          → archivado de tareas (ya existe)

### SECCIÓN — RECIPE MANAGER (módulo NPD)
- Rule Cells       → celdas Excel configurables
- Holiday Map      → mapeo de keywords a holidays
- Sleeve Pricing   → precios de sleeve por precio/stems
- General          → lock timeout, distribution defaults

---

## IMPLEMENTACIÓN

### 1. SettingsPage.tsx — nueva estructura de tabs con secciones

Reemplazar la lista plana de tabs por tabs agrupados con headers de sección:

```tsx
// Estructura visual:
//
// ┌─────────────────────────────────────────────────┐
// │  Settings                                        │
// ├──────────────┬──────────────────────────────────┤
// │              │                                  │
// │  GENERAL     │   [contenido del tab activo]     │
// │  · Profile   │                                  │
// │  · Members   │                                  │
// │  · Appear.   │                                  │
// │  · Notif.    │                                  │
// │  · Keyboard  │                                  │
// │              │                                  │
// │  PLANNER     │                                  │
// │  · Boards    │                                  │
// │  · Clients   │                                  │
// │  · Labels    │                                  │
// │  · Files     │                                  │
// │  · Traze     │                                  │
// │  · Archive   │                                  │
// │              │                                  │
// │  RECIPE MGR  │                                  │
// │  · Rule Cells│                                  │
// │  · Holidays  │                                  │
// │  · Sleeve    │                                  │
// │  · General   │                                  │
// └──────────────┴──────────────────────────────────┘

const SETTINGS_SECTIONS = [
  {
    label: 'General',
    tabs: [
      { id: 'profile',       label: 'Profile',       icon: 'User' },
      { id: 'members',       label: 'Members',       icon: 'Users' },
      { id: 'appearance',    label: 'Appearance',    icon: 'Palette' },
      { id: 'notifications', label: 'Notifications', icon: 'Bell' },
      { id: 'keyboard',      label: 'Keyboard',      icon: 'Keyboard' },
    ]
  },
  {
    label: 'Planner',
    tabs: [
      { id: 'boards',   label: 'Boards',   icon: 'Layout' },
      { id: 'clients',  label: 'Clients',  icon: 'Building2' },
      { id: 'labels',   label: 'Labels',   icon: 'Tag' },
      { id: 'files',    label: 'Files',    icon: 'FolderOpen' },
      { id: 'traze',    label: 'Traze',    icon: 'Truck' },
      { id: 'archive',  label: 'Archive',  icon: 'Archive' },
    ]
  },
  {
    label: 'Recipe Manager',
    tabs: [
      { id: 'recipe-cells',    label: 'Rule Cells',    icon: 'Grid' },
      { id: 'recipe-holidays', label: 'Holidays',      icon: 'Calendar' },
      { id: 'recipe-sleeve',   label: 'Sleeve Pricing',icon: 'DollarSign' },
      { id: 'recipe-general',  label: 'General',       icon: 'Settings2' },
    ]
  },
]
```

### 2. Sidebar de tabs con secciones

Reemplazar los tabs horizontales actuales por una sidebar vertical izquierda
con headers de sección. Usar el mismo estilo visual del sidebar principal del app.

```tsx
// Sidebar izquierda de settings:
<div className="w-52 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 pr-2">
  {SETTINGS_SECTIONS.map(section => (
    <div key={section.label} className="mb-4">
      {/* Section header */}
      <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider
                      text-gray-400 dark:text-gray-500 mb-1">
        {section.label}
      </div>
      {/* Tabs */}
      {section.tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm
                      text-left transition-colors mb-0.5 ${
            activeTab === tab.id
              ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white font-medium'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
          }`}
        >
          {/* Lucide icon by name */}
          <span className="w-4 h-4 flex-shrink-0">{/* icon */}</span>
          {tab.label}
        </button>
      ))}
    </div>
  ))}
</div>
```

### 3. Área de contenido derecha

El área derecha renderiza el componente del tab activo.
Para los tabs de Recipe Manager, renderizar RecipeSettingsTab con la
sub-sección correspondiente:

```tsx
// En el switch de contenido:
case 'recipe-cells':
  return <RecipeSettingsTab section="cells" />
case 'recipe-holidays':
  return <RecipeSettingsTab section="holidays" />
case 'recipe-sleeve':
  return <RecipeSettingsTab section="sleeve" />
case 'recipe-general':
  return <RecipeSettingsTab section="general" />
```

Si RecipeSettingsTab no acepta prop `section` todavía, agregar esa prop
y mostrar la sub-sección correspondiente internamente.

### 4. URL param para deep-link (opcional pero útil)

Permitir navegar directamente a un tab:
```
/settings?tab=recipe-cells
/settings?tab=members
```

Usar `useSearchParams` de react-router-dom para leer/escribir el tab activo.
Así cuando desde RecipeProjectPage se hace clic en "Settings", puede abrir
directamente en el tab correcto.

### 5. Header de la página

Actualizar el header para reflejar la sección activa:

```tsx
// En lugar de solo "Settings", mostrar:
// "Settings  ›  Planner  ›  Boards"
// "Settings  ›  Recipe Manager  ›  Rule Cells"

const activeSection = SETTINGS_SECTIONS.find(s =>
  s.tabs.some(t => t.id === activeTab)
)
const activeTabLabel = activeSection?.tabs.find(t => t.id === activeTab)?.label

// Breadcrumb:
// Settings › {activeSection.label} › {activeTabLabel}
```

---

## LO QUE NO DEBES TOCAR

- La lógica interna de cada tab existente (MembersPanel, LabelManager, etc.)
- RecipeSettingsTab.tsx — solo envuélvelo, no lo modifiques
- firestore.ts, recipeFirestore.ts — sin cambios
- Ningún hook ni store — sin cambios
- El sidebar principal del app (AppLayout.tsx) — sin cambios

---

## CHECKLIST DE VERIFICACIÓN

- [ ] npm run typecheck → 0 errores
- [ ] npm run dev → app abre sin errores
- [ ] /settings muestra sidebar izquierda con 3 secciones: General, Planner, Recipe Manager
- [ ] Todos los tabs existentes de Planner siguen funcionando exactamente igual
- [ ] Los 4 tabs de Recipe Manager muestran el contenido correcto
- [ ] Tab activo tiene highlight visual claro
- [ ] Las 3 secciones tienen headers separadores visibles
- [ ] En mobile/ventana pequeña: layout no se rompe
- [ ] git add solo los archivos modificados
- [ ] git commit con mensaje descriptivo

Commit:
"feat: unified settings page with Planner and Recipe Manager sections

- Settings sidebar split into General / Planner / Recipe Manager
- All existing Planner tabs preserved, no logic changes
- Recipe Manager settings integrated (Rule Cells, Holidays, Sleeve, General)
- Section headers clearly separate the two modules
- Deep-link support via ?tab= URL param
- Breadcrumb header shows active section

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
