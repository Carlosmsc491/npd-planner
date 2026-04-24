# NPD Planner — Módulo Fotográfico: Fase 3 (Photo Manager + Sidepanel Updates)
# Spec + Prompts para Claude Code
# Fecha: 2026-04-21

---

## RESUMEN DE FASES

| Fase | Qué hace | Estado |
|------|----------|--------|
| **Fase 1** | Tethering: cámara → PICTURES/1.CAMERA/ con gphoto2. Badge, filmstrip, NEXT. | ✅ Completa |
| **Fase 2** | Selección integrada en CapturePage: modo GALLERY, estrellas → PICTURES/2.SELECTED/ | ✅ Completa |
| **Fase 3** | Photo Manager por tabs en proyecto. Sidepanel: label "PROGRESS", preview grid, popup galería. Drop PNGs → 3.READY/PNG + JPG automático. | ← Esta fase |

---

## ESTRUCTURA DE CARPETAS DEFINITIVA

```
Valentine's Day 2026/
├── Valentines/
│   ├── Standard Rose.xlsx
│   └── Premium Lily.xlsx
└── PICTURES/
    ├── 1. CAMERA/
    │   └── Valentines/
    │       ├── Standard Rose - 1.jpg
    │       ├── Standard Rose - 2.jpg
    │       └── Premium Lily - 1.jpg
    ├── 2. SELECTED/
    │   └── Valentines/
    │       ├── Standard Rose - 2.jpg
    │       └── Premium Lily - 1.jpg
    └── 3. READY/
        ├── PNG/
        │   └── Valentines/
        │       ├── Standard Rose.png    ← usuario hace drop
        │       └── Premium Lily.png
        └── JPG/
            └── Valentines/
                ├── Standard Rose.jpg    ← app convierte automáticamente
                └── Premium Lily.jpg
```

**Reglas:**
- `PICTURES/` siempre en la raíz del proyecto
- Los números en los nombres de carpeta garantizan orden visual en Finder/Explorer
- `3. READY/PNG/` y `3. READY/JPG/` replican exactamente la misma estructura de subcarpetas
- La app crea todas estas carpetas automáticamente en el primer uso

---

## PARTE A — CAMBIOS EN EL SIDEPANEL (RecipeDetailPanel)

### A1. Renombrar label "PHOTO PROGRESS" → "PROGRESS"

En el componente `RecipeDetailPanel`, buscar el texto "PHOTO PROGRESS" y cambiarlo
a "PROGRESS". Es solo un cambio de texto.

### A2. Preview grid de fotos en el sidepanel

**Cuándo aparece:**
- Solo si `photoStatus !== 'pending'` Y `capturedPhotos.length > 0`
- Posición: al final del todo, después del timeline y del botón de acción existente

**Qué fotos muestra:**
Un solo grid con TODAS las fotos de `capturedPhotos` (equivalente a CAMERA —
todas las tomadas en la sesión). Las candidatas (`isSelected: true`, equivalente
a SELECTED) se destacan visualmente dentro del mismo grid — no son dos grids
separados. El usuario ve todo de un vistazo: todas las fotos tomadas, y cuál(es)
fue(ron) elegida(s) como candidata(s).

**Layout del grid:**
```
┌─────────────────────────────────────┐
│  [foto1] [foto2] [foto3★]           │  ← foto3 es candidata: dorada
│  [foto4] [foto5] [foto6]            │
│                                     │
│  (scroll vertical si hay muchas)    │
└─────────────────────────────────────┘
```
- Grid de 3 columnas, thumbnails cuadrados
- Máximo altura de ~200px, scroll interno si hay más fotos
- Thumbnails cargados via `readFileAsDataUrl` desde `picturePath`
- Si la foto no existe en disco: placeholder gris con ícono de imagen roto

**Foto candidata (isSelected: true) — equivalente a SELECTED:**
- Borde dorado `2px solid #F59E0B`
- Efecto heartbeat: CSS animation `box-shadow` pulsante en dorado
  ```css
  @keyframes heartbeat {
    0%, 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.4); }
    50%       { box-shadow: 0 0 0 6px rgba(245, 158, 11, 0); }
  }
  animation: heartbeat 2s ease-in-out infinite;
  ```
- Estrella dorada ★ (`#F59E0B`) en esquina inferior derecha del thumbnail,
  tamaño 14px, con sombra oscura para visibilidad

**Fotos normales (isSelected: false) — equivalente a CAMERA:**
- Sin borde especial
- Sin estrella

**Interacción:**
- Doble click en cualquier foto del grid → abre popup galería (ver A3)
- Single click: nada (no navega, no selecciona)

### A3. Popup galería (al hacer doble click en el grid)

**Overlay:**
- Fondo: `backdrop-filter: blur(12px)` + `background: rgba(0,0,0,0.7)`
- Cubre toda la ventana del app
- Click fuera del contenido → cierra el popup
- ESC → cierra el popup

**Contenido del popup:**
```
┌──────────────────────────────────────────────────┐
│                                                  │
│  Standard Rose                   [✕]             │
│  ─────────────────────────────────               │
│                                                  │
│    [‹]    [imagen grande]    [›]                 │
│           [★ si candidata]                       │
│                                                  │
│  Standard Rose - 2                               │  ← nombre abajo
│                                                  │
│  [thumb][thumb][thumb★][thumb][thumb]            │  ← filmstrip
└──────────────────────────────────────────────────┘
```

- **Título arriba:** nombre de la receta (sin extensión, sin "DONE BY ..."),
  extraído del `recipeName` en Firestore
- **Botón ✕** en esquina superior derecha para cerrar
- **Imagen grande:** `object-contain`, sin zoom, fondo negro
- **Flechas ‹ ›** superpuestas en los bordes laterales (igual que CapturePage modo GALLERY)
- **Estrella ★** dorada en esquina superior derecha si `isSelected: true`, solo visual (no toggle — este popup es read-only, no permite cambiar selección)
- **Nombre de foto abajo:** filename sin extensión (`Standard Rose - 2`)
- **Filmstrip inferior:** thumbnails horizontales, la activa con borde blanco, la candidata con ★
- **Navegación:** teclas ← →, scroll del mouse
- La foto que se abrió con doble click es la foto inicial que se muestra

**Este popup es READ-ONLY** — no permite cambiar selecciones. Para cambiar
la selección hay que ir a CapturePage (botón "Reabrir sesión").

---

## PARTE B — PHOTO MANAGER (nueva vista en RecipeProjectPage)

### B1. Botón en el header del proyecto

En `RecipeProjectPage`, en la barra de header donde están los botones
Settings, Archive, etc., agregar un botón:

```tsx
<button onClick={() => setView('photo-manager')} className="...">
  <Camera size={16} />
  Photo Manager
</button>
```

**Visibilidad:** solo para `owner` y `photographer`

Al hacer click: cambia la vista del proyecto de la lista de recetas a la
vista Photo Manager. Debe haber un botón para volver:
```tsx
<button onClick={() => setView('recipes')}>← Recetas</button>
```

### B2. Layout del Photo Manager

```
┌────────────────────────────────────────────────────────────┐
│ Valentine's Day 2026  [← Recetas]                          │
│                                                            │
│  [  1. CAMERA  ]  [  2. SELECTED  ]  [  3. READY  ]       │  ← tabs
├────────────────────────────────────────────────────────────┤
│                                                            │
│  [contenido del tab activo]                                │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

Tabs activo: indicador visual (underline o background) con color primario `#1D9E75`

### B3. Tab: 1. CAMERA

Muestra todas las fotos en `PICTURES/1. CAMERA/` agrupadas por subcarpeta.

```
Valentines                                    12 fotos
────────────────────────────────────────────────────────
[foto] [foto] [foto] [foto] [foto] [foto]
[foto] [foto] [foto] [foto] [foto] [foto]

8 Red Roses                                    4 fotos
────────────────────────────────────────────────────────
[foto] [foto] [foto] [foto]
```

- Grid de 6 columnas, thumbnails cuadrados ~120px
- Nombre de la subcarpeta como header de grupo (bold, separador)
- Contador de fotos por grupo (gris, derecha)
- Hover en thumbnail: overlay oscuro + nombre del archivo centrado
- Doble click en thumbnail: abre el mismo popup galería de A3,
  con las fotos de esa subcarpeta como filmstrip
- Las fotos candidatas (isSelected: true en Firestore) muestran ★ dorada
- Estado vacío: "No hay fotos en CAMERA. Ve a Tomar Fotos para empezar."

### B4. Tab: 2. SELECTED

Muestra solo las fotos candidatas (`isSelected: true`) agrupadas por subcarpeta.
Misma estructura visual que el tab CAMERA.

- Si una receta tiene candidata: aparece en el grid con ★ dorada
- Estado vacío: "No hay candidatas seleccionadas aún. Completa una sesión de captura."
- Doble click → mismo popup galería

### B5. Tab: 3. READY

Este es el tab donde el usuario hace drop de PNGs.

**Zona de drop:**
```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│        ↓  Arrastra tus PNGs aquí                         │
│           o haz click para seleccionar archivos          │
│                                                          │
│        Solo se aceptan archivos .png                     │
│                                                          │
└──────────────────────────────────────────────────────────┘
```
- Drag & drop area en la parte superior del tab
- También acepta click para abrir file picker (solo `.png`)
- Al arrastrar archivos sobre la zona: borde punteado se vuelve sólido verde
- Acepta múltiples archivos a la vez

**Proceso al recibir PNGs (ver sección B6)**

**Grid de resultados:**
Debajo de la zona de drop, mostrar las fotos ya procesadas en `3. READY/`,
agrupadas por subcarpeta. Cada foto muestra:
- Thumbnail JPG (desde `3. READY/JPG/`)
- Badge "PNG + JPG" si ambos existen
- Badge "Solo PNG" (naranja) si aún no se convirtió el JPG
- Nombre del archivo sin extensión

**Estado vacío:** "No hay archivos en READY. Arrastra los PNGs retocados aquí."

### B6. Lógica de procesamiento al hacer drop

Al recibir uno o más archivos PNG:

```typescript
async function handlePngDrop(files: File[]) {
  for (const file of files) {
    const pngName = file.name  // ej: "Standard Rose.png"
    const baseName = pngName.replace(/\.png$/i, '')  // "Standard Rose"

    // 1. MATCHING: buscar la receta correspondiente en Firestore
    //    El agente debe investigar el codebase para determinar el mejor método:
    //    - Buscar en capturedPhotos[] si algún filename contiene baseName
    //    - O buscar en los recipes del proyecto si algún recipeName contiene baseName
    //    - El Excel puede tener nombre "Standard Rose DONE BY Carlos.xlsx",
    //      así que el match debe ser fuzzy/parcial, no exacto
    //    - Si hay match único → asignación automática
    //    - Si hay 0 matches o múltiples ambiguos → modo asignación manual (ver B7)

    // 2. DETERMINAR SUBCARPETA
    //    Si hay match: obtener subfolderName del recipe o del capturedPhoto
    //    La app ya tiene esta info en Firestore desde Fase 1

    // 3. COPIAR PNG a PICTURES/3. READY/PNG/{subfolderName}/{baseName}.png
    //    Crear directorios si no existen

    // 4. CONVERTIR PNG → JPG usando sharp (en main process via IPC)
    //    Guardar en PICTURES/3. READY/JPG/{subfolderName}/{baseName}.jpg

    // 5. Actualizar Firestore: recipe.readyPngPath + recipe.readyJpgPath

    // 6. Mostrar resultado en el grid
  }
}
```

**NOTA IMPORTANTE PARA EL AGENTE DE CODE:**
El sistema ya tiene un registro completo en Firestore desde Fase 1 y Fase 2.
Cada `capturedPhoto` tiene `filename` (ej: "Standard Rose - 2.jpg"),
`subfolderName` (ej: "Valentines"), y está vinculado a un `recipeId`.
El agente debe investigar el codebase de Recipe Manager para entender cómo
se nombran los recipes y los Excel generados, y construir el algoritmo de
matching más robusto posible basándose en esa información existente.
El objetivo es que el 95%+ de los drops se asignen automáticamente.

### B7. Modo asignación manual (cuando no hay match)

Si la app no puede determinar automáticamente a qué receta pertenece un PNG:

```
┌────────────────────────────────────────────────────────────┐
│  No se pudo asignar automáticamente                        │
│                                                            │
│  ┌──────────────┐   ┌──────────────────────────────────┐  │
│  │              │   │ Selecciona la receta:             │  │
│  │  [preview    │   │                                   │  │
│  │   del PNG]   │   │  ○ Standard Rose (Valentines)    │  │
│  │              │   │  ○ Premium Lily (Valentines)     │  │
│  │ Unknown.png  │   │  ○ Red Classic (8 Red Roses)     │  │
│  │              │   │  ...                              │  │
│  └──────────────┘   │                                   │  │
│                     │  [Buscar receta...]               │  │
│                     └──────────────────────────────────┘  │
│                                                            │
│  [Omitir]                          [Asignar]               │
└────────────────────────────────────────────────────────────┘
```

- Lista de recetas disponibles del proyecto actual
- Searchable con input de texto
- Al seleccionar receta + click "Asignar": continúa el proceso normal (paso 3-5 de B6)
- "Omitir": salta este archivo, no se procesa

### B8. IPC nuevo: convertir PNG → JPG con sharp

En el main process, agregar handler:

```typescript
ipcMain.handle('photo:convert-png-to-jpg', async (_event, { sourcePng, destJpg, quality }) => {
  try {
    const sharp = require('sharp')  // ya instalado desde Fase 1 si se agregó, si no: npm install sharp
    fs.mkdirSync(path.dirname(destJpg), { recursive: true })
    await sharp(sourcePng)
      .jpeg({ quality: quality ?? 90 })
      .toFile(destJpg)
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})
```

En preload exponer:
```typescript
convertPngToJpg: (args: { sourcePng: string; destJpg: string; quality?: number }) =>
  ipcRenderer.invoke('photo:convert-png-to-jpg', args),
```

---

## CAMBIOS EN FIRESTORE

### Recipe — campos nuevos para Fase 3

```typescript
readyPngPath: string | null    // ruta absoluta al PNG en 3.READY/PNG/
readyJpgPath: string | null    // ruta absoluta al JPG en 3.READY/JPG/
readyProcessedAt: Timestamp | null
readyProcessedBy: string | null  // uid
```

### photoStatus — nuevo valor

```typescript
photoStatus: 'pending' | 'in_progress' | 'complete' | 'selected' | 'ready'
```

`ready` se activa cuando el JPG ha sido generado exitosamente.

### Timeline update

Al completar el proceso en READY, actualizar `photoStatus: 'ready'` para que
el step "Photo Done" del timeline se active (círculo verde en lugar de gris).

---

## TIMELINE — CAMBIOS EN EL SIDEPANEL

El timeline ya existe (ver imagen de referencia). Los únicos cambios son:

1. **Label de sección:** "PHOTO PROGRESS" → **"PROGRESS"**

2. **Lógica de activación de cada step:**

| Step | Verde (✅) cuando | Gris (⬜) cuando |
|------|-------------------|-----------------|
| Recipe Ready | recipe.status === 'done' | recipe.status !== 'done' |
| Photos Taken | photoStatus !== 'pending' && capturedPhotos.length > 0 | no hay fotos |
| Candidate Selected | photoStatus === 'selected' \|\| 'ready' | photoStatus !== 'selected' |
| Photo Done | photoStatus === 'ready' | photoStatus !== 'ready' |

**Caso especial:** si ya hay fotos tomadas (`Photos Taken` verde) pero la receta
aún NO está marcada como done (`Recipe Ready` gris), el timeline muestra:
```
⬜ Recipe Ready     ← gris porque aún no está done
✅ Photos Taken     ← verde porque sí hay fotos
⬜ Candidate Selected
⬜ Photo Done
```
Esto es válido — se puede fotografiar antes de que la receta esté terminada.

---

## ROLES Y PERMISOS

| Acción | Owner | Photographer | Admin | Member |
|--------|-------|-------------|-------|--------|
| Ver botón Photo Manager | ✅ | ✅ | ❌ | ❌ |
| Tab CAMERA (ver) | ✅ | ✅ | ❌ | ❌ |
| Tab SELECTED (ver) | ✅ | ✅ | ❌ | ❌ |
| Tab READY — ver grid | ✅ | ✅ | ❌ | ❌ |
| Tab READY — hacer drop | ✅ | ✅ | ❌ | ❌ |
| Ver preview grid en sidepanel | ✅ | ✅ | ❌ | ❌ |
| Abrir popup galería | ✅ | ✅ | ❌ | ❌ |

---

# PROMPTS PARA CLAUDE CODE
# Orden: PF-1 → PF-2 → PF-3 → PF-4 → PF-5

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT PF-1 — Tipos + Firestore + IPC para Fase 3
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lee CLAUDE.md y DOCUMENTACION_TECNICA_NPD_PLANNER.md completamente antes de empezar.
Lee src/renderer/src/types/index.ts para entender la estructura actual.

1. En src/renderer/src/types/index.ts:

   a. En photoStatus agregar 'ready':
      ```typescript
      photoStatus: 'pending' | 'in_progress' | 'complete' | 'selected' | 'ready'
      ```

   b. En la interface Recipe (o donde viva el tipo de receta), agregar:
      ```typescript
      readyPngPath: string | null
      readyJpgPath: string | null
      readyProcessedAt: Timestamp | null
      readyProcessedBy: string | null
      ```

2. En src/renderer/src/lib/firestore.ts agregar:
   ```typescript
   export async function updateRecipeReadyPaths(
     recipeId: string,
     pngPath: string,
     jpgPath: string,
     userId: string
   ): Promise<void> {
     try {
       await updateDoc(doc(db, COLLECTIONS.RECIPES, recipeId), {
         readyPngPath: pngPath,
         readyJpgPath: jpgPath,
         readyProcessedAt: serverTimestamp(),
         readyProcessedBy: userId,
         photoStatus: 'ready',
       })
     } catch (err) {
       throw new Error(`Failed to update ready paths: ${err}`)
     }
   }
   ```

3. En src/main/ipc/ agregar handler de conversión PNG→JPG:
   ```typescript
   ipcMain.handle('photo:convert-png-to-jpg', async (_event, { sourcePng, destJpg, quality }) => {
     try {
       // Instalar sharp si no está: npm install sharp
       const sharp = require('sharp')
       fs.mkdirSync(path.dirname(destJpg), { recursive: true })
       await sharp(sourcePng).jpeg({ quality: quality ?? 90 }).toFile(destJpg)
       return { success: true }
     } catch (err) {
       return { success: false, error: String(err) }
     }
   })
   ```

4. En preload exponer:
   ```typescript
   convertPngToJpg: (args: { sourcePng: string; destJpg: string; quality?: number }) =>
     ipcRenderer.invoke('photo:convert-png-to-jpg', args),
   ```

5. Verificar que sharp esté instalado: npm install sharp
   (Si ya se instaló en Fase 1 para thumbnails, omitir)

6. npm run typecheck — corregir todos los errores.

7. Commit: "feat(photo-ready): tipos Fase 3, IPC PNG→JPG, Firestore updateRecipeReadyPaths"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT PF-2 — Sidepanel: label PROGRESS + preview grid + popup galería
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lee CLAUDE.md completamente antes de empezar.
Lee el componente RecipeDetailPanel (sidepanel derecho del proyecto de recetas).
Busca el texto "PHOTO PROGRESS" en el codebase para encontrar el archivo exacto.

1. CAMBIO SIMPLE: renombrar "PHOTO PROGRESS" → "PROGRESS" en el label de sección.

2. Actualizar la lógica del timeline para el caso especial:
   Photos Taken puede ser verde aunque Recipe Ready sea gris.
   Verificar que cada step se evalúa de forma independiente según la tabla del spec.

3. PREVIEW GRID — agregar al final del sidepanel (después de todo lo existente):

   Mostrar solo si: capturedPhotos?.length > 0

   ```tsx
   {recipe.capturedPhotos?.length > 0 && (canSeePhotoFeatures) && (
     <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
       <div className="grid grid-cols-3 gap-1.5 max-h-52 overflow-y-auto">
         {recipe.capturedPhotos.map((photo, index) => (
           <PhotoThumbnail
             key={photo.filename}
             photo={photo}
             onDoubleClick={() => openGalleryPopup(index)}
           />
         ))}
       </div>
     </div>
   )}
   ```

   Crear sub-componente `PhotoThumbnail` inline o en archivo separado:
   - Carga la imagen via `window.electronAPI.readFileAsDataUrl(photo.picturePath)`
   - Mientras carga: skeleton gris animado
   - Si error: placeholder gris con ícono de imagen roto (sin crash)
   - Si `photo.isSelected`:
     - Borde `2px solid #F59E0B`
     - CSS animation heartbeat (ver spec para keyframes exactos)
     - Estrella ★ dorada en esquina inferior derecha, 14px, con text-shadow oscuro

4. POPUP GALERÍA — crear componente `PhotoGalleryPopup.tsx`:

   Props:
   ```typescript
   interface Props {
     photos: CapturedPhoto[]
     initialIndex: number
     recipeName: string
     onClose: () => void
   }
   ```

   - Overlay: `fixed inset-0 z-50 backdrop-blur-md bg-black/70`
   - Click en overlay → onClose()
   - ESC → onClose()
   - Contenido centrado, max-w-4xl, max-h-[90vh]

   Layout interno:
   ```
   ┌────────────────────────────────────────────┐
   │ Standard Rose                    [✕]       │  ← título receta + close
   │ ─────────────────────────────────────────  │
   │                                            │
   │  [‹]   [imagen object-contain]   [›]       │  ← foto principal con flechas
   │        [★ si candidata — read only]        │
   │                                            │
   │  Standard Rose - 2                         │  ← nombre foto abajo
   │                                            │
   │  [th][th][th★][th][th]                     │  ← filmstrip
   └────────────────────────────────────────────┘
   ```

   - Flechas ‹ › superpuestas en bordes laterales (mismo patrón que CapturePage GALLERY)
   - Teclas ← → y scroll del mouse para navegar
   - La estrella es solo visual (READ-ONLY, no permite cambiar selección)
   - Nombre de foto: filename sin extensión
   - Filmstrip: thumbnails 80x60px, la activa con borde blanco, candidata con ★ dorada

   Usar el popup en RecipeDetailPanel:
   ```typescript
   const [galleryOpen, setGalleryOpen] = useState(false)
   const [galleryIndex, setGalleryIndex] = useState(0)

   function openGalleryPopup(index: number) {
     setGalleryIndex(index)
     setGalleryOpen(true)
   }
   ```

5. canSeePhotoFeatures helper:
   ```typescript
   const canSeePhotoFeatures = user?.role === 'owner' || user?.role === 'photographer'
   ```
   Usar este check para el preview grid y el popup.

6. npm run typecheck && npm run dev
   Verificar:
   - Label "PROGRESS" visible en sidepanel
   - Grid aparece cuando hay fotos en capturedPhotos
   - Foto candidata tiene borde dorado pulsante y ★
   - Doble click abre popup blurry
   - Popup navega con flechas y teclas

Commit: "feat(photo-sidepanel): label PROGRESS + preview grid heartbeat + popup galería"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT PF-3 — Botón Photo Manager en header del proyecto
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lee CLAUDE.md completamente antes de empezar.
Lee RecipeProjectPage para entender el header y su sistema de vistas/botones existentes.

1. En el header de RecipeProjectPage, agregar botón "Photo Manager":
   - Solo visible para owner y photographer
   - Junto a los otros botones del header (Settings, Archive, etc.)
   - Ícono: Camera de lucide-react

2. Agregar estado de vista al componente:
   ```typescript
   const [view, setView] = useState<'recipes' | 'photo-manager'>('recipes')
   ```

3. Cuando view === 'photo-manager':
   - Ocultar la lista de recetas y el sidepanel
   - Mostrar el componente PhotoManagerView (a crear en PF-4)
   - El botón Photo Manager cambia a "← Recetas" para volver

4. Cuando view === 'recipes' (default):
   - Todo funciona igual que antes

5. Crear src/renderer/src/components/recipe/PhotoManagerView.tsx — solo el esqueleto:
   ```tsx
   interface Props {
     project: RecipeProject  // o el tipo que use el proyecto
     onBack: () => void
   }

   export function PhotoManagerView({ project, onBack }: Props) {
     const [activeTab, setActiveTab] = useState<'camera' | 'selected' | 'ready'>('camera')

     return (
       <div>
         <div className="flex gap-2 border-b mb-4">
           {['camera', 'selected', 'ready'].map(tab => (
             <button key={tab} onClick={() => setActiveTab(tab as any)}
               className={activeTab === tab ? '... activo ...' : '... inactivo ...'}>
               {tab === 'camera' ? '1. CAMERA' : tab === 'selected' ? '2. SELECTED' : '3. READY'}
             </button>
           ))}
         </div>
         <div>
           {activeTab === 'camera' && <p>CAMERA tab — próximamente</p>}
           {activeTab === 'selected' && <p>SELECTED tab — próximamente</p>}
           {activeTab === 'ready' && <p>READY tab — próximamente</p>}
         </div>
       </div>
     )
   }
   ```

6. npm run typecheck && npm run dev
   Verificar que el botón Photo Manager aparece y alterna la vista.

Commit: "feat(photo-manager): botón en header proyecto + skeleton PhotoManagerView con tabs"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT PF-4 — PhotoManagerView: tabs CAMERA, SELECTED, READY completos
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lee CLAUDE.md completamente antes de empezar.
Lee src/renderer/src/components/recipe/PhotoManagerView.tsx (esqueleto del prompt anterior).
Lee src/renderer/src/lib/firestore.ts para las funciones disponibles.

Implementar los tres tabs completos en PhotoManagerView.

LÓGICA COMPARTIDA — hook usePhotoManagerData:
Crear un hook que cargue todas las recipes del proyecto con sus capturedPhotos,
agrupadas por subfolderName. Lo usarán los tres tabs.

```typescript
// Para cada recipe del proyecto que tenga capturedPhotos.length > 0,
// construir un mapa: subfolderName → CapturedPhoto[]
// Esto permite mostrar las fotos agrupadas por subcarpeta
```

TAB CAMERA — implementar según spec sección B3:
- Leer fotos desde `capturedPhotos` de cada recipe (picturePath)
- Agrupar por subfolderName
- Grid 6 columnas, header de grupo con nombre + contador
- Hover: overlay oscuro + nombre del archivo
- Doble click: abrir PhotoGalleryPopup (reusar el de PF-2)
- Candidatas con ★ dorada en thumbnail
- Estado vacío apropiado

TAB SELECTED — implementar según spec sección B4:
- Filtrar solo capturedPhotos donde isSelected === true
- Misma estructura de grid agrupado
- Todas las fotos aquí son candidatas, todas con ★ dorada y borde dorado
- Estado vacío apropiado

TAB READY — implementar según spec secciones B5, B6, B7:

Zona de drop:
```tsx
<div
  onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
  onDragLeave={() => setDragOver(false)}
  onDrop={handleDrop}
  onClick={() => fileInputRef.current?.click()}
  className={`
    border-2 border-dashed rounded-xl p-12 text-center cursor-pointer
    transition-colors duration-200
    ${dragOver
      ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
      : 'border-gray-300 dark:border-gray-700 hover:border-gray-400'
    }
  `}
>
  <input
    ref={fileInputRef}
    type="file"
    accept=".png"
    multiple
    className="hidden"
    onChange={(e) => handleFiles(Array.from(e.target.files ?? []))}
  />
  <Upload size={32} className="mx-auto mb-3 text-gray-400" />
  <p className="text-gray-600 dark:text-gray-400">Arrastra tus PNGs aquí</p>
  <p className="text-sm text-gray-400 mt-1">o haz click para seleccionar archivos</p>
</div>
```

Algoritmo de matching (el agente DEBE investigar el codebase antes de implementar):
- Leer el nombre del PNG dropeado (sin extensión)
- Buscar en todos los recipes del proyecto:
  1. Primero: buscar en capturedPhotos[].filename si alguno contiene el baseName
  2. Segundo: buscar en recipe.name o el nombre del Excel generado
  3. El Excel puede tener "Standard Rose DONE BY Carlos.xlsx" — limpiar "DONE BY ..."
     antes de comparar
  4. Usar comparación case-insensitive y trim
  5. Si hay un match único con confianza alta → asignación automática
  6. Si no → mostrar modal de asignación manual (ver spec B7)

Para cada PNG procesado exitosamente:
1. Copiar PNG a PICTURES/3. READY/PNG/{subfolderName}/{baseName}.png
2. Convertir a JPG via window.electronAPI.convertPngToJpg(...)
3. Guardar en PICTURES/3. READY/JPG/{subfolderName}/{baseName}.jpg
4. Llamar updateRecipeReadyPaths(recipeId, pngPath, jpgPath, userId)
5. Mostrar en el grid de resultados

Modal de asignación manual:
- Foto a la izquierda (preview del PNG)
- Lista de recipes disponibles a la derecha con searchbox
- Solo recipes de este proyecto
- Botones: Omitir / Asignar

Grid de resultados en READY:
- Mostrar JPGs ya procesados, agrupados por subcarpeta
- Badge "PNG + JPG" si ambos existen
- Badge naranja "Solo PNG" si el JPG no se generó
- Estado vacío si no hay nada procesado aún

5. npm run typecheck && npm run dev
   Probar: navegar a Photo Manager → tab CAMERA muestra las fotos → tab SELECTED
   muestra solo candidatas → tab READY acepta drop de PNG y genera JPG.

Commit: "feat(photo-manager): tabs CAMERA, SELECTED, READY completos con drop PNG→JPG"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT PF-5 — Actualizar CLAUDE.md y DOCUMENTACION_TECNICA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lee CLAUDE.md y DOCUMENTACION_TECNICA_NPD_PLANNER.md completamente.

Actualizar ambos documentos para reflejar la Fase 3 completa:

En CLAUDE.md:
- photoStatus: agregar 'ready'
- Recipe: agregar readyPngPath, readyJpgPath, readyProcessedAt, readyProcessedBy
- IPC: photo:convert-png-to-jpg
- Dependencias: sharp (si no estaba)
- Estructura de carpetas: actualizar con PICTURES/ completa (1.CAMERA, 2.SELECTED, 3.READY)
- Componentes nuevos: PhotoManagerView, PhotoGalleryPopup, PhotoThumbnail
- Marcar Fase 3 como completada [x]

En DOCUMENTACION_TECNICA_NPD_PLANNER.md:
- Sección módulo fotográfico: agregar Fase 3
- Documentar estructura PICTURES/ completa con árbol de carpetas
- Documentar algoritmo de matching PNG → recipe
- Documentar el Photo Manager: botón en header, tabs, drop zone
- Documentar el sidepanel: preview grid, heartbeat animation, popup galería
- Actualizar tabla de fases (todas ✅)
- Actualizar tabla de photoStatus con 'ready'
- Actualizar roles y permisos con Photo Manager

Commit: "docs: módulo fotográfico Fase 3 completa en CLAUDE.md y documentación técnica"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE PROMPTS — FASE 3 COMPLETA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Orden de ejecución: PF-1 → PF-2 → PF-3 → PF-4 → PF-5

Test de smoke al terminar PF-4:
  1. Abrir proyecto con recetas que tengan fotos capturadas
  2. Sidepanel → label dice "PROGRESS" (no "PHOTO PROGRESS")
  3. Sidepanel → grid de fotos aparece al final con thumbnails
  4. Foto candidata (isSelected:true) tiene borde dorado pulsante + ★
  5. Doble click en thumbnail → popup blurry se abre con título de receta arriba
  6. Popup navega con flechas, teclas ← →, scroll del mouse
  7. Popup se cierra con ESC o click fuera
  8. Header del proyecto → botón "Photo Manager" visible para owner/photographer
  9. Click → vista cambia a Photo Manager con tabs
  10. Tab CAMERA → fotos agrupadas por subcarpeta con hover effect
  11. Tab SELECTED → solo candidatas, todas con ★ dorada
  12. Tab READY → zona de drop visible
  13. Drop de un PNG → se procesa, aparece en grid con badge "PNG + JPG"
  14. Verificar en disco: PICTURES/3.READY/PNG/ y PICTURES/3.READY/JPG/ tienen el archivo
  15. Recipe en Firestore tiene readyPngPath, readyJpgPath, photoStatus:'ready'
  16. Timeline en sidepanel → "Photo Done" ahora aparece en verde
