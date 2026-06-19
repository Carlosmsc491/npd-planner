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
  private folderWatcher: FSWatcher | null = null

  /** PATH augmented with Homebrew dirs so Electron finds gphoto2 regardless of launch context. */
  private get spawnEnv(): NodeJS.ProcessEnv {
    const brewPaths = '/opt/homebrew/bin:/usr/local/bin'
    const current = process.env.PATH ?? ''
    return {
      ...process.env,
      PATH: current.includes('/opt/homebrew/bin') ? current : `${brewPaths}:${current}`,
    }
  }

  /**
   * Detects whether gphoto2 is installed.
   * gPhoto2 tethering is Mac-only — returns false immediately on Windows.
   * On Mac/Linux, checks known Homebrew paths directly before falling back to `which`.
   */
  async isGphoto2Available(): Promise<boolean> {
    if (process.platform === 'win32') return false
    // Check the two common Homebrew install locations first (avoids PATH issues in Electron)
    if (fs.existsSync('/opt/homebrew/bin/gphoto2')) return true
    if (fs.existsSync('/usr/local/bin/gphoto2')) return true
    return new Promise((resolve) => {
      const proc = spawn('which', ['gphoto2'], { env: this.spawnEnv })
      proc.on('close', (code) => resolve(code === 0))
      proc.on('error', () => resolve(false))
    })
  }

  /** Returns the absolute path to gphoto2, or 'gphoto2' as fallback. */
  private get gphoto2Bin(): string {
    if (fs.existsSync('/opt/homebrew/bin/gphoto2')) return '/opt/homebrew/bin/gphoto2'
    if (fs.existsSync('/usr/local/bin/gphoto2')) return '/usr/local/bin/gphoto2'
    return 'gphoto2'
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
      const proc = spawn(this.gphoto2Bin, ['--auto-detect'], { env: this.spawnEnv })
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
  /**
   * macOS auto-loads PTPCamera / imagecaptured when a camera connects,
   * taking exclusive USB ownership. Kill them (by name and by command line)
   * and stop the launchd agent so gPhoto2 can claim the device.
   */
  private killMacOSCameraServices(): Promise<void> {
    const cmds: [string, string[]][] = [
      ['killall', ['-9', 'PTPCamera']],
      ['pkill', ['-9', '-f', 'PTPCamera']],
      ['pkill', ['-9', '-f', 'ptpcamera']],
      ['launchctl', ['stop', 'com.apple.imagecaptured']],
      ['pkill', ['-9', '-f', 'imagecaptured']],
      // Stray gphoto2 procs (a leftover --auto-detect poll or a crashed tether
      // attempt) keep the USB interface claimed → "-53 / No such file or
      // directory" on the next claim. Reap them, but never our live tether proc.
      ['pkill', ['-9', '-x', 'gphoto2']],
    ]
    return cmds.reduce(
      (chain, [cmd, args]) =>
        chain.then(
          () =>
            new Promise<void>((resolve) => {
              const proc = spawn(cmd, args, { env: this.spawnEnv })
              proc.on('close', () => resolve())
              proc.on('error', () => resolve())
            })
        ),
      Promise.resolve()
    )
  }

  /** gPhoto2 errors that mean "the USB device is held by something else". */
  private isDeviceBusyError(msg: string | undefined): boolean {
    if (!msg) return false
    return /could not claim|could not lock|resource busy|an error occurred in the io-library|usb device/i.test(msg)
  }

  /** Try to start gphoto2 tethering once. Resolves on EVERY exit path. */
  private spawnGphoto2(outputDir: string): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      let settled = false
      const settle = (r: { success: boolean; error?: string }) => {
        if (!settled) { settled = true; resolve(r) }
      }

      const proc = spawn(this.gphoto2Bin, [
        '--capture-tethered',
        '--filename', nodePath.join(outputDir, '%Y%m%d-%H%M%S-%04n.%C'),
        '--force-overwrite',
      ], { cwd: outputDir, env: this.spawnEnv })

      this.gphotoProcess = proc
      let startupError = ''

      proc.stdout?.on('data', (data: Buffer) => {
        const msg = data.toString().trim()
        if (msg) { console.log('[gphoto2 stdout]', msg); this.emit('log', msg) }
      })

      proc.stderr?.on('data', (data: Buffer) => {
        const msg = data.toString().trim()
        if (msg) { console.error('[gphoto2 stderr]', msg); this.emit('log', msg) }
        // Capture the first meaningful error line so the caller can decide to retry
        if (!startupError && (this.isDeviceBusyError(msg) || msg.includes('*** Error ***'))) {
          startupError = msg
        }
      })

      proc.on('error', (err: Error) => {
        console.error('[gphoto2 error]', err)
        this.gphotoProcess = null
        settle({ success: false, error: err.message })
      })

      proc.on('close', (code: number | null) => {
        console.log('[gphoto2] process closed with code', code)
        this.gphotoProcess = null
        if (!settled) {
          // Exited before the 2s success window → it failed to start
          settle({ success: false, error: startupError || `gPhoto2 exited with code ${code}` })
        } else if (code !== 0 && code !== null) {
          // Already reported success, then died → surface as a disconnect
          this.emit('tethering-error', `gPhoto2 exited with code ${code}`)
        }
      })

      // If gphoto2 is still running after 2 seconds it started successfully
      setTimeout(() => {
        if (proc.exitCode === null) settle({ success: true })
      }, 2000)
    })
  }

  async startTethering(outputDir: string): Promise<{ success: boolean; error?: string }> {
    // gPhoto2 tethering is macOS-only (Phase 1).
    // On Windows, return failure immediately so the caller falls back to Watch Folder mode.
    if (process.platform === 'win32') {
      return { success: false, error: 'gPhoto2 tethering is not supported on Windows. Use Watch Folder mode.' }
    }

    try {
      fs.mkdirSync(outputDir, { recursive: true })

      // Stop previous session if any
      await this.stopTethering()

      // Start chokidar BEFORE spawning gphoto2 so no file is missed during startup
      console.log('[CameraManager] starting chokidar watch on:', outputDir)
      this.watcher = chokidar.watch(outputDir, {
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
      })

      this.watcher.on('ready', () => console.log('[chokidar] ready, watching:', outputDir))
      this.watcher.on('error', (err) => console.error('[chokidar] error:', err))
      this.watcher.on('add', (filePath: string) => {
        console.log('[chokidar] add detected:', filePath)
        const ext = nodePath.extname(filePath).toLowerCase()
        console.log('[chokidar] ext:', ext)
        if (['.jpg', '.jpeg', '.cr2', '.cr3', '.nef', '.arw'].includes(ext)) {
          console.log('[chokidar] emitting photo-received')
          this.emit('photo-received', { tempPath: filePath, filename: nodePath.basename(filePath) })
        }
      })

      // macOS keeps relaunching PTPCamera the instant the camera is enumerated,
      // so kill it immediately before each spawn and retry a few times.
      const isMac = process.platform === 'darwin'
      const MAX_ATTEMPTS = isMac ? 3 : 1
      let result: { success: boolean; error?: string } = { success: false }
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        if (isMac) {
          await this.killMacOSCameraServices()
          // Let the USB device re-enumerate after the kill before claiming it,
          // otherwise the claim races the reset → "-53 / No such file or directory".
          await new Promise(resolve => setTimeout(resolve, attempt === 1 ? 1200 : 1800))
        }
        result = await this.spawnGphoto2(outputDir)
        if (result.success) break
        // A non-busy error (e.g. gphoto2 missing) won't be fixed by retrying
        if (!this.isDeviceBusyError(result.error)) break
        console.log(`[gphoto2] attempt ${attempt}/${MAX_ATTEMPTS} failed (device busy) — retrying`)
      }

      if (!result.success) {
        // Close watcher if gphoto2 ultimately failed
        await this.watcher.close()
        this.watcher = null
        const friendly = this.isDeviceBusyError(result.error)
          ? 'Camera is busy — macOS or another app is holding it. Quit Capture One / EOS Utility / Image Capture / Photos (or unplug and replug the camera), then press Start capture again.'
          : (result.error ?? 'gPhoto2 failed to start')
        this.emit('tethering-error', friendly)
        return { success: false, error: friendly }
      }

      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  }

  /**
   * Returns true if gphoto2 tethering (or at least the chokidar watcher) is currently active.
   * Used by CapturePage to skip the full init sequence when switching between recipes.
   */
  isTethering(): boolean {
    return this.gphotoProcess !== null || this.watcher !== null
  }

  /**
   * Stops gphoto2 process and chokidar watcher.
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

  /**
   * Watch Folder mode — used when gphoto2 tethering is unavailable (e.g. macOS Sequoia).
   * The user points their tethering software (Capture One, EOS Utility) to save photos here.
   * Every new image file emits the same 'photo-received' event as gphoto2 tethering.
   */
  startFolderWatch(watchPath: string): { success: boolean; error?: string } {
    try {
      if (this.folderWatcher) {
        this.folderWatcher.close()
        this.folderWatcher = null
      }

      if (!fs.existsSync(watchPath)) {
        return { success: false, error: `Folder not found: ${watchPath}` }
      }

      this.folderWatcher = chokidar.watch(watchPath, {
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 800, pollInterval: 100 },
        depth: 0,   // only watch the top-level folder, not subdirectories
      })

      this.folderWatcher.on('add', (filePath: string) => {
        const ext = nodePath.extname(filePath).toLowerCase()
        if (['.jpg', '.jpeg', '.cr2', '.cr3', '.nef', '.arw', '.tif', '.tiff'].includes(ext)) {
          this.emit('photo-received', { tempPath: filePath, filename: nodePath.basename(filePath) })
        }
      })

      console.log('[CameraManager] Folder watch started:', watchPath)
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  }

  async stopFolderWatch(): Promise<void> {
    if (this.folderWatcher) {
      await this.folderWatcher.close()
      this.folderWatcher = null
      console.log('[CameraManager] Folder watch stopped')
    }
  }
}

export const cameraManager = new CameraManager()
