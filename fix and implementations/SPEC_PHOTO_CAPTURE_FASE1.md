si# NPD Planner — Módulo de Captura Fotográfica (Fase 1)
# Spec + Prompts para Claude Code
# Fecha: 2026-04-21

---

## CONTEXTO Y DECISIONES DE ARQUITECTURA

### ¿Qué hace este módulo?
Tethering fotográfico integrado en NPD Planner. El fotógrafo dispara la cámara
físicamente. La foto viaja por USB al Mac. NPD Planner la detecta automáticamente,
la renombra, la guarda en dos lugares y la muestra en pantalla.

### Stack de captura
- **gPhoto2** instalado vía Homebrew (`brew install gphoto2`)
- **Modo:** `gphoto2 --capture-tethered` como proceso hijo (`child_process.spawn`)
- **Watch:** `chokidar` observa carpeta temporal → detecta foto nueva
- **NO live view** — solo captura + display de foto resultante
- **Mac only** en esta fase

### Almacenamiento (NO Firebase para fotos)
- **SharePoint:** `{projectFolder}/Pictures/{subfolderName}/{recipeName} - {n}.jpg`
- **SSD externo:** misma estructura, ruta configurable en Settings globales
- **Firestore:** solo guarda el array de paths + metadata (no binarios)
- **CAMERA:** `{projectFolder}/CAMERA/{subfolderName}/{recipeName} - {n}.jpg` — fotos crudas sin tocar

### Roles con acceso al módulo
- **owner** — acceso total, ve botón de cámara en recetas
- **photographer** — rol nuevo, SOLO ve Recipe Manager + módulo de captura, sin edición
- **admin / member** — NO ven el módulo de captura

### Estructura de carpetas en disco

```
Valentine's Day 2026/              ← projectFolder en Firestore
├── _project/
├── Valentines/                    ← subfolder (variedad)
│   ├── A1.xlsx
│   ├── B2.xlsx
│   └── C3.xlsx
├── Pictures/                      ← creada automáticamente al primera captura
│   └── Valentines/
│       ├── A1 - 1.jpg
│       ├── A1 - 2.jpg
│       └── B2 - 1.jpg
└── CAMERA/                        ← fotos crudas del tethering
    └── Valentines/
        ├── A1 - 1.jpg
        └── B2 - 1.jpg
```

### Nomenclatura de archivos
- Formato: `{recipeName} - {n}.jpg`
- recipeName = nombre del Excel sin extensión y sin precio (ej: `Standard Rose`, `Premium Lily`)
- n = secuencia por receta, empieza en 1, reinicia al cambiar de receta
- Ejemplo: `Standard Rose - 1.jpg`, `Standard Rose - 2.jpg`, `Premium Lily - 1.jpg`

### Campo photoStatus en recipes (Firestore)
```typescript
photoStatus: 'pending' | 'in_progress' | 'complete'
capturedPhotos: Array<{
  sequence: number
  filename: string          // "Standard Rose - 1.jpg"
  subfolderName: string     // "Valentines"
  picturePath: string       // ruta absoluta en Pictures/
  cameraPath: string        // ruta absoluta en CAMERA/
  ssdPath: string | null    // ruta en SSD si disponible
  capturedAt: Timestamp
  capturedBy: string        // uid
}>
```

---

## CAMBIOS EN TIPOS EXISTENTES

### AppUser — agregar rol photographer
```typescript
role: 'owner' | 'admin' | 'member' | 'photographer'
```

### Recipe — agregar campos de foto
```typescript
photoStatus: 'pending' | 'in_progress' | 'complete'
capturedPhotos: CapturedPhoto[]
```

### GlobalSettings — agregar SSD path
```typescript
ssdPhotoPath: string | null   // configurable en Settings
```

---

## IPC CHANNELS NUEVOS

### Main → Renderer
```
camera:status-changed   { connected: boolean, model: string | null }
camera:photo-received   { tempPath: string, filename: string }
```

### Renderer → Main
```
camera:start-tethering  { outputDir: string } → { success: boolean, error?: string }
camera:stop-tethering   → void
camera:check-connection → { connected: boolean, model: string | null }
```

---

## PANTALLAS Y COMPONENTES

### 1. Badge de cámara en header global
- Badge verde con ícono de cámara cuando hay cámara conectada
- Badge gris cuando no hay cámara
- Al conectar: sonido de chime (usar Notification API o archivo .mp3 bundleado)
- Al hover: tooltip con modelo de cámara
- Visible SOLO para owner y photographer

### 2. Botón "📷 Tomar Fotos" en cada Recipe card
- Visible solo para owner y photographer
- Deshabilitado si photoStatus === 'complete'
- Al hacer click → navega a `/capture/:recipeId`

### 3. Página de captura `/capture/:recipeId`

**Layout:**
```
┌──────────────────────────────────────────────┐
│ ← Volver  |  Valentines › Standard Rose      │
│            |  📷 Canon EOS 6D Mark II  [●LIVE]│
├──────────────────────────────────────────────┤
│                                              │
│         [Área de preview — 100%]             │
│         Última foto capturada                │
│         (o placeholder si no hay fotos)      │
│                                              │
├──────────────────────────────────────────────┤
│  Filmstrip horizontal (thumbnails 120x80px)  │
│  [foto1] [foto2] [foto3] ← scroll horizontal │
├──────────────────────────────────────────────┤
│  [DONE ✓]        Foto 3 de esta sesión       │
└──────────────────────────────────────────────┘
```

**Comportamiento:**
1. Al entrar: app verifica cámara conectada via IPC
2. Si no hay cámara: banner naranja "Conecta la cámara Canon por USB y enciéndela"
   con botón "Reintentar" que llama `camera:check-connection`
3. Si hay cámara: inicia `camera:start-tethering` con outputDir = carpeta CAMERA temporal
4. Cuando llega `camera:photo-received`:
   a. Copia foto a `CAMERA/{subfolder}/{recipeName} - {n}.jpg`
   b. Copia foto a `Pictures/{subfolder}/{recipeName} - {n}.jpg`
   c. Si SSD configurado: copia foto al SSD misma estructura
   d. Muestra foto en área de preview (fade in)
   e. Agrega thumbnail al filmstrip
   f. Guarda en Firestore (capturedPhotos array)
5. ESPACIO o click en botón captura → NO hace nada (el disparo es físico en la cámara)
   — la captura viene automáticamente del tethering
6. Botón DONE:
   a. Detiene tethering (`camera:stop-tethering`)
   b. Actualiza `photoStatus: 'complete'` en Firestore
   c. Regresa a la lista de recetas del proyecto
   d. Modal de confirmación: "¿Marcar [Standard Rose] como fotografiada?"

### 4. Settings — SSD Configuration
En SettingsPage, agregar tab o sección "Photography":
- Input de ruta + botón Browse (usa selectFolder IPC ya existente)
- Indicador de estado: verde si la ruta existe y tiene permisos de escritura, rojo si no
- Botón "Test" que escribe un archivo temporal y lo elimina
- Solo visible para owner

---

## PREREQUISITOS DEL SISTEMA

gPhoto2 debe estar instalado. La app debe detectar si está disponible:
```bash
which gphoto2   # si retorna path, está instalado
```
Si no está: banner de instalación con instrucciones:
```
brew install gphoto2
```

---

## MANEJO DE ERRORES

| Situación | Comportamiento |
|-----------|----------------|
| Cámara desconectada durante sesión | Banner rojo, botón reconectar, tethering reinicia |
| SSD lleno o desconectado | Warning banner, guarda solo en SharePoint, continúa |
| gPhoto2 no instalado | Página de captura muestra instrucciones de instalación |
| Permiso denegado en carpeta | Error con path exacto y botón para abrir Finder |
| Foto corrupta/vacía | Silently skip + log en consola |

---

## FASES FUTURAS (NO implementar ahora — guardar para referencia)

### Fase 2 — Selección de candidatos
- En la capture page, fotógrafo puede marcar fotos como "Selected"
- Las seleccionadas se copian a `Selected/{subfolder}/{recipeName} - {n}.jpg`

### Fase 3 — Limpieza y exportación a Excel
- User hace drop de PNGs limpios a la app
- App crea carpeta `Cleaned/{subfolder}/{recipeName}/`
  - `{recipeName}.png` (original drop)
  - `{recipeName}.jpg` (convertido por sharp)
- App inserta la imagen JPG en la celda indicada del Excel correspondiente

---

# PROMPTS PARA CLAUDE CODE
# Pegar en orden. Cada prompt hace typecheck antes de terminar.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT PC-1 — Tipos + rol photographer + campos recipe
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lee CLAUDE.md y DOCUMENTACION_TECNICA_NPD_PLANNER.md completamente antes de empezar.

Agrega los tipos necesarios para el módulo de captura fotográfica:

1. En src/renderer/src/types/index.ts:

   a. En AppUser, cambiar el tipo de role a:
      role: 'owner' | 'admin' | 'member' | 'photographer'

   b. Agregar interface CapturedPhoto:
      ```typescript
      export interface CapturedPhoto {
        sequence: number
        filename: string           // "Standard Rose - 1.jpg"
        subfolderName: string      // "Valentines"
        picturePath: string        // ruta absoluta en Pictures/
        cameraPath: string         // ruta absoluta en CAMERA/
        ssdPath: string | null
        capturedAt: Timestamp
        capturedBy: string         // uid
      }
      ```

   c. En la interface Recipe (o donde exista el tipo de receta en Recipe Manager),
      agregar campos:
      ```typescript
      photoStatus: 'pending' | 'in_progress' | 'complete'
      capturedPhotos: CapturedPhoto[]
      ```
      Si capturedPhotos no existe en una receta, tratar como array vacío.

   d. En GlobalSettings agregar:
      ```typescript
      ssdPhotoPath: string | null
      ```

2. En src/main/index.ts (o donde estén los IPC handlers del main process),
   agregar los channel names como constantes o simplemente documentarlos:
   - 'camera:status-changed'   (main → renderer)
   - 'camera:photo-received'   (main → renderer)
   - 'camera:start-tethering'  (renderer → main)
   - 'camera:stop-tethering'   (renderer → main)
   - 'camera:check-connection' (renderer → main)

3. En src/preload/index.ts, exponer en window.electronAPI:
   ```typescript
   startCameraTethering: (outputDir: string) => Promise<{ success: boolean; error?: string }>
   stopCameraTethering: () => Promise<void>
   checkCameraConnection: () => Promise<{ connected: boolean; model: string | null }>
   onCameraStatusChanged: (cb: (data: { connected: boolean; model: string | null }) => void) => () => void
   onCameraPhotoReceived: (cb: (data: { tempPath: string; filename: string }) => void) => () => void
   ```
   Recuerda el patrón existente de cleanup para los listeners (retornar función de unlisten).

4. En src/lib/firestore.ts, agregar funciones:
   ```typescript
   // Actualizar photoStatus de una receta
   export async function updateRecipePhotoStatus(
     recipeId: string,
     status: 'pending' | 'in_progress' | 'complete'
   ): Promise<void>

   // Agregar foto capturada al array de la receta
   export async function addCapturedPhoto(
     recipeId: string,
     photo: CapturedPhoto
   ): Promise<void>
   ```
   Usar arrayUnion de Firestore para addCapturedPhoto.

5. Ejecutar: npm run typecheck
   Corregir todos los errores antes de continuar.

6. Commit: "feat(photo): tipos CapturedPhoto, rol photographer, IPC channels"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT PC-2 — CameraManager en main process (gPhoto2 + chokidar)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lee CLAUDE.md completamente antes de empezar.
Lee src/main/index.ts para entender la estructura actual del main process.

Instala dependencias necesarias:
npm install chokidar
npm install --save-dev @types/node

Crea el archivo src/main/camera/CameraManager.ts:

```typescript
/**
 * CameraManager — gestiona el proceso gphoto2 tethered y el watch de fotos
 *
 * Flujo:
 * 1. checkConnection()  → spawna `gphoto2 --auto-detect` para ver si hay cámara
 * 2. startTethering(outputDir) → spawna `gphoto2 --capture-tethered --filename ...`
 *    en la outputDir, con chokidar watch en esa carpeta
 * 3. Cuando chokidar detecta un archivo nuevo → emite evento 'photo-received'
 * 4. stopTethering() → mata el proceso gphoto2, detiene el watcher
 */

import { spawn, ChildProcess } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import chokidar, { FSWatcher } from 'chokidar'
import { EventEmitter } from 'events'

export interface CameraStatus {
  connected: boolean
  model: string | null
}

export interface PhotoReceivedEvent {
  tempPath: string
  filename: string
}

export class CameraManager extends EventEmitter {
  private gphotoProcess: ChildProcess | null = null
  private watcher: FSWatcher | null = null
  private outputDir: string | null = null

  /**
   * Detecta si gphoto2 está instalado en el sistema.
   * Retorna true si `which gphoto2` encuentra el binario.
   */
  async isGphoto2Available(): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn('which', ['gphoto2'])
      proc.on('close', (code) => resolve(code === 0))
      proc.on('error', () => resolve(false))
    })
  }

  /**
   * Verifica si hay una cámara conectada via USB.
   * Usa `gphoto2 --auto-detect` y parsea el output.
   * Retorna { connected, model }.
   */
  async checkConnection(): Promise<CameraStatus> {
    const available = await this.isGphoto2Available()
    if (!available) return { connected: false, model: null }

    return new Promise((resolve) => {
      let output = ''
      const proc = spawn('gphoto2', ['--auto-detect'])
      proc.stdout?.on('data', (data) => { output += data.toString() })
      proc.on('close', () => {
        // Output ejemplo:
        // Model                          Port
        // ----------------------------------------------------------
        // Canon EOS 6D Mark II           usb:020,009
        const lines = output.split('\n').filter(l => l.includes('usb:') || l.includes('PTP'))
        if (lines.length > 0) {
          // Extraer nombre del modelo (todo antes del doble espacio o tab)
          const model = lines[0].replace(/\s{2,}.*/, '').trim()
          resolve({ connected: true, model: model || 'Camera' })
        } else {
          resolve({ connected: false, model: null })
        }
      })
      proc.on('error', () => resolve({ connected: false, model: null }))
      // Timeout de 8 segundos
      setTimeout(() => { proc.kill(); resolve({ connected: false, model: null }) }, 8000)
    })
  }

  /**
   * Inicia el tethering. Lanza gphoto2 en modo --capture-tethered.
   * Las fotos se guardan en outputDir con nombre basado en timestamp.
   * chokidar observa outputDir y emite 'photo-received' por cada foto nueva.
   */
  async startTethering(outputDir: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Asegurar que outputDir existe
      fs.mkdirSync(outputDir, { recursive: true })

      // Detener cualquier sesión anterior
      await this.stopTethering()

      this.outputDir = outputDir

      // Lanzar gphoto2 en modo tethered
      // --filename: pattern de nombre temporal (timestamp)
      // --force-overwrite: por si hay conflicto de nombres
      this.gphotoProcess = spawn('gphoto2', [
        '--capture-tethered',
        '--filename', path.join(outputDir, '%Y%m%d-%H%M%S-%04n.%C'),
        '--force-overwrite',
      ], {
        cwd: outputDir,
      })

      this.gphotoProcess.stderr?.on('data', (data) => {
        console.error('[gphoto2 stderr]', data.toString())
      })

      this.gphotoProcess.on('error', (err) => {
        console.error('[gphoto2 error]', err)
        this.emit('error', err.message)
      })

      this.gphotoProcess.on('close', (code) => {
        console.log('[gphoto2] process closed with code', code)
      })

      // Watch de la carpeta para detectar fotos nuevas
      // ignoreInitial: true para no disparar por archivos pre-existentes
      this.watcher = chokidar.watch(outputDir, {
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
      })

      this.watcher.on('add', (filePath) => {
        const ext = path.extname(filePath).toLowerCase()
        if (['.jpg', '.jpeg', '.cr2', '.cr3', '.nef', '.arw'].includes(ext)) {
          const event: PhotoReceivedEvent = {
            tempPath: filePath,
            filename: path.basename(filePath),
          }
          this.emit('photo-received', event)
        }
      })

      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  }

  /**
   * Detiene el proceso gphoto2 y el watcher de chokidar.
   */
  async stopTethering(): Promise<void> {
    if (this.gphotoProcess) {
      this.gphotoProcess.kill('SIGTERM')
      this.gphotoProcess = null
    }
    if (this.watcher) {
      await this.watcher.close()
      this.watcher = null
    }
    this.outputDir = null
  }
}

export const cameraManager = new CameraManager()
```

Luego, en src/main/ipc/cameraHandlers.ts, crear los IPC handlers:

```typescript
import { ipcMain, BrowserWindow } from 'electron'
import * as os from 'os'
import * as path from 'path'
import { cameraManager } from '../camera/CameraManager'

export function registerCameraHandlers(mainWindow: BrowserWindow): void {

  // Renderer pregunta: ¿hay cámara?
  ipcMain.handle('camera:check-connection', async () => {
    return await cameraManager.checkConnection()
  })

  // Renderer pide iniciar tethering
  ipcMain.handle('camera:start-tethering', async (_event, outputDir: string) => {
    const result = await cameraManager.startTethering(outputDir)
    return result
  })

  // Renderer pide detener tethering
  ipcMain.handle('camera:stop-tethering', async () => {
    await cameraManager.stopTethering()
  })

  // CameraManager emite foto nueva → enviar al renderer
  cameraManager.on('photo-received', (event) => {
    mainWindow.webContents.send('camera:photo-received', event)
  })

  // Poll de conexión cada 10 segundos → notificar al renderer si cambia
  let lastStatus = { connected: false, model: null as string | null }
  setInterval(async () => {
    const status = await cameraManager.checkConnection()
    if (status.connected !== lastStatus.connected || status.model !== lastStatus.model) {
      lastStatus = status
      mainWindow.webContents.send('camera:status-changed', status)
    }
  }, 10000)
}
```

En src/main/index.ts, importar y llamar registerCameraHandlers(mainWindow) después de
que la ventana esté creada (junto a los otros registerXxxHandlers).

Ejecutar: npm run typecheck
Corregir todos los errores.

Commit: "feat(photo): CameraManager + gphoto2 tethered + IPC handlers"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT PC-3 — Badge de cámara en header + hook useCameraStatus
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lee CLAUDE.md completamente antes de empezar.
Lee src/renderer/src/components/layout/ para entender el header/topbar actual.

1. Crear src/renderer/src/hooks/useCameraStatus.ts:

```typescript
/**
 * Hook que mantiene el estado de la cámara en tiempo real.
 * - Al montar: llama checkConnection para estado inicial
 * - Escucha camera:status-changed del main process
 * - Cuando connected cambia de false a true: reproduce sonido de chime
 */
import { useState, useEffect, useRef } from 'react'

interface CameraStatus {
  connected: boolean
  model: string | null
}

export function useCameraStatus(): CameraStatus {
  const [status, setStatus] = useState<CameraStatus>({ connected: false, model: null })
  const prevConnected = useRef(false)

  useEffect(() => {
    // Estado inicial
    window.electronAPI.checkCameraConnection().then(setStatus)

    // Escuchar cambios
    const unlisten = window.electronAPI.onCameraStatusChanged((newStatus) => {
      if (newStatus.connected && !prevConnected.current) {
        // Reproducir sonido de chime al conectar
        const audio = new Audio('/sounds/camera-connect.mp3')
        audio.play().catch(() => {}) // ignorar si falla (no hay audio disponible)
      }
      prevConnected.current = newStatus.connected
      setStatus(newStatus)
    })

    return () => unlisten()
  }, [])

  return status
}
```

2. Añadir un archivo de sonido en resources/sounds/camera-connect.mp3
   (cualquier chime corto de 0.5-1 segundo). Si no tienes un archivo de sonido,
   crea un placeholder y deja un comentario TODO.
   Configura electron-builder.yml para incluir resources/sounds/ en extraResources.

3. Crear src/renderer/src/components/ui/CameraBadge.tsx:

```tsx
/**
 * Badge de cámara para el header global.
 * Verde = conectada, gris = desconectada.
 * Solo visible para owner y photographer.
 */
import { Camera } from 'lucide-react'
import { useCameraStatus } from '../../hooks/useCameraStatus'
import { useAuthStore } from '../../store/authStore'

export function CameraBadge() {
  const { user } = useAuthStore()
  const { connected, model } = useCameraStatus()

  // Solo owner y photographer ven el badge
  if (!user || (user.role !== 'owner' && user.role !== 'photographer')) return null

  return (
    <div
      title={connected ? model ?? 'Camera connected' : 'No camera detected'}
      className={`
        flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium
        transition-colors duration-300
        ${connected
          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
          : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600'
        }
      `}
    >
      <Camera size={13} />
      <span>{connected ? (model ?? 'Connected') : 'No Camera'}</span>
      {connected && (
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
      )}
    </div>
  )
}
```

4. Insertar <CameraBadge /> en el header/topbar de la app (el componente de layout
   que contiene la barra superior). Colocarlo a la derecha, antes del avatar del usuario.
   Solo agregar donde no rompa el layout actual.

5. Ejecutar: npm run typecheck && npm run dev
   Verificar que el badge aparece en el header sin errores.

Commit: "feat(photo): CameraBadge + useCameraStatus hook + sonido al conectar"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT PC-4 — Botón "Tomar Fotos" en Recipe cards + route /capture
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lee CLAUDE.md completamente antes de empezar.
Lee src/renderer/src/pages/ para encontrar donde se renderizan las recetas del Recipe Manager.
Lee src/renderer/src/types/index.ts para entender la estructura de Recipe.

1. En el componente de card/row de receta del Recipe Manager, agregar botón
   "📷 Tomar Fotos":

   - Solo visible si user.role === 'owner' || user.role === 'photographer'
   - Deshabilitado con tooltip "Ya fotografiada" si recipe.photoStatus === 'complete'
   - Si photoStatus === 'in_progress': botón en amarillo con texto "Continuar Fotos"
   - Si photoStatus === 'pending' o undefined: botón verde primario
   - Al hacer click: navigate(`/capture/${recipe.id}`)
   - Usar useNavigate de react-router-dom

   Ejemplo de botón:
   ```tsx
   {canSeePhotoButton && (
     <button
       onClick={() => navigate(`/capture/${recipe.id}`)}
       disabled={recipe.photoStatus === 'complete'}
       className="..."
     >
       <Camera size={14} />
       {recipe.photoStatus === 'in_progress' ? 'Continuar Fotos' : 'Tomar Fotos'}
     </button>
   )}
   ```

2. Agregar la ruta en App.tsx (o donde estén las rutas):
   ```tsx
   <Route path="/capture/:recipeId" element={<CapturePage />} />
   ```
   Protegida igual que las demás rutas — requiere usuario activo.

3. Crear src/renderer/src/pages/CapturePage.tsx — solo el esqueleto con:
   - useParams para obtener recipeId
   - Cargar recipe de Firestore con getDoc
   - Loading state mientras carga
   - Error state si recipe no existe
   - Renderizar un placeholder "Capture Page — {recipe.name}" por ahora
   - Botón "← Volver" que hace navigate(-1)

4. Ejecutar: npm run typecheck
   Verificar que navegar a /capture/test-id muestra el placeholder sin crash.

Commit: "feat(photo): botón Tomar Fotos en recipes + route /capture/:recipeId"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT PC-5 — CapturePage completa: tethering + preview + filmstrip + DONE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lee CLAUDE.md completamente antes de empezar.
Lee src/renderer/src/pages/CapturePage.tsx (el esqueleto del prompt anterior).
Lee src/renderer/src/hooks/useCameraStatus.ts.
Lee src/renderer/src/lib/firestore.ts para las funciones updateRecipePhotoStatus y addCapturedPhoto.

Implementar CapturePage.tsx completa:

```
LAYOUT (usa CSS grid o flexbox, no librerías externas):

┌─────────────────────────────────────────────────────┐
│ [← Volver]  Valentines › Standard Rose  [● Canon]  │  ← Header
├─────────────────────────────────────────────────────┤
│                                                     │
│                                                     │
│            [Preview: última foto]                   │  ← flex-1, object-contain
│            o placeholder gris si no hay fotos       │
│                                                     │
│                                                     │
├─────────────────────────────────────────────────────┤
│ [img][img][img]  ← filmstrip scroll horizontal      │  ← h-24
├─────────────────────────────────────────────────────┤
│    [DONE ✓ Terminar sesión]    3 fotos esta sesión  │  ← footer
└─────────────────────────────────────────────────────┘
```

LÓGICA COMPLETA:

```typescript
// Al montar la página:
// 1. Cargar recipe de Firestore (obtener projectFolder, subfolderName, recipeName)
// 2. Verificar cámara con checkCameraConnection()
// 3. Si hay cámara: llamar startCameraTethering(tempDir)
//    donde tempDir = path temporal del sistema (os.tmpdir() no disponible en renderer,
//    usar un path dentro de userData que vendrá de un nuevo IPC: app:get-user-data-path)
// 4. Escuchar onCameraPhotoReceived para cada foto que llega
// 5. Al desmontar: llamar stopCameraTethering()

// Cuando llega una foto nueva:
// 1. Derivar paths:
//    cameraPath = {projectFolder}/CAMERA/{subfolderName}/{recipeName} - {n}.jpg
//    picturePath = {projectFolder}/Pictures/{subfolderName}/{recipeName} - {n}.jpg
//    ssdPath = si ssdPhotoPath configurado en settings: {ssdPhotoPath}/{projectName}/{subfolderName}/{recipeName} - {n}.jpg
// 2. Llamar IPC copyFile (ya existe en window.electronAPI) para:
//    - tempPath → cameraPath (crear directorios intermedios)
//    - tempPath → picturePath (crear directorios intermedios)
//    - tempPath → ssdPath (si aplica, no bloquear si falla)
// 3. Guardar en Firestore: addCapturedPhoto(recipeId, { sequence, filename, ... })
// 4. Actualizar estado local: setPhotos([...photos, newPhoto])
// 5. setCurrentPreview(picturePath) para mostrar en el área grande

// El path de la foto no puede ser un file:// URL directamente en Electron renderer
// por restricciones de seguridad. Necesitas exponerlo via IPC o usar
// window.electronAPI.getFileAsBase64(path) — agrega este IPC si no existe.
// Alternativamente, si el archivo está en userData/AppData, Electron lo permite.
// La forma más limpia: añadir IPC app:read-file-as-dataurl que lee el archivo
// y retorna un data URL para mostrarlo en <img>.
```

Implementar estos sub-componentes inline en CapturePage.tsx:

a. **CameraStatusBanner**: si !cameraConnected, mostrar banner naranja full-width
   con texto "Conecta la cámara Canon por USB y enciéndela" y botón "Reintentar"
   que llama checkCameraConnection()

b. **PhotoPreview**: área central con:
   - Si photos.length === 0: placeholder gris con ícono Camera y texto
     "Dispara la cámara para tomar la primera foto"
   - Si hay fotos: <img> con la última foto, object-contain, fade-in animation

c. **Filmstrip**: div horizontal scrollable, gap-2, overflow-x-auto:
   - Por cada foto: thumbnail 120x80px, cursor-pointer
   - Al hacer click: setCurrentPreview a esa foto
   - La foto actualmente en preview tiene borde verde

d. **Footer con botón DONE**:
   - Botón verde "✓ Terminar sesión"
   - Al hacer click: modal de confirmación
     "¿Terminar la sesión de fotos para [recipeName]?
      Se han tomado {n} fotos.
      [Cancelar] [Confirmar]"
   - Al confirmar:
     1. stopCameraTethering()
     2. updateRecipePhotoStatus(recipeId, 'complete')
     3. navigate(-1)

NOTA IMPORTANTE: Para mostrar imágenes locales en Electron renderer, necesitas
exponer un nuevo IPC handler en el main process:
```typescript
// En main process:
ipcMain.handle('app:read-file-as-dataurl', async (_event, filePath: string) => {
  const buffer = fs.readFileSync(filePath)
  const ext = path.extname(filePath).toLowerCase().replace('.', '')
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`
  return `data:${mime};base64,${buffer.toString('base64')}`
})

// En preload:
readFileAsDataUrl: (filePath: string) => ipcRenderer.invoke('app:read-file-as-dataurl', filePath)
```
Agregar este IPC si no existe. Usarlo para mostrar las fotos en preview y filmstrip.

También necesitas un IPC para obtener el path de userData:
```typescript
// Main: ipcMain.handle('app:get-user-data-path', () => app.getPath('userData'))
// Preload: getUserDataPath: () => ipcRenderer.invoke('app:get-user-data-path')
```

Ejecutar: npm run typecheck
Ejecutar: npm run dev y probar el flujo completo sin cámara (debe mostrar el banner naranja).

Commit: "feat(photo): CapturePage completa con tethering, preview, filmstrip y DONE"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT PC-6 — Settings: configuración de SSD + indicador de estado
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lee CLAUDE.md completamente antes de empezar.
Lee src/renderer/src/pages/SettingsPage.tsx para entender la estructura actual de settings.
Lee src/renderer/src/lib/firestore.ts para la función que actualiza GlobalSettings.

En la página de Settings (solo visible para owner), agregar sección "Photography":

1. Leer ssdPhotoPath de GlobalSettings desde Firestore al montar.

2. UI de la sección Photography:
   ```
   ┌─────────────────────────────────────────────┐
   │ Photography                                  │
   │                                              │
   │ SSD Photo Path                               │
   │ [/Volumes/MyDrive/Photos        ] [Browse]   │
   │ ● Connected — 128 GB free                    │  ← verde si accesible
   │                                              │
   │ [Test Connection]   [Save]                   │
   └─────────────────────────────────────────────┘
   ```

3. Botón Browse → usa window.electronAPI.selectFolder() (ya existe)

4. Botón "Test Connection":
   - Llama un nuevo IPC: `storage:test-write-access`
   - El main process intenta escribir un archivo temporal en el path
   - Si éxito: retorna { success: true, freeSpaceGB: number }
   - Si falla: retorna { success: false, error: string }

   En main process (agregar en storageHandlers.ts o cameraHandlers.ts):
   ```typescript
   ipcMain.handle('storage:test-write-access', async (_event, dirPath: string) => {
     try {
       const testFile = path.join(dirPath, '.npd-test-write')
       fs.writeFileSync(testFile, 'test')
       fs.unlinkSync(testFile)
       // Obtener espacio libre (macOS: usar `df` command)
       // Si no quieres la complejidad del df, simplemente retornar { success: true }
       return { success: true }
     } catch (err) {
       return { success: false, error: String(err) }
     }
   })
   ```
   Exponer en preload: `testWriteAccess: (dirPath: string) => ipcRenderer.invoke('storage:test-write-access', dirPath)`

5. Al hacer Save: llamar updateGlobalSettings({ ssdPhotoPath: selectedPath })
   (o la función equivalente que ya existe en firestore.ts para GlobalSettings)

6. El indicador de estado (verde/rojo) se recalcula cuando cambia el path o
   después de hacer Test Connection.

7. Ejecutar: npm run typecheck

Commit: "feat(photo): configuración de SSD en Settings con test de escritura"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT PC-7 — photoStatus badge en lista de recetas + permisos photographer
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lee CLAUDE.md completamente antes de empezar.
Lee src/renderer/src/pages/ y src/renderer/src/components/ del Recipe Manager
para entender dónde se listan las recetas.

1. En la lista/grid de recetas del Recipe Manager, mostrar un badge de estado fotográfico
   junto al nombre de cada receta:

   - photoStatus === 'pending' o undefined: nada (no mostrar badge)
   - photoStatus === 'in_progress': badge amarillo "📷 En progreso"
   - photoStatus === 'complete': badge verde "📷 Listo" con checkmark

2. En la matriz de permisos de la app, asegurar que el rol 'photographer':
   - Puede VER la lista de proyectos y recetas del Recipe Manager
   - NO puede editar recetas (botones de editar/crear receta deshabilitados)
   - SÍ puede ver y clickear el botón "Tomar Fotos"
   - NO ve el resto de la app (Boards, Calendar, Analytics, Settings)

   Para esto, en el ProtectedRoute o en el sidebar, agregar lógica:
   ```typescript
   const isPhotographerOnly = user?.role === 'photographer'
   // Si isPhotographerOnly: solo mostrar Recipe Manager en sidebar
   // Si va a una ruta no permitida: redirect a la lista de recetas
   ```

3. En el sidebar, si user.role === 'photographer':
   - Solo mostrar el link al Recipe Manager (o donde estén los proyectos)
   - No mostrar Boards, Calendar, Analytics, Settings
   - Mostrar el CameraBadge normalmente

4. En Settings, si user.role === 'photographer': no mostrar nada (redirect a inicio)

5. En el panel de Members (Settings → Members), permitir que owner/admin
   asigne el rol 'photographer' desde el dropdown de roles de cada usuario.

6. Ejecutar: npm run typecheck && npm run dev
   Verificar que un usuario photographer no puede acceder a /board/:id ni /settings.

Commit: "feat(photo): permisos photographer + badges photoStatus en lista recetas"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT PC-8 — Actualizar CLAUDE.md y DOCUMENTACION_TECNICA_NPD_PLANNER.md
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lee CLAUDE.md y DOCUMENTACION_TECNICA_NPD_PLANNER.md completamente.

Actualiza ambos documentos para reflejar el módulo de captura fotográfica:

En CLAUDE.md:
- Agregar 'photographer' a la lista de roles
- Agregar las nuevas dependencias: chokidar
- Agregar los nuevos IPC channels: camera:*, storage:test-write-access, app:read-file-as-dataurl, app:get-user-data-path
- Agregar la nueva ruta: /capture/:recipeId
- Marcar como [x] las features completadas del módulo de captura

En DOCUMENTACION_TECNICA_NPD_PLANNER.md:
- Agregar sección "Módulo de Captura Fotográfica (Fase 1)"
- Documentar: stack técnico (gphoto2, chokidar), estructura de carpetas en disco,
  flujo de tethering, nomenclatura de archivos, campos nuevos en Firestore
- Actualizar la matriz de permisos con el rol photographer
- Documentar los requisitos del sistema (gphoto2 via Homebrew, Mac only en Fase 1)

Commit: "docs: actualizar CLAUDE.md y documentación técnica con módulo foto Fase 1"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE PROMPTS — FASE 1 COMPLETA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Orden de ejecución: PC-1 → PC-2 → PC-3 → PC-4 → PC-5 → PC-6 → PC-7 → PC-8

Prerequisito manual (hacer una sola vez antes de PC-2):
  brew install gphoto2

Test de smoke al terminar PC-5:
  1. Conectar Canon EOS 6D Mark II por USB
  2. Encender cámara en modo PC
  3. El badge en el header debe volverse verde en < 10 segundos
  4. Navegar a una receta → click "Tomar Fotos"
  5. Disparar la cámara físicamente
  6. La foto debe aparecer en preview en < 3 segundos
  7. El thumbnail debe aparecer en el filmstrip
  8. Click DONE → la receta muestra badge "📷 Listo"
