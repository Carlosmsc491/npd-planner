# SPEC: Calendar Date Tags — Visual Fixes & UX Improvements

## Problemas a resolver

1. **Multi-row en calendario**: el main event del task y los taskDate events aparecen en filas separadas. Deben verse en una sola línea.
2. **Color del main event muy dominante** (rojo sólido): debe ser más claro/translúcido para no competir con los taskDate events.
3. **Sin validación de fechas**: los date pickers permiten colocar fechas fuera del rango `dateStart`–`dateEnd` del task.
4. **Dropdown duplicado**: el selector de tipos de fecha muestra cada opción dos veces.
5. **Visual del rango**: en lugar de solo título, mostrar `★ ——— ★` para comunicar que es un rango con start y end del mismo tipo.

---

## Soluciones

### 1. Una sola fila en calendario

**Estrategia**: Cuando un task tiene `taskDates`, NO generar el evento principal (el del `dateStart`/`dateEnd` del task). Los `taskDates` reemplazan visualmente al main event. Si el task NO tiene `taskDates`, el main event sigue apareciendo como antes.

Esto elimina el problema de filas múltiples porque FullCalendar solo tiene un conjunto de eventos por task.

Si el task tiene `dateStart`/`dateEnd` pero NO tiene `taskDates`, sigue mostrando el evento principal como estaba antes.

### 2. Color del main event más claro

Cuando el task SÍ tiene `taskDates` y se sigue mostrando el main event (edge case: task con fechas pero sin taskDates aún), usar el color del board con opacidad `40` (hex `66`) en lugar de sólido. Así los taskDate events destacan.

Alternativamente, como implementamos la estrategia 1 (suprimir main cuando hay taskDates), este punto aplica solo al main event sin taskDates — mantener color pero reducir ligeramente la saturación usando `color + 'DD'` en lugar de sólido.

### 3. Validación de fechas en el form

En `TaskPage.tsx`, en el form de "Add date":

- `min` del `dateStart` picker = `task.dateStart` (si existe)
- `max` del `dateStart` picker = `task.dateEnd` (si existe)
- `min` del `dateEnd` picker = valor actual de `newDateStart`
- `max` del `dateEnd` picker = `task.dateEnd` (si existe)

Función helper:

```ts
function taskBoundaryDates(): { min: string; max: string } {
  const min = task.dateStart ? toLocalDateString(task.dateStart.toDate()) : ''
  const max = task.dateEnd   ? toLocalDateString(task.dateEnd.toDate())   : ''
  return { min, max }
}
```

### 4. Fix dropdown duplicado

El bug de duplicados ocurre porque `subscribeToDateTypes` está siendo llamado dos veces (desde `AppLayout` y posiblemente desde otro componente). Fix:

- En `AppLayout.tsx`: guardar el unsubscribe y asegurarse de que el `useEffect` con `seedDefaultDateTypes` + `subscribeToDateTypes` tenga el dependency array `[]` y el cleanup correcto.
- En `DateTypeManager.tsx` y `TaskPage.tsx`: **NO suscribirse directamente a Firestore** — leer solo del store (`useDateTypeStore()`). El store ya tiene los datos en tiempo real gracias a la suscripción de AppLayout.
- Verificar que `subscribeToDateTypes` no esté siendo llamada en múltiples lugares.

### 5. Visual del rango con iconos en extremos

En el `eventContent` de FullCalendar, para eventos de tipo `taskDate` que tienen rango (start ≠ end):

```
[ícono] ——————— [ícono]
```

Para el día START del rango → mostrar: `[ícono] título`
Para los días MIDDLE → mostrar: barra sin texto (solo color)
Para el día END → mostrar: `[ícono]` alineado a la derecha

FullCalendar en `dayGridMonth` expone `arg.event.start` y el contexto del día en `arg.el` pero no de forma directa qué segmento es (start/middle/end). Sin embargo, se puede inferir comparando la fecha del día que está renderizando con `event.start` y `event.end`:

```ts
eventContent={(arg) => {
  const { isTaskDate, dateTypeIcon } = arg.event.extendedProps
  if (!isTaskDate) {
    // render normal del main event
    return (
      <div className="flex items-center gap-1 px-1 py-0.5 overflow-hidden w-full">
        <span className="truncate text-xs font-medium">{arg.event.title}</span>
      </div>
    )
  }

  const Icon = ICON_MAP[dateTypeIcon] ?? CalendarIcon
  const eventStart = arg.event.start
  const eventEnd = arg.event.end   // FullCalendar end es exclusive, restar 1 día
  const hasRange = eventEnd && eventStart &&
    (eventEnd.getTime() - eventStart.getTime()) > 86400000

  if (!hasRange) {
    // Single day: icon + title
    return (
      <div className="flex items-center gap-1 px-1 py-0.5 overflow-hidden w-full">
        <Icon size={10} className="shrink-0" />
        <span className="truncate text-xs font-medium">{arg.event.title}</span>
      </div>
    )
  }

  // Range: icon at start, dash fill, icon at end
  // FullCalendar calls eventContent once per week-segment.
  // We detect which segment by checking if arg.event.start equals the segment start
  // via the isStart/isEnd flags on arg
  const isStart = arg.isStart
  const isEnd = arg.isEnd

  if (isStart && isEnd) {
    // Short range within same week row
    return (
      <div className="flex items-center gap-1 px-1 py-0.5 w-full overflow-hidden">
        <Icon size={10} className="shrink-0" />
        <span className="flex-1 truncate text-xs font-medium">{arg.event.title}</span>
        <Icon size={10} className="shrink-0 ml-auto" />
      </div>
    )
  }
  if (isStart) {
    return (
      <div className="flex items-center gap-1 px-1 py-0.5 w-full overflow-hidden">
        <Icon size={10} className="shrink-0" />
        <span className="truncate text-xs font-medium">{arg.event.title}</span>
      </div>
    )
  }
  if (isEnd) {
    return (
      <div className="flex items-center justify-end px-1 py-0.5 w-full">
        <Icon size={10} className="shrink-0" />
      </div>
    )
  }
  // Middle: empty (just the color bar)
  return <div className="w-full h-full" />
}}
```

---

---

# PROMPTS PARA CLAUDE CODE

---

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## PROMPT A — Fix dropdown duplicado en Date Types
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lee los siguientes archivos completos antes de empezar:
- `CLAUDE.md`
- `src/renderer/src/components/ui/AppLayout.tsx`
- `src/renderer/src/store/dateTypeStore.ts`
- `src/renderer/src/components/task/TaskPage.tsx`
- `src/renderer/src/components/settings/DateTypeManager.tsx`

### Problema

El dropdown de tipos de fecha muestra cada opción duplicada. Causa: `subscribeToDateTypes` se está llamando en más de un lugar, duplicando los datos en el store.

### Fix

**1. En `src/renderer/src/components/ui/AppLayout.tsx`** — verificar que el `useEffect` que llama a `subscribeToDateTypes` tiene exactamente esta forma:

```ts
useEffect(() => {
  seedDefaultDateTypes()
  const unsub = subscribeToDateTypes((types) => {
    useDateTypeStore.getState().setDateTypes(types)
  })
  return unsub
}, [])
```

Confirmar que NO existe ninguna otra llamada a `subscribeToDateTypes` en este archivo.

**2. En `src/renderer/src/components/task/TaskPage.tsx`** — buscar cualquier llamada directa a `subscribeToDateTypes` o `getDocs` sobre `dateTypes`. Si existe, eliminarla. El componente debe leer el store únicamente:

```ts
const { dateTypes } = useDateTypeStore()
// NO debe haber useEffect con subscribeToDateTypes aquí
```

**3. En `src/renderer/src/components/settings/DateTypeManager.tsx`** — mismo check. Si hay una suscripción propia, eliminarla. Leer solo del store:

```ts
const { dateTypes } = useDateTypeStore()
```

**4. Buscar en todo el proyecto** cualquier otro archivo que importe `subscribeToDateTypes`:

```bash
grep -r "subscribeToDateTypes" src/
```

Solo debe aparecer en `AppLayout.tsx` (la suscripción) y en `lib/firestore.ts` (la definición). Si aparece en otro archivo, eliminar esa suscripción.

### Verificación

```bash
npm run typecheck
grep -r "subscribeToDateTypes" src/
```

Abrir la app → task panel → "+ Add date" → el dropdown debe mostrar exactamente 4 opciones sin duplicados.

### Commit

```
fix: remove duplicate dateTypes subscription causing doubled dropdown options

subscribeToDateTypes must only be called once (AppLayout).
TaskPage and DateTypeManager now read from Zustand store only.
```

---

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## PROMPT B — Validación de fechas bounded al task
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lee los siguientes archivos completos antes de empezar:
- `CLAUDE.md`
- `src/renderer/src/components/task/TaskPage.tsx`
- `src/renderer/src/utils/dateUtils.ts`
- `src/renderer/src/types/index.ts`

### Tarea

Agregar validación de fechas en el form "Add date" dentro de `TaskPage.tsx` para que las fechas de los taskDates estén bounded al rango del task.

**1. Agregar helper en el componente** (no exportar, solo uso interno):

```ts
function getTaskBounds(): { min: string; max: string } {
  return {
    min: task.dateStart ? toLocalDateString(task.dateStart.toDate()) : '',
    max: task.dateEnd   ? toLocalDateString(task.dateEnd.toDate())   : '',
  }
}
```

**2. En el input de `dateStart` del form inline, agregar atributos `min` y `max`:**

```tsx
<input
  type="date"
  value={newDateStart}
  min={getTaskBounds().min || undefined}
  max={getTaskBounds().max || undefined}
  onChange={(e) => {
    setNewDateStart(e.target.value)
    // Si el end date actual queda fuera del nuevo start, resetearlo
    if (newDateEnd && e.target.value > newDateEnd) {
      setNewDateEnd('')
    }
  }}
  className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1.5 text-xs text-gray-800 dark:text-gray-200 focus:outline-none"
/>
```

**3. En el input de `dateEnd` del form inline:**

```tsx
<input
  type="date"
  value={newDateEnd}
  min={newDateStart || getTaskBounds().min || undefined}
  max={getTaskBounds().max || undefined}
  onChange={(e) => setNewDateEnd(e.target.value)}
  className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1.5 text-xs text-gray-800 dark:text-gray-200 focus:outline-none"
/>
```

**4. En la función `handleAddTaskDate`**, agregar validación defensiva antes de guardar:

```ts
async function handleAddTaskDate() {
  if (!newDateTypeKey || !newDateStart) return

  const bounds = getTaskBounds()

  // Validar que start no queda fuera del task
  if (bounds.min && newDateStart < bounds.min) return
  if (bounds.max && newDateStart > bounds.max) return

  // Validar que end >= start y no queda fuera del task
  if (hasEndDate && newDateEnd) {
    if (newDateEnd < newDateStart) return
    if (bounds.max && newDateEnd > bounds.max) return
  }

  // ... resto de la función sin cambios
}
```

**5. En el display de los taskDates existentes** (la lista), mostrar un warning visual si la fecha del taskDate está fuera del rango actual del task (puede pasar si el usuario cambia las fechas del task después de agregar taskDates):

```tsx
// Después de calcular startStr y endStr, agregar:
const isOutOfBounds =
  (task.dateStart && td.dateStart.toMillis() < task.dateStart.toMillis()) ||
  (task.dateEnd && td.dateEnd && td.dateEnd.toMillis() > task.dateEnd.toMillis())

// En el JSX de la fila, si isOutOfBounds agregar clase de warning:
className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
  isOutOfBounds
    ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20'
    : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800'
}`}

// Y un pequeño badge si está fuera:
{isOutOfBounds && (
  <span className="text-xs text-amber-600 dark:text-amber-400 font-medium shrink-0">⚠</span>
)}
```

### Verificación

```bash
npm run typecheck
```

Probar:
- Task con dateStart=Jan 5, dateEnd=Jan 20. En el form, no debe poder seleccionar Jan 4 ni Jan 21.
- Si se selecciona dateStart=Jan 15, el dateEnd debe tener min=Jan 15.

### Commit

```
feat: validate taskDate date pickers within task date bounds

- dateStart picker bounded by task.dateStart (min) and task.dateEnd (max)
- dateEnd picker bounded by selected dateStart (min) and task.dateEnd (max)
- Defensive validation in handleAddTaskDate before saving
- Visual warning on existing taskDates that fall outside current task bounds
```

---

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## PROMPT C — Calendar: una sola línea + visual ícono-raya-ícono
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lee los siguientes archivos completos antes de empezar:
- `CLAUDE.md`
- `src/renderer/src/components/board/BoardCalendar.tsx`
- `src/renderer/src/pages/CalendarPage.tsx`
- `src/renderer/src/store/dateTypeStore.ts`
- `src/renderer/src/utils/dateUtils.ts`

### Problema

Los taskDate events aparecen en filas separadas debajo del main event del task, creando ruido visual. Necesitamos que cuando un task tiene `taskDates`, el main event NO se muestre — los taskDates son los únicos eventos visibles de ese task.

Además, el `eventContent` de los taskDates debe mostrar el patrón `[ícono] título` en el start, barra vacía en los días medios, y `[ícono]` alineado al final en el end.

### Tarea

**Aplica los mismos cambios en `BoardCalendar.tsx` Y en `CalendarPage.tsx`.**

---

**1. En la función que construye el array de eventos** — suprimir el main event cuando el task tiene taskDates:

```ts
// Separar en dos pasos:

// PASO 1: main events (solo para tasks SIN taskDates)
const mainEvents = tasks
  .filter((t) => !t.completed && (t.dateStart || t.dateEnd))
  .filter((t) => !t.taskDates || t.taskDates.length === 0)   // <-- NUEVO filtro
  .map((t) => {
    // ... código existente sin cambios
    // Solo ajuste: color más suave cuando el task tiene solo main event
    const bgColor = eventColor + 'DD'   // ligero alpha para no ser tan dominante
    return {
      id: t.id,
      title: t.title,
      start: toLocalDateString((t.dateStart ?? t.dateEnd)!.toDate()),
      end: t.dateEnd ? toLocalDateString(t.dateEnd.toDate()) : undefined,
      allDay: true,
      backgroundColor: bgColor,
      borderColor: eventColor,
      textColor: '#ffffff',
      extendedProps: { task: t, isTaskDate: false },
    }
  })

// PASO 2: taskDate events (para tasks CON taskDates)
const taskDateEvents = tasks
  .filter((t) => !t.completed && t.taskDates && t.taskDates.length > 0)
  .flatMap((t) =>
    (t.taskDates ?? []).map((td) => {
      const dt = dateTypes.find((x) => x.key === td.typeKey)
      if (!dt) return null
      return {
        id: `${t.id}-td-${td.id}`,
        title: t.title,
        start: toLocalDateString(td.dateStart.toDate()),
        end: td.dateEnd ? toLocalDateString(td.dateEnd.toDate()) : undefined,
        allDay: true,
        backgroundColor: dt.color + 'CC',
        borderColor: dt.color,
        textColor: '#ffffff',
        editable: false,
        extendedProps: {
          task: t,
          isTaskDate: true,
          dateTypeKey: td.typeKey,
          dateTypeIcon: dt.icon,
          dateTypeLabel: dt.label,
        },
      }
    }).filter(Boolean)
  )

const events = [...mainEvents, ...taskDateEvents]
```

**2. Agregar constante `ICON_MAP` fuera del componente:**

```ts
import { Hammer, Truck, Wrench, Star, Calendar as CalendarIcon, Package, MapPin, Flag, Clock, Zap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const ICON_MAP: Record<string, LucideIcon> = {
  Hammer, Truck, Wrench, Star, Calendar: CalendarIcon,
  Package, MapPin, Flag, Clock, Zap,
}
```

**3. Reemplazar el `eventContent` existente:**

```tsx
eventContent={(arg) => {
  const { isTaskDate, dateTypeIcon } = arg.event.extendedProps as {
    isTaskDate?: boolean
    dateTypeIcon?: string
  }

  if (!isTaskDate) {
    // Main event — render normal
    return (
      <div className="flex items-center gap-1 px-1 py-0.5 overflow-hidden w-full">
        <span className="truncate text-xs font-medium leading-tight">{arg.event.title}</span>
      </div>
    )
  }

  const Icon = ICON_MAP[dateTypeIcon ?? ''] ?? CalendarIcon
  const eventStart = arg.event.start
  const eventEnd = arg.event.end
  // FullCalendar's end is exclusive — check if range spans more than 1 day
  const hasRange = eventStart && eventEnd &&
    (eventEnd.getTime() - eventStart.getTime()) > 86400000

  if (!hasRange) {
    // Single day event: icon + title
    return (
      <div className="flex items-center gap-1 px-1 py-0.5 overflow-hidden w-full">
        <Icon size={10} className="shrink-0 opacity-90" />
        <span className="truncate text-xs font-medium leading-tight">{arg.event.title}</span>
      </div>
    )
  }

  // Range event — use arg.isStart / arg.isEnd to detect segment
  if (arg.isStart && arg.isEnd) {
    // Entire range fits in one week row
    return (
      <div className="flex items-center w-full px-1 py-0.5 gap-1 overflow-hidden">
        <Icon size={10} className="shrink-0" />
        <span className="flex-1 truncate text-xs font-medium leading-tight">{arg.event.title}</span>
        <Icon size={10} className="shrink-0" />
      </div>
    )
  }
  if (arg.isStart) {
    return (
      <div className="flex items-center gap-1 px-1 py-0.5 overflow-hidden w-full">
        <Icon size={10} className="shrink-0" />
        <span className="truncate text-xs font-medium leading-tight">{arg.event.title}</span>
      </div>
    )
  }
  if (arg.isEnd) {
    return (
      <div className="flex items-center justify-end px-1 py-0.5 w-full">
        <Icon size={10} className="shrink-0" />
      </div>
    )
  }
  // Middle segment — empty bar (color fills the row)
  return <div className="w-full h-full" />
}}
```

**4. En `CalendarPage.tsx`**, el mismo `eventContent` pero también verificar que `dateTypes` viene del store:

```ts
const { dateTypes } = useDateTypeStore()
```

**5. Asegurarse que `FullCalendar` tiene `dayMaxEvents={true}` o un número suficiente** para que los taskDate events no se collapsen en "+N more" cuando hay varios en el mismo día. Cambiar:

```tsx
dayMaxEvents={4}   // o aumentar a 6 si hay espacio
```

### Verificación

```bash
npm run typecheck
```

Probar con el task "test" del screenshot:
- Si el task tiene taskDates, solo deben verse los taskDate events (una o dos barras según los tipos), sin el evento rojo principal encima.
- Un taskDate de rango debe mostrar `[ícono] título` el primer día, barra vacía los días medios, y `[ícono]` el último día.
- Un taskDate de un solo día debe mostrar `[ícono] título` en ese día.

### Commit

```
feat: calendar shows taskDate events instead of main event, with icon range visual

- When a task has taskDates, suppress the main event — taskDates replace it
- Single-day taskDate: icon + title
- Range taskDate: icon+title on start segment, empty bar on middle, icon on end
- Uses arg.isStart / arg.isEnd from FullCalendar to detect segment position
- Applies to BoardCalendar and CalendarPage (master calendar)
- Main event color softened with alpha when task has no taskDates
```

---

## Notas para el agente

- Ejecutar en orden: **A → B → C**
- Prompt A primero porque si el store tiene duplicados los prompts B y C no funcionarán bien.
- En Prompt C, `arg.isStart` y `arg.isEnd` son propiedades del objeto que FullCalendar pasa a `eventContent` — son booleanos que indican si el segmento es el inicio/final del evento en esa semana. Están disponibles en FullCalendar v6+.
- Si `dateTypes` devuelve array vacío en el calendario, significa que `AppLayout` no está inicializando la suscripción correctamente — verificar el fix del Prompt A.
- Después del Prompt C, actualizar `CLAUDE.md`.
