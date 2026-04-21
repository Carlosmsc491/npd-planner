/**
 * CameraManager — gestiona el proceso gphoto2 tethered y el watch de fotos
 *
 * Flujo:
 * 1. checkConnection()  → spawna `gphoto2 --auto-detect` para ver si hay cámara
 * 2. startTethering(outputDir) → spawna `gphoto2 --capture-tethered --filename ...`
 *    en la outputDir, con chokidar watch en esa carpeta
 * 3. Cuando chokidar detecta un archivo nuevo → emite evento 'photo-received'
 * 4. stopTethering() → mata el proceso gphoto2, detiene el watcher
 *
 * Mac only en Fase 1. gphoto2 debe estar instalado via: brew install gphoto2
 */

import { spawn, ChildProcess } from 'child_process'
import * as nodePath from 'path'
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
   */
  async checkConnection(): Promise<CameraStatus> {
    const available = await this.isGphoto2Available()
    if (!available) return { connected: false, model: null }

    return new Promise((resolve) => {
      let output = ''
      const proc = spawn('gphoto2', ['--auto-detect'])
      proc.stdout?.on('data', (data: Buffer) => { output += data.toString() })
      proc.on('close', () => {
        // Output example:
        // Model                          Port
        // ----------------------------------------------------------
        // Canon EOS 6D Mark II           usb:020,009
        const lines = output.split('\n').filter(l => l.includes('usb:') || l.includes('PTP'))
        if (lines.length > 0) {
          const model = lines[0].replace(/\s{2,}.*/, '').trim()
          resolve({ connected: true, model: model || 'Camera' })
        } else {
          resolve({ connected: false, model: null })
        }
      })
      proc.on('error', () => resolve({ connected: false, model: null }))
      // Timeout 8 seconds
      setTimeout(() => { proc.kill(); resolve({ connected: false, model: null }) }, 8000)
    })
  }

  /**
   * Inicia el tethering. Lanza gphoto2 en modo --capture-tethered.
   * Las fotos se guardan en outputDir. chokidar emite 'photo-received' por cada foto.
   */
  async startTethering(outputDir: string): Promise<{ success: boolean; error?: string }> {
    try {
      fs.mkdirSync(outputDir, { recursive: true })

      // Detener sesión anterior si existe
      await this.stopTethering()


      this.gphotoProcess = spawn('gphoto2', [
        '--capture-tethered',
        '--filename', nodePath.join(outputDir, '%Y%m%d-%H%M%S-%04n.%C'),
        '--force-overwrite',
      ], { cwd: outputDir })

      this.gphotoProcess.stderr?.on('data', (data: Buffer) => {
        console.error('[gphoto2 stderr]', data.toString())
      })

      this.gphotoProcess.on('error', (err: Error) => {
        console.error('[gphoto2 error]', err)
        this.emit('error', err.message)
      })

      this.gphotoProcess.on('close', (code: number | null) => {
        console.log('[gphoto2] process closed with code', code)
      })

      this.watcher = chokidar.watch(outputDir, {
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
      })

      this.watcher.on('add', (filePath: string) => {
        const ext = nodePath.extname(filePath).toLowerCase()
        if (['.jpg', '.jpeg', '.cr2', '.cr3', '.nef', '.arw'].includes(ext)) {
          const event: PhotoReceivedEvent = {
            tempPath: filePath,
            filename: nodePath.basename(filePath),
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
  }
}

export const cameraManager = new CameraManager()
