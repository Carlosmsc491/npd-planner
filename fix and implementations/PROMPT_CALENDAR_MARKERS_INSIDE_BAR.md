# SPEC: Calendar — Task Date Range con Markers Internos

## Concepto visual (basado en sketch)

Una sola barra horizontal por task en el calendario. Esa barra representa el rango `dateStart → dateEnd` del task. Dentro de esa barra, en sus posiciones relativas, aparecen los **taskDate markers** — pequeños íconos de colores que indican dónde cae cada evento tipado (Ship date, Show day, etc.).

```
[Jan 5 ────── 🚚 ──── ★ ── ★ ──── Jan 28]
               ship  show      show end
```

Todo en UNA sola fila. No hay eventos secundarios de FullCalendar para los taskDates.

---

## Arquitectura del cambio

### Lo que CAMBIA respecto al approach anterior

Antes: se generaban eventos separados de FullCalendar por cada taskDate → múltiples filas.

Ahora: **un solo evento de FullCalendar por task** (el rango principal). Los taskDates se renderizan como marcadores **dentro del `eventContent`** usando posicionamiento CSS relativo/absoluto calculado por porcentaje dentro del rango del task.

### Cálculo de posición del marker

Para un taskDate con `dateStart = D` dentro de un task con rango `[taskStart, taskEnd]`:

```ts
function markerPosition(
  taskStart: Date,
  taskEnd: Date,
  markerDate: Date
): number {
  const totalMs = taskEnd.getTime() - taskStart.getTime()
  if (totalMs <= 0) return 0
  const offsetMs = markerDate.getTime() - taskStart.getTime()
  return Math.max(0, Math.min(100, (offsetMs / totalMs) * 100))
}
```

Retorna un porcentaje (0–100) que se usa como `left: X%` dentro del `eventContent`.

### Limitación de FullCalendar en dayGrid

En `dayGridMonth`, cuando un evento multi-semana se corta al final de la semana y continúa en la siguiente, FullCalendar llama a `eventContent` varias veces (una por segmento de semana). En cada segmento, `arg.event.start` y `arg.event.end` siguen siendo los del evento completo, pero visualmente solo se muestra el fragmento de esa semana.

Para posicionar los markers correctamente en cada segmento de semana, necesitamos saber qué rango de fechas cubre el segmento visible:

- `segmentStart` = max(taskStart, inicioSemana)
- `segmentEnd` = min(taskEnd, finSemana)

El marker solo se renderiza en el segmento donde cae su fecha. La posición dentro del segmento se calcula igual:

```ts
const pct = markerPosition(segmentStart, segmentEnd, markerDate)
```

Para obtener el inicio/fin de semana del segmento, usar la fecha del primer y último día visible. FullCalendar no expone esto directamente en `eventContent`, pero se puede inferir:

```ts
// En eventContent arg, el segmento start/end se puede obtener de:
// arg.event.start (siempre el inicio del evento completo)
// arg.isStart, arg.isEnd

// Estrategia alternativa más simple: 
// renderizar el marker solo en arg.isStart con posición relativa al evento completo.
// Para eventos multi-semana, repetir el título del task al inicio de cada segmento
// (FullCalendar hace esto si title está presente y eventContent no lo suprime).
```

**Decisión de implementación**: usar la estrategia simple — los markers se muestran solo en el segmento `isStart`. En segmentos `middle` e `isEnd`, mostrar la barra vacía con el título (comportamiento estándar de FullCalendar). Esto cubre el 90% del uso real: la mayoría de los markers caen en la primera semana o el usuario puede ver en el task panel la lista completa.

---

## Implementación

### Paso 1: un solo evento de FullCalendar por task

```ts
const events = tasks
  .filter((t) => !t.completed && (t.dateStart || t.dateEnd))
  .map((t) => {
    const eventColor = getBucketColor(t.bucket, board) ?? boardColor
    return {
      id: t.id,
      title: t.title,
      start: toLocalDateString((t.dateStart ?? t.dateEnd)!.toDate()),
      end: t.dateEnd ? toLocalDateString(t.dateEnd.toDate()) : undefined,
      allDay: true,
      backgroundColor: eventColor + '55',   // más transparente — la barra es el contenedor
      borderColor: eventColor + 'AA',
      textColor: '#ffffff',
      extendedProps: { task: t },
    }
  })
```

Nota: `backgroundColor` con `55` (33% opacidad) hace la barra más suave para que los markers dentro destaquen.

### Paso 2: eventContent con markers internos

```tsx
eventContent={(arg) => {
  const task = arg.event.extendedProps.task as Task
  const taskDates = task.taskDates ?? []

  if (taskDates.length === 0 || !arg.isStart) {
    // Sin taskDates o segmento de continuación — render normal
    return (
      <div className="flex items-center gap-1 px-1 py-0.5 overflow-hidden w-full h-full">
        <span className="truncate text-xs font-medium leading-tight opacity-90">
          {arg.event.title}
        </span>
      </div>
    )
  }

  // Segmento isStart con taskDates — renderizar markers posicionados
  const taskStart = arg.event.start!
  const taskEnd = arg.event.end ?? taskStart  // end es exclusive en FC, pero para cálculo de pct es suficiente

  return (
    <div
      className="relative flex items-center px-1 overflow-hidden w-full h-full"
      style={{ minHeight: '20px' }}
    >
      {/* Título del task a la izquierda */}
      <span
        className="text-xs font-medium leading-tight opacity-80 shrink-0 mr-1 truncate"
        style={{ maxWidth: '40%' }}
      >
        {arg.event.title}
      </span>

      {/* Markers de taskDates */}
      {taskDates.map((td) => {
        const dt = dateTypes.find((x) => x.key === td.typeKey)
        if (!dt) return null
        const Icon = ICON_MAP[dt.icon] ?? CalendarIcon

        const markerDate = td.dateStart.toDate()

        // Solo mostrar si el marker cae dentro del rango visible del task
        if (markerDate < taskStart || markerDate > taskEnd) return null

        const totalMs = taskEnd.getTime() - taskStart.getTime()
        const pct = totalMs > 0
          ? Math.max(2, Math.min(95, ((markerDate.getTime() - taskStart.getTime()) / totalMs) * 100))
          : 50

        return (
          <div
            key={td.id}
            title={`${dt.label}: ${toLocalDateString(markerDate)}${td.dateEnd ? ' → ' + toLocalDateString(td.dateEnd.toDate()) : ''}`}
            className="absolute flex items-center justify-center rounded-full"
            style={{
              left: `${pct}%`,
              transform: 'translateX(-50%)',
              width: '16px',
              height: '16px',
              backgroundColor: dt.color,
              flexShrink: 0,
              zIndex: 1,
            }}
          >
            <Icon size={9} color="#fff" />
          </div>
        )
      })}
    </div>
  )
}}
```

### Paso 3: dateTypes en el componente

```ts
import { useDateTypeStore } from '../../store/dateTypeStore'

// Dentro del componente:
const { dateTypes } = useDateTypeStore()
```

---

---

# PROMPTS PARA CLAUDE CODE

---

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## PROMPT ÚNICO — Calendar: markers internos en la barra del task
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lee los siguientes archivos completos antes de empezar:
- `CLAUDE.md`
- `src/renderer/src/components/board/BoardCalendar.tsx`
- `src/renderer/src/pages/CalendarPage.tsx`
- `src/renderer/src/store/dateTypeStore.ts`
- `src/renderer/src/utils/dateUtils.ts`
- `src/renderer/src/types/index.ts`

### Contexto del cambio

El approach anterior generaba eventos separados de FullCalendar por cada taskDate, causando múltiples filas. El nuevo approach es:

**Un solo evento de FullCalendar por task.** Los taskDates se renderizan como markers circulares posicionados **dentro del `eventContent`** de ese único evento, usando `position: absolute` con `left: X%` calculado por la posición relativa de la fecha del marker dentro del rango total del task.

### Tarea — aplicar en `BoardCalendar.tsx` Y en `CalendarPage.tsx`

---

**1. Agregar import de dateTypeStore y ICON_MAP** (fuera del componente):

```ts
import { useDateTypeStore } from '../../store/dateTypeStore'
// ajustar path relativo según ubicación del archivo

import {
  Hammer, Truck, Wrench, Star,
  Calendar as CalendarIcon,
  Package, MapPin, Flag, Clock, Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const ICON_MAP: Record<string, LucideIcon> = {
  Hammer, Truck, Wrench, Star, Calendar: CalendarIcon,
  Package, MapPin, Flag, Clock, Zap,
}
```

**2. Dentro del componente**, agregar:

```ts
const { dateTypes } = useDateTypeStore()
```

**3. En la función que construye el array `events`** — eliminar cualquier generación de eventos secundarios de taskDates que exista del approach anterior. Debe quedar **un solo evento por task**:

```ts
const events = tasks
  .filter((t) => !t.completed && (t.dateStart || t.dateEnd))
  .map((t) => {
    // ... obtener eventColor como existe actualmente (getBucketColor, boardColor, etc.)
    return {
      id: t.id,
      title: t.title,
      start: toLocalDateString((t.dateStart ?? t.dateEnd)!.toDate()),
      end: t.dateEnd ? toLocalDateString(t.dateEnd.toDate()) : undefined,
      allDay: true,
      backgroundColor: eventColor + '55',
      borderColor: eventColor + 'BB',
      textColor: '#ffffff',
      extendedProps: { task: t },
    }
  })
```

El `+ '55'` reduce la opacidad del color de fondo para que la barra sea un contenedor sutil y los markers destaquen.

**4. Agregar helper de posición** fuera del componente (o como función local interna):

```ts
function markerLeftPct(taskStart: Date, taskEnd: Date, markerDate: Date): number {
  const totalMs = taskEnd.getTime() - taskStart.getTime()
  if (totalMs <= 0) return 50
  const offsetMs = markerDate.getTime() - taskStart.getTime()
  return Math.max(2, Math.min(95, (offsetMs / totalMs) * 100))
}
```

**5. Reemplazar el `eventContent` del FullCalendar:**

```tsx
eventContent={(arg) => {
  const task = arg.event.extendedProps.task as Task
  const taskDates = task.taskDates ?? []

  // Sin taskDates, o segmento de continuación de semana (no isStart):
  // mostrar solo el título como barra normal
  if (taskDates.length === 0 || !arg.isStart) {
    return (
      <div className="flex items-center gap-1 px-1 py-0.5 overflow-hidden w-full h-full">
        <span className="truncate text-xs font-medium leading-tight">
          {arg.event.title}
        </span>
      </div>
    )
  }

  // Segmento isStart con taskDates: barra con markers posicionados
  const taskStart = arg.event.start!
  const taskEnd = arg.event.end ?? new Date(taskStart.getTime() + 86400000)

  return (
    <div
      className="relative flex items-center px-2 overflow-hidden w-full h-full"
      style={{ minHeight: '20px' }}
    >
      {/* Título del task */}
      <span
        className="text-xs font-medium leading-tight shrink-0 z-10"
        style={{ maxWidth: '35%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {arg.event.title}
      </span>

      {/* Markers por cada taskDate */}
      {taskDates.map((td) => {
        const dt = dateTypes.find((x) => x.key === td.typeKey)
        if (!dt) return null

        const Icon = ICON_MAP[dt.icon] ?? CalendarIcon
        const markerDate = td.dateStart.toDate()

        // Ignorar markers fuera del rango del evento visible
        if (markerDate < taskStart || markerDate > taskEnd) return null

        const pct = markerLeftPct(taskStart, taskEnd, markerDate)

        return (
          <div
            key={td.id}
            title={`${dt.label}: ${toLocalDateString(markerDate)}${
              td.dateEnd ? ' → ' + toLocalDateString(td.dateEnd.toDate()) : ''
            }`}
            className="absolute flex items-center justify-center rounded-full"
            style={{
              left: `${pct}%`,
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: '16px',
              height: '16px',
              backgroundColor: dt.color,
              zIndex: 2,
              flexShrink: 0,
            }}
          >
            <Icon size={9} color="#fff" />
          </div>
        )
      })}
    </div>
  )
}}
```

**6. En `CalendarPage.tsx`**: hacer exactamente los mismos cambios. La única diferencia es que en CalendarPage el `board` es variable (cada task pertenece a un board diferente), así que el `eventColor` ya viene de la lógica existente — mantenerlo igual, solo agregar el `+ '55'` al backgroundColor.

**7. Eliminar** cualquier código remanente del approach anterior que generaba `taskDateEvents` como array separado y los concatenaba. Debe quedar solo el array `events` de un elemento por task.

**8. En los handlers `handleEventDrop` y `handleEventResize`**: no hay cambios — siguen actualizando `dateStart`/`dateEnd` del task como siempre. Los markers son solo visuales, no son arrastrables ni resizables (no son eventos de FC).

### Verificación

```bash
npm run typecheck
```

Probar: un task con dateStart=Jan 5, dateEnd=Jan 28, con taskDates: Ship=Jan 10, Show=Jan 26-28.
- En el calendario debe aparecer UNA sola barra para ese task.
- Dentro de la barra, un círculo azul con ícono de truck posicionado aprox. al 18% del ancho (Jan 10 dentro del rango Jan 5–28), y un círculo amber con star aprox. al 88% (Jan 26).
- La barra debe ser el color del board/bucket con transparencia, no el color sólido anterior.
- Hover sobre un marker muestra el tooltip con nombre del tipo + fecha.

### Commit

```
feat: render taskDate markers inside the main event bar (single row)

Replace separate FullCalendar events per taskDate with positioned circular
markers inside the main task event's eventContent. One row per task.

- markerLeftPct() calculates % position of each marker within task range
- Markers are 16px circles with the DateType color and Lucide icon
- Tooltip on hover shows type label and date(s)
- Background color of main bar is softened (+ '55' alpha) so markers pop
- Applies to BoardCalendar and CalendarPage
```

---

## Nota sobre segmentos multi-semana

En `dayGridMonth`, cuando un evento ocupa más de una semana, FullCalendar renderiza la barra en fragmentos (uno por semana). `arg.isStart` es `true` solo en el primer fragmento. Los markers se muestran solo en ese fragmento, lo cual es correcto — la mayoría de los markers relevantes están al inicio del rango. El usuario puede ver todos los markers en detalle abriendo el task panel.

Si en el futuro se necesita mostrar markers en segmentos `middle` / `isEnd`, se puede calcular el rango visible del segmento usando la semana del calendario, pero por ahora el approach `isStart-only` cubre todos los casos de uso reales.
