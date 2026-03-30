# SPEC: Granular Access Control per Module (Area Permissions)

## Problema a resolver

Los roles actuales (`owner`, `admin`, `member`) son binarios: o tienes acceso a todo o solo a lo básico.
El equipo necesita control granular: un usuario puede ver el board de Planner pero no EliteQuote, o puede ver Trips en modo lectura pero no editar.

## Diseño del sistema

### Principio central

El sistema de **roles globales no cambia** — `owner`, `admin`, `member` siguen existiendo con sus permisos actuales. Lo que se agrega es una capa de **permisos de área** que los admins/owners asignan per-usuario.

**Regla de herencia:**
- `owner` → siempre acceso completo a todo, sin excepción, no configurable
- `admin` → siempre acceso completo a todo, no configurable  
- `member` → acceso controlado por `areaPermissions` en su documento de usuario

Esto es correcto corporativamente: los admins no se restringen a sí mismos.

---

## 1. Áreas configurables (módulos)

| Area ID | Descripción | Opciones de acceso |
|---------|-------------|-------------------|
| `dashboard` | Página de inicio y stats | `view` / `none` |
| `board_{boardId}` | Cada board individualmente | `edit` / `view` / `none` |
| `calendar` | Master Calendar | `view` / `none` |
| `my_tasks` | My Tasks page | `view` / `none` |
| `my_space` | My Space page | `view` / `none` |
| `analytics` | Analytics page | `view` / `none` |
| `elitequote` | Módulo EliteQuote/Recipe Manager | `edit` / `view` / `none` |
| `settings_files` | Tab de Files en Settings | `view` / `none` |

**Nota sobre boards:** Los boards son dinámicos. El ID del área es `board_{boardId}`. Cuando se crea un nuevo board, los usuarios `member` NO tienen acceso por defecto — el admin debe otorgarlo explícitamente.

**Nivel de acceso por área:**
- `none` → el área no aparece en el sidebar, navegar a la ruta redirige a `/dashboard`
- `view` → puede ver pero no crear/editar/borrar (read-only)
- `edit` → acceso completo de escritura dentro de los límites del rol `member`

---

## 2. Firestore Schema — cambio en `users`

Agregar campo `areaPermissions` al documento de usuario:

```typescript
// En la interfaz AppUser existente, agregar:
areaPermissions?: Record<string, 'none' | 'view' | 'edit'>

// Ejemplos de valores:
{
  "dashboard": "view",
  "board_abc123": "edit",
  "board_xyz789": "view",
  "board_trips01": "none",
  "calendar": "view",
  "my_tasks": "view",
  "my_space": "view",
  "analytics": "none",
  "elitequote": "edit",
  "settings_files": "view"
}
```

**Default para nuevos members:** Todos en `none` hasta que un admin configure. Esto es el comportamiento más seguro corporativamente.

**Alternativa configurable:** Admins pueden definir un "default template" en `settings/defaultPermissions` doc — cuando se aprueba un nuevo usuario, se copian esos defaults.

---

## 3. TypeScript — types/index.ts

```typescript
export type AreaPermission = 'none' | 'view' | 'edit'

export type AreaPermissions = Record<string, AreaPermission>

// En AppUser, agregar:
areaPermissions?: AreaPermissions

// Tipo helper para las áreas estáticas conocidas:
export type StaticAreaId =
  | 'dashboard'
  | 'calendar'
  | 'my_tasks'
  | 'my_space'
  | 'analytics'
  | 'elitequote'
  | 'settings_files'

// Board area IDs son dinámicos: `board_${boardId}`
```

---

## 4. Hook: useAreaPermission.ts

Crear `src/renderer/src/hooks/useAreaPermission.ts`:

```typescript
export function useAreaPermission(areaId: string): AreaPermission {
  const { user } = useAuthStore()
  
  // owner y admin siempre tienen edit
  if (!user) return 'none'
  if (user.role === 'owner' || user.role === 'admin') return 'edit'
  
  // member: leer de areaPermissions
  return user.areaPermissions?.[areaId] ?? 'none'
}

// Hook plural para múltiples áreas a la vez
export function useAreaPermissions(areaIds: string[]): Record<string, AreaPermission> {
  ...
}

// Hook específico para boards
export function useBoardPermission(boardId: string): AreaPermission {
  return useAreaPermission(`board_${boardId}`)
}
```

---

## 5. Aplicación de permisos en la UI

### 5.1 AppLayout / Sidebar

El sidebar filtra items según permisos:

```typescript
// Navegación estática
const navItems = [
  { path: '/dashboard',  areaId: 'dashboard',  ... },
  { path: '/my-tasks',   areaId: 'my_tasks',   ... },
  { path: '/my-space',   areaId: 'my_space',   ... },
  { path: '/calendar',   areaId: 'calendar',   ... },
  { path: '/analytics',  areaId: 'analytics',  ... },
]

// Filtrar: solo mostrar items donde permission !== 'none'
const visibleItems = navItems.filter(item => 
  getPermission(item.areaId) !== 'none'
)

// Boards: filtrar igualmente
const visibleBoards = boards.filter(board =>
  getPermission(`board_${board.id}`) !== 'none'
)
```

### 5.2 ProtectedRoute — actualizar

Agregar soporte para `areaId`:

```typescript
// Ruta protegida con verificación de área:
<ProtectedRoute areaId="analytics">
  <AnalyticsPage />
</ProtectedRoute>

// Si permission === 'none' → <Navigate to="/dashboard" />
// Si permission === 'view' o 'edit' → renderiza el componente
```

### 5.3 BoardPage — modo read-only

Si `boardPermission === 'view'`:
- No mostrar "+ New Task" button
- Cards no editables (click abre task pero en modo lectura)
- No mostrar 3-dot menu en cards
- No mostrar column "+ Add" button
- Mostrar badge "View only" en el topbar

Si `boardPermission === 'edit'`:
- Comportamiento normal actual

### 5.4 EliteQuote module

Si `elitequotePermission === 'view'`:
- Puede ver recetas pero no crear/editar/borrar

Si `elitequotePermission === 'edit'`:
- Acceso completo

Si `elitequotePermission === 'none'`:
- No aparece en sidebar, ruta redirige

---

## 6. MembersPanel — agregar Access Control UI

En la sección de cada miembro activo, agregar botón "Manage Access" que abre un modal/panel.

### 6.1 Modal: "Access Permissions — {User Name}"

```
┌────────────────────────────────────────────────────────────┐
│  Access Permissions — Laura García                          │
│  Role: Member                                               │
│                                                             │
│  ─── Core Areas ─────────────────────────────────────────  │
│                                                             │
│  Dashboard          [○ None]  [● View]  [○ Edit]           │
│  My Tasks           [○ None]  [● View]  [○ Edit]           │
│  My Space           [○ None]  [● View]  [○ Edit]           │
│  Master Calendar    [○ None]  [● View]  [○ Edit]           │
│  Analytics          [● None]  [○ View]  [─ N/A]            │
│                                                             │
│  ─── Boards ─────────────────────────────────────────────  │
│                                                             │
│  ● Planner          [○ None]  [○ View]  [● Edit]           │
│  ● Trips            [○ None]  [● View]  [○ Edit]           │
│  ● Vacations        [● None]  [○ View]  [○ Edit]           │
│  ◌ Miami Show 2026  [● None]  [○ View]  [○ Edit]           │
│                                                             │
│  ─── Modules ─────────────────────────────────────────── │
│                                                             │
│  EliteQuote         [○ None]  [○ View]  [● Edit]           │
│  Files (Settings)   [○ None]  [● View]  [○ Edit]           │
│                                                             │
│                              [Cancel]  [Save Changes]       │
└────────────────────────────────────────────────────────────┘
```

**Interacción:** Radio buttons inline por área (None / View / Edit, o None / View para áreas sin edit).

**Guardado:** Un solo `updateUser(uid, { areaPermissions: { ...newPerms } })` al hacer Save — no guarda incrementalmente para evitar estados intermedios.

**Nota UX:** Si un usuario es `owner` o `admin`, mostrar en su lugar: "This user has full access based on their role. Area permissions do not apply to admins or owners." (no mostrar checkboxes).

---

## 7. Settings — Default Permissions Template

En `Settings → Members` (visible solo para admin/owner), agregar sección:

```
─── Default Permissions for New Members ─────────────────────

When a new member is approved, they will automatically receive
these permissions. You can always customize per user afterward.

Dashboard          [○ None]  [● View]
My Tasks           [○ None]  [● View]
...
[Save Default Template]
```

**Firestore:** Guardar en `settings/defaultPermissions` como `{ areaPermissions: {...} }`.

**Aplicación:** En la función `updateUserStatus(uid, 'active')` — leer `settings/defaultPermissions` y copiar `areaPermissions` al usuario si el documento existe.

---

## 8. Firestore Rules — actualización

Los `areaPermissions` son parte del doc de usuario. Las reglas existentes ya permiten:
- Admins actualizar usuarios member
- Usuarios editar sus propias preferencias (excepto role/status)

**Agregar restricción explícita:** `members` NO pueden editar su propio `areaPermissions`:

```javascript
// En el allow update de users, la condición isSelf ya tiene:
!request.resource.data.diff(resource.data)
  .affectedKeys()
  .hasAny(['role', 'status', 'email', 'uid'])

// Agregar 'areaPermissions' a esa lista:
.hasAny(['role', 'status', 'email', 'uid', 'areaPermissions'])
```

Solo admins/owners pueden modificar `areaPermissions` de otros.

---

## 9. Firestore Operations — firestore.ts

Agregar función:

```typescript
export async function updateUserAreaPermissions(
  uid: string,
  areaPermissions: AreaPermissions
): Promise<void>

export async function getDefaultPermissions(): Promise<AreaPermissions | null>

export async function saveDefaultPermissions(
  areaPermissions: AreaPermissions
): Promise<void>
```

---

## 10. Orden de implementación

1. `types/index.ts` — `AreaPermission`, `AreaPermissions`, actualizar `AppUser`
2. `firestore.ts` — `updateUserAreaPermissions`, `getDefaultPermissions`, `saveDefaultPermissions`
3. `firestore.rules` — agregar `areaPermissions` a campos protegidos del self-update
4. `hooks/useAreaPermission.ts` — hook nuevo
5. `components/ui/ProtectedRoute.tsx` — soporte para `areaId` prop
6. `components/ui/AppLayout.tsx` — sidebar filtra por permisos
7. `components/ui/AccessPermissionsModal.tsx` — nuevo componente modal
8. `components/settings/MembersPanel.tsx` — botón "Manage Access" por usuario
9. `pages/BoardPage.tsx` — modo view-only cuando `permission === 'view'`
10. `pages/SettingsPage.tsx` — sección Default Permissions en Members tab
11. Aplicar `useAreaPermission` en rutas relevantes (Analytics, EliteQuote, etc.)
12. Actualizar `CLAUDE.md` y `DOCUMENTACION_TECNICA_NPD_PLANNER.md`

---

## Notas de diseño corporativo

- **Fail-secure:** Default `none` para members nuevos — mejor pedir acceso que tener fuga
- **Sin side effects de roles:** El sistema de roles global no se toca, solo se agrega la capa de área
- **Auditabilidad:** Cada cambio de `areaPermissions` pasa por Firestore (trackeable en Activity si se quisiera)
- **Escalable:** Agregar un módulo nuevo = agregar su `areaId` al modal. Sin código adicional
- **UX consistente:** El mismo patrón None/View/Edit en todas las áreas — no hay confusión de qué significa cada nivel
