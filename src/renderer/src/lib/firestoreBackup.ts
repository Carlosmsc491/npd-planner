// src/renderer/src/lib/firestoreBackup.ts
// Weekly JSON export of Firestore business data to the SharePoint folder.
//
// Why: SharePoint files get OneDrive versioning for free, but the tasks/boards
// data lives ONLY in Firestore free tier — no managed backups, no
// point-in-time recovery. A deleted board or a bad bulk edit was unrecoverable.
//
// How: once a week, admins/owners export the core collections as one JSON file
// to {sharePointRoot}/_backups/ (OneDrive syncs + versions it). The newest 8
// backups are kept. Reads happen at most once a week per admin — negligible
// quota. Restore is manual by design: the file documents its own shape.

import { collection, getDocs } from 'firebase/firestore'
import { db } from './firebase'

const BACKUP_COLLECTIONS = [
  'boards', 'tasks', 'clients', 'divisions', 'labels', 'dateTypes', 'users',
] as const

const LS_KEY = 'npd:last_firestore_backup'
const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const KEEP_BACKUPS = 8

export async function runWeeklyFirestoreBackup(sharePointPath: string): Promise<void> {
  try {
    if (!window.electronAPI || !sharePointPath) return
    const last = Number(localStorage.getItem(LS_KEY) ?? 0)
    if (Date.now() - last < WEEK_MS) return

    const dump: Record<string, unknown[]> = {}
    for (const name of BACKUP_COLLECTIONS) {
      const snap = await getDocs(collection(db, name))
      // Firestore Timestamps serialize as {seconds, nanoseconds} — fine for a
      // restore tool, and human-readable enough for manual recovery
      dump[name] = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      appVersion: (import.meta.env.VITE_APP_VERSION as string | undefined) ?? '',
      note: 'NPD Planner weekly Firestore backup. Timestamps are {seconds, nanoseconds}.',
      collections: dump,
    }

    const root = sharePointPath.replace(/\\/g, '/').replace(/\/$/, '')
    const dir = `${root}/_backups`
    const dest = `${dir}/npd-backup-${new Date().toISOString().slice(0, 10)}.json`

    const res = await window.electronAPI.recipeWriteIndex(dest, JSON.stringify(payload, null, 1))
    if (!res.success) {
      console.warn('[Backup] write failed (will retry next launch):', res.error)
      return
    }
    // Mark success only AFTER the file landed — a failed week retries next launch
    localStorage.setItem(LS_KEY, String(Date.now()))
    console.info(`[Backup] Firestore backup written: ${dest}`)

    // Keep the newest N backups (date-stamped names sort lexicographically)
    const entries = await window.electronAPI.recipeListFolder(dir)
    const backups = entries
      .filter(e => !e.isDirectory && e.name.startsWith('npd-backup-') && e.name.endsWith('.json'))
      .sort((a, b) => b.name.localeCompare(a.name))
    for (const old of backups.slice(KEEP_BACKUPS)) {
      await window.electronAPI.recipeDeleteItem(old.fullPath)
    }
  } catch (err) {
    console.warn('[Backup] failed (non-fatal, will retry next launch):', err)
  }
}
