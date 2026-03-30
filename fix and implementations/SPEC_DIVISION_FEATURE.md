# SPEC: Division Feature — NPD Planner

## Resumen del cambio

Se agrega el concepto de **División** como un sub-nivel dentro de **Cliente**. La jerarquía resultante es:

```
Año  →  Cliente  →  División  →  Tarea
```

**Ejemplo real:**
```
2026 > Publix > Salt Lake > Task Name
```

Esto se refleja en:
1. **NewTaskModal** — dropdown de división aparece después de seleccionar cliente
2. **TaskPage** — campo división editable, mismo patrón que cliente
3. **Settings → Clients tab** — sub-tab o sección "Divisions" por cliente
4. **SharePoint path** — incluye división como carpeta adicional
5. **Task tree / board view** — breadcrumb informativo actualizado

---

## 1. Firestore Schema

### Colección nueva: `divisions`

```typescript
interface Division {
  id: string              // nanoid
  clientId: string        // FK → clients/{id}
  name: string            // e.g. "Salt Lake", "Miami", "Orlando"
  active: boolean         // soft delete
  createdAt: Timestamp
  updatedAt: Timestamp
  createdBy: string       // uid
}
```

### Colección `tasks` — campo nuevo

```typescript
// Agregar a la interfaz Task existente:
divisionId?: string | null    // FK → divisions/{id}, opcional
```

### Reglas Firestore — agregar:

```
match /divisions/{divisionId} {
  allow read: if isActiveUser();
  allow write: if isActiveUser();
}
```

---

## 2. TypeScript — types/index.ts

Agregar la interfaz `Division` y actualizar la interfaz `Task`:

```typescript
export interface Division {
  id: string
  clientId: string
  name: string
  active: boolean
  createdAt: Timestamp
  updatedAt: Timestamp
  createdBy: string
}

// En Task, agregar:
divisionId?: string | null
```

---

## 3. Firestore Operations — firestore.ts

Agregar las siguientes funciones (mismo patrón que clients):

```typescript
// Subscribe a divisiones de un cliente específico
export function subscribeToDivisions(
  clientId: string,
  callback: (divisions: Division[]) => void
): Unsubscribe

// Crear división
export async function createDivision(
  data: Omit<Division, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string>

// Update división
export async function updateDivision(
  id: string,
  data: Partial<Pick<Division, 'name' | 'active'>>
): Promise<void>

// Subscribirse a TODAS las divisiones (para Settings)
export function subscribeToAllDivisions(
  callback: (divisions: Division[]) => void
): Unsubscribe
```

---

## 4. Hook: useDivisions.ts

Crear `src/renderer/src/hooks/useDivisions.ts`:

```typescript
// Recibe clientId como parámetro
// Cuando clientId cambia, re-subscribe automáticamente
// Retorna: { divisions, loading }
// Si clientId es null/undefined → divisions = []
```

---

## 5. NewTaskModal — cambios

**Archivo:** `src/renderer/src/components/ui/NewTaskModal.tsx`

Después del select de Cliente:

```
[Cliente dropdown]
    ↓ (cuando clientId está seleccionado)
[División dropdown]  ← NUEVO
    - Opciones: divisiones activas del cliente seleccionado
    - Última opción: "+ New Division" (igual al patrón de cliente)
    - Si no hay divisiones: mostrar solo "+ New Division"
    - Si clientId no seleccionado: ocultar división completamente
    - Campo opcional (no bloquea submit)
```

**Estado interno nuevo:**
```typescript
const [divisionId, setDivisionId] = useState<string>('')
const [showNewDivision, setShowNewDivision] = useState(false)
const [newDivisionName, setNewDivisionName] = useState('')
const { divisions } = useDivisions(clientId) // hook nuevo
```

**handleCreateDivision:**
```typescript
async function handleCreateDivision() {
  if (!newDivisionName.trim() || !clientId) return
  const id = await createDivision({
    clientId,
    name: newDivisionName.trim().toUpperCase(),
    active: true,
    createdBy: user.uid,
  })
  setDivisionId(id)
  setShowNewDivision(false)
  setNewDivisionName('')
}
```

**Al crear la tarea:** incluir `divisionId: divisionId || null`

---

## 6. TaskPage — cambios

**Archivo:** `src/renderer/src/components/task/TaskPage.tsx`

Agregar fila de División debajo de la fila de Cliente, usando el mismo componente `PropRow`:

```tsx
<PropRow key="builtin-division" icon={<Layers size={14} />} label="Division">
  {/* Mismo patrón que cliente: select + showNewDivision inline */}
  {/* Si no hay clientId en la tarea: mostrar "— Select client first —" deshabilitado */}
  {/* Divisiones se filtran por task.clientId */}
</PropRow>
```

Al cambiar el cliente en una tarea existente → limpiar `divisionId` automáticamente.

---

## 7. Settings Page — Clients Tab

**Archivo:** `src/renderer/src/pages/SettingsPage.tsx` y `src/renderer/src/components/settings/ClientManager.tsx`

Agregar nueva pestaña/tab en Settings:

```
Settings tabs actuales:
  Profile | Members | Boards | Clients | Labels | Files

Cambio:
  Profile | Members | Boards | Clients | Divisions | Labels | Files
```

**Nueva pestaña "Divisions":**

Crear `src/renderer/src/components/settings/DivisionManager.tsx`:

```
Layout:
┌─────────────────────────────────────────────┐
│ Division Management                          │
│ Manage divisions per client                  │
│                                              │
│ Filter by client: [dropdown de clientes]     │
│                                              │
│ ┌──────────────────────────────────────────┐│
│ │ Name          Client      Status  Actions ││
│ │ Salt Lake     Publix      Active  ✏ 🗑   ││
│ │ Miami         Publix      Active  ✏ 🗑   ││
│ │ Dallas        Walmart     Active  ✏ 🗑   ││
│ └──────────────────────────────────────────┘│
│ [+ Add Division]                             │
└─────────────────────────────────────────────┘
```

- "+ Add Division" abre modal inline: Name + Client selector
- Edit (✏): inline name editing
- Deactivar (🗑): soft-delete (active: false), no borrar Firestore

---

## 8. SharePoint Path — actualización

**Archivo:** `src/renderer/src/lib/sharepointLocal.ts`

Path actual:
```
{root}/{year}/{clientName}/{taskTitle}/{fileName}
```

Path nuevo (cuando hay división):
```
{root}/{year}/{clientName}/{divisionName}/{taskTitle}/{fileName}
```

Path nuevo (cuando NO hay división — backward compatible):
```
{root}/{year}/{clientName}/{taskTitle}/{fileName}
```

**Cambiar la firma de `buildDestinationPath`:**
```typescript
export function buildDestinationPath(
  sharePointRoot: string,
  year: number,
  clientName: string,
  taskTitle: string,
  fileName: string,
  divisionName?: string   // nuevo parámetro opcional
): string
```

**Lógica:**
```typescript
const segments = divisionName
  ? [sharePointRoot, String(year), sanitize(clientName), sanitize(divisionName), sanitize(taskTitle), sanitize(fileName)]
  : [sharePointRoot, String(year), sanitize(clientName), sanitize(taskTitle), sanitize(fileName)]
```

Actualizar `buildRelativePath` con el mismo patrón.

**Actualizar los callers** (donde se llama `buildDestinationPath` en TaskPage/sharepointLocal) para pasar `divisionName` resolviendo desde el store o pasando el nombre del objeto.

---

## 9. Breadcrumb / Path Display en Task

El texto informativo debajo de los adjuntos actualmente muestra:
```
📁 2026 / ClientName / TaskTitle
```

Actualizar a:
```
📁 2026 / ClientName / DivisionName / TaskTitle   ← cuando hay división
📁 2026 / ClientName / TaskTitle                   ← sin división (sin cambio)
```

---

## 10. Orden de implementación

1. `types/index.ts` — agregar `Division` interface + `divisionId` en `Task`
2. `firestore.ts` — funciones CRUD para divisions
3. `firestore.rules` — agregar regla divisions
4. `hooks/useDivisions.ts` — hook reactivo
5. `components/ui/NewTaskModal.tsx` — dropdown división
6. `components/task/TaskPage.tsx` — PropRow división
7. `components/settings/DivisionManager.tsx` — nuevo componente
8. `pages/SettingsPage.tsx` — agregar tab Divisions
9. `lib/sharepointLocal.ts` — path actualizado
10. Actualizar `CLAUDE.md` checkboxes
11. Actualizar `DOCUMENTACION_TECNICA_NPD_PLANNER.md`

---

## Notas importantes

- **División es opcional** — no bloquea crear tareas. Clientes existentes sin divisiones siguen funcionando igual.
- **Backward compatible** — SharePoint path sin división es idéntico al actual.
- **Auto-clear división** — si el usuario cambia de cliente en una tarea, `divisionId` se limpia a null.
- **Solo admin** puede gestionar divisiones en Settings (mismo que clients).
- **Patrón "+ New Division"** es idéntico al patrón existente de "+ New Client" para consistencia UX.
