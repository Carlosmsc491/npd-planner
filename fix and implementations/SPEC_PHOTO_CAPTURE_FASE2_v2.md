# NPD Planner — Módulo Fotográfico: Fase 2 (Selección Integrada en Captura)
# Spec + Prompts para Claude Code
# Fecha: 2026-04-21 — versión corregida

---

## RESUMEN DE FASES

| Fase | Qué hace | Estado |
|------|----------|--------|
| **Fase 1** | Tethering: cámara → CAMERA/ y Pictures/ con gphoto2. Badge, filmstrip, DONE. | ✅ Completa |
| **Fase 2** | Selección integrada en la misma sesión de captura. Botón NEXT abre galería para elegir candidata antes de cerrar. | ← Esta fase |
| **Fase 3** | Drop de PNGs retocados → Cleaned/, convierte PNG→JPG, inserta en Excel. | 🔜 Pendiente |

---

## QUÉ CAMBIA RESPECTO A LA FASE 1

En Fase 1, el flujo terminaba con un botón DONE que cerraba la sesión y marcaba
la receta como `complete`.

En Fase 2, ese botón cambia a **NEXT**, que en lugar de cerrar directamente,
abre una galería de selección. El fotógrafo elige el candidato ahí mismo,
y al confirmar se cierra la sesión de esa receta.

La pantalla `/select/:recipeId` ya **no existe** como ruta separada.
Todo ocurre dentro de la CapturePage.

---

## FLUJO COMPLETO ACTUALIZADO

```
1. Fotógrafo entra a /capture/:recipeId
2. Toma fotos (tethering — igual que Fase 1)
3. Las fotos van apareciendo en el filmstrip inferior
4. Cuando termina de tomar fotos → presiona "NEXT →"
5. La vista de live/preview se reemplaza por la GALERÍA DE SELECCIÓN
6. El fotógrafo revisa todas las fotos:
   - Navega con flechas laterales, teclas ← →, o scroll del mouse
   - Cada foto muestra su nombre arriba ("Standard Rose - 3")
   - Hay una estrella ☆ en la esquina superior derecha
   - Doble click o Enter → selecciona/deselecciona (estrella se vuelve dorada ★)
   - El filmstrip inferior sigue visible con todas las fotos en miniatura
7. Una vez elegida(s) la(s) candidata(s) → presiona "Terminar sesión"
8. Modal de confirmación: "¿Terminar sesión? Se ha seleccionado 1 candidata."
9. Al confirmar:
   - Copia candidatas a Selected/{subfolderName}/{filename}
   - Guarda isSelected en Firestore
   - Actualiza photoStatus según corresponda
   - Regresa a lista de recetas
10. La sesión SIEMPRE se puede reabrir desde la lista de recetas
    (el botón "Tomar Fotos" / "Continuar sesión" siempre estará disponible
    excepto si photoStatus === 'closed' — ver abajo)
```

---

## ESTADOS DE photoStatus ACTUALIZADOS

```typescript
photoStatus:
  'pending'     // nunca se han tomado fotos
  'in_progress' // sesión abierta, fotos en curso
  'complete'    // fotos tomadas, aún no se ha elegido candidata
  'selected'    // candidata(s) elegida(s), sesión terminada
```

La sesión siempre se puede reabrir:
- Si `photoStatus === 'selected'`: el botón dice "Reabrir sesión" y permite
  tomar más fotos o cambiar la selección
- No hay estado "cerrado permanentemente" en Fase 2

---

## CAMBIOS EN FIRESTORE

### CapturedPhoto — nuevo campo
```typescript
export interface CapturedPhoto {
  sequence: number
  filename: string
  subfolderName: string
  picturePath: string
  cameraPath: string
  ssdPath: string | null
  capturedAt: Timestamp
  capturedBy: string
  isSelected: boolean     // ← NUEVO
  selectedAt?: Timestamp  // ← NUEVO
  selectedBy?: string     // ← NUEVO
}
```

### Funciones nuevas en firestore.ts
```typescript
export async function updateRecipePhotoSelections(
  recipeId: string,
  updatedPhotos: CapturedPhoto[],
  status: 'complete' | 'selected'
): Promise<void>
```

---

## IPC NUEVOS

```
photo:copy-to-selected    { sourcePath, destPath } → { success, error? }
photo:delete-from-selected { filePath }             → { success }
```

---

## LAYOUT DETALLADO DE LA CAPTUREPAGE (ACTUALIZADA)

La CapturePage ahora tiene DOS modos que comparten el mismo layout base:

### Modo CAPTURE (igual que Fase 1)
```
┌───────────────────────────────────────────────────┐
│ ← Volver  │  Valentines › Standard Rose  [●Canon] │
├───────────────────────────────────────────────────┤
│                                                   │
│         [Preview: última foto capturada]          │
│         o placeholder si no hay fotos aún         │
│                                                   │
├───────────────────────────────────────────────────┤
│  [filmstrip scroll horizontal — thumbnails]       │
├───────────────────────────────────────────────────┤
│  {n} fotos tomadas          [  NEXT →  ]          │
└───────────────────────────────────────────────────┘
```

- NEXT deshabilitado si no hay fotos (`capturedPhotos.length === 0`)
- Al hacer click en NEXT: transición a modo GALLERY (fade o slide)

### Modo GALLERY (nuevo en Fase 2)
```
┌───────────────────────────────────────────────────┐
│ ← Volver al capture  │  Valentines › Standard Rose│
│                      │  Elige tu candidata        │
├───────────────────────────────────────────────────┤
│                                                   │
│  Standard Rose - 3              ← nombre arriba   │
│                                                   │
│    [←]   [    imagen grande    ]   [→]            │
│          [★ en esquina sup-der ]                  │
│                                                   │
│          (sin zoom — object-contain)              │
│                                                   │
├───────────────────────────────────────────────────┤
│  [filmstrip con todas las fotos — igual que antes]│
├───────────────────────────────────────────────────┤
│  1 seleccionada        [Terminar sesión]          │
└───────────────────────────────────────────────────┘
```

---

## ESPECIFICACIÓN DETALLADA DEL MODO GALLERY

### Foto principal (área central)

- `object-contain` — NO hay zoom, la foto se ve completa siempre
- La imagen ocupa todo el espacio disponible manteniendo aspect ratio
- Fondo negro o gris muy oscuro para que resalte
- **Nombre de la foto arriba** — centrado, texto blanco, fuente mediana:
  `Standard Rose - 3`  (es decir, el filename sin extensión)
- **Flechas en los lados** — botones semitransparentes superpuestos sobre la imagen:
  - Izquierda: `‹` centrado verticalmente en el borde izquierdo
  - Derecha: `›` centrado verticalmente en el borde derecho
  - Solo visibles si hay foto anterior/siguiente
  - Tamaño generoso (40x80px) para fácil click

### Estrella de selección

- Posición: esquina superior derecha de la imagen, dentro del área de la foto
- Tamaño: 28px
- Deseleccionada: `☆` blanca con sombra oscura (visible sobre fotos claras y oscuras)
- Seleccionada: `★` dorada / amarilla (`#F59E0B`)
- Click en la estrella → toggle selección
- `Enter` → toggle selección de la foto actualmente visible
- La foto en el filmstrip también muestra la estrella dorada si está seleccionada

### Navegación

- Flechas `[←]` `[→]` en la imagen → foto anterior / siguiente
- Teclas ← → del teclado → misma acción
- Scroll del mouse (wheel) hacia abajo → foto siguiente, hacia arriba → foto anterior
- Click en thumbnail del filmstrip → saltar directamente a esa foto
- El filmstrip hace scroll automático para mostrar la foto activa

### Doble click en la imagen

- En modo GALLERY el doble click NO hace zoom
- En su lugar: doble click en la imagen principal → toggle selección (misma acción que Enter o click en estrella)
- Esto es intuitivo: "hago doble click en la foto que me gusta"

### Filmstrip en modo GALLERY

- Igual que en modo CAPTURE pero con un indicador adicional:
- Thumbnail seleccionado muestra estrella dorada superpuesta en miniatura
- Thumbnail actualmente visible tiene borde verde/blanco

### Footer en modo GALLERY

```
[n] candidata(s) seleccionada(s)     [Terminar sesión]
```

- "Terminar sesión" siempre habilitado (puede terminar sin haber seleccionado nada)
- Si no hay candidata seleccionada: el modal de confirmación lo aclara:
  "No has seleccionado ninguna candidata. ¿Terminar la sesión de todos modos?"
- Si hay 1+: "¿Terminar sesión? {n} foto(s) marcada(s) como candidata(s)."
- Botones del modal: [Cancelar] [Terminar]

### Botón "← Volver al capture" en modo GALLERY

- Vuelve al modo CAPTURE sin perder las fotos ni el estado de selección
- Las selecciones hechas en GALLERY se recuerdan aunque se vuelva a CAPTURE
- Permite tomar más fotos y luego volver a GALLERY

---

## LÓGICA DE GUARDAR AL TERMINAR

```typescript
async function handleFinishSession(photos: CapturedPhoto[]) {
  const selectedPhotos = photos.filter(p => p.isSelected)
  const notSelectedPhotos = photos.filter(p => !p.isSelected)

  // Copiar candidatas a Selected/
  for (const photo of selectedPhotos) {
    const destPath = `${projectFolder}/Selected/${photo.subfolderName}/${photo.filename}`
    await window.electronAPI.copyToSelected({
      sourcePath: photo.picturePath,
      destPath,
    })
  }

  // Limpiar fotos que se deseleccionaron (si existían antes en Selected/)
  for (const photo of notSelectedPhotos) {
    const selectedPath = `${projectFolder}/Selected/${photo.subfolderName}/${photo.filename}`
    await window.electronAPI.deleteFromSelected({ filePath: selectedPath })
  }

  // Guardar en Firestore
  const newStatus = selectedPhotos.length > 0 ? 'selected' : 'complete'
  await updateRecipePhotoSelections(recipeId, photos, newStatus)

  // Detener tethering
  await window.electronAPI.stopCameraTethering()

  // Navegar de regreso
  navigate(-1)
}
```

---

## REAPERTURA DE SESIÓN

Desde la lista de recetas, el botón varía según photoStatus:

| photoStatus | Texto del botón | Comportamiento |
|-------------|-----------------|----------------|
| `pending` | 📷 Tomar Fotos | Entra a CapturePage en modo CAPTURE |
| `in_progress` | 📷 Continuar sesión | Entra a CapturePage en modo CAPTURE con fotos existentes |
| `complete` | 📷 Elegir candidata | Entra a CapturePage directamente en modo GALLERY |
| `selected` | 📷 Reabrir sesión | Entra a CapturePage en modo GALLERY con selección existente |

Al reabrir una sesión `selected`:
- Las fotos que ya estaban seleccionadas (`isSelected: true`) muestran la estrella dorada
- El fotógrafo puede cambiar la selección y volver a guardar

---

## MANEJO DE ERRORES

| Situación | Comportamiento |
|-----------|----------------|
| Sin fotos al hacer click en NEXT | Botón NEXT deshabilitado |
| Error al copiar a Selected/ | Toast de error, operación continúa con las demás |
| picturePath no existe en disco | Placeholder gris en galería, estrella sigue funcionando |
| Cámara desconectada en modo GALLERY | No importa — en galería no se necesita la cámara |

---

## FASES FUTURAS (referencia — NO implementar)

### Fase 3 — Drop de PNGs limpios e inserción en Excel
1. Usuario hace drop de PNGs retocados en la app
2. App detecta receta por nombre de archivo
3. Crea `Cleaned/{subfolderName}/{recipeName}/`
   - `{recipeName}.png` (original)
   - `{recipeName}.jpg` (convertido con sharp)
4. Abre el Excel con exceljs e inserta la imagen JPG en la celda indicada

---

# PROMPTS PARA CLAUDE CODE

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT PS-1 — Tipos + Firestore + IPC para selección
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lee CLAUDE.md y DOCUMENTACION_TECNICA_NPD_PLANNER.md completamente antes de empezar.

1. En src/renderer/src/types/index.ts:

   a. En CapturedPhoto agregar:
      ```typescript
      isSelected: boolean
      selectedAt?: Timestamp
      selectedBy?: string
      ```

   b. En photoStatus agregar el valor 'selected':
      ```typescript
      photoStatus: 'pending' | 'in_progress' | 'complete' | 'selected'
      ```

2. En src/renderer/src/lib/firestore.ts agregar:
   ```typescript
   export async function updateRecipePhotoSelections(
     recipeId: string,
     updatedPhotos: CapturedPhoto[],
     status: 'complete' | 'selected'
   ): Promise<void> {
     try {
       await updateDoc(doc(db, COLLECTIONS.RECIPES, recipeId), {
         capturedPhotos: updatedPhotos,
         photoStatus: status,
       })
     } catch (err) {
       throw new Error(`Failed to update photo selections: ${err}`)
     }
   }
   ```
   Ajusta COLLECTIONS.RECIPES al nombre correcto de la colección en tu codebase.

3. En src/main/ipc/ (en fileHandlers.ts o cameraHandlers.ts), registrar:
   ```typescript
   ipcMain.handle('photo:copy-to-selected', async (_event, { sourcePath, destPath }) => {
     try {
       fs.mkdirSync(path.dirname(destPath), { recursive: true })
       fs.copyFileSync(sourcePath, destPath)
       return { success: true }
     } catch (err) {
       return { success: false, error: String(err) }
     }
   })

   ipcMain.handle('photo:delete-from-selected', async (_event, { filePath }) => {
     try {
       if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
       return { success: true }
     } catch (err) {
       return { success: false, error: String(err) }
     }
   })
   ```

4. En src/preload/index.ts exponer:
   ```typescript
   copyToSelected: (args: { sourcePath: string; destPath: string }) =>
     ipcRenderer.invoke('photo:copy-to-selected', args),
   deleteFromSelected: (args: { filePath: string }) =>
     ipcRenderer.invoke('photo:delete-from-selected', args),
   ```

5. npm run typecheck — corregir todos los errores.

6. Commit: "feat(photo-select): tipos isSelected + IPC copy/delete + Firestore fn"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT PS-2 — Modo GALLERY en CapturePage + botón NEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lee CLAUDE.md completamente antes de empezar.
Lee src/renderer/src/pages/CapturePage.tsx completamente — es el archivo principal a modificar.

La CapturePage ya tiene un modo de captura (Fase 1). Ahora hay que agregar un
segundo modo: GALLERY. Ambos modos comparten el mismo componente y el mismo filmstrip.

1. Agregar estado de modo al componente:
   ```typescript
   const [mode, setMode] = useState<'capture' | 'gallery'>('capture')
   const [galleryIndex, setGalleryIndex] = useState(0)  // foto activa en galería
   ```

   Al montar: si recipe.photoStatus === 'complete' || 'selected', entrar directamente
   en modo 'gallery'. Si no, entrar en modo 'capture'.

2. En modo CAPTURE, reemplazar el botón DONE por NEXT:
   ```tsx
   <button
     onClick={() => {
       setGalleryIndex(photos.length - 1)  // empezar desde la última foto
       setMode('gallery')
     }}
     disabled={photos.length === 0}
     className="... botón verde primario ..."
   >
     NEXT →
   </button>
   ```

3. En modo GALLERY, mostrar la vista de galería en el área central:

   HEADER (reemplazar el de capture):
   ```tsx
   <button onClick={() => setMode('capture')}>← Volver al capture</button>
   <span>{subfolderName} › {recipeName}</span>
   <span className="text-sm text-gray-400">Elige tu candidata</span>
   ```

   ÁREA CENTRAL (reemplazar el preview):
   ```tsx
   {/* Nombre de la foto — arriba, centrado */}
   <div className="text-center text-white font-medium mb-2">
     {currentPhoto.filename.replace(/\.[^.]+$/, '')}  {/* sin extensión */}
   </div>

   {/* Contenedor de la foto con flechas */}
   <div className="relative flex-1 flex items-center">

     {/* Flecha izquierda */}
     {galleryIndex > 0 && (
       <button
         onClick={() => setGalleryIndex(i => i - 1)}
         className="absolute left-0 z-10 h-full w-16 flex items-center justify-center
                    bg-black/20 hover:bg-black/40 text-white text-4xl transition-colors"
       >
         ‹
       </button>
     )}

     {/* Imagen principal */}
     <div className="relative flex-1 h-full flex items-center justify-center">
       <img
         src={photoDataUrls[currentPhoto.filename]}
         alt={currentPhoto.filename}
         className="max-w-full max-h-full object-contain"
         style={{ userSelect: 'none', WebkitUserDrag: 'none' }}
         onDoubleClick={() => toggleSelection(currentPhoto.filename)}
       />

       {/* Estrella de selección */}
       <button
         onClick={() => toggleSelection(currentPhoto.filename)}
         className="absolute top-3 right-3 text-3xl transition-transform hover:scale-110"
         style={{ textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}
       >
         {localSelection[currentPhoto.filename] ? '★' : '☆'}
       </button>
     </div>

     {/* Flecha derecha */}
     {galleryIndex < photos.length - 1 && (
       <button
         onClick={() => setGalleryIndex(i => i + 1)}
         className="absolute right-0 z-10 h-full w-16 flex items-center justify-center
                    bg-black/20 hover:bg-black/40 text-white text-4xl transition-colors"
       >
         ›
       </button>
     )}
   </div>
   ```

4. Keyboard + mouse wheel handlers en modo GALLERY (agregar en useEffect):
   ```typescript
   useEffect(() => {
     if (mode !== 'gallery') return

     function handleKey(e: KeyboardEvent) {
       if (e.key === 'ArrowLeft')  setGalleryIndex(i => Math.max(0, i - 1))
       if (e.key === 'ArrowRight') setGalleryIndex(i => Math.min(photos.length - 1, i + 1))
       if (e.key === 'Enter') toggleSelection(photos[galleryIndex]?.filename)
     }

     function handleWheel(e: WheelEvent) {
       e.preventDefault()
       if (e.deltaY > 0) setGalleryIndex(i => Math.min(photos.length - 1, i + 1))
       if (e.deltaY < 0) setGalleryIndex(i => Math.max(0, i - 1))
     }

     window.addEventListener('keydown', handleKey)
     window.addEventListener('wheel', handleWheel, { passive: false })
     return () => {
       window.removeEventListener('keydown', handleKey)
       window.removeEventListener('wheel', handleWheel)
     }
   }, [mode, galleryIndex, photos])
   ```

5. Estado local de selección:
   ```typescript
   // Inicializar desde Firestore al cargar la receta
   const [localSelection, setLocalSelection] = useState<Record<string, boolean>>({})

   // Cuando se carga la recipe, inicializar:
   useEffect(() => {
     if (recipe?.capturedPhotos) {
       const initial: Record<string, boolean> = {}
       recipe.capturedPhotos.forEach(p => {
         initial[p.filename] = p.isSelected ?? false
       })
       setLocalSelection(initial)
     }
   }, [recipe])

   function toggleSelection(filename: string) {
     setLocalSelection(prev => ({ ...prev, [filename]: !prev[filename] }))
   }
   ```

6. Footer en modo GALLERY:
   ```tsx
   <div className="flex items-center justify-between p-4">
     <span className="text-sm text-gray-400">
       {selectedCount} candidata{selectedCount !== 1 ? 's' : ''} seleccionada{selectedCount !== 1 ? 's' : ''}
     </span>
     <button
       onClick={() => setShowFinishModal(true)}
       className="... botón verde ..."
     >
       Terminar sesión
     </button>
   </div>
   ```

7. Modal de confirmación "Terminar sesión":
   - Si selectedCount === 0:
     "No has seleccionado ninguna candidata. ¿Terminar la sesión de todos modos?"
   - Si selectedCount > 0:
     "¿Terminar sesión? {n} foto(s) marcada(s) como candidata(s)."
   - Botones: [Cancelar] [Terminar]

8. Al confirmar, llamar handleFinishSession(photos) — ver lógica en el spec.

9. Filmstrip en modo GALLERY: cada thumbnail que esté seleccionado muestra
   una estrella dorada ★ superpuesta en miniatura (esquina superior derecha).
   El thumbnail de la foto activa tiene borde blanco/verde.
   Al hacer click en un thumbnail → setGalleryIndex al índice de esa foto.

10. npm run typecheck && npm run dev
    Probar:
    - Modo CAPTURE → NEXT → modo GALLERY
    - Navegar con ← → y wheel
    - Toggle de estrellas con click, doble click y Enter
    - Filmstrip muestra estrellas en miniaturas
    - Botón "← Volver al capture" regresa sin perder selecciones
    - Modal de Terminar sesión

Commit: "feat(photo-select): modo GALLERY en CapturePage con selección por estrellas"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT PS-3 — Botones de receta actualizados + lógica de reapertura
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lee CLAUDE.md completamente antes de empezar.
Lee el componente de card/row de receta del Recipe Manager.

1. Actualizar los botones de foto en cada recipe card según photoStatus:

   ```tsx
   const photoButton = () => {
     if (!canSeePhotoButton) return null

     switch (recipe.photoStatus) {
       case undefined:
       case 'pending':
         return (
           <button onClick={() => navigate(`/capture/${recipe.id}`)}
             className="... verde ...">
             <Camera size={14} /> Tomar Fotos
           </button>
         )
       case 'in_progress':
         return (
           <button onClick={() => navigate(`/capture/${recipe.id}`)}
             className="... amarillo ...">
             <Camera size={14} /> Continuar sesión
           </button>
         )
       case 'complete':
         return (
           <button onClick={() => navigate(`/capture/${recipe.id}`)}
             className="... azul ...">
             <Camera size={14} /> Elegir candidata
           </button>
         )
       case 'selected':
         return (
           <button onClick={() => navigate(`/capture/${recipe.id}`)}
             className="... verde oscuro ...">
             <Star size={14} className="text-yellow-400" /> Reabrir sesión
           </button>
         )
     }
   }
   ```

2. Actualizar badges de photoStatus en la lista:
   - 'pending': sin badge
   - 'in_progress': badge amarillo "📷 En sesión"
   - 'complete': badge azul "📷 Fotos listas"
   - 'selected': badge verde "★ Candidata elegida"

3. En CapturePage, al montar verificar el photoStatus inicial para determinar el modo:
   ```typescript
   useEffect(() => {
     if (!recipe) return
     if (recipe.photoStatus === 'complete' || recipe.photoStatus === 'selected') {
       setMode('gallery')
       // Si hay fotos, posicionarse en la última
       if (recipe.capturedPhotos?.length > 0) {
         setGalleryIndex(recipe.capturedPhotos.length - 1)
       }
     }
   }, [recipe])
   ```

4. npm run typecheck && npm run dev

Commit: "feat(photo-select): botones de receta por photoStatus + lógica reapertura"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT PS-4 — Actualizar CLAUDE.md y DOCUMENTACION_TECNICA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lee CLAUDE.md y DOCUMENTACION_TECNICA_NPD_PLANNER.md completamente.

Actualiza ambos documentos:

En CLAUDE.md:
- photoStatus: agregar 'selected'
- CapturedPhoto: agregar isSelected, selectedAt, selectedBy
- IPC: photo:copy-to-selected, photo:delete-from-selected
- CapturePage: documentar que tiene dos modos ('capture' y 'gallery')
- Marcar features de Fase 2 como completadas [x]

En DOCUMENTACION_TECNICA_NPD_PLANNER.md:
- Actualizar sección del módulo fotográfico con Fase 2
- Documentar el modo GALLERY: navegación, estrellas, toggle, wheel, Enter
- Actualizar tabla de fases
- Actualizar estructura de carpetas (incluir Selected/)
- Actualizar tabla de photoStatus con el valor 'selected'

Commit: "docs: módulo fotográfico Fase 2 en CLAUDE.md y documentación técnica"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE PROMPTS — FASE 2 COMPLETA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Orden de ejecución: PS-1 → PS-2 → PS-3 → PS-4

Test de smoke al terminar PS-3:
  1. Receta con photoStatus 'pending' → botón "Tomar Fotos"
  2. Tomar 4 fotos con tethering
  3. Click NEXT → transición a modo GALLERY
  4. Nombre de la foto visible arriba ("Standard Rose - 4")
  5. Flechas en los lados navegan entre fotos
  6. Scroll del mouse navega entre fotos
  7. Click en estrella ☆ → se vuelve dorada ★
  8. Doble click en imagen → toggle selección
  9. Enter → toggle selección
  10. Filmstrip muestra ★ en la miniatura de la foto seleccionada
  11. Click en thumbnail del filmstrip → salta a esa foto
  12. "← Volver al capture" → regresa a modo CAPTURE, selección se mantiene
  13. Volver a NEXT → la estrella sigue dorada
  14. Click "Terminar sesión" → modal correcto según si hay/no hay candidata
  15. Confirmar → Selected/{subfolderName}/ tiene la foto elegida
  16. En lista: receta muestra badge "★ Candidata elegida" + botón "Reabrir sesión"
  17. Click "Reabrir sesión" → CapturePage abre en modo GALLERY con estrella dorada
