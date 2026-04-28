# SPEC: Calendar Timezone Fix + Multi-Date Tags en Tasks

## Contexto

Dos mejoras relacionadas al sistema de fechas en NPD Planner:

1. **Bug crítico**: Las fechas en el calendario aparecen un día antes de lo correcto (timezone UTC vs local).
2. **Feature**: Soporte para múltiples fechas tipadas por task (Preparation, Ship date, Set up, Show day), visibles en el task panel y en el calendario como eventos independientes con colores e iconos distintos.

---

## Parte 1 — Timezone Fix

### Problema

FullCalendar recibe objetos `Date` del método `.toDate()` de Firestore `Timestamp`. Cuando la fecha se guardó en UTC (ej. `2025-01-28T00:00:00.000Z`) y el usuario está en Miami (UTC-5), `.toDate()` retorna `2025-01-27T19:00:00 local`. FullCalendar interpreta ese Date y coloca el evento en el día 27.

### Solución

Convertir siempre la fecha a string `YYYY-MM-DD` local antes de pasarla a FullCalendar. Así FullCalendar la trata como all-day date sin conversión de timezone.

### Helper function (agregar en `src/renderer/src/utils/dateUtils.ts`)

```ts
/**
 * Converts a Date to a local YYYY-MM-DD string for FullCalendar all-day events.
 * Avoids UTC timezone drift when displaying dates.
 */
export function toLocalDateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
```

### Archivos afectados

- `src/renderer/src/components/board/BoardCalendar.tsx`
- `src/renderer/src/pages/CalendarPage.tsx`
- `src/renderer/src/components/myspace/PersonalCalendar.tsx`
- `src/renderer/src/utils/dateUtils.ts` (nuevo helper)

En cada uno, cambiar la construcción del evento:

```ts
// ANTES (bug)
start: t.dateStart.toDate()
end: t.dateEnd?.toDate()

// DESPUÉS (fix)
start: toLocalDateString(t.dateStart.toDate())
end: t.dateEnd ? toLocalDateString(t.dateEnd.toDate()) : undefined
```

---

## Parte 2 — Task Date Tags

### Concepto

Cada task puede tener un array de fechas tipadas llamado `taskDates`. Cada entrada tiene:
- `type`: clave que referencia un `DateType` global (configurable en Settings)
- `dateStart`: Timestamp (requerido)
- `dateEnd`: Timestamp | null (opcional — si existe, es un rango)

Los `DateType` globales se guardan en una colección Firestore `dateTypes` y son configurables por admin/owner en Settings → Date Types.

### Tipos de fecha default (seeding inicial)

| key | label | icon (Lucide) | color |
|-----|-------|---------------|-------|
| `preparation` | Preparation | `Hammer` | `#639922` (green) |
| `ship` | Ship date | `Truck` | `#185FA5` (blue) |
| `set_up` | Set up | `Wrench` | `#534AB7` (purple) |
| `show_day` | Show day | `Star` | `#BA7517` (amber) |

### Schema Firestore

#### Colección `dateTypes` (global, una vez)

```
dateTypes/{id}
  key: string          // ej. "ship", "show_day"
  label: string        // ej. "Ship date"
  icon: string         // nombre de ícono Lucide
  color: string        // hex color
  order: number        // para ordenar en UI
  createdAt: Timestamp
```

#### Campo nuevo en `tasks`

```ts
taskDates?: TaskDate[]

interface TaskDate {
  id: string           // nanoid() generado en cliente
  typeKey: string      // referencia a dateTypes[].key
  dateStart: Timestamp
  dateEnd: Timestamp | null
}
```

---

## Parte 3 — UI: Task Panel

En `TaskPage.tsx`, dentro de la sección de fechas existente (donde están `dateStart` / `dateEnd`), agregar una sección **"Event Dates"** que muestre y permita editar `taskDates`.

### Comportamiento

- Lista las `taskDates` existentes, cada una con ícono + label del tipo, fecha(s) y botón de eliminar.
- Si `dateEnd` es null → muestra solo `dateStart` como fecha única.
- Si `dateEnd` existe → muestra rango con línea entre ambas fechas: `Jan 6 ——— Jan 20`.
- Botón "+ Add date" abre un inline form con:
  - Dropdown de tipo (lista los `DateType` activos)
  - Date picker para `dateStart`
  - Date picker opcional para `dateEnd` (toggle "Add end date")
- Guardar actualiza `taskDates` array en Firestore con `updateTaskField`.

---

## Parte 4 — UI: Calendario

### Generación de eventos

Además de los eventos existentes (del `dateStart`/`dateEnd` del task), se generan eventos adicionales por cada entrada en `taskDates`.

```ts
// Para cada taskDate en task.taskDates
{
  id: `${task.id}-taskdate-${td.id}`,
  title: task.title,
  start: toLocalDateString(td.dateStart.toDate()),
  end: td.dateEnd ? toLocalDateString(td.dateEnd.toDate()) : undefined,
  allDay: true,
  backgroundColor: dateType.color + 'CC',   // ligero alpha
  borderColor: dateType.color,
  textColor: '#ffffff',
  extendedProps: {
    task,
    dateTypeKey: td.typeKey,
    dateTypeIcon: dateType.icon,
    isTaskDate: true,
  }
}
```

### Event content render

En el `eventContent` de FullCalendar, si `extendedProps.isTaskDate === true`, renderizar con el ícono Lucide del tipo antes del título.

### Título en semanas subsecuentes

FullCalendar con `dayGridMonth` ya soporta `eventContent` con título repetido cuando el evento cruza semanas — no requiere lógica extra. Asegurarse de que `title` esté siempre presente en el objeto evento.

### Evento de un solo día sin rango

Si `dateEnd` es null, el evento aparece como badge de un día con el ícono, sin barra de rango.

---

## Parte 5 — Settings: Date Types Manager

Nueva tab en Settings (`dateTypes`) visible solo para admin/owner.

### Componente: `DateTypeManager`

- Lista los DateTypes existentes ordenados por `order`.
- Cada fila: ícono preview + label + color swatch + botones Edit/Delete.
- Inline edit: campo de texto para label, color picker (simple input type=color), selector de ícono Lucide (subset de ~20 íconos relevantes).
- Botón "+ Add date type" al final.
- No se puede eliminar un DateType si algún task lo usa (validar antes de delete).
- Al crear, hacer seed de los 4 defaults si la colección está vacía.

### Seed en Firestore

Crear función `seedDefaultDateTypes()` en `firestore.ts`. Llamar una sola vez al inicio si `dateTypes` collection está vacía. Usar `getDocs` para verificar antes de hacer batch write.

---

## Notas de implementación

- Los `DateType` se deben cachear en Zustand (nuevo store `dateTypeStore` o extender `boardStore`).
- Suscripción en tiempo real: `subscribeToDateTypes` en `firestore.ts`.
- Inicializar la suscripción en `AppLayout.tsx` (igual que `useClients()` y `useLabels()`).
- El campo `taskDates` es opcional en el tipo `Task` — backward compatible.
- `updateTaskField` ya maneja arrays — usar con field `'taskDates'` y el array completo actualizado.

---

## Archivos a crear/modificar

| Archivo | Acción |
|---------|--------|
| `src/renderer/src/utils/dateUtils.ts` | Agregar `toLocalDateString()` |
| `src/renderer/src/types/index.ts` | Agregar `TaskDate`, `DateType` interfaces |
| `src/renderer/src/lib/firestore.ts` | Agregar `subscribeToDateTypes`, `createDateType`, `updateDateType`, `deleteDateType`, `seedDefaultDateTypes` |
| `src/renderer/src/store/dateTypeStore.ts` | Nuevo Zustand store |
| `src/renderer/src/components/board/BoardCalendar.tsx` | Fix timezone + render taskDates events |
| `src/renderer/src/pages/CalendarPage.tsx` | Fix timezone + render taskDates events |
| `src/renderer/src/components/myspace/PersonalCalendar.tsx` | Fix timezone |
| `src/renderer/src/components/task/TaskPage.tsx` | Sección Event Dates |
| `src/renderer/src/components/settings/DateTypeManager.tsx` | Nuevo componente |
| `src/renderer/src/pages/SettingsPage.tsx` | Agregar tab "Date Types" (adminOnly) |
| `src/renderer/src/components/ui/AppLayout.tsx` | Inicializar suscripción dateTypes |
| `CLAUDE.md` | Marcar feature completa |
| `DOCUMENTACION_TECNICA_NPD_PLANNER.md` | Actualizar sección de tipos/fechas |

---

---

# PROMPTS PARA CLAUDE CODE

---

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## PROMPT 1 — Timezone Fix (Calendar date off-by-one)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lee los siguientes archivos completos antes de empezar:
- `CLAUDE.md`
- `src/renderer/src/utils/dateUtils.ts`
- `src/renderer/src/components/board/BoardCalendar.tsx`
- `src/renderer/src/pages/CalendarPage.tsx`
- `src/renderer/src/components/myspace/PersonalCalendar.tsx`

### Problema

Las fechas en el calendario se muestran un día antes del correcto. Causa: `.toDate()` en Firestore Timestamp retorna un objeto Date en UTC, que al ser interpretado en timezone local (ej. UTC-5) produce el día anterior.

### Tarea

**1. En `src/renderer/src/utils/dateUtils.ts`** — agregar esta función:

```ts
/**
 * Converts a Date to a local YYYY-MM-DD string for FullCalendar all-day events.
 * Prevents UTC timezone drift. Always use this instead of .toDate() for allDay events.
 */
export function toLocalDateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
```

**2. En `src/renderer/src/components/board/BoardCalendar.tsx`** — importar `toLocalDateString` y en la función que construye el array de eventos, cambiar:

```ts
// ANTES
start: (t.dateStart ?? t.dateEnd)!.toDate(),
end: t.dateEnd?.toDate(),

// DESPUÉS
start: toLocalDateString((t.dateStart ?? t.dateEnd)!.toDate()),
end: t.dateEnd ? toLocalDateString(t.dateEnd.toDate()) : undefined,
```

**3. En `src/renderer/src/pages/CalendarPage.tsx`** — misma corrección en la función que construye eventos del master calendar:

```ts
// ANTES
const start = (t.dateStart ?? t.dateEnd)!.toDate()
const end = t.dateEnd ? t.dateEnd.toDate() : undefined

// DESPUÉS
const start = toLocalDateString((t.dateStart ?? t.dateEnd)!.toDate())
const end = t.dateEnd ? toLocalDateString(t.dateEnd.toDate()) : undefined
```

**4. En `src/renderer/src/components/myspace/PersonalCalendar.tsx`** — misma corrección en ambos mapeos de eventos (boardEvents y personalEvents):

```ts
// boardEvents — ANTES
start: task.dateStart?.toDate() ?? task.dateEnd?.toDate()
end: task.dateEnd?.toDate()

// boardEvents — DESPUÉS
start: toLocalDateString((task.dateStart ?? task.dateEnd)!.toDate())
end: task.dateEnd ? toLocalDateString(task.dateEnd.toDate()) : undefined

// personalEvents — ANTES
start: dueDate

// personalEvents — DESPUÉS
start: toLocalDateString(dueDate)
```

**5. Verificar** que en los handlers `handleEventDrop` y `handleEventResize` de todos los archivos, la función `toFirestoreDate` existente se mantenga sin cambios — esa va en la dirección opuesta (Date → Timestamp) y no tiene el bug.

### Verificación

```bash
npm run typecheck
```

No debe haber errores de TypeScript. Confirmar visualmente que un task con fecha Jan 28 aparece en el día 28 del calendario.

### Commit

```
fix: correct calendar timezone drift for all-day events

Use toLocalDateString() instead of .toDate() when passing dates to
FullCalendar. Prevents UTC-to-local conversion from shifting all-day
events one day earlier in negative-offset timezones (e.g. UTC-5 Miami).

Affected: BoardCalendar, CalendarPage, PersonalCalendar
```

---

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## PROMPT 2 — Types + Firestore + Store para Date Tags
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lee los siguientes archivos completos antes de empezar:
- `CLAUDE.md`
- `src/renderer/src/types/index.ts`
- `src/renderer/src/lib/firestore.ts`
- `src/renderer/src/store/boardStore.ts` (como referencia de patrón Zustand)
- `src/renderer/src/components/ui/AppLayout.tsx`

### Tarea

**1. En `src/renderer/src/types/index.ts`** — agregar estas interfaces (antes de la interfaz `Task`):

```ts
export interface DateType {
  id: string
  key: string       // e.g. 'ship', 'show_day', 'preparation', 'set_up'
  label: string     // e.g. 'Ship date'
  icon: string      // Lucide icon name e.g. 'Truck'
  color: string     // hex e.g. '#185FA5'
  order: number
  createdAt: Timestamp
}

export interface TaskDate {
  id: string           // nanoid() — generated client-side
  typeKey: string      // references DateType.key
  dateStart: Timestamp
  dateEnd: Timestamp | null
}
```

En la interfaz `Task` existente, agregar el campo opcional:

```ts
taskDates?: TaskDate[]
```

**2. En `src/renderer/src/lib/firestore.ts`** — agregar al objeto `COLLECTIONS`:

```ts
DATE_TYPES: 'dateTypes',
```

Luego agregar estas funciones al final del archivo:

```ts
// ─── DATE TYPES ───────────────────────────────────────────────

const DEFAULT_DATE_TYPES: Omit<DateType, 'id' | 'createdAt'>[] = [
  { key: 'preparation', label: 'Preparation', icon: 'Hammer',  color: '#639922', order: 0 },
  { key: 'ship',        label: 'Ship date',   icon: 'Truck',   color: '#185FA5', order: 1 },
  { key: 'set_up',      label: 'Set up',      icon: 'Wrench',  color: '#534AB7', order: 2 },
  { key: 'show_day',    label: 'Show day',    icon: 'Star',    color: '#BA7517', order: 3 },
]

export async function seedDefaultDateTypes(): Promise<void> {
  const col = collection(db, COLLECTIONS.DATE_TYPES)
  const snap = await getDocs(col)
  if (!snap.empty) return   // already seeded
  const batch = writeBatch(db)
  for (const dt of DEFAULT_DATE_TYPES) {
    const ref = doc(col)
    batch.set(ref, { ...dt, createdAt: serverTimestamp() })
  }
  await batch.commit()
}

export function subscribeToDateTypes(
  callback: (types: DateType[]) => void
): () => void {
  const col = collection(db, COLLECTIONS.DATE_TYPES)
  const q = query(col, orderBy('order', 'asc'))
  return onSnapshot(q, (snap) => {
    const types = snap.docs.map((d) => ({ id: d.id, ...d.data() } as DateType))
    callback(types)
  })
}

export async function createDateType(
  data: Omit<DateType, 'id' | 'createdAt'>
): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTIONS.DATE_TYPES), {
    ...data,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateDateType(
  id: string,
  data: Partial<Pick<DateType, 'label' | 'icon' | 'color' | 'order'>>
): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS.DATE_TYPES, id), data)
}

export async function deleteDateType(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.DATE_TYPES, id))
}
```

Asegúrate de que las importaciones de Firestore necesarias (`getDocs`, `orderBy`, `query`) estén presentes en el archivo — agrégalas si faltan.

**3. Crear `src/renderer/src/store/dateTypeStore.ts`**:

```ts
import { create } from 'zustand'
import type { DateType } from '../types'

interface DateTypeState {
  dateTypes: DateType[]
  setDateTypes: (types: DateType[]) => void
  getByKey: (key: string) => DateType | undefined
}

export const useDateTypeStore = create<DateTypeState>((set, get) => ({
  dateTypes: [],
  setDateTypes: (types) => set({ dateTypes: types }),
  getByKey: (key) => get().dateTypes.find((dt) => dt.key === key),
}))
```

**4. En `src/renderer/src/components/ui/AppLayout.tsx`** — inicializar la suscripción a dateTypes junto a las otras suscripciones existentes (donde están `useClients()`, `useLabels()`, etc.):

```ts
// Importar al inicio del archivo
import { subscribeToDateTypes, seedDefaultDateTypes } from '../../lib/firestore'
import { useDateTypeStore } from '../../store/dateTypeStore'

// Dentro del componente AppLayout, en el useEffect de inicialización:
useEffect(() => {
  seedDefaultDateTypes()   // no-op si ya existen
  const unsub = subscribeToDateTypes(useDateTypeStore.getState().setDateTypes)
  return unsub
}, [])
```

### Verificación

```bash
npm run typecheck
```

Cero errores. El store debe estar disponible para import desde cualquier componente.

### Commit

```
feat: add DateType + TaskDate types, Firestore layer, and Zustand store

- Add DateType and TaskDate interfaces to types/index.ts
- Add taskDates?: TaskDate[] optional field to Task interface
- Add dateTypes Firestore collection with CRUD + realtime subscription
- Seed 4 default date types (Preparation, Ship, Set up, Show day)
- Create useDateTypeStore Zustand store
- Initialize subscription in AppLayout alongside clients/labels
```

---

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## PROMPT 3 — Task Panel: sección Event Dates
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lee los siguientes archivos completos antes de empezar:
- `CLAUDE.md`
- `src/renderer/src/components/task/TaskPage.tsx`
- `src/renderer/src/types/index.ts`
- `src/renderer/src/store/dateTypeStore.ts`
- `src/renderer/src/lib/firestore.ts`
- `src/renderer/src/utils/dateUtils.ts`

### Tarea

Agregar una sección **"Event Dates"** en `TaskPage.tsx`, ubicada después de la sección de fechas existente (`dateStart` / `dateEnd`).

**Imports a agregar:**

```ts
import { nanoid } from 'nanoid'   // ya debe estar o instalar: npm i nanoid
import { useDateTypeStore } from '../../store/dateTypeStore'
import { toLocalDateString } from '../../utils/dateUtils'
// Íconos Lucide necesarios: Hammer, Truck, Wrench, Star, Plus, X, ChevronRight
```

**Estado local a agregar en el componente:**

```ts
const { dateTypes } = useDateTypeStore()
const [addingDate, setAddingDate] = useState(false)
const [newDateTypeKey, setNewDateTypeKey] = useState('')
const [newDateStart, setNewDateStart] = useState('')
const [newDateEnd, setNewDateEnd] = useState('')
const [hasEndDate, setHasEndDate] = useState(false)
```

**Función para obtener ícono Lucide por nombre** (agregar helper local):

```ts
import { Hammer, Truck, Wrench, Star, Calendar, type LucideIcon } from 'lucide-react'

const ICON_MAP: Record<string, LucideIcon> = {
  Hammer, Truck, Wrench, Star, Calendar,
}

function getDateTypeIcon(iconName: string): LucideIcon {
  return ICON_MAP[iconName] ?? Calendar
}
```

**Función para guardar un nuevo TaskDate:**

```ts
async function handleAddTaskDate() {
  if (!newDateTypeKey || !newDateStart) return
  const { Timestamp: Ts } = await import('firebase/firestore')

  const startDate = new Date(newDateStart + 'T12:00:00')  // noon para evitar drift
  const endDate = hasEndDate && newDateEnd
    ? new Date(newDateEnd + 'T12:00:00')
    : null

  const newEntry: TaskDate = {
    id: nanoid(),
    typeKey: newDateTypeKey,
    dateStart: Ts.fromDate(startDate),
    dateEnd: endDate ? Ts.fromDate(endDate) : null,
  }

  const updated = [...(task.taskDates ?? []), newEntry]
  await save('taskDates', updated, task.taskDates)

  // Reset form
  setAddingDate(false)
  setNewDateTypeKey('')
  setNewDateStart('')
  setNewDateEnd('')
  setHasEndDate(false)
}
```

**Función para eliminar un TaskDate:**

```ts
async function handleRemoveTaskDate(id: string) {
  const updated = (task.taskDates ?? []).filter((td) => td.id !== id)
  await save('taskDates', updated, task.taskDates)
}
```

**JSX de la sección** — agregar después del bloque de `dateStart`/`dateEnd` existente:

```tsx
{/* ── Event Dates ────────────────────────────────── */}
{dateTypes.length > 0 && (
  <div className="mt-4">
    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
      Event Dates
    </p>

    {/* Lista de taskDates existentes */}
    <div className="space-y-1.5">
      {(task.taskDates ?? []).map((td) => {
        const dt = dateTypes.find((x) => x.key === td.typeKey)
        if (!dt) return null
        const Icon = getDateTypeIcon(dt.icon)
        const startStr = toLocalDateString(td.dateStart.toDate())
        const endStr = td.dateEnd ? toLocalDateString(td.dateEnd.toDate()) : null

        return (
          <div
            key={td.id}
            className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2"
          >
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
              style={{ backgroundColor: dt.color + '20', color: dt.color }}
            >
              <Icon size={14} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{dt.label}</p>
              {endStr ? (
                <div className="flex items-center gap-1 text-xs font-medium text-gray-800 dark:text-gray-200">
                  <span>{startStr}</span>
                  <span className="text-gray-400">────</span>
                  <span>{endStr}</span>
                </div>
              ) : (
                <p className="text-xs font-medium text-gray-800 dark:text-gray-200">{startStr}</p>
              )}
            </div>
            <button
              onClick={() => handleRemoveTaskDate(td.id)}
              className="text-gray-400 hover:text-red-500 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>

    {/* Form inline para agregar */}
    {addingDate ? (
      <div className="mt-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-3 space-y-2">
        {/* Selector de tipo */}
        <select
          value={newDateTypeKey}
          onChange={(e) => setNewDateTypeKey(e.target.value)}
          className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1.5 text-xs text-gray-800 dark:text-gray-200 focus:outline-none"
        >
          <option value="">Select type...</option>
          {dateTypes.map((dt) => (
            <option key={dt.key} value={dt.key}>{dt.label}</option>
          ))}
        </select>

        {/* Start date */}
        <input
          type="date"
          value={newDateStart}
          onChange={(e) => setNewDateStart(e.target.value)}
          className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1.5 text-xs text-gray-800 dark:text-gray-200 focus:outline-none"
        />

        {/* Toggle end date */}
        <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={hasEndDate}
            onChange={(e) => setHasEndDate(e.target.checked)}
            className="rounded"
          />
          Add end date
        </label>

        {hasEndDate && (
          <input
            type="date"
            value={newDateEnd}
            min={newDateStart}
            onChange={(e) => setNewDateEnd(e.target.value)}
            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1.5 text-xs text-gray-800 dark:text-gray-200 focus:outline-none"
          />
        )}

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <button
            onClick={() => { setAddingDate(false); setNewDateTypeKey(''); setNewDateStart(''); setNewDateEnd(''); setHasEndDate(false) }}
            className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 px-2 py-1"
          >
            Cancel
          </button>
          <button
            onClick={handleAddTaskDate}
            disabled={!newDateTypeKey || !newDateStart}
            className="text-xs font-medium bg-green-600 text-white rounded-md px-3 py-1 hover:bg-green-700 disabled:opacity-40 transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    ) : (
      <button
        onClick={() => setAddingDate(true)}
        className="mt-1.5 flex w-full items-center gap-1.5 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 px-3 py-2 text-xs text-gray-500 hover:border-gray-400 dark:hover:border-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
      >
        <Plus size={12} />
        Add date
      </button>
    )}
  </div>
)}
```

### Verificación

```bash
npm run typecheck
```

Probar: abrir un task, agregar una fecha de tipo "Ship date" con fecha única, luego otra de "Preparation" con rango. Verificar que se guardan en Firestore y se muestran correctamente.

### Commit

```
feat: add Event Dates section to TaskPage

- List, add, and remove typed task dates (TaskDate[])
- Supports single-day and date-range entries
- Icon and color driven by DateType configuration
- Uses toLocalDateString to prevent timezone drift on display
```

---

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## PROMPT 4 — Calendario: render de taskDates como eventos
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lee los siguientes archivos completos antes de empezar:
- `CLAUDE.md`
- `src/renderer/src/components/board/BoardCalendar.tsx`
- `src/renderer/src/pages/CalendarPage.tsx`
- `src/renderer/src/store/dateTypeStore.ts`
- `src/renderer/src/utils/dateUtils.ts`
- `src/renderer/src/types/index.ts`

### Tarea

Extender la generación de eventos en `BoardCalendar.tsx` y `CalendarPage.tsx` para incluir los `taskDates` de cada task como eventos adicionales en FullCalendar.

**En ambos archivos, al inicio del componente:**

```ts
import { useDateTypeStore } from '../../store/dateTypeStore'
// (ajustar path relativo según ubicación del archivo)

const { dateTypes } = useDateTypeStore()
```

**En la función que construye el array `events` (useMemo o inline), después de mapear los eventos existentes del task, agregar los taskDates:**

```ts
// Después del evento principal del task, agregar por cada taskDate:
const taskDateEvents = tasks.flatMap((t) =>
  (t.taskDates ?? []).flatMap((td) => {
    const dt = dateTypes.find((x) => x.key === td.typeKey)
    if (!dt) return []
    return [{
      id: `${t.id}-td-${td.id}`,
      title: t.title,
      start: toLocalDateString(td.dateStart.toDate()),
      end: td.dateEnd ? toLocalDateString(td.dateEnd.toDate()) : undefined,
      allDay: true,
      backgroundColor: dt.color + 'CC',
      borderColor: dt.color,
      textColor: '#ffffff',
      extendedProps: {
        task: t,
        isTaskDate: true,
        dateTypeKey: td.typeKey,
        dateTypeIcon: dt.icon,
        dateTypeLabel: dt.label,
        // board si aplica (en CalendarPage)
      },
    }]
  })
)

// El array final de eventos debe ser: [...mainEvents, ...taskDateEvents]
```

**En el `eventContent` de FullCalendar** — diferenciar visualmente los taskDate events. El `eventContent` ya existe; extenderlo para mostrar el ícono del tipo cuando `extendedProps.isTaskDate === true`:

```tsx
eventContent={(arg) => {
  const { isTaskDate, dateTypeIcon } = arg.event.extendedProps

  // Helper para ícono (mismo ICON_MAP del TaskPage)
  const Icon = isTaskDate ? (ICON_MAP[dateTypeIcon] ?? CalendarIcon) : null

  return (
    <div className="flex items-center gap-1 px-1 py-0.5 overflow-hidden w-full">
      {Icon && <Icon size={10} className="shrink-0 opacity-90" />}
      <span className="truncate text-xs font-medium leading-tight">{arg.event.title}</span>
    </div>
  )
}}
```

Agrega el `ICON_MAP` como constante fuera del componente (igual que en TaskPage):

```ts
import { Hammer, Truck, Wrench, Star, Calendar as CalendarIcon } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const ICON_MAP: Record<string, LucideIcon> = {
  Hammer, Truck, Wrench, Star, Calendar: CalendarIcon,
}
```

**Nota importante sobre drag/drop:** Los taskDate events NO deben ser arrastrables. En el objeto evento, agregar:

```ts
editable: false,
```

O alternativamente, en el handler `handleEventDrop`, verificar y hacer early return:

```ts
if (event.extendedProps.isTaskDate) return
```

### Verificación

```bash
npm run typecheck
```

Probar: un task con un taskDate de tipo "Show day" con rango Jan 26-28 debe aparecer en el calendario en esas fechas con color amber y el ícono ⭐ antes del título. Los eventos de taskDate no deben poder arrastrarse.

### Commit

```
feat: render taskDates as typed calendar events

- TaskDate entries appear as additional events alongside the main task event
- Each event shows the DateType icon and uses the DateType color
- Events are not editable (drag/drop disabled for task date events)
- Applied to BoardCalendar and CalendarPage (master calendar)
```

---

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## PROMPT 5 — Settings: Date Types Manager
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lee los siguientes archivos completos antes de empezar:
- `CLAUDE.md`
- `src/renderer/src/pages/SettingsPage.tsx`
- `src/renderer/src/components/settings/LabelManager.tsx` (como referencia de patrón)
- `src/renderer/src/lib/firestore.ts`
- `src/renderer/src/store/dateTypeStore.ts`
- `src/renderer/src/types/index.ts`

### Tarea

**1. Crear `src/renderer/src/components/settings/DateTypeManager.tsx`**

Componente que lista y permite editar los DateTypes. Seguir el mismo patrón visual que `LabelManager.tsx`.

Funcionalidad:
- Lista los dateTypes del store ordenados por `order`.
- Cada fila muestra: ícono Lucide preview (en un círculo con el color), label, color swatch, botones "Edit" / "Delete".
- Al clickar Edit: inline edit con campo de texto para `label` + input `type="color"` para `color` + selector de ícono (dropdown con las opciones: Hammer, Truck, Wrench, Star, Calendar, Package, MapPin, Flag, Clock, Zap).
- Botón "+ Add date type" al final que expande inline form.
- Al eliminar: mostrar confirmación inline "¿Eliminar este tipo? Los tasks que lo usen perderán esta fecha." con botón "Confirm delete".
- Llamar `createDateType`, `updateDateType`, `deleteDateType` de `firestore.ts`.
- Al crear nuevo, calcular `order` como `dateTypes.length` (appended al final).

Íconos disponibles para el selector:

```ts
const AVAILABLE_ICONS = [
  { name: 'Hammer',   label: 'Hammer'   },
  { name: 'Truck',    label: 'Truck'    },
  { name: 'Wrench',   label: 'Wrench'   },
  { name: 'Star',     label: 'Star'     },
  { name: 'Calendar', label: 'Calendar' },
  { name: 'Package',  label: 'Package'  },
  { name: 'MapPin',   label: 'Map Pin'  },
  { name: 'Flag',     label: 'Flag'     },
  { name: 'Clock',    label: 'Clock'    },
  { name: 'Zap',      label: 'Zap'      },
]
```

**2. En `src/renderer/src/pages/SettingsPage.tsx`**

Agregar `'dateTypes'` al tipo `SettingsTab` y al array `TABS`:

```ts
type SettingsTab = 'profile' | 'members' | 'boards' | 'clients' | 'labels' | 'dateTypes' | 'files' | ...

// En TABS array, después de 'labels':
{ id: 'dateTypes', label: 'Date Types', adminOnly: true },
```

Agregar el import y el case de render:

```tsx
import DateTypeManager from '../components/settings/DateTypeManager'

// En el render del tab content:
{activeTab === 'dateTypes' && isAdmin && (
  <div>
    <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
      Date Types
    </h2>
    <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
      Configure the types of dates that can be added to tasks. Only admins can manage these.
    </p>
    <DateTypeManager />
  </div>
)}
```

### Verificación

```bash
npm run typecheck
```

Probar: Settings → Date Types. Verificar que los 4 defaults aparecen. Editar el color de "Ship date". Agregar un nuevo tipo custom. Eliminarlo.

### Commit

```
feat: add Date Types manager in Settings (admin only)

- New DateTypeManager component with inline edit, create, delete
- Icon selector with 10 Lucide icon options
- Color picker per date type
- New 'Date Types' tab in SettingsPage (adminOnly)
- Follows same visual pattern as LabelManager
```

---

## Notas finales para el agente

- Ejecutar los prompts **en orden**: 1 → 2 → 3 → 4 → 5.
- Después de cada prompt exitoso, actualizar `CLAUDE.md` marcando el avance.
- Después del Prompt 5, actualizar `DOCUMENTACION_TECNICA_NPD_PLANNER.md` con la sección de Date Tags.
- Si `nanoid` no está instalado: `npm install nanoid` antes del Prompt 3.
- No modificar `updateTaskField` en `firestore.ts` — ya soporta arrays y funciona para `taskDates`.
