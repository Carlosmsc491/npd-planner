# NPD PLANNER — PLAN DE TRABAJO COMPLETO
# ═══════════════════════════════════════════════════════════════
# INSTRUCCIONES: Ejecuta cada prompt EN ORDEN.
# Después de cada prompt: npm run typecheck → debe pasar.
# Commit después de cada prompt completado.
# NO saltes al siguiente si el actual tiene errores.
# Lee KIMI_READ_FIRST.md antes de empezar.
# ═══════════════════════════════════════════════════════════════
#
# RESUMEN DEL PLAN (12 prompts):
#
# BLOQUE A — BUGFIXES CRÍTICOS (4 prompts)
#   A1. Notification panel cortado y mal posicionado
#   A2. Desktop notifications se repiten en cada launch
#   A3. Auto mark-as-read al abrir panel de notificaciones
#   A4. Date input no acepta escritura manual (typing)
#
# BLOQUE B — ANALYTICS FIXES (1 prompt)
#   B1. Top 10 Clients muestra solo algunos nombres +
#       "Tasks by Project" debe ser "Tasks by Bucket"
#
# BLOQUE C — FEATURES NUEVAS (5 prompts)
#   C1. Welcome Wizard expandido (Traze + SharePoint + todo)
#   C2. SharePoint Task Report (HTML al completar + on-demand)
#   C3. Delete task → cleanup SharePoint + trash 30 días
#   C4. Owner → enviar password reset email a usuarios
#   C5. EliteQuote: sleeve prices global en Firebase
#
# BLOQUE D — VERIFICACIÓN (2 prompts)
#   D1. Test integral de todos los cambios
#   D2. Actualizar CLAUDE.md + DOCUMENTACION_TECNICA
#
# ═══════════════════════════════════════════════════════════════


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT A1 — Fix: Notification panel cortado y mal posicionado
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read CLAUDE.md completely before starting.

BUG: El NotificationCenter dropdown tiene w-80 (320px) y sale pegado
al sidebar con `absolute bottom-full left-0`. Mensajes como
"Carlos Amador assigned you to WEEKLY OFFICE ARRANGEMENT" se cortan.
El panel queda atrapado en el overflow del sidebar.

File: `src/renderer/src/components/notifications/NotificationCenter.tsx`

CAMBIOS:

1. Importar createPortal:
   ```typescript
   import { createPortal } from 'react-dom'
   ```

2. Envolver todo el return en un portal. Cambiar el div externo de:
   ```tsx
   <div ref={ref} className="absolute bottom-full left-0 mb-2 z-50 w-80 rounded-xl border ...">
   ```
   A:
   ```tsx
   return createPortal(
     <div ref={ref}
       className="fixed bottom-16 left-[232px] z-50 w-[420px] max-h-[520px]
                  rounded-xl border border-gray-200 bg-white shadow-2xl
                  dark:border-gray-700 dark:bg-gray-800"
     >
       {/* ...todo el contenido existente... */}
     </div>,
     document.body
   )
   ```
   - left-[232px] = sidebar(220px) + 12px gap
   - w-[420px] = ancho suficiente para mensajes completos
   - max-h-[520px] = más alto para mostrar más notificaciones

3. En el scrollable list area, cambiar max-h-80 a max-h-[440px].

4. Quitar clase `truncate` del texto del mensaje de notificación.
   El <p> del mensaje debe poder hacer wrap a 2 líneas:
   ```tsx
   <p className="text-xs font-medium text-gray-800 dark:text-gray-200 leading-snug">
     {notif.message}
   </p>
   ```
   Mantener `truncate` SOLO en el título verde del task debajo.

5. Agregar cierre con Escape:
   ```typescript
   useEffect(() => {
     const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
     document.addEventListener('keydown', handleEsc)
     return () => document.removeEventListener('keydown', handleEsc)
   }, [onClose])
   ```

Run `npm run typecheck`.
Commit: "fix: notification panel width, positioning and message visibility"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT A2 — Fix: Desktop notifications se repiten en cada launch
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read CLAUDE.md completely before starting.

BUG: Cada vez que se abre el app, TODAS las notificaciones unread
disparan popups de desktop otra vez. 26 unread = 26 popups al abrir.
Solo debe notificar las que se crearon DESPUÉS de abrir el app.

ROOT CAUSE en `src/renderer/src/hooks/useNotifications.ts`:
El Set `notifiedIds` empieza vacío en cada launch. Al subscribirse
a Firestore, llegan las 50 notificaciones de golpe y TODAS pasan
el check `!notifiedIds.current.has(id)`.

File: `src/renderer/src/hooks/useNotifications.ts`

FIX — Ignorar el primer snapshot (carga inicial) y solo notificar
los que lleguen DESPUÉS:

```typescript
export function useNotifications(): void {
  const { user } = useAuthStore()
  const { setNotifications } = useNotificationStore()
  const notifiedIds = useRef<Set<string>>(new Set())
  const isFirstSnapshot = useRef(true)

  useEffect(() => {
    if (!user) return

    isFirstSnapshot.current = true
    notifiedIds.current.clear()

    const unsub = subscribeToNotifications(user.uid, (incoming) => {
      setNotifications(incoming)

      // En el primer snapshot, solo registrar IDs existentes sin notificar
      if (isFirstSnapshot.current) {
        isFirstSnapshot.current = false
        for (const notif of incoming) {
          notifiedIds.current.add(notif.id)
        }
        return  // NO disparar desktop notifications en carga inicial
      }

      // A partir de aquí, solo notificar los NUEVOS (que no estaban en el primer snapshot)
      if (!isElectron) return

      const prefs = user.preferences
      const dndActive =
        prefs?.dndEnabled && prefs?.dndStart && prefs?.dndEnd
          ? isDNDActive(prefs.dndStart, prefs.dndEnd)
          : false

      for (const notif of incoming) {
        if (notifiedIds.current.has(notif.id)) continue
        notifiedIds.current.add(notif.id)

        if (notif.read) continue
        if (notif.boardType !== 'planner') continue

        window.electronAPI.sendNotification(
          notif.message,
          notif.taskTitle ?? '',
          notif.taskId ?? '',
          notif.boardType ?? 'planner',
          dndActive
        )
      }
    })

    return unsub
  }, [user, setNotifications])

  useEffect(() => {
    notifiedIds.current.clear()
    isFirstSnapshot.current = true
  }, [user?.uid])
}
```

La clave: `isFirstSnapshot.current = true` → al primer callback,
guarda todos los IDs pero NO dispara popups. A partir del segundo
callback (cambios reales), sí notifica los nuevos.

Run `npm run typecheck`.
Commit: "fix: desktop notifications only fire for new events, not on app launch"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT A3 — Fix: Auto mark-as-read al abrir panel de notificaciones
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read CLAUDE.md completely before starting.

FEATURE: Cuando el usuario abre el panel de notificaciones (click en
la campana), todas las notificaciones visibles deben marcarse como
leídas automáticamente después de un breve delay (2 segundos).
Esto reemplaza el botón "Mark all read" como acción principal.

File: `src/renderer/src/components/notifications/NotificationCenter.tsx`

CAMBIOS:

1. Agregar un useEffect que se ejecute al montar el componente
   (es decir, cuando el panel se abre):

   ```typescript
   // Auto mark all as read after 2 seconds of panel being open
   useEffect(() => {
     if (!user) return
     const hasUnread = notifications.some(n => !n.read)
     if (!hasUnread) return

     const timer = setTimeout(async () => {
       await markAllNotificationsRead(user.uid)
     }, 2000)

     return () => clearTimeout(timer)
   }, [user, notifications])
   ```

   Esto hace que al abrir el panel, espera 2 segundos y marca todo
   como leído. Si el usuario cierra antes de 2s, el timer se cancela
   y no se marca nada.

2. Mantener el botón "All read" como opción manual para marcado inmediato.
   El auto-mark es complementario, no reemplaza.

3. El badge del bell (unreadCount) se actualizará automáticamente porque
   notificationStore recalcula `unreadCount` cada vez que `setNotifications`
   es llamado, y el listener de Firestore detectará el cambio `read: true`.

Run `npm run typecheck`.
Commit: "feat: auto mark notifications as read when panel opens"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT A4 — Fix: Date input debe aceptar escritura manual
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read CLAUDE.md completely before starting.

BUG: Los campos de fecha usan `<input type="date">` nativo del browser.
El usuario quiere poder ESCRIBIR la fecha (ej: teclear "03232026" y
que se formatee automáticamente a "03/23/2026"). El input nativo no
permite esto — su comportamiento depende del OS/browser y en Electron
el formato es restringido.

SOLUCIÓN: Reemplazar los `<input type="date">` con un input de texto
que auto-formatea mientras el usuario escribe, pero que también permite
click para abrir un date picker nativo como fallback.

File: `src/renderer/src/components/ui/DateInput.tsx` (NUEVO ARCHIVO)

Crear un componente reutilizable DateInput:

```typescript
import { useState, useRef, useEffect } from 'react'
import { Calendar } from 'lucide-react'

interface DateInputProps {
  value: string  // "YYYY-MM-DD" format (same as <input type="date">)
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export default function DateInput({ value, onChange, placeholder, className }: DateInputProps) {
  // Display format: MM/DD/YYYY
  // Internal/stored format: YYYY-MM-DD

  const [displayValue, setDisplayValue] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const hiddenDateRef = useRef<HTMLInputElement>(null)

  // Sync external value → display
  useEffect(() => {
    if (isFocused) return  // don't override while user is typing
    if (!value) { setDisplayValue(''); return }
    const [y, m, d] = value.split('-')
    if (y && m && d) setDisplayValue(`${m}/${d}/${y}`)
    else setDisplayValue('')
  }, [value, isFocused])

  function handleTextChange(raw: string) {
    // Strip non-digits
    const digits = raw.replace(/\D/g, '')

    // Auto-format as user types: MM/DD/YYYY
    let formatted = ''
    if (digits.length <= 2) {
      formatted = digits
    } else if (digits.length <= 4) {
      formatted = digits.slice(0, 2) + '/' + digits.slice(2)
    } else {
      formatted = digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4, 8)
    }
    setDisplayValue(formatted)

    // If complete (8 digits), emit YYYY-MM-DD
    if (digits.length === 8) {
      const mm = digits.slice(0, 2)
      const dd = digits.slice(2, 4)
      const yyyy = digits.slice(4, 8)
      const numM = parseInt(mm)
      const numD = parseInt(dd)
      const numY = parseInt(yyyy)
      // Basic validation
      if (numM >= 1 && numM <= 12 && numD >= 1 && numD <= 31 && numY >= 2020 && numY <= 2099) {
        onChange(`${yyyy}-${mm}-${dd}`)
      }
    }

    // If cleared, emit empty
    if (digits.length === 0) {
      onChange('')
    }
  }

  function handleBlur() {
    setIsFocused(false)
    // Re-sync display from stored value
    if (!value) { setDisplayValue(''); return }
    const [y, m, d] = value.split('-')
    if (y && m && d) setDisplayValue(`${m}/${d}/${y}`)
  }

  function openNativePicker() {
    hiddenDateRef.current?.showPicker()
  }

  function handleNativeChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange(e.target.value)  // already YYYY-MM-DD
  }

  return (
    <div className="relative flex items-center">
      <input
        type="text"
        value={displayValue}
        onChange={(e) => handleTextChange(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={handleBlur}
        placeholder={placeholder ?? 'MM/DD/YYYY'}
        maxLength={10}
        className={className ?? "w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:outline-none focus:border-green-500"}
      />
      <button
        type="button"
        onClick={openNativePicker}
        className="absolute right-1 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        tabIndex={-1}
      >
        <Calendar size={14} />
      </button>
      {/* Hidden native date input for picker fallback */}
      <input
        ref={hiddenDateRef}
        type="date"
        value={value}
        onChange={handleNativeChange}
        className="absolute inset-0 opacity-0 pointer-events-none"
        tabIndex={-1}
      />
    </div>
  )
}
```

AHORA reemplazar TODOS los `<input type="date">` en la app:

File: `src/renderer/src/components/task/TaskPage.tsx`

Buscar las dos instancias de `<input type="date">` para dateStart y dateEnd.
Reemplazar ambas con el nuevo DateInput:

```tsx
import DateInput from '../ui/DateInput'

// Donde estaba:
<input type="date" value={timestampToDateInput(task.dateStart)}
  onChange={(e) => handleDateChange('dateStart', e.target.value)} ... />

// Ahora:
<DateInput
  value={timestampToDateInput(task.dateStart)}
  onChange={(value) => handleDateChange('dateStart', value)}
/>
```

Hacer lo mismo para dateEnd.

También buscar y reemplazar en:
- `src/renderer/src/components/ui/NewTaskModal.tsx` (si tiene date inputs)
- Cualquier otro lugar que use `<input type="date">`:
  ```bash
  grep -rn 'type="date"' src/renderer/ --include="*.tsx"
  ```

Run `npm run typecheck`.
Test: Click en campo de fecha → escribir "03232026" → muestra "03/23/2026".
Click en el icono de calendario → abre picker nativo como fallback.
Commit: "feat: date input with auto-format typing (MM/DD/YYYY) and native picker fallback"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT B1 — Fix: Analytics charts (client bar names + bucket donut)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read CLAUDE.md completely before starting.

DOS BUGS en la página de Analytics:

BUG 1: "Top 10 Clients" bar chart muestra 10 barras pero solo algunos
nombres en el Y axis. Los demás están hidden por autoSkip de Recharts.

BUG 2: "Tasks by Project" pie chart agrupa por board (Planner, Vacations).
Debería agrupar por BUCKET (SAMPLES/SHIP OUT, FedEx, IN HOUSE MEETING, etc.)
y el título debe ser "Tasks by Bucket", no "Tasks by Project".

File: `src/renderer/src/pages/AnalyticsPage.tsx` → `DashboardTab`

FIX BUG 1 — Top 10 Clients bar chart:

Buscar el ChartCard "Top 10 Clients" y su <BarChart>. El problema es
que el YAxis con nombres largos se corta. Soluciones:

a. Aumentar el margin left del BarChart:
   ```tsx
   <BarChart data={clientChartData} layout="vertical" margin={{ left: 120 }}>
   ```
   (actualmente tiene `left: 80`, los nombres necesitan más espacio)

b. Asegurar que el YAxis muestre TODOS los labels sin autoSkip:
   ```tsx
   <YAxis
     dataKey="name"
     type="category"
     width={110}
     tick={{ fontSize: 11 }}
     interval={0}  // ← CLAVE: interval={0} fuerza mostrar TODOS los labels
   />
   ```
   Sin `interval={0}`, Recharts auto-salta labels si cree que hay overlap.

c. Si los nombres son muy largos, truncarlos en los datos:
   ```typescript
   const clientChartData = useMemo(() => {
     return clientData.map(d => ({
       name: (clientNames[d.clientId] || 'Unknown').length > 16
         ? (clientNames[d.clientId] || 'Unknown').slice(0, 14) + '…'
         : clientNames[d.clientId] || 'Unknown',
       fullName: clientNames[d.clientId] || 'Unknown',
       count: d.count
     }))
   }, [clientData, clientNames])
   ```
   Y usar un Tooltip custom que muestre el nombre completo al hover.

FIX BUG 2 — Tasks by Project → Tasks by Bucket:

Buscar el ChartCard que dice "Tasks by Board" o "Tasks by Project".
Está usando `boardData` que agrupa por `board.name` (Planner, Trips, Vacations).

Reemplazar con datos agrupados por bucket:

a. Crear un nuevo useMemo `bucketData`:
   ```typescript
   const bucketData = useMemo(() => {
     const counts: Record<string, number> = {}
     tasks.forEach(task => {
       const bucket = task.bucket || 'No bucket'
       counts[bucket] = (counts[bucket] || 0) + 1
     })
     return Object.entries(counts)
       .map(([name, count]) => ({ name, count }))
       .sort((a, b) => b.count - a.count)
   }, [tasks])
   ```

b. En el ChartCard, cambiar el título de "Tasks by Board" / "Tasks by Project"
   a "Tasks by Bucket".

c. Usar `bucketData` en lugar de `boardData` para el PieChart:
   ```tsx
   <ChartCard title="Tasks by Bucket" icon={<LayoutGrid size={16} />}>
     <ResponsiveContainer width="100%" height={250}>
       <PieChart>
         <Pie
           data={bucketData}
           cx="50%" cy="50%"
           innerRadius={60} outerRadius={100}
           paddingAngle={5}
           dataKey="count" nameKey="name"
         >
           {bucketData.map((_, index) => (
             <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
           ))}
         </Pie>
         <Tooltip ... />
         <Legend />
       </PieChart>
     </ResponsiveContainer>
   </ChartCard>
   ```

d. SI quieres mantener "Tasks by Board" también, puedes tener ambos charts.
   Pero el que estaba con boardData se reemplaza con bucketData.

Run `npm run typecheck`.
Commit: "fix: analytics top 10 clients shows all names + tasks by bucket chart"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT C1 — Feature: Welcome Wizard expandido (primera sesión)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read CLAUDE.md completely before starting.

Expandir el setup wizard para que pida TODO lo necesario la primera vez
que un usuario inicia sesión. Actualmente solo pide el SharePoint path.

TRIGGER: Cuando user.status === 'active' y user.preferences.sharePointPath
está vacío (primer login aprobado).

File: Crear `src/renderer/src/components/ui/WelcomeWizard.tsx`

PASOS DEL WIZARD:

STEP 1 — Welcome
- Título: "Welcome to NPD Planner"
- Subtítulo: "Let's set up your workspace in a few quick steps."
- Logo/icono de NPD Planner
- Botón "Get Started →"

STEP 2 — SharePoint Folder
- Título: "Connect your SharePoint folder"
- Explicación: "Select the folder where SharePoint syncs on your computer.
  Look for a folder called REPORTS (NPD-SECURE) inside it."
- Suggested path hint: "Usually under OneDrive - Elite Flower/"
- Botón "Browse" → llama window.electronAPI.selectFolder()
- Muestra path seleccionado
- Botón "Verify" → llama verifySharePointPath
- Si válido: green checkmark "Folder verified ✓"
- Si inválido: red message con error específico
- "Next" solo habilitado cuando verificado

STEP 3 — Traze Credentials (Optional)
- Título: "Connect to Traze (optional)"
- Explicación: "If you track AWB shipments, enter your Traze credentials.
  They're stored securely on your device, never sent to any server except Traze."
- Campos: Username, Password
- Botón "Test Connection" → llama traze:check-auth con las credenciales
- Si exitoso: green checkmark "Connected ✓"
- Si falla: red message pero NO bloquear el wizard
- Botón "Skip" para saltar este paso
- Botón "Next" (habilitado siempre, Traze es opcional)

STEP 4 — Done
- Título: "You're all set!"
- Resumen de lo configurado (checkmarks):
  ✓ SharePoint folder connected
  ✓ Traze connected (or "⊘ Traze skipped — set up later in Settings")
- Botón "Go to Dashboard →" → navega a /dashboard

PERSISTENCIA:
- SharePoint path → user.preferences.sharePointPath en Firestore
- Traze credentials → via IPC traze:save-credentials (keychain local)
- Marcar wizard como completado: verificar que sharePointPath no está vacío

INTEGRACIÓN:
- El wizard se muestra como un overlay full-screen (fixed inset-0 z-50)
- Se renderiza en App.tsx o DashboardPage.tsx:
  ```tsx
  {user?.status === 'active' && !user?.preferences?.sharePointPath && (
    <WelcomeWizard user={user} onComplete={() => { /* refresh user */ }} />
  )}
  ```
- No es skippable — debe completar al menos el SharePoint step.

ESTILO: Centrado, max-w-lg, cards con border sutil, progress dots en header
(● ● ○ ○ para step 2 de 4), transiciones suaves entre steps.

Run `npm run typecheck`.
Commit: "feat: expanded welcome wizard with SharePoint and Traze setup"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT C2 — Feature: SharePoint Task Report (HTML al completar + on-demand)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read CLAUDE.md completely before starting.

Generar un HTML report del task en el folder de SharePoint.
Se genera automáticamente al completar el task, y también on-demand
desde el menú de 3 puntos del task card.

REPORT CONTENT (view-only HTML con todas las propiedades del task):
- Header: NPD Planner logo text + "Task Report" + fecha de generación
- Task title (grande, bold)
- Board name + color badge
- Client name
- Status badge con color
- Priority
- Assignees (nombres)
- Date range (start → end)
- PO Numbers (lista)
- AWBs con sus datos: number, boxes, carrier, shipDate, ETA, ATA, guía
- Bucket
- Labels (color pills)
- Description (HTML rendered)
- Notes
- Subtasks con checkmarks (✓ completadas, ○ pendientes) y progress %
- Attachments list (nombres con links relativos al folder)
- Comments (avatar inicial + nombre + fecha + texto)
- Activity Log (últimas 20 entries)
- Footer: "Generated by NPD Planner · Elite Flower · {date}"

ESTILO DEL HTML:
- Inline CSS (no external stylesheets — debe verse bien offline)
- Clean, professional, printable
- Max-width 800px centrado
- Colores matching app palette (green #1D9E75, board colors)
- Tables con borders sutiles para AWBs y subtasks
- Mobile-friendly (responsive dentro del 800px)

IMPLEMENTACIÓN:

1. Crear `src/renderer/src/utils/taskReportGenerator.ts`:

   ```typescript
   import type { Task, Client, Label, AppUser, Board, Comment, TaskHistoryEntry } from '../types'

   interface ReportData {
     task: Task
     client: Client | null
     board: Board | null
     labels: Label[]
     users: AppUser[]
     comments: Comment[]
     history: TaskHistoryEntry[]
   }

   export function generateTaskReportHTML(data: ReportData): string {
     const { task, client, board, labels, users, comments, history } = data
     // Build full HTML string with inline CSS
     // Return complete <!DOCTYPE html> document
   }
   ```

2. Crear `src/renderer/src/utils/taskReportSaver.ts`:

   ```typescript
   /**
    * Saves the report HTML to the SharePoint folder.
    * Path: {SharePointRoot}/{year}/{client}/{taskTitle}/REPORT_{taskTitle}.html
    */
   export async function saveTaskReport(
     task: Task,
     reportHTML: string,
     sharePointPath: string,
     clientName: string
   ): Promise<{ success: boolean; error?: string }>
   ```

   Usa el mismo patrón de IPC que el file attachment system:
   - buildDestinationPath con year/client/task
   - Nombre del archivo: `REPORT_${sanitize(task.title)}.html`
   - copyFile via IPC (escribir el HTML como archivo temporal primero,
     luego copiar al destino, o crear un nuevo IPC handler para escribir
     string content directamente)

3. Si no existe un IPC handler para escribir string content a un path,
   crear uno:

   File: `src/main/ipc/fileHandlers.ts`

   ```typescript
   ipcMain.handle('file:write-text', async (_event, destPath: string, content: string) => {
     try {
       const dir = path.dirname(destPath)
       if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
       fs.writeFileSync(destPath, content, 'utf-8')
       return { success: true }
     } catch (err) {
       return { success: false, error: String(err) }
     }
   })
   ```

   Agregar 'file:write-text' a INVOKE_CHANNELS en preload/index.ts.

4. AUTO-GENERATE ON COMPLETE:

   File: `src/renderer/src/hooks/useTasks.ts` → `complete` callback

   Después de marcar el task como completado (y crear la recurring instance
   si aplica), generar el report:

   ```typescript
   // After completeTask() call:
   if (sharePointPath) {
     try {
       const reportHTML = generateTaskReportHTML({ task: snapshot, client, board, labels, users, comments, history })
       await saveTaskReport(snapshot, reportHTML, sharePointPath, clientName)
     } catch (err) {
       console.error('Failed to generate task report:', err)
       // Non-blocking — don't fail the completion
     }
   }
   ```

   Nota: necesitas acceso a client, board, labels, users, comments, history
   en el scope de useTasks. Algunos ya están disponibles, otros necesitarás
   pasar como parámetros o fetchear on-demand.

5. ON-DEMAND BUTTON:

   File: `src/renderer/src/components/board/TaskCard.tsx`

   En el menú de 3 puntos (Duplicate, Make Recurring, Delete), agregar:
   ```tsx
   { label: 'Generate Report', action: () => { generateReport(task); setMenuOpen(false) } },
   ```

   También agregar en `src/renderer/src/components/task/TaskPage.tsx`
   en su menú de 3 puntos.

   La función `generateReport` debe:
   - Fetch comments y history del task
   - Llamar generateTaskReportHTML
   - Llamar saveTaskReport
   - Mostrar toast de éxito/error

Run `npm run typecheck`.
Commit: "feat: SharePoint task report HTML generation on complete and on-demand"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT C3 — Feature: Delete task → cleanup SharePoint + trash 30 días
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read CLAUDE.md completely before starting.

Cuando un task se elimina debe:
1. Moverse a una "Trash" collection en Firestore (soft delete por 30 días)
2. Después de 30 días, eliminarse permanentemente
3. Al eliminarse permanentemente, borrar el folder del task en SharePoint

ACTUALMENTE: `deleteTask()` hace hard delete directo de Firestore.
No hay trash ni cleanup de SharePoint.

CAMBIOS:

1. NUEVA COLLECTION: `trash`

   File: `src/renderer/src/types/index.ts`

   ```typescript
   export interface TrashedTask {
     id: string           // original task ID
     task: Task           // snapshot completo del task
     trashedAt: Timestamp // cuando se movió a trash
     trashedBy: string    // uid de quien lo eliminó
     boardId: string
     boardType: BoardType
     sharePointRelativePath: string | null  // para cleanup
   }
   ```

2. MODIFICAR deleteTask en `src/renderer/src/lib/firestore.ts`:

   En lugar de `batch.delete(taskRef)`, hacer soft delete:
   ```typescript
   export async function deleteTask(
     taskId: string, userId: string, userName: string
   ): Promise<void> {
     try {
       const taskSnap = await getDoc(doc(db, COLLECTIONS.TASKS, taskId))
       if (!taskSnap.exists()) throw new Error('Task not found')

       const taskData = taskSnap.data() as Task
       const batch = writeBatch(db)

       // Move to trash
       const trashRef = doc(db, 'trash', taskId)
       batch.set(trashRef, {
         id: taskId,
         task: { ...taskData, id: taskId },
         trashedAt: serverTimestamp(),
         trashedBy: userId,
         boardId: taskData.boardId,
         sharePointRelativePath: taskData.attachments?.[0]?.sharePointRelativePath
           ? taskData.attachments[0].sharePointRelativePath.split('/').slice(0, 3).join('/')
           : null,
       })

       // Delete from tasks
       batch.delete(doc(db, COLLECTIONS.TASKS, taskId))

       // Log
       const historyRef = doc(collection(db, COLLECTIONS.HISTORY))
       batch.set(historyRef, {
         taskId, userId, userName,
         action: 'deleted', field: null, oldValue: null, newValue: null,
         timestamp: serverTimestamp(),
       })

       await batch.commit()
     } catch (err) {
       throw new Error(`Failed to delete task: ${err}`)
     }
   }
   ```

3. PERMANENT DELETE después de 30 días:

   Crear función que corre al startup (admin only):
   ```typescript
   export async function cleanupTrash(sharePointPath: string): Promise<number> {
     const cutoff = new Date()
     cutoff.setDate(cutoff.getDate() - 30)

     const snap = await getDocs(
       query(collection(db, 'trash'), where('trashedAt', '<', Timestamp.fromDate(cutoff)))
     )

     const batch = writeBatch(db)
     let count = 0

     for (const d of snap.docs) {
       batch.delete(d.ref)
       count++

       // Cleanup SharePoint folder
       const data = d.data()
       if (data.sharePointRelativePath && sharePointPath) {
         try {
           const folderPath = await window.electronAPI.resolveSharePointPath(
             sharePointPath, data.sharePointRelativePath
           )
           // Delete folder via IPC (need new handler, see below)
           await window.electronAPI.invoke('file:delete-folder', folderPath)
         } catch {
           // Non-blocking — folder might already be gone
         }
       }
     }

     if (count > 0) await batch.commit()
     return count
   }
   ```

4. IPC handler para delete folder:

   File: `src/main/ipc/fileHandlers.ts`
   ```typescript
   ipcMain.handle('file:delete-folder', async (_event, folderPath: string) => {
     try {
       if (fs.existsSync(folderPath)) {
         fs.rmSync(folderPath, { recursive: true, force: true })
       }
       return { success: true }
     } catch (err) {
       return { success: false, error: String(err) }
     }
   })
   ```

   Agregar 'file:delete-folder' a INVOKE_CHANNELS en preload.

5. Llamar cleanupTrash al startup en DashboardPage o App.tsx (admin only).

6. Actualizar el undo toast en useTasks.ts → remove: el undo debe
   mover el task de trash de vuelta a tasks.

Run `npm run typecheck`.
Commit: "feat: soft delete with 30-day trash + SharePoint cleanup"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT C4 — Feature: Owner → enviar password reset email
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read CLAUDE.md completely before starting.

El owner necesita poder resetear la contraseña de un usuario.
Firebase Auth client SDK no permite cambiar contraseñas de otros usuarios.
Pero SÍ permite enviar un email de password reset a cualquier dirección.

SOLUCIÓN: Botón "Send Password Reset" en MembersPanel que envía un email
de Firebase con link para que el usuario cree nueva contraseña. Gratis.

File: `src/renderer/src/components/settings/MembersPanel.tsx`

1. Agregar botón "Reset Password" en el dropdown de acciones de cada member.
   Solo visible para owner/admin.

2. Al click, llamar Firebase Auth sendPasswordResetEmail:
   ```typescript
   import { getAuth, sendPasswordResetEmail } from 'firebase/auth'

   async function handlePasswordReset(email: string, name: string) {
     try {
       const auth = getAuth()
       await sendPasswordResetEmail(auth, email)
       // Show success toast/feedback
       alert(`Password reset email sent to ${email}`)
     } catch (err) {
       console.error('Failed to send password reset:', err)
       alert('Failed to send reset email. Try again.')
     }
   }
   ```

3. En el member row, agregar al dropdown de acciones:
   ```tsx
   { label: 'Reset Password', action: () => handlePasswordReset(member.email, member.name) },
   ```

4. Mostrar un confirmation dialog antes de enviar:
   "Send password reset email to {name} ({email})?"

Run `npm run typecheck`.
Commit: "feat: owner can send password reset email to users from members panel"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT C5 — Feature: EliteQuote sleeve prices global en Firebase
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read CLAUDE.md completely before starting.

CONTEXTO: EliteQuote (Python/PySide6) tiene datos de sleeve prices
guardados en archivos JSON locales:
- %APPDATA%/EliteQuote/rules/sleeve_price_by_price.json
- %APPDATA%/EliteQuote/rules/sleeve_price_by_stemcount.json

Estos deben ser GLOBALES (compartidos por todos los usuarios) y guardarse
en Firebase. Esto es un cambio para el proyecto EliteQuote, NO NPD Planner.

NOTA PARA KIMI: Este prompt es para el REPOSITORIO ELITEQUOTE, no NPD-PLANNER.
Si no tienes acceso a ese repo, documenta los cambios necesarios y salta al
siguiente prompt.

CAMBIOS NECESARIOS EN ELITEQUOTE:

1. Crear collection en Firebase/Supabase:
   - Table/collection: `global_settings`
   - Document: `sleeve_prices`
   - Fields:
     - `by_price: Record<string, string>` (precio → sleeve price)
     - `by_stem_count: Record<string, string>` (stem count → sleeve price)
     - `updated_at: timestamp`
     - `updated_by: string`

2. Al guardar en Settings → "Sleeve by Price" / "Sleeve by Stem Count":
   - Guardar en JSON local como antes (fallback offline)
   - TAMBIÉN sincronizar con Supabase/Firebase

3. Al cargar Settings:
   - Intentar cargar de Supabase/Firebase primero
   - Fallback a JSON local si offline

4. En el SettingsDialog, los tabs "Sleeve by Price" y "Sleeve by Stem Count"
   deben mostrar los datos globales. Si están vacíos, es porque nadie los
   ha configurado aún — agregar un mensaje: "No sleeve prices configured yet.
   Add price mappings below."

Si no puedes hacer estos cambios ahora, crea un archivo
ELITEQUOTE_SLEEVE_MIGRATION.md con las instrucciones detalladas.

Commit: "docs: EliteQuote sleeve price global migration plan"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT D1 — Test integral de todos los cambios
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read CLAUDE.md completely before starting.

Ejecuta las siguientes verificaciones después de todos los prompts anteriores:

1. `npm run typecheck` — zero errors
2. `npm run lint` — zero errors (si eslint está configurado)
3. Buscar `as any`:
   ```bash
   grep -rn "as any" src/renderer/ --include="*.tsx" --include="*.ts"
   ```
   Arreglar cualquiera que encuentres.

4. Test manual checklist:

NOTIFICATIONS:
[ ] Panel se abre con ancho suficiente, mensajes no se cortan
[ ] Panel cierra con Escape y click fuera
[ ] Al abrir panel, notificaciones se marcan como leídas en ~2s
[ ] Badge desaparece después del auto-mark
[ ] Al cerrar y reabrir app, NO salen popups de notificaciones viejas
[ ] Notificación nueva SÍ muestra popup desktop

DATE INPUT:
[ ] Escribir "03232026" → muestra "03/23/2026"
[ ] Click en icono calendario → abre picker nativo
[ ] Fecha guardada correctamente en Firestore (sin off-by-one)
[ ] Fecha se muestra correctamente al reabrir el task

ANALYTICS:
[ ] Top 10 Clients muestra los 10 nombres
[ ] Pie chart muestra "Tasks by Bucket" con buckets correctos

WELCOME WIZARD:
[ ] Nuevo usuario aprobado ve el wizard al primer login
[ ] SharePoint path se verifica y guarda
[ ] Traze credentials se guardan (o se pueden saltar)
[ ] Wizard no aparece en logins siguientes

TASK REPORT:
[ ] Completar task → se genera HTML report en SharePoint folder
[ ] Menú 3 puntos → "Generate Report" → genera/actualiza report
[ ] Report HTML se ve bien al abrirlo en browser

DELETE + TRASH:
[ ] Eliminar task → desaparece de la vista
[ ] Undo funciona (restaura de trash)
[ ] Task eliminado NO aparece después de reload
[ ] Después de 30 días simulados (o manual cleanup), folder SharePoint se borra

PASSWORD RESET:
[ ] Owner ve "Reset Password" en member actions
[ ] Click → confirmation → email enviado
[ ] Usuario recibe email y puede cambiar contraseña

Reporta qué pasó y qué falló. Arregla lo que puedas.
Commit: "chore: integration testing pass for all bugfixes and new features"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT D2 — Actualizar CLAUDE.md + DOCUMENTACION_TECNICA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read CLAUDE.md completely before starting.

Actualiza AMBOS archivos para reflejar todos los cambios hechos:

1. CLAUDE.md — Actualizar checkboxes relevantes que se completaron.

2. DOCUMENTACION_TECNICA_NPD_PLANNER.md — Agregar:

   Sección 2.3: Nuevos archivos creados:
   - src/renderer/src/components/ui/DateInput.tsx
   - src/renderer/src/components/ui/WelcomeWizard.tsx
   - src/renderer/src/utils/taskReportGenerator.ts
   - src/renderer/src/utils/taskReportSaver.ts

   Sección 2.5: Nuevos IPC channels:
   - file:write-text — Escribe string content a un archivo
   - file:delete-folder — Elimina un folder recursivamente

   Sección 3.2: Nueva collection:
   - trash — Soft-deleted tasks con retención de 30 días

   Sección 5: Nuevos flujos:
   - Flujo: Welcome Wizard (onboarding primera sesión)
   - Flujo: Task Report Generation (al completar + on-demand)
   - Flujo: Task Soft Delete + Trash Cleanup

   Sección 6: Nuevos módulos:
   - DateInput component con auto-format
   - WelcomeWizard expandido

   Sección 8: Nuevas reglas de negocio:
   - Trash: 30 días de retención, cleanup automático admin-only
   - Reports: se generan al completar task, almacenados en SharePoint
   - Notificaciones: auto mark-as-read al abrir panel (2s delay)
   - Desktop notifications: solo para eventos nuevos post-launch

Commit: "docs: update CLAUDE.md and technical documentation with all changes"
