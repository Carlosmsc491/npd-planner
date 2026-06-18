// src/main/ipc/photoStudioHandlers.ts
// Standalone Photo Studio — session management IPC (Mac-only, no recipe dependency)
//
// Two storage layouts:
//   • 'flat'   (legacy) — originals in the session root, state in _states.json,
//                cleaned/ready as derivatives in _cleaned/ _ready/.
//   • 'stages' (new)    — each photo is COPIED into real capture/ selected/
//                cleaned/ ready/ folders as it advances. The filesystem itself
//                is the state, so nothing can desync and nothing is ever cut.

import { ipcMain, dialog, shell } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import type { StudioSession, StudioPhoto, StudioLayout, StudioStage } from '../../shared/photoStudio'

export type { StudioSession, StudioPhoto }

const SESSION_META_FILE = '_session.json'
const PHOTO_STATE_FILE  = '_states.json'
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.bmp', '.webp'])

const STAGE_DIRS = { captured: 'capture', selected: 'selected', cleaned: 'cleaned', ready: 'ready' } as const
const STAGE_RANK: Record<StudioStage, number> = { captured: 0, selected: 1, cleaned: 2, ready: 3 }

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

interface SessionMeta { id: string; name: string; createdAt: string; layout?: StudioLayout }

function readMeta(sessionDir: string): SessionMeta {
  return readJson<SessionMeta>(path.join(sessionDir, SESSION_META_FILE), {
    id: path.basename(sessionDir), name: path.basename(sessionDir), createdAt: new Date().toISOString(),
  })
}

function sessionLayout(sessionDir: string): StudioLayout {
  return readMeta(sessionDir).layout ?? 'flat'
}

/** Capture folder for a session (capture/ for stages, root for flat). */
function captureDir(sessionDir: string): string {
  return sessionLayout(sessionDir) === 'stages' ? path.join(sessionDir, STAGE_DIRS.captured) : sessionDir
}

/** First image file in `dir` whose stem matches `stem`, or null. */
function findByStem(dir: string, stem: string): string | null {
  try {
    for (const f of fs.readdirSync(dir)) {
      if (f.startsWith('_')) continue
      const ext = path.extname(f).toLowerCase()
      if (IMAGE_EXTS.has(ext) && path.basename(f, path.extname(f)) === stem) return path.join(dir, f)
    }
  } catch { /* dir missing */ }
  return null
}

function listImageFiles(dir: string): string[] {
  try {
    return fs.readdirSync(dir)
      .filter(f => IMAGE_EXTS.has(path.extname(f).toLowerCase()) && !f.startsWith('_'))
      .sort()
  } catch {
    return []
  }
}

// ── 'stages' layout: filesystem-derived photos ───────────────────────────────

function listStagePhotos(sessionDir: string): StudioPhoto[] {
  const capDir = path.join(sessionDir, STAGE_DIRS.captured)
  const selDir = path.join(sessionDir, STAGE_DIRS.selected)
  const cleDir = path.join(sessionDir, STAGE_DIRS.cleaned)
  const rdyDir = path.join(sessionDir, STAGE_DIRS.ready)

  return listImageFiles(capDir).map(f => {
    const ext = path.extname(f).toLowerCase()
    const id = path.basename(f, ext)
    const capturePath = path.join(capDir, f)
    const stat = fs.statSync(capturePath)

    const selectedPath = findByStem(selDir, id)
    const cleanedPath  = findByStem(cleDir, id)        // cut-outs are PNG
    const readyJpg     = path.join(rdyDir, `${id}.jpg`)
    const readyPng     = path.join(rdyDir, `${id}.png`)
    const jpgPath      = fs.existsSync(readyJpg) ? readyJpg : null
    const readyPngPath = fs.existsSync(readyPng) ? readyPng : null
    const isReady      = !!jpgPath || !!readyPngPath

    const state: StudioStage = isReady ? 'ready' : cleanedPath ? 'cleaned' : selectedPath ? 'selected' : 'captured'
    return {
      id, filename: f, absPath: capturePath, ext, size: stat.size, mtimeMs: stat.mtimeMs,
      state, cleanedPath, jpgPath, capturePath, selectedPath, readyPngPath,
      stages: { selected: !!selectedPath, cleaned: !!cleanedPath, ready: isReady },
    }
  })
}

// ── 'flat' layout: legacy state-map photos (with derived stage fields) ────────

function listFlatPhotos(sessionDir: string): StudioPhoto[] {
  const stateMap = readJson<Record<string, Partial<StudioPhoto>>>(
    path.join(sessionDir, PHOTO_STATE_FILE), {}
  )
  return listImageFiles(sessionDir).map(f => {
    const ext = path.extname(f).toLowerCase()
    const id = path.basename(f, ext)
    const absPath = path.join(sessionDir, f)
    const stat = fs.statSync(absPath)
    const saved = stateMap[id] ?? {}
    const state = (saved.state as StudioStage) ?? 'captured'
    const cleanedPath = saved.cleanedPath ?? null
    const jpgPath = saved.jpgPath ?? null
    const r = STAGE_RANK[state]
    return {
      id, filename: f, absPath, ext, size: stat.size, mtimeMs: stat.mtimeMs,
      state, cleanedPath, jpgPath,
      capturePath: absPath,
      selectedPath: r >= STAGE_RANK.selected ? absPath : null,
      readyPngPath: state === 'ready' ? cleanedPath : null,
      stages: {
        selected: r >= STAGE_RANK.selected,
        cleaned: r >= STAGE_RANK.cleaned || !!cleanedPath,
        ready: r >= STAGE_RANK.ready,
      },
    }
  })
}

function listSessionPhotos(sessionDir: string): StudioPhoto[] {
  return sessionLayout(sessionDir) === 'stages' ? listStagePhotos(sessionDir) : listFlatPhotos(sessionDir)
}

// ── registration ─────────────────────────────────────────────────────────────

export function registerPhotoStudioHandlers(): void {
  if (process.platform !== 'darwin') return

  // List all sessions in a catalog dir
  ipcMain.handle('photostudio:list-sessions', async (_event, catalogDir: string) => {
    try {
      if (!fs.existsSync(catalogDir)) return { ok: true, sessions: [] }

      // Filter first so sort never touches dirs without _session.json
      const entries = fs.readdirSync(catalogDir, { withFileTypes: true })
        .filter(e => e.isDirectory() && fs.existsSync(path.join(catalogDir, e.name, SESSION_META_FILE)))
        .sort((a, b) => {
          // Newest first by _session.json mtime
          try {
            const ma = fs.statSync(path.join(catalogDir, a.name, SESSION_META_FILE)).mtimeMs
            const mb = fs.statSync(path.join(catalogDir, b.name, SESSION_META_FILE)).mtimeMs
            return mb - ma
          } catch { return 0 }
        })

      const sessions: StudioSession[] = []
      for (const entry of entries) {
        const sessionDir = path.join(catalogDir, entry.name)
        const meta = readMeta(sessionDir)
        const layout = meta.layout ?? 'flat'
        const photos = listImageFiles(captureDir(sessionDir))
        const coverFile = photos[0] ? path.join(captureDir(sessionDir), photos[0]) : null
        sessions.push({
          id: meta.id,
          name: meta.name,
          createdAt: meta.createdAt,
          photoCount: photos.length,
          coverThumb: coverFile,
          layout,
        })
      }
      return { ok: true, sessions }
    } catch (err) {
      return { ok: false, sessions: [], error: String(err) }
    }
  })

  // Create a new session folder — folder name is just the timestamp, display
  // name lives in _session.json. New sessions use the 'stages' layout.
  ipcMain.handle('photostudio:create-session', async (_event, args: { catalogDir: string; name: string }) => {
    try {
      const id = Date.now().toString()
      const sessionDir = path.join(args.catalogDir, id)
      fs.mkdirSync(sessionDir, { recursive: true })
      for (const d of Object.values(STAGE_DIRS)) fs.mkdirSync(path.join(sessionDir, d), { recursive: true })
      const meta: SessionMeta = { id, name: args.name, createdAt: new Date().toISOString(), layout: 'stages' }
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

  // Import photos (copy) into a session — lands in capture/ for stages sessions
  ipcMain.handle('photostudio:import-photos', async (_event, args: { sessionDir: string; srcPaths: string[] }) => {
    const errors: string[] = []
    const destDir = captureDir(args.sessionDir)
    fs.mkdirSync(destDir, { recursive: true })
    for (const src of args.srcPaths) {
      try {
        const dest = path.join(destDir, path.basename(src))
        if (!fs.existsSync(dest)) fs.copyFileSync(src, dest)
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
    const destDir = captureDir(sessionDir)
    fs.mkdirSync(destDir, { recursive: true })
    for (const src of result.filePaths) {
      try {
        const dest = path.join(destDir, path.basename(src))
        if (!fs.existsSync(dest)) fs.copyFileSync(src, dest)
        imported++
      } catch (err) {
        errors.push(`${path.basename(src)}: ${String(err)}`)
      }
    }
    return { ok: errors.length === 0, imported, errors }
  })

  // Update photo state — only meaningful for 'flat' (legacy) sessions; in
  // 'stages' sessions the state is derived from folder membership, so this is
  // a harmless no-op there.
  ipcMain.handle('photostudio:update-photo-state', async (_event, args: {
    sessionDir: string
    photoId: string
    state: StudioPhoto['state']
    cleanedPath?: string | null
    jpgPath?: string | null
  }) => {
    try {
      if (sessionLayout(args.sessionDir) === 'stages') return { ok: true }
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

  // ── 'stages' transitions — copy never cut ──────────────────────────────────

  // Star → copy capture/{id} into selected/
  ipcMain.handle('photostudio:stage-select', async (_event, args: { sessionDir: string; photoId: string }) => {
    try {
      const src = findByStem(path.join(args.sessionDir, STAGE_DIRS.captured), args.photoId)
      if (!src) return { ok: false, error: 'capture original not found' }
      const selDir = path.join(args.sessionDir, STAGE_DIRS.selected)
      fs.mkdirSync(selDir, { recursive: true })
      const dest = path.join(selDir, path.basename(src))
      fs.copyFileSync(src, dest)
      return { ok: true, selectedPath: dest }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  // Unstar → remove this photo's selected/ AND cleaned/ copies (capture stays)
  ipcMain.handle('photostudio:stage-unselect', async (_event, args: { sessionDir: string; photoId: string }) => {
    try {
      for (const stage of [STAGE_DIRS.selected, STAGE_DIRS.cleaned] as const) {
        const hit = findByStem(path.join(args.sessionDir, stage), args.photoId)
        if (hit) await shell.trashItem(hit).catch(() => { try { fs.rmSync(hit, { force: true }) } catch { /* */ } })
      }
      return { ok: true }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  // Approve → copy cleaned/{id}.png into ready/ as PNG + flattened JPG
  ipcMain.handle('photostudio:stage-approve', async (_event, args: { sessionDir: string; photoId: string }) => {
    try {
      const cleanedPng = findByStem(path.join(args.sessionDir, STAGE_DIRS.cleaned), args.photoId)
      if (!cleanedPng) return { ok: false, error: 'cleaned PNG not found' }
      const rdyDir = path.join(args.sessionDir, STAGE_DIRS.ready)
      fs.mkdirSync(rdyDir, { recursive: true })
      const readyPng = path.join(rdyDir, `${args.photoId}.png`)
      const readyJpg = path.join(rdyDir, `${args.photoId}.jpg`)
      fs.copyFileSync(cleanedPng, readyPng)
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const sharp = require('sharp') as typeof import('sharp')
      await sharp(readyPng).flatten({ background: '#ffffff' }).jpeg({ quality: 92 }).toFile(readyJpg)
      return { ok: true, readyPngPath: readyPng, jpgPath: readyJpg }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  // Regenerate the ready JPG from the (possibly edited) ready PNG
  ipcMain.handle('photostudio:stage-refresh-jpg', async (_event, args: { sessionDir: string; photoId: string }) => {
    try {
      const rdyDir = path.join(args.sessionDir, STAGE_DIRS.ready)
      const readyPng = path.join(rdyDir, `${args.photoId}.png`)
      const readyJpg = path.join(rdyDir, `${args.photoId}.jpg`)
      if (!fs.existsSync(readyPng)) return { ok: false, error: 'ready PNG not found' }
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const sharp = require('sharp') as typeof import('sharp')
      await sharp(readyPng).flatten({ background: '#ffffff' }).jpeg({ quality: 92 }).toFile(readyJpg)
      return { ok: true, jpgPath: readyJpg }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  // Remove a photo from a session (moves to trash). For stages, trash every copy.
  ipcMain.handle('photostudio:remove-photo', async (_event, args: { sessionDir: string; photoId: string; filename: string }) => {
    try {
      if (sessionLayout(args.sessionDir) === 'stages') {
        for (const stage of Object.values(STAGE_DIRS)) {
          // ready has both .png and .jpg — trash all matches in each stage dir
          const dir = path.join(args.sessionDir, stage)
          try {
            for (const f of fs.readdirSync(dir)) {
              if (path.basename(f, path.extname(f)) === args.photoId) {
                await shell.trashItem(path.join(dir, f)).catch(() => {})
              }
            }
          } catch { /* stage dir missing */ }
        }
        return { ok: true }
      }
      // flat
      const absPath = path.join(args.sessionDir, args.filename)
      await shell.trashItem(absPath)
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
      const meta = readMeta(args.sessionDir)
      meta.name = args.newName
      writeJson(metaPath, meta)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })
}
