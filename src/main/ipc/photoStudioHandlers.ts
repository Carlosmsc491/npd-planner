// src/main/ipc/photoStudioHandlers.ts
// Standalone Photo Studio — session management IPC (Mac-only, no recipe dependency)

import { ipcMain, dialog, shell } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import type { StudioSession, StudioPhoto } from '../../shared/photoStudio'

export type { StudioSession, StudioPhoto }

const SESSION_META_FILE = '_session.json'
const PHOTO_STATE_FILE  = '_states.json'
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.bmp', '.webp'])

// ── helpers ──────────────────────────────────────────────────────────────────

function readJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T
  } catch {
    return fallback
  }
}

function writeJson(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

function listSessionPhotos(sessionDir: string): StudioPhoto[] {
  const stateMap = readJson<Record<string, Partial<StudioPhoto>>>(
    path.join(sessionDir, PHOTO_STATE_FILE), {}
  )
  const files = fs.readdirSync(sessionDir)
    .filter(f => {
      const ext = path.extname(f).toLowerCase()
      return IMAGE_EXTS.has(ext) && !f.startsWith('_')
    })
    .sort()

  return files.map(f => {
    const absPath = path.join(sessionDir, f)
    const ext = path.extname(f).toLowerCase()
    const id = path.basename(f, ext)
    const stat = fs.statSync(absPath)
    const saved = stateMap[id] ?? {}
    return {
      id,
      filename: f,
      absPath,
      ext,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      state: (saved.state as StudioPhoto['state']) ?? 'captured',
      cleanedPath: saved.cleanedPath ?? null,
      jpgPath: saved.jpgPath ?? null,
    }
  })
}

// ── registration ─────────────────────────────────────────────────────────────

export function registerPhotoStudioHandlers(): void {
  if (process.platform !== 'darwin') return

  // List all sessions in a catalog dir
  ipcMain.handle('photostudio:list-sessions', async (_event, catalogDir: string) => {
    try {
      if (!fs.existsSync(catalogDir)) return { ok: true, sessions: [] }
      const entries = fs.readdirSync(catalogDir, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .sort((a, b) => {
          // Newest first — sort by mtime of _session.json
          const ma = fs.statSync(path.join(catalogDir, a.name, SESSION_META_FILE)).mtimeMs
          const mb = fs.statSync(path.join(catalogDir, b.name, SESSION_META_FILE)).mtimeMs
          return mb - ma
        })

      const sessions: StudioSession[] = []
      for (const entry of entries) {
        const sessionDir = path.join(catalogDir, entry.name)
        const metaPath = path.join(sessionDir, SESSION_META_FILE)
        if (!fs.existsSync(metaPath)) continue
        const meta = readJson<{ id: string; name: string; createdAt: string }>(metaPath, {
          id: entry.name, name: entry.name, createdAt: new Date().toISOString(),
        })
        const photos = fs.readdirSync(sessionDir)
          .filter(f => IMAGE_EXTS.has(path.extname(f).toLowerCase()) && !f.startsWith('_'))
        const coverFile = photos[0] ? path.join(sessionDir, photos[0]) : null
        sessions.push({
          id: meta.id,
          name: meta.name,
          createdAt: meta.createdAt,
          photoCount: photos.length,
          coverThumb: coverFile,
        })
      }
      return { ok: true, sessions }
    } catch (err) {
      return { ok: false, sessions: [], error: String(err) }
    }
  })

  // Create a new session folder
  ipcMain.handle('photostudio:create-session', async (_event, args: { catalogDir: string; name: string }) => {
    try {
      const id = `${Date.now()}-${args.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}`
      const sessionDir = path.join(args.catalogDir, id)
      fs.mkdirSync(sessionDir, { recursive: true })
      const meta = { id, name: args.name, createdAt: new Date().toISOString() }
      writeJson(path.join(sessionDir, SESSION_META_FILE), meta)
      return { ok: true, id, sessionDir }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  // Delete session folder
  ipcMain.handle('photostudio:delete-session', async (_event, sessionDir: string) => {
    try {
      // Safety: must be a folder with _session.json
      if (!fs.existsSync(path.join(sessionDir, SESSION_META_FILE))) {
        return { ok: false, error: 'Not a valid session folder' }
      }
      fs.rmSync(sessionDir, { recursive: true, force: true })
      return { ok: true }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  // List photos in a session
  ipcMain.handle('photostudio:list-photos', async (_event, sessionDir: string) => {
    try {
      const photos = listSessionPhotos(sessionDir)
      return { ok: true, photos }
    } catch (err) {
      return { ok: false, photos: [], error: String(err) }
    }
  })

  // Import photos (copy) into a session
  ipcMain.handle('photostudio:import-photos', async (_event, args: { sessionDir: string; srcPaths: string[] }) => {
    const errors: string[] = []
    for (const src of args.srcPaths) {
      try {
        const dest = path.join(args.sessionDir, path.basename(src))
        if (!fs.existsSync(dest)) {
          fs.copyFileSync(src, dest)
        }
      } catch (err) {
        errors.push(`${path.basename(src)}: ${String(err)}`)
      }
    }
    return { ok: errors.length === 0, errors }
  })

  // Open file-picker to import photos
  ipcMain.handle('photostudio:select-import', async (_event, sessionDir: string) => {
    const result = await dialog.showOpenDialog({
      title: 'Import Photos',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'tif', 'tiff', 'bmp', 'webp'] }],
    })
    if (result.canceled || !result.filePaths.length) return { ok: false, imported: 0, errors: [] }
    const errors: string[] = []
    let imported = 0
    for (const src of result.filePaths) {
      try {
        const dest = path.join(sessionDir, path.basename(src))
        if (!fs.existsSync(dest)) {
          fs.copyFileSync(src, dest)
        }
        imported++
      } catch (err) {
        errors.push(`${path.basename(src)}: ${String(err)}`)
      }
    }
    return { ok: errors.length === 0, imported, errors }
  })

  // Update photo state (selected/cleaned/ready + paths)
  ipcMain.handle('photostudio:update-photo-state', async (_event, args: {
    sessionDir: string
    photoId: string
    state: StudioPhoto['state']
    cleanedPath?: string | null
    jpgPath?: string | null
  }) => {
    try {
      const stateFile = path.join(args.sessionDir, PHOTO_STATE_FILE)
      const stateMap = readJson<Record<string, Partial<StudioPhoto>>>(stateFile, {})
      stateMap[args.photoId] = {
        ...stateMap[args.photoId],
        state: args.state,
        ...(args.cleanedPath !== undefined ? { cleanedPath: args.cleanedPath } : {}),
        ...(args.jpgPath !== undefined ? { jpgPath: args.jpgPath } : {}),
      }
      writeJson(stateFile, stateMap)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  // Remove a photo from a session (moves to trash)
  ipcMain.handle('photostudio:remove-photo', async (_event, args: { sessionDir: string; photoId: string; filename: string }) => {
    try {
      const absPath = path.join(args.sessionDir, args.filename)
      await shell.trashItem(absPath)
      // Remove from state map too
      const stateFile = path.join(args.sessionDir, PHOTO_STATE_FILE)
      const stateMap = readJson<Record<string, Partial<StudioPhoto>>>(stateFile, {})
      delete stateMap[args.photoId]
      writeJson(stateFile, stateMap)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  // Open catalog picker dialog
  ipcMain.handle('photostudio:pick-catalog', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select Photo Studio catalog folder',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || !result.filePaths.length) return null
    return result.filePaths[0]
  })

  // Open session folder in Finder
  ipcMain.handle('photostudio:open-in-finder', async (_event, dir: string) => {
    shell.openPath(dir)
  })

  // Rename a session
  ipcMain.handle('photostudio:rename-session', async (_event, args: { sessionDir: string; newName: string }) => {
    try {
      const metaPath = path.join(args.sessionDir, SESSION_META_FILE)
      const meta = readJson<{ id: string; name: string; createdAt: string }>(metaPath, {
        id: path.basename(args.sessionDir), name: path.basename(args.sessionDir), createdAt: new Date().toISOString(),
      })
      meta.name = args.newName
      writeJson(metaPath, meta)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })
}
