# NPD Planner — Módulo Fotográfico: Fase 4 (Inserción de Imagen en Excel)
# Spec + Prompts para Claude Code
# Fecha: 2026-04-21

---

## RESUMEN DE FASES

| Fase | Qué hace | Estado |
|------|----------|--------|
| **Fase 1** | Tethering: cámara → PICTURES/1.CAMERA/ con gphoto2. Badge, filmstrip, NEXT. | ✅ Completa |
| **Fase 2** | Selección integrada en CapturePage: modo GALLERY, estrellas → PICTURES/2.SELECTED/ | ✅ Completa |
| **Fase 3** | Photo Manager por tabs. Drop PNGs → 3.READY/PNG + conversión JPG automática. | ✅ Completa |
| **Fase 4** | Inserción del JPG en el área PHOTO del Excel (Spec Sheet, G8:M35), centrado. | ← Esta fase |

---

## QUÉ HACE ESTA FASE

Una vez que el JPG está en `PICTURES/3. READY/JPG/{subfolderName}/{recipeName}.jpg`,
el usuario decide manualmente cuándo insertarlo en el Excel presionando un botón
por cada receta en el tab READY del Photo Manager.

El Excel tiene una hoja llamada **"Spec Sheet"** con un área de foto en la celda
fusionada **G8:M35** (etiqueta "PHOTO"). La imagen debe quedar centrada dentro
de ese área, manteniendo aspect ratio, sin deformar.

---

## CUÁNDO SE DISPARA LA INSERCIÓN

**Trigger manual** — botón por receta en el tab READY:

```
Fase 3 (drop) termina:
  → App copia PNG a 3.READY/PNG/
  → App convierte PNG → JPG
  → Grid del tab READY muestra la receta con su JPG listo
  → Aparece botón "📊 Insertar en Excel" por cada receta

Usuario revisa el JPG y presiona el botón cuando está listo:
  → App toma el JPG de 3.READY/JPG/
  → App lo inserta centrado en G8:M35 del Spec Sheet
  → Firestore: photoStatus: 'ready', excelInsertedAt: timestamp
  → Botón cambia a "✓ Insertado" (verde, deshabilitado)
  → Sigue disponible botón "Reinsertar" por si hace un nuevo drop
```

**El usuario tiene control total.** Puede revisar el JPG antes de decidir
insertar. Si el JPG no está bien, hace drop de uno nuevo antes de presionar.

---

## DATOS DEL EXCEL

### Estructura del archivo
- Cada receta tiene su propio `.xlsx` en `{projectFolder}/{subfolderName}/{recipeName}.xlsx`
- El archivo puede tener nombre completo incluyendo precio y "DONE BY":
  `$12.99_Standard Rose DONE BY Carlos.xlsx`
- La app ya sabe la ruta exacta del Excel desde Firestore (`recipe.excelPath` o equivalente)
- El agente debe investigar el codebase para confirmar cómo se almacena el path del Excel

### Hoja target
- Nombre: **"Spec Sheet"**
- Si la hoja no existe en el workbook: log de error, no crashear

### Área de la foto
- Celda fusionada: **G8:M35**
- Etiqueta: "PHOTO" (en G7)
- La imagen va dentro de G8:M35, centrada, manteniendo aspect ratio

### Dimensiones del área (medidas del template real)
```
Columnas G a M:
  G: 13.0 units  → ~97px
  H: 13.0 units  → ~97px
  I: 13.0 units  → ~97px
  J: 13.0 units  → ~97px
  K: 13.0 units  → ~97px
  L: 15.5 units  → ~116px
  M: 13.0 units  → ~97px
  Total: ~701px de ancho

Filas 8 a 35:
  Rows 8-9: 16pt height → ~21px cada una
  Rows 10-35: 15pt height (default) → ~20px cada una
  Total: ~563px de alto

Área total: ~701 x 563 px
```

---

## ALGORITMO DE INSERCIÓN

```python
from openpyxl import load_workbook
from openpyxl.drawing.image import Image as XLImage
from openpyxl.drawing.xdr import XDRPoint2D, XDRPositiveSize2D
from openpyxl.drawing.spreadsheet_drawing import AbsoluteAnchor
from openpyxl.utils import get_column_letter
from openpyxl.utils.units import pixels_to_EMU
import PIL.Image as PILImage

def insert_photo_in_excel(excel_path: str, jpg_path: str) -> None:
    wb = load_workbook(excel_path)

    if 'Spec Sheet' not in wb.sheetnames:
        raise ValueError(f"'Spec Sheet' not found in {excel_path}")

    ws = wb['Spec Sheet']

    # --- Helpers ---
    def col_px(col_letter: str) -> float:
        w = ws.column_dimensions[col_letter].width
        return (w or 8.43) * 7.5

    def row_px(row_idx: int) -> float:
        h = ws.row_dimensions[row_idx].height
        return (h or 15) * 1.3333

    # --- Calcular posición absoluta de G8 ---
    # Suma de columnas A-F (índices 1-6)
    x_offset = sum(col_px(get_column_letter(c)) for c in range(1, 7))
    # Suma de filas 1-7
    y_offset = sum(row_px(r) for r in range(1, 8))

    # --- Calcular tamaño del área G8:M35 ---
    area_w = sum(col_px(get_column_letter(c)) for c in range(7, 14))  # G=7 a M=13
    area_h = sum(row_px(r) for r in range(8, 36))                     # filas 8-35

    # --- Cargar imagen y calcular fit con aspect ratio ---
    pil_img = PILImage.open(jpg_path).convert('RGB')
    orig_w, orig_h = pil_img.size

    ratio = min(area_w / orig_w, area_h / orig_h)
    new_w = int(orig_w * ratio)
    new_h = int(orig_h * ratio)

    # --- Centrar dentro del área ---
    center_x = x_offset + (area_w - new_w) / 2
    center_y = y_offset + (area_h - new_h) / 2

    # --- Resize y guardar temporal ---
    import tempfile, os
    pil_resized = pil_img.resize((new_w, new_h), PILImage.LANCZOS)
    tmp = tempfile.NamedTemporaryFile(suffix='.png', delete=False)
    pil_resized.save(tmp.name, 'PNG')
    tmp.close()

    # --- Insertar en Excel con AbsoluteAnchor ---
    # AbsoluteAnchor permite posicionamiento en píxeles exactos,
    # independiente del tamaño de las celdas
    xl_img = XLImage(tmp.name)
    xl_img.width = new_w
    xl_img.height = new_h

    size   = XDRPositiveSize2D(pixels_to_EMU(new_w),       pixels_to_EMU(new_h))
    marker = XDRPoint2D(pixels_to_EMU(int(center_x)),      pixels_to_EMU(int(center_y)))
    xl_img.anchor = AbsoluteAnchor(pos=marker, ext=size)

    # Eliminar imagen anterior si existe (evitar duplicados en reinserciones)
    ws._images = [img for img in ws._images
                  if not (hasattr(img, '_photo_inserted_by_npd') and img._photo_inserted_by_npd)]
    # Marcar esta imagen para identificarla en futuras actualizaciones
    # (openpyxl no tiene campo nativo para esto — usar comentario en anchor o simplemente
    # limpiar TODAS las imágenes del ws antes de insertar si el area G8:M35 es la única)
    ws._images = []  # limpiar todas las imágenes del sheet antes de insertar
    ws.add_image(xl_img)

    wb.save(excel_path)
    os.unlink(tmp.name)
```

**NOTA IMPORTANTE:** El algoritmo usa `AbsoluteAnchor` (posición absoluta en EMUs),
no `TwoCellAnchor`. Esto garantiza que la imagen siempre quede centrada
independientemente de cómo estén configuradas las filas/columnas en cada Excel.

---

## IPC NUEVO: excel:insert-photo

Este IPC se llama desde el renderer después de que el JPG ha sido generado.

### Main process
```typescript
import { ipcMain } from 'electron'
import { execFile } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'

ipcMain.handle('excel:insert-photo', async (_event, {
  excelPath,
  jpgPath,
}: {
  excelPath: string
  jpgPath: string
}) => {
  try {
    // Verificar que ambos archivos existen
    if (!fs.existsSync(excelPath)) {
      return { success: false, error: `Excel not found: ${excelPath}` }
    }
    if (!fs.existsSync(jpgPath)) {
      return { success: false, error: `JPG not found: ${jpgPath}` }
    }

    // Llamar al script Python que hace la inserción
    // El script debe estar bundleado en extraResources
    const scriptPath = path.join(process.resourcesPath, 'scripts', 'insert_photo.py')

    return new Promise((resolve) => {
      execFile('python3', [scriptPath, excelPath, jpgPath], (error, stdout, stderr) => {
        if (error) {
          console.error('[excel:insert-photo]', stderr)
          resolve({ success: false, error: stderr || error.message })
        } else {
          resolve({ success: true })
        }
      })
    })
  } catch (err) {
    return { success: false, error: String(err) }
  }
})
```

### Script Python: resources/scripts/insert_photo.py
```python
#!/usr/bin/env python3
"""
insert_photo.py — Inserta una imagen JPG en el área PHOTO (G8:M35)
de la hoja "Spec Sheet" del Excel de receta de Elite Flower.

Uso: python3 insert_photo.py <excel_path> <jpg_path>
"""
import sys
import os
import tempfile
from openpyxl import load_workbook
from openpyxl.drawing.image import Image as XLImage
from openpyxl.drawing.xdr import XDRPoint2D, XDRPositiveSize2D
from openpyxl.drawing.spreadsheet_drawing import AbsoluteAnchor
from openpyxl.utils import get_column_letter
from openpyxl.utils.units import pixels_to_EMU
from PIL import Image as PILImage

def col_px(ws, col_letter):
    w = ws.column_dimensions[col_letter].width
    return (w or 8.43) * 7.5

def row_px(ws, row_idx):
    h = ws.row_dimensions[row_idx].height
    return (h or 15) * 1.3333

def insert_photo(excel_path, jpg_path):
    wb = load_workbook(excel_path)

    if 'Spec Sheet' not in wb.sheetnames:
        print(f"ERROR: 'Spec Sheet' not found in {excel_path}", file=sys.stderr)
        sys.exit(1)

    ws = wb['Spec Sheet']

    # Posición absoluta de G8
    x_offset = sum(col_px(ws, get_column_letter(c)) for c in range(1, 7))
    y_offset = sum(row_px(ws, r) for r in range(1, 8))

    # Tamaño del área G8:M35
    area_w = sum(col_px(ws, get_column_letter(c)) for c in range(7, 14))
    area_h = sum(row_px(ws, r) for r in range(8, 36))

    # Cargar y redimensionar imagen
    pil_img = PILImage.open(jpg_path).convert('RGB')
    orig_w, orig_h = pil_img.size
    ratio = min(area_w / orig_w, area_h / orig_h)
    new_w = int(orig_w * ratio)
    new_h = int(orig_h * ratio)

    # Centrar
    cx = x_offset + (area_w - new_w) / 2
    cy = y_offset + (area_h - new_h) / 2

    # Resize y guardar temporal
    tmp = tempfile.NamedTemporaryFile(suffix='.png', delete=False)
    pil_img.resize((new_w, new_h), PILImage.LANCZOS).save(tmp.name, 'PNG')
    tmp.close()

    # Limpiar imágenes anteriores y reinsertar
    ws._images = []
    xl_img = XLImage(tmp.name)
    xl_img.width = new_w
    xl_img.height = new_h
    xl_img.anchor = AbsoluteAnchor(
        pos=XDRPoint2D(pixels_to_EMU(int(cx)), pixels_to_EMU(int(cy))),
        ext=XDRPositiveSize2D(pixels_to_EMU(new_w), pixels_to_EMU(new_h))
    )
    ws.add_image(xl_img)
    wb.save(excel_path)
    os.unlink(tmp.name)
    print("OK")

if __name__ == '__main__':
    if len(sys.argv) != 3:
        print("Usage: insert_photo.py <excel_path> <jpg_path>", file=sys.stderr)
        sys.exit(1)
    insert_photo(sys.argv[1], sys.argv[2])
```

### Preload
```typescript
insertPhotoInExcel: (args: { excelPath: string; jpgPath: string }) =>
  ipcRenderer.invoke('excel:insert-photo', args),
```

---

## FLUJO COMPLETO EN EL RENDERER (integrado en Fase 3)

En `PhotoManagerView`, tab READY, después de convertir PNG → JPG:

```typescript
async function handlePngDrop(files: File[]) {
  for (const file of files) {
    // ... matching, copy PNG, convert to JPG (Fase 3) ...

    const jpgPath = `${projectFolder}/PICTURES/3. READY/JPG/${subfolderName}/${baseName}.jpg`
    const excelPath = recipe.excelPath  // investigar cómo se almacena en Firestore

    // FASE 4: insertar en Excel
    const insertResult = await window.electronAPI.insertPhotoInExcel({
      excelPath,
      jpgPath,
    })

    if (!insertResult.success) {
      showToast(`⚠️ No se pudo insertar en Excel: ${insertResult.error}`, 'warning')
      // No bloquear el flujo — la foto sigue estando en READY
    } else {
      showToast(`✓ Imagen insertada en ${path.basename(excelPath)}`, 'success')
    }

    // Actualizar Firestore (photoStatus: 'ready')
    await updateRecipeReadyPaths(recipe.id, pngPath, jpgPath, userId)
  }
}
```

---

## PREREQUISITOS DEL SISTEMA

Las librerías Python deben estar disponibles en el Mac del usuario.
Verificar al iniciar la app o antes de la primera inserción:

```bash
python3 -c "import openpyxl, PIL" 2>/dev/null && echo "OK" || echo "MISSING"
```

Si faltan:
```bash
pip3 install openpyxl pillow --break-system-packages
```

La app debe mostrar un banner de instalación si las librerías no están disponibles,
igual que el banner de gphoto2 en Fase 1.

---

## MANEJO DE ERRORES

| Situación | Comportamiento |
|-----------|----------------|
| "Spec Sheet" no existe en el workbook | Toast de warning, no bloquear el flujo de READY |
| Excel abierto por el usuario en ese momento | Python lanzará error de archivo bloqueado → toast de error claro: "Cierra el Excel antes de continuar" |
| JPG no existe o está corrupto | Toast de error con path exacto |
| python3 no disponible | Banner de instalación al abrir Photo Manager |
| openpyxl/Pillow no disponibles | Banner de instalación con instrucciones |
| Excel path no encontrado en Firestore | El agente debe investigar y manejar este caso |

---

## CAMBIOS EN FIRESTORE

### Recipe — campo nuevo
```typescript
excelInsertedAt: Timestamp | null    // cuándo se insertó la imagen por última vez
excelInsertedBy: string | null       // uid de quien lo hizo
```

### Función nueva en firestore.ts
```typescript
export async function updateRecipeExcelInserted(
  recipeId: string,
  userId: string
): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS.RECIPES, recipeId), {
    excelInsertedAt: serverTimestamp(),
    excelInsertedBy: userId,
  })
}
```

---

## TIMELINE — ACTUALIZACIÓN

El step "Photo Done" (último del timeline en el sidepanel) se activa cuando
`photoStatus === 'ready'`, que ya se setea en Fase 3 al generar el JPG.

La inserción en Excel es parte del mismo proceso de Fase 3/4, así que
`photoStatus: 'ready'` cubre ambos pasos. No se necesita un nuevo estado.

---

## BUNDLING DEL SCRIPT PYTHON

El script `insert_photo.py` debe estar incluido en el build de Electron.

En `electron-builder.yml`, agregar a `extraResources`:
```yaml
extraResources:
  - from: resources/scripts/insert_photo.py
    to: scripts/insert_photo.py
  # ... otros extraResources existentes ...
```

Esto hace que en producción el script esté en:
- Mac: `{app}.app/Contents/Resources/scripts/insert_photo.py`
- Accesible via: `path.join(process.resourcesPath, 'scripts', 'insert_photo.py')`

---

# PROMPTS PARA CLAUDE CODE
# Orden: PE-1 → PE-2 → PE-3

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT PE-1 — Script Python + IPC excel:insert-photo
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lee CLAUDE.md y DOCUMENTACION_TECNICA_NPD_PLANNER.md completamente antes de empezar.
Lee electron-builder.yml para entender cómo están configurados los extraResources.
Lee src/main/index.ts para entender dónde se registran los IPC handlers.

1. Crear el script Python en resources/scripts/insert_photo.py con el
   contenido exacto del spec (sección "Script Python: resources/scripts/insert_photo.py").

2. Verificar que openpyxl y Pillow están disponibles en el sistema:
   ```bash
   python3 -c "import openpyxl, PIL; print('OK')"
   ```
   Si no están instalados:
   ```bash
   pip3 install openpyxl pillow --break-system-packages
   ```

3. Probar el script localmente antes de integrarlo:
   ```bash
   python3 resources/scripts/insert_photo.py \
     "/ruta/al/excel.xlsx" \
     "/ruta/al/foto.jpg"
   ```
   Verificar que el Excel se abre correctamente con la imagen centrada en G8:M35
   de la hoja "Spec Sheet".

4. Registrar el IPC handler en src/main/ipc/ (crear excel-handlers.ts o agregar
   a un archivo existente):

   ```typescript
   import { ipcMain } from 'electron'
   import { execFile } from 'child_process'
   import * as path from 'path'
   import * as fs from 'fs'
   import { app } from 'electron'

   export function registerExcelPhotoHandlers(): void {
     ipcMain.handle('excel:insert-photo', async (_event, { excelPath, jpgPath }) => {
       try {
         if (!fs.existsSync(excelPath)) {
           return { success: false, error: `Excel not found: ${excelPath}` }
         }
         if (!fs.existsSync(jpgPath)) {
           return { success: false, error: `JPG not found: ${jpgPath}` }
         }

         // En desarrollo: usar el script desde resources/scripts/
         // En producción: usar process.resourcesPath
         const isDev = !app.isPackaged
         const scriptPath = isDev
           ? path.join(__dirname, '../../resources/scripts/insert_photo.py')
           : path.join(process.resourcesPath, 'scripts', 'insert_photo.py')

         return new Promise((resolve) => {
           execFile('python3', [scriptPath, excelPath, jpgPath],
             { timeout: 30000 },
             (error, stdout, stderr) => {
               if (error) {
                 console.error('[excel:insert-photo]', stderr)
                 resolve({ success: false, error: stderr || error.message })
               } else {
                 resolve({ success: true })
               }
             }
           )
         })
       } catch (err) {
         return { success: false, error: String(err) }
       }
     })
   }
   ```

   Importar y llamar `registerExcelPhotoHandlers()` en src/main/index.ts,
   junto a los demás registerXxxHandlers().

5. En src/preload/index.ts, exponer:
   ```typescript
   insertPhotoInExcel: (args: { excelPath: string; jpgPath: string }) =>
     ipcRenderer.invoke('excel:insert-photo', args),
   ```

6. En electron-builder.yml, agregar a extraResources:
   ```yaml
   - from: resources/scripts/insert_photo.py
     to: scripts/insert_photo.py
   ```

7. En src/renderer/src/types/index.ts, agregar a Recipe:
   ```typescript
   excelInsertedAt: Timestamp | null
   excelInsertedBy: string | null
   ```

8. En src/renderer/src/lib/firestore.ts, agregar:
   ```typescript
   export async function updateRecipeExcelInserted(
     recipeId: string,
     userId: string
   ): Promise<void> {
     await updateDoc(doc(db, COLLECTIONS.RECIPES, recipeId), {
       excelInsertedAt: serverTimestamp(),
       excelInsertedBy: userId,
     })
   }
   ```

9. npm run typecheck — corregir todos los errores.

10. Commit: "feat(photo-excel): script Python insert_photo.py + IPC excel:insert-photo"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT PE-2 — Botón "Insertar en Excel" en el grid del tab READY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lee CLAUDE.md completamente antes de empezar.
Lee src/renderer/src/components/recipe/PhotoManagerView.tsx — el tab READY.
El agente debe investigar cómo se almacena el path del Excel en Firestore
para cada recipe (puede ser recipe.excelPath, recipe.filePath, o similar).

En el grid de resultados del tab READY, cada receta procesada muestra su JPG
y un botón de acción. Implementar lo siguiente:

1. LAYOUT de cada card de receta en el grid READY:

   ```
   ┌─────────────────────────────┐
   │  [thumbnail JPG]            │
   │                             │
   │  Standard Rose              │
   │  Valentines                 │
   │                             │
   │  [📊 Insertar en Excel]     │  ← botón principal
   │                             │
   └─────────────────────────────┘
   ```

   Estados del botón según `recipe.excelInsertedAt`:

   a. **Sin insertar** (`excelInsertedAt === null`):
      ```tsx
      <button
        onClick={() => handleInsertToExcel(recipe)}
        disabled={inserting}
        className="w-full mt-2 px-3 py-1.5 rounded-lg text-sm font-medium
                   bg-blue-600 hover:bg-blue-700 text-white
                   disabled:opacity-50 disabled:cursor-not-allowed
                   flex items-center justify-center gap-1.5"
      >
        {inserting ? (
          <><Loader2 size={14} className="animate-spin" /> Insertando...</>
        ) : (
          <><FileSpreadsheet size={14} /> Insertar en Excel</>
        )}
      </button>
      ```

   b. **Ya insertado** (`excelInsertedAt !== null`):
      ```tsx
      <div className="w-full mt-2 flex flex-col gap-1">
        {/* Badge de confirmación */}
        <div className="flex items-center gap-1.5 text-xs text-green-600
                        dark:text-green-400 justify-center">
          <CheckCircle size={13} />
          <span>Insertado el {formatDate(recipe.excelInsertedAt)}</span>
        </div>
        {/* Botón de reinsercción — más discreto */}
        <button
          onClick={() => handleInsertToExcel(recipe)}
          disabled={inserting}
          className="w-full px-3 py-1 rounded-lg text-xs
                     border border-gray-300 dark:border-gray-600
                     text-gray-500 hover:text-gray-700
                     hover:border-gray-400 transition-colors"
        >
          Reinsertar
        </button>
      </div>
      ```

2. FUNCIÓN handleInsertToExcel:

   ```typescript
   async function handleInsertToExcel(recipe: Recipe) {
     setInserting(recipe.id)
     try {
       // INVESTIGAR: obtener el path del Excel de esta receta desde Firestore
       // Puede estar en recipe.excelPath, recipe.filePath, o derivarse de:
       // `${projectFolder}/${recipe.subfolderName}/${recipe.excelFilename}`
       const excelPath = recipe.excelPath  // ajustar según codebase

       const jpgPath = `${projectFolder}/PICTURES/3. READY/JPG/${recipe.subfolderName}/${recipe.baseName}.jpg`

       // Verificar que el JPG existe antes de llamar
       // (el agente puede agregar un IPC fs:exists si no existe ya)

       const result = await window.electronAPI.insertPhotoInExcel({ excelPath, jpgPath })

       if (!result.success) {
         // Errores específicos con mensajes claros al usuario
         if (result.error?.includes('locked') || result.error?.includes('Permission')) {
           showToast('Cierra el archivo Excel e inténtalo de nuevo', 'error')
         } else if (result.error?.includes('Spec Sheet')) {
           showToast('No se encontró la hoja "Spec Sheet" en este Excel', 'error')
         } else {
           showToast(`Error al insertar imagen: ${result.error}`, 'error')
         }
         return
       }

       // Éxito — actualizar Firestore
       await updateRecipeExcelInserted(recipe.id, currentUser.uid)
       showToast(`✓ Imagen insertada en ${recipe.excelFilename ?? 'Excel'}`, 'success')

     } catch (err) {
       showToast(`Error inesperado: ${String(err)}`, 'error')
     } finally {
       setInserting(null)
     }
   }
   ```

3. Estado local de inserción en curso:
   ```typescript
   const [inserting, setInserting] = useState<string | null>(null)
   // string = recipeId que está insertando, null = ninguno en curso
   // Previene múltiples inserciones simultáneas
   ```

4. La card de receta también muestra:
   - Thumbnail del JPG (desde `readFileAsDataUrl(jpgPath)`)
   - Badge "PNG + JPG" si ambos archivos existen en disco
   - Badge naranja "Solo PNG" si el JPG aún no se generó (no mostrar botón Insertar en este caso)
   - Nombre de la receta y subcarpeta

5. npm run typecheck && npm run dev

6. Commit: "feat(photo-excel): botón Insertar en Excel por receta en tab READY"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT PE-3 — Actualizar CLAUDE.md y DOCUMENTACION_TECNICA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lee CLAUDE.md y DOCUMENTACION_TECNICA_NPD_PLANNER.md completamente.

Actualizar ambos documentos para reflejar la Fase 4 completa:

En CLAUDE.md:
- IPC: excel:insert-photo
- Script externo: resources/scripts/insert_photo.py (Python, openpyxl + Pillow)
- Recipe: agregar excelInsertedAt, excelInsertedBy
- extraResources: insert_photo.py
- Prerequisitos del sistema: python3 + openpyxl + Pillow
- Trigger: botón manual "Insertar en Excel" por receta en tab READY (NO automático)
- Marcar Fase 4 como completada [x]

En DOCUMENTACION_TECNICA_NPD_PLANNER.md:
- Agregar sección Fase 4 en el módulo fotográfico
- Documentar: hoja target "Spec Sheet", área G8:M35, algoritmo de centrado
- Documentar: AbsoluteAnchor con EMUs para posicionamiento exacto
- Documentar: flujo manual — usuario revisa JPG y presiona botón cuando está listo
- Documentar estados del botón: sin insertar / insertando / ya insertado / reinsertar
- Actualizar tabla de fases (todas ✅)
- Documentar prerequisitos: python3, openpyxl, Pillow

Commit: "docs: módulo fotográfico Fase 4 completa en CLAUDE.md y documentación técnica"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE PROMPTS — FASE 4 COMPLETA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Orden de ejecución: PE-1 → PE-2 → PE-3

Test de smoke al terminar PE-2:
  1. Abrir proyecto con receta que tenga JPG en 3.READY/JPG/
  2. Photo Manager → tab READY → card de receta muestra botón "📊 Insertar en Excel"
  3. Presionar el botón → spinner "Insertando..."
  4. Abrir el Excel en disco → hoja "Spec Sheet" → G8:M35 tiene la imagen centrada
  5. Botón cambia a "✓ Insertado el [fecha]" + botón discreto "Reinsertar"
  6. Firestore: recipe.excelInsertedAt tiene timestamp
  7. Presionar "Reinsertar" → imagen se reemplaza sin duplicarse
  8. Si el Excel está abierto en Excel.app → toast claro "Cierra el archivo Excel e inténtalo de nuevo"
  9. Si la receta solo tiene PNG (no JPG) → botón "Insertar en Excel" NO aparece
