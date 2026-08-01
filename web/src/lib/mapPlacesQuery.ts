// Viewport-scoped Firestore reads for the Field Check map (task D). Mirrors
// the quota-guard philosophy of FieldCheckPage's GPS-based fetchNearby: never
// scan the whole fieldPlaces collection, cap every query hard, and cache
// cells already fetched so dragging the map around doesn't re-query the same
// ground twice.
import { collection, getDocs, limit, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import type { FieldPlace, FieldPlaceCluster } from '../types'
import { geohashPrefixRange, NEARBY_GEOHASH_PRECISION } from './geohash'
import { geohashCellsForBounds, type LatLngBounds } from './mapGeo'

export type ClusterLevel = 'g2' | 'g3' | 'g4'

const CLUSTER_PRECISION: Record<ClusterLevel, number> = { g2: 2, g3: 3, g4: 4 }

// Real-place viewport query — hard caps per task D ("limit(200) DURO").
const REAL_PLACES_QUERY_LIMIT_PER_CELL = 200
const REAL_PLACES_RESULT_LIMIT = 200

// Defensive cap on how many grid cells one fetch can enumerate — keeps a
// single pan/zoom from firing dozens of Firestore queries even if the
// viewport ends up larger than expected for the chosen precision.
const MAX_CELLS_PER_FETCH = 60

export type ZoomBucket = { kind: 'cluster'; level: ClusterLevel } | { kind: 'places' }

/** Which data source (and geohash precision) a given Leaflet zoom level should load — task D thresholds. */
export function zoomBucket(zoom: number): ZoomBucket {
  if (zoom < 8) return { kind: 'cluster', level: 'g2' }
  if (zoom < 10) return { kind: 'cluster', level: 'g3' }
  if (zoom < 12) return { kind: 'cluster', level: 'g4' }
  return { kind: 'places' }
}

export type ClusterCache = Map<string, FieldPlaceCluster[]>
export type PlacesCache = Map<string, FieldPlace[]>

export function createClusterCache(): ClusterCache {
  return new Map()
}

export function createPlacesCache(): PlacesCache {
  return new Map()
}

/** Precomputed cluster bubbles for the visible cells at this level — one query per cell, cached. */
export async function fetchClusters(level: ClusterLevel, bounds: LatLngBounds, cache: ClusterCache): Promise<FieldPlaceCluster[]> {
  const precision = CLUSTER_PRECISION[level]
  const cells = geohashCellsForBounds(bounds, precision, MAX_CELLS_PER_FETCH)
  const results: FieldPlaceCluster[] = []

  await Promise.all(
    cells.map(async (cell) => {
      const cacheKey = `${level}:${cell}`
      const cached = cache.get(cacheKey)
      if (cached) {
        results.push(...cached)
        return
      }
      const { start, end } = geohashPrefixRange(cell)
      const q = query(
        collection(db, 'fieldPlaceClusters'),
        where('level', '==', level),
        where('key', '>=', start),
        where('key', '<=', end)
      )
      const snap = await getDocs(q)
      const found = snap.docs.map((d) => d.data() as FieldPlaceCluster)
      cache.set(cacheKey, found)
      results.push(...found)
    })
  )

  return results
}

/** Real fieldPlaces docs for the visible cells at full zoom — one query per cell, cached, hard-capped. */
export async function fetchRealPlaces(bounds: LatLngBounds, cache: PlacesCache): Promise<FieldPlace[]> {
  const cells = geohashCellsForBounds(bounds, NEARBY_GEOHASH_PRECISION, MAX_CELLS_PER_FETCH)
  const found = new Map<string, FieldPlace>()

  await Promise.all(
    cells.map(async (cell) => {
      const cacheKey = `places:${cell}`
      let places = cache.get(cacheKey)
      if (!places) {
        const { start, end } = geohashPrefixRange(cell)
        const q = query(
          collection(db, 'fieldPlaces'),
          where('geohash', '>=', start),
          where('geohash', '<', end),
          limit(REAL_PLACES_QUERY_LIMIT_PER_CELL)
        )
        const snap = await getDocs(q)
        places = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as FieldPlace)
          .filter((p) => p.active && p.lat != null && p.lon != null)
        cache.set(cacheKey, places)
      }
      places.forEach((p) => {
        if (!found.has(p.id)) found.set(p.id, p)
      })
    })
  )

  return [...found.values()].slice(0, REAL_PLACES_RESULT_LIMIT)
}
