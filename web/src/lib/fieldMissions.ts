// Loads mission definitions (fieldMissions/*) from Firestore — task A: no
// more hardcoded FIELD_CHECK_SECTIONS, a merchandiser now picks from
// whichever missions are active (Sales Team, Competitive Intelligence
// Analysis, UPC Check, and whatever gets added later).
//
// This is reference data: admin-managed, rarely edited, and a merchandiser
// with no signal still has to be able to open a mission form (task A). So a
// fetch is cached in memory for the session and mirrored to localStorage;
// on failure (or on a fresh app open while offline) the last-synced copy is
// used instead of blocking the flow.

import { collection, getDocs, orderBy, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import type { FieldMission } from '../types'

const CACHE_KEY = 'fieldcheck:missions:v1'

let memoryCache: FieldMission[] | null = null
let inFlight: Promise<FieldMission[]> | null = null

function readCache(): FieldMission[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as FieldMission[]) : null
  } catch {
    return null
  }
}

function writeCache(missions: FieldMission[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(missions))
  } catch {
    // best-effort only — losing the cache just means offline start-up falls
    // back to whatever's already in memory (or fails, same as before caching existed)
  }
}

async function fetchFromFirestore(): Promise<FieldMission[]> {
  const q = query(collection(db, 'fieldMissions'), where('active', '==', true), orderBy('order'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as FieldMission)
}

/**
 * Active missions, ordered by `order`. Memoized for the session — callers
 * (mission list page, visit form deep-link resolution) can call this freely
 * without re-hitting Firestore.
 */
export async function loadFieldMissions(): Promise<FieldMission[]> {
  if (memoryCache) return memoryCache
  if (inFlight) return inFlight

  inFlight = fetchFromFirestore()
    .then((missions) => {
      memoryCache = missions
      writeCache(missions)
      return missions
    })
    .catch((err) => {
      const cached = readCache()
      if (cached) {
        memoryCache = cached
        return cached
      }
      throw err
    })
    .finally(() => {
      inFlight = null
    })

  return inFlight
}

export function getFieldMissionById(missions: FieldMission[], missionId: string): FieldMission | null {
  return missions.find((m) => m.id === missionId) ?? null
}
