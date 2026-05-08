# SPEC — Roles, Permissions & Approval Modal
## NPD Planner — Elite Flower

---

## 1. Objetivo

Implementar un sistema de roles granular con tres niveles predeterminados (`owner`, `admin`, `member`), permisos por área configurables por usuario, y un **modal de aprobación** que aparece automáticamente cuando llega un usuario nuevo — sin depender del sistema de notificaciones del OS.

---

## 2. Roles y jerarquía

```
owner  >  admin  >  member
```

| Rol | Quién lo tiene | Puede ser cambiado por |
|-----|---------------|----------------------|
| `owner` | Primer usuario registrado / promovido | Solo otro `owner` |
| `admin` | Promovido por owner o admin | Owner o admin |
| `member` | Todo usuario nuevo aprobado | Owner o admin |

**Reglas de inmutabilidad:**
- Admin NO puede cambiar el rol de otro admin ni de un owner
- Solo owner puede eliminar usuarios
- Owner y admin siempre bypasan `areaPermissions`

---

## 3. areaPermissions (nuevo campo en user document)

Cada usuario `member` tiene un campo `areaPermissions` en Firestore:

```typescript
areaPermissions: {
  boards: {
    [boardId: string]: 'none' | 'view' | 'edit'
  },
  projects: 'none' | 'view' | 'edit',
  recipes:  'none' | 'view' | 'edit',
  analytics:'none' | 'view' | 'edit',
  settings: 'none'   // siempre none para members
}
```

**Defaults al aprobar un usuario nuevo:**
```typescript
{
  boards: {},         // ningún board asignado
  projects: 'view',
  recipes:  'none',
  analytics:'none',
  settings: 'none'
}
```

Owner y admin ignoran completamente `areaPermissions`.

---

## 4. Matriz de permisos

### 4.1 Boards & Tasks

| Acción | Owner | Admin | Member |
|--------|-------|-------|--------|
| Ver boards | ✅ | ✅ | según `boards[boardId]` |
| Crear / editar boards | ✅ | ✅ | ❌ |
| Eliminar boards | ✅ | ✅ | ❌ |
| Crear tareas | ✅ | ✅ | si `edit` en ese board |
| Editar cualquier tarea | ✅ | ✅ | si `edit` en ese board |
| Eliminar tarea propia | ✅ | ✅ | ✅ |
| Eliminar cualquier tarea | ✅ | ✅ | ❌ |

### 4.2 NPD Projects & Recipe Manager

| Acción | Owner | Admin | Member |
|--------|-------|-------|--------|
| Ver proyectos | ✅ | ✅ | si `projects` ≥ `view` |
| Crear / editar proyectos | ✅ | ✅ | si `projects` = `edit` |
| Eliminar proyectos | ✅ | ✅ | ❌ |
| Ver recetas | ✅ | ✅ | si `recipes` ≥ `view` |
| Editar recetas | ✅ | ✅ | si `recipes` = `edit` |
| Force-unlock receta | ✅ | ✅ | ❌ |

### 4.3 Analytics & Settings

| Acción | Owner | Admin | Member |
|--------|-------|-------|--------|
| Ver analytics | ✅ | ✅ | si `analytics` ≥ `view` |
| Cambiar settings globales | ✅ | ✅ | ❌ |
| Gestionar labels / clients | ✅ | ✅ | ❌ |
| Aprobar nuevos usuarios | ✅ | ✅ | ❌ |
| Cambiar rol de usuarios | ✅ | ✅ (no owners/admins) | ❌ |
| Suspender usuarios | ✅ | ✅ | ❌ |
| Eliminar usuarios | ✅ | ❌ | ❌ |
| Editar areaPermissions | ✅ | ✅ | ❌ |

---

## 5. Flujo de registro y aprobación

```
1. Usuario registra con @eliteflower.com
   ↓
2. Firestore: status='awaiting', role='member'
3. Se escribe doc en 'pendingApprovals/{uid}'
   ↓
4. Admins/owners activos reciben:
   a) Notificación in-app (bell)
   b) ApprovalModal se abre automáticamente (Firestore listener)
   ↓
5. En el modal, el admin:
   - Ve nombre, email, fecha de registro
   - Elige rol: member | admin
   - Configura areaPermissions módulo por módulo
   - Presiona "Approve" o "Reject"
   ↓
6a. Approve → status='active', role=elegido, areaPermissions=configurado
6b. Reject  → status='rejected'
   ↓
7. El pendingApprovals/{uid} se elimina
8. El usuario en espera ve la pantalla actualizada en tiempo real
```

---

## 6. ApprovalModal — Comportamiento

- **Trigger:** Firestore `onSnapshot` en colección `pendingApprovals`
  - Cualquier admin/owner activo que esté logueado verá el modal
  - Si hay múltiples admins online, el modal muestra quién está "reviewing" (lock optimista)
- **No bloquea la UI:** tiene overlay semitransparente, el admin puede cerrarlo y reabrirlo desde la campana de notificaciones
- **Cola:** si llegan N usuarios pending, muestra uno a la vez con indicador "1 of N"
- **Auto-dismiss:** si otro admin aprueba/rechaza primero, el modal se cierra solo (real-time)

### Estructura visual del modal

```
┌─────────────────────────────────────────┐
│  New user request          [×]          │
│─────────────────────────────────────────│
│  [Avatar] Laura García                  │
│           laura@eliteflower.com         │
│           Registered 2 hours ago        │
│                                         │
│  Role                                   │
│  ○ Member   ○ Admin                     │
│                                         │
│  Area permissions                       │
│  ┌─────────────────────────────────┐    │
│  │ Planner board   [None][View][Edit]│  │
│  │ Trips           [None][View][Edit]│  │
│  │ Vacations       [None][View][Edit]│  │
│  │ NPD Projects    [None][View][Edit]│  │
│  │ Recipe Manager  [None][View][Edit]│  │
│  │ Analytics       [None][View][Edit]│  │
│  └─────────────────────────────────┘    │
│                                         │
│  [Reject]              [Approve →]      │
└─────────────────────────────────────────┘
```

---

## 7. Nuevos archivos

```
src/renderer/src/
├── components/
│   ├── auth/
│   │   └── ApprovalModal.tsx          ← NUEVO
│   └── settings/
│       ├── MembersPanel.tsx           ← MODIFICAR (añadir areaPermissions editor)
│       └── AreaPermissionsEditor.tsx  ← NUEVO
├── hooks/
│   └── usePendingApprovals.ts         ← NUEVO
├── lib/
│   └── permissions.ts                 ← NUEVO (helpers: canView, canEdit, etc.)
└── types/
    └── index.ts                       ← MODIFICAR (añadir AreaPermissions type)
```

---

## 8. Firestore — Cambios

### 8.1 Nueva colección: `pendingApprovals`

```typescript
// pendingApprovals/{uid}
{
  uid: string,
  displayName: string,
  email: string,
  registeredAt: Timestamp,
  reviewingBy: string | null,  // uid del admin que abrió el modal
}
```

### 8.2 Campo nuevo en users

```typescript
// users/{uid}
{
  // ... campos existentes ...
  areaPermissions: AreaPermissions  // nuevo
}
```

### 8.3 Firestore rules — añadir

```javascript
match /pendingApprovals/{uid} {
  allow read: if isAdmin();
  allow create: if isAuthenticated() && request.auth.uid == uid;
  allow update: if isAdmin();   // para reviewingBy lock
  allow delete: if isAdmin();
}
```

---

## 9. permissions.ts helper

```typescript
// src/renderer/src/lib/permissions.ts

import { AppUser } from '../types'

export type AreaKey = 'projects' | 'recipes' | 'analytics'
export type BoardAccess = 'none' | 'view' | 'edit'
export type AreaAccess = 'none' | 'view' | 'edit'

export function isPrivileged(user: AppUser): boolean {
  return user.role === 'owner' || user.role === 'admin'
}

export function canViewBoard(user: AppUser, boardId: string): boolean {
  if (isPrivileged(user)) return true
  const access = user.areaPermissions?.boards?.[boardId] ?? 'none'
  return access === 'view' || access === 'edit'
}

export function canEditBoard(user: AppUser, boardId: string): boolean {
  if (isPrivileged(user)) return true
  return user.areaPermissions?.boards?.[boardId] === 'edit'
}

export function canViewArea(user: AppUser, area: AreaKey): boolean {
  if (isPrivileged(user)) return true
  const access = user.areaPermissions?.[area] ?? 'none'
  return access === 'view' || access === 'edit'
}

export function canEditArea(user: AppUser, area: AreaKey): boolean {
  if (isPrivileged(user)) return true
  return user.areaPermissions?.[area] === 'edit'
}
```

---

## 10. Tipos — cambios en index.ts

```typescript
// Añadir a types/index.ts

export interface AreaPermissions {
  boards: Record<string, 'none' | 'view' | 'edit'>
  projects: 'none' | 'view' | 'edit'
  recipes:  'none' | 'view' | 'edit'
  analytics:'none' | 'view' | 'edit'
  settings: 'none'
}

export const DEFAULT_AREA_PERMISSIONS: AreaPermissions = {
  boards:   {},
  projects: 'view',
  recipes:  'none',
  analytics:'none',
  settings: 'none',
}

export interface PendingApproval {
  uid: string
  displayName: string
  email: string
  registeredAt: Timestamp
  reviewingBy: string | null
}

// Modificar AppUser
export interface AppUser {
  // ... campos existentes ...
  areaPermissions?: AreaPermissions   // opcional para compatibilidad con usuarios existentes
}
```

---

## 11. Flujo de registro — cambio en auth

Al crear un usuario nuevo (status: `awaiting`), también crear el doc en `pendingApprovals`:

```typescript
// En la función de registro (firestore.ts o auth hook)
await Promise.all([
  setDoc(doc(db, 'users', uid), { ...userData, status: 'awaiting' }),
  setDoc(doc(db, 'pendingApprovals', uid), {
    uid,
    displayName,
    email,
    registeredAt: serverTimestamp(),
    reviewingBy: null,
  }),
])
```

---

## 12. Post-implementación

Después de cada prompt ejecutado, actualizar:
- `CLAUDE.md` — Feature checklist
- `DOCUMENTACION_TECNICA_NPD_PLANNER.md` — Sección 4 (usuarios/roles/permisos)
