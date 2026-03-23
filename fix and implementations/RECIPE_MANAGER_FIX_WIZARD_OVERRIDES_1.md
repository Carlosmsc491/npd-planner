# NPD Planner — Fix: Recipe Override Fields en WizardStepStructure
# Correr DESPUÉS de que el Prompt 2 esté completado
# Solo corrige el editor de recetas en el Step 3 del wizard

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX — Recipe Override Fields en WizardStepStructure
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lee CLAUDE.md antes de empezar.

OBJETIVO: En WizardStepStructure.tsx, el editor de cada receta individual
debe mostrar TODOS los campos con los valores del Step 2 (Rules) pre-cargados,
pero permitir sobreescribirlos por receta. Si el usuario cambia un campo,
ese override queda guardado en esa receta. Si no lo toca, hereda el default.

NO modificar WizardStepBasics.tsx ni WizardStepRules.tsx.
NO modificar ningún otro archivo fuera del wizard.

---

## COMPORTAMIENTO ESPERADO

Step 2 (Rules) define para el proyecto:
  customerDefault = "WALMART"
  holidayDefault  = "VALENTINE'S DAY"
  wetPackDefault  = false
  distributionDefault = { miami: 50, newJersey: 50, ... }

Step 3 (Structure) — cada receta abre con esos valores pre-cargados:
  customer  = "WALMART"       ← viene de Rules, editable
  holiday   = "VALENTINE'S DAY" ← viene de Rules, editable
  wetPack   = "N"             ← viene de Rules, editable
  distribution = { miami: 50, newJersey: 50, ... } ← viene de Rules, editable

Si el usuario cambia el customer de esa receta a "OPEN DESIGN":
  → esa receta guarda customerOverride = "OPEN DESIGN"
  → las otras recetas siguen con "WALMART"

---

## CAMBIOS EN WizardStepStructure.tsx

### 1. Props — asegurarse que recibe los defaults del Step 2

WizardStepStructure ya recibe `wizardData` que contiene los valores de Rules.
Verificar que se usa:
```typescript
const {
  customerDefault,
  holidayDefault,
  wetPackDefault,
  distributionDefault,
} = wizardData   // viene del wizard padre
```

### 2. Estado inicial de cada receta

Cuando el usuario hace "+ Add Recipe", inicializar la receta con los defaults:
```typescript
const newRecipe: RecipeSpec = {
  recipeId: crypto.randomUUID(),
  relativePath: '',
  displayName: '',
  price: '',
  option: '',
  name: '',
  holidayOverride: wizardData.holidayDefault,       // pre-cargado
  customerOverride: wizardData.customerDefault,     // pre-cargado
  wetPackOverride: wizardData.wetPackDefault ? 'Y' : 'N',  // pre-cargado
  distributionOverride: { ...wizardData.distributionDefault }, // copia, no referencia
  requiresManualUpdate: false,
}
```

### 3. Editor expandible por receta

Cada receta en la lista tiene dos estados: colapsado y expandido.

**Colapsado (default):** muestra solo una fila con:
- Preview del nombre normalizado: "$12.99 A VALENTINE"
- Badges pequeños si tiene overrides diferentes al default del proyecto:
  badge azul "Custom customer", badge verde "Custom holiday", etc.
- Botón "Edit" (chevron) para expandir
- Botón X para eliminar la receta

**Expandido:** muestra el formulario completo debajo de la fila:

```
┌─────────────────────────────────────────────────────┐
│ Campos básicos (siempre visibles):                  │
│  Price:   [input $]    Option: [A/B/C/—]           │
│  Name:    [input texto]                             │
│  Preview: "$12.99 A VALENTINE"                     │
│                                                     │
│ Overrides (colapsados en sección "Override Rules"): │
│  Customer:     [select — muestra default si no tocado] │
│  Holiday:      [select — muestra default si no tocado] │
│  Wet Pack:     [toggle Y/N — muestra default]      │
│  Distribution: [6 inputs — muestran defaults]      │
└─────────────────────────────────────────────────────┘
```

### 4. Sección de overrides

Dentro del editor expandido, la sección de overrides debe:

- Tener un header "Override Project Rules" con un chevron para colapsar/expandir
  (colapsada por default para no abrumar al usuario)
- Mostrar un indicador visual si algún campo fue modificado:
  texto gris pequeño "(overriding project default)" al lado del campo cambiado

**Customer select:**
```typescript
<select
  value={recipe.customerOverride}
  onChange={(e) => updateRecipe(recipe.recipeId, { customerOverride: e.target.value })}
>
  {RECIPE_CUSTOMER_OPTIONS.map(opt => (
    <option key={opt} value={opt}>
      {opt}{opt === wizardData.customerDefault ? ' (project default)' : ''}
    </option>
  ))}
</select>
```

**Holiday select:** igual, con RECIPE_HOLIDAY_OPTIONS

**Wet Pack toggle:**
```typescript
// Toggle Y/N
// Label: si wetPackOverride === (wetPackDefault ? 'Y' : 'N') → "(project default)"
```

**Distribution:**
- Reutilizar DistributionEditor (ya creado en Prompt 2)
- Pasar distributionDefault como prop para mostrar "(default)" en los inputs
- Si el usuario cambia un DC: actualizar distributionOverride de esa receta
- Mostrar suma total, validar ≤ 100%

### 5. Función updateRecipe

```typescript
const updateRecipe = (
  recipeId: string,
  updates: Partial<RecipeSpec>
) => {
  setFolders(prev => prev.map(folder => ({
    ...folder,
    recipes: folder.recipes.map(r =>
      r.recipeId === recipeId ? { ...r, ...updates } : r
    )
  })))
}
```

### 6. Preview del nombre normalizado

Ya existe normalizeRecipeName — asegurarse que se llama con los 3 campos:
```typescript
const preview = normalizeRecipeName(recipe.price, recipe.option, recipe.name)
// Mostrar en tiempo real debajo de los inputs básicos
// Si algún campo está vacío: mostrar placeholder gris "e.g. $12.99 A VALENTINE"
```

### 7. Indicador de overrides en modo colapsado

Cuando la receta está colapsada, mostrar badges pequeños si difiere del default:
```typescript
const hasCustomerOverride = recipe.customerOverride !== wizardData.customerDefault
const hasHolidayOverride  = recipe.holidayOverride  !== wizardData.holidayDefault
const hasWetPackOverride  = recipe.wetPackOverride  !== (wizardData.wetPackDefault ? 'Y' : 'N')
const hasDistribOverride  = JSON.stringify(recipe.distributionOverride)
                         !== JSON.stringify(wizardData.distributionDefault)
```

Mostrar badges solo cuando hay override real, no siempre.

---

## VERIFICACIÓN

Corre npm run typecheck → 0 errores.
Corre npm run dev y verificar en el wizard:
□ Step 3 abre con cada receta heredando los valores de Step 2
□ Al expandir una receta se ven todos los campos con los defaults pre-cargados
□ Cambiar customer en una receta no afecta las demás
□ La sección "Override Project Rules" está colapsada por default
□ El preview del nombre se actualiza en tiempo real
□ Los badges de override aparecen en modo colapsado cuando hay cambios
□ Al llegar a Finish, cada RecipeSpec tiene sus overrides guardados correctamente

Commit:
"fix: recipe wizard step 3 - full override fields per recipe

- Each recipe pre-loads defaults from Step 2 (Rules)
- Customer, holiday, wet pack, distribution overridable per recipe
- Override section collapsed by default, expandable
- Visual indicators when recipe differs from project defaults
- Preview updates in real time

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
