# NPD Planner — Bug Fixes (4 bugs)
# Para: Claude Code en terminal
# Lee CLAUDE.md antes de empezar

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT — 4 Bug Fixes en Planner
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lee CLAUDE.md completamente antes de empezar.

ARCHIVOS A LEER PRIMERO:
- src/renderer/src/components/settings/ (todos)
- src/renderer/src/components/task/TaskPage.tsx o TaskFullPage.tsx
- src/renderer/src/lib/firestore.ts (deleteTask)
- src/renderer/src/components/board/BoardView.tsx o BoardColumn.tsx
- src/renderer/src/types/index.ts

Corrige los 4 bugs en orden. Después de cada uno: npm run typecheck.
Solo commites al final cuando los 4 estén resueltos.

---

## BUG 1 — Board Template en Settings no muestra clientes

PROBLEMA: En Settings → Boards → Board Template Editor, hay un dropdown
de "Client" que aparece vacío aunque sí existen clientes en Client Management.

CAUSA PROBABLE: El componente que renderiza el Board Template Editor
no está suscrito a `subscribeToClients` de firestore.ts. Carga los
boards pero no carga los clientes.

ARCHIVOS A REVISAR:
- src/renderer/src/components/settings/BoardTemplateEditor.tsx (o similar)

SOLUCIÓN:
Dentro del componente que muestra el dropdown de clientes en el template
editor, agregar un useEffect que llame `subscribeToClients` y guarde
el resultado en estado local. Usar el mismo patrón que cualquier otro
componente que muestra clientes (por ejemplo TaskPage.tsx).

```typescript
const [clients, setClients] = useState<Client[]>([])

useEffect(() => {
  const unsub = subscribeToClients((data) => setClients(data))
  return unsub
}, [])
```

Verificar: abrir Settings → Boards → editar un board template →
el dropdown de Client debe mostrar todos los clientes existentes.

---

## BUG 2 — Eliminar tarea no la elimina del board

PROBLEMA: Al eliminar una tarea (desde el menú de 3 puntos o desde
TaskPage), la tarea no desaparece del tablero. Puede que la función
deleteTask se llame pero el listener no detecte el cambio, o que
la tarea se marque como deleted pero el filtro no la excluya.

ARCHIVOS A REVISAR:
- src/renderer/src/lib/firestore.ts → función deleteTask
- src/renderer/src/components/board/BoardView.tsx o BoardColumn.tsx
- src/renderer/src/hooks/useTasks.ts (si existe)

PASOS DE INVESTIGACIÓN:
1. Verificar que deleteTask en firestore.ts llama `deleteDoc` correctamente
   y NO solo actualiza un campo `deleted: true`
2. Verificar que el listener `subscribeToTasks` en el board recibe
   el snapshot actualizado después del delete
3. Si la app usa soft-delete (campo deleted: true), verificar que
   el query de subscribeToTasks filtra `where('deleted', '!=', true)`

SOLUCIÓN MÁS COMÚN — si usa soft-delete sin filtro:
```typescript
// En subscribeToTasks, agregar el filtro:
query(
  collection(db, COLLECTIONS.TASKS),
  where('boardId', '==', boardId),
  where('deleted', '!=', true),  // ← agregar si falta
  orderBy('deleted'),             // Firestore requiere orderBy cuando usas !=
  orderBy('createdAt', 'desc')
)
```

SOLUCIÓN si deleteDoc no funciona:
Verificar en firestore.rules que el usuario tiene permiso para delete
en la colección tasks. Si no lo tiene, agregar:
```javascript
allow delete: if isActiveUser();
```

Verificar: crear una tarea → eliminarla → debe desaparecer del board
inmediatamente sin recargar.

---

## BUG 3 — "Add a description" aparece fuera del textbox

PROBLEMA: En TaskPage/TaskFullPage, el placeholder "Add a description..."
aparece debajo del área del editor TipTap en lugar de dentro de él.
Cuando se hace scroll, queda un espacio en blanco al final.

ARCHIVOS A REVISAR:
- src/renderer/src/components/task/RichTextEditor.tsx
- src/renderer/src/components/task/TaskPage.tsx o TaskFullPage.tsx

CAUSA PROBABLE: El editor TipTap tiene el placeholder configurado
como texto externo (un <p> o <span> separado) en lugar de usar la
extensión Placeholder de TipTap. O el contenedor del editor tiene
un height fijo que hace que el placeholder quede fuera.

SOLUCIÓN — usar la extensión Placeholder de TipTap correctamente:

1. Verificar que Placeholder está instalado e importado:
```typescript
import Placeholder from '@tiptap/extension-placeholder'
```

2. Agregarlo a las extensions del editor:
```typescript
useEditor({
  extensions: [
    StarterKit,
    // ... otras extensions ...
    Placeholder.configure({
      placeholder: 'Add a description...',
    }),
  ],
})
```

3. Agregar el CSS para que el placeholder aparezca DENTRO del editor:
En el archivo CSS global o en un <style> dentro del componente:
```css
.tiptap p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  float: left;
  color: #9ca3af;
  pointer-events: none;
  height: 0;
}
```

4. Si hay un elemento externo mostrando "Add a description..." como
texto hardcodeado fuera del editor, eliminarlo.

PARA EL SCROLL EXCESIVO:
El contenedor del editor probablemente tiene `min-height` o `height`
que excede el contenido real. Revisar el wrapper del RichTextEditor
y cambiar height fijo por `min-height`:

```tsx
// ANTES (problemático):
<div className="h-64 overflow-y-auto">
  <EditorContent editor={editor} />
</div>

// DESPUÉS (correcto):
<div className="min-h-[120px] max-h-[400px] overflow-y-auto">
  <EditorContent editor={editor} />
</div>
```

Verificar: abrir una tarea → el placeholder "Add a description..."
debe aparecer DENTRO del área gris del editor. Al hacer click,
el cursor aparece dentro del editor. Sin scroll extra al final.

---

## BUG 4 — Scroll excesivo en TaskPage/TaskFullPage

PROBLEMA: Al hacer scroll dentro del panel de task (subtasks, files,
description), se puede scrollear más de la cuenta dejando un área
en blanco al final del modal.

ARCHIVOS A REVISAR:
- src/renderer/src/components/task/TaskPage.tsx
- src/renderer/src/components/task/TaskFullPage.tsx

CAUSA PROBABLE: El contenedor scrolleable tiene `padding-bottom`
excesivo, o un elemento hijo tiene `margin-bottom` grande, o
el cálculo de altura del modal no cuenta correctamente la altura
del header/footer.

SOLUCIÓN:
1. Encontrar el div con `overflow-y-auto` o `overflow-y-scroll`
   que envuelve el contenido de la tarea
2. Verificar que su height está calculado correctamente:
```tsx
// Patrón correcto para modal con header fijo:
<div className="flex flex-col h-full">
  <div className="flex-shrink-0">  {/* header */}
    ...
  </div>
  <div className="flex-1 overflow-y-auto min-h-0">  {/* scroll area */}
    ...
    {/* NO agregar padding-bottom excesivo aquí */}
  </div>
</div>
```
3. Eliminar cualquier `pb-96`, `pb-64`, `mb-96` o similar al final
   del contenido scrolleable
4. Si el último elemento tiene margin-bottom grande, reducirlo a
   `mb-4` o `mb-6`

---

## CHECKLIST DE VERIFICACIÓN

Bug 1 — Clients en Board Template:
- [ ] Settings → Boards → editar template → dropdown Client muestra clientes

Bug 2 — Delete tarea:
- [ ] Crear tarea → eliminar → desaparece del board sin recargar
- [ ] El undo toast aparece correctamente después de eliminar

Bug 3 — Placeholder description:
- [ ] "Add a description..." aparece DENTRO del editor, no debajo
- [ ] Click en el área del editor posiciona el cursor correctamente

Bug 4 — Scroll:
- [ ] Modal de tarea no permite scrollear más allá del contenido real
- [ ] No hay área en blanco al final del scroll

General:
- [ ] npm run typecheck → 0 errores
- [ ] npm run dev → app abre sin errores en consola
- [ ] git add solo los archivos modificados

Commit:
"fix: 4 planner bugs - clients dropdown, task delete, description placeholder, scroll

- Board template editor now loads clients via subscribeToClients
- Task delete properly removes from board in real time
- Description placeholder rendered inside TipTap editor via Placeholder extension
- Task modal scroll constrained to content height, no blank area at bottom

