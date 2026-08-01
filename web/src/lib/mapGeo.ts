// Grid-covering helper for the Field Check map (task D — viewport-based
// loading). geohash.ts owns encode + neighbor-of-a-point; this file is the
// complementary "which geohash cells intersect this rectangle" query needed
// to fetch fieldPlaceClusters / fieldPlaces for whatever the user is
// currently looking at, instead of a single point + its 8 neighbors.
//
// Standard geohash bit allocation: 5 bits per base32 character, alternating
// longitude/latitude starting with longitude. For precision p there are 5p
// total bits, split ceil(5p/2) to longitude and floor(5p/2) to latitude.
import { geohashEncode } from './geohash'

export interface LatLngBounds {
  north: number
  south: number
  east: number
  west: number
}

function lonBitsFor(precision: number): number {
  return Math.ceil((5 * precision) / 2)
}

function latBitsFor(precision: number): number {
  return Math.floor((5 * precision) / 2)
}

/** Approximate cell width/height in degrees for a geohash of the given precision. */
export function geohashCellSizeDegrees(precision: number): { latDeg: number; lonDeg: number } {
  return {
    lonDeg: 360 / 2 ** lonBitsFor(precision),
    latDeg: 180 / 2 ** latBitsFor(precision),
  }
}

function clampLat(lat: number): number {
  return Math.max(-90, Math.min(90, lat))
}

function normalizeLon(lon: number): number {
  let n = lon
  while (n > 180) n -= 360
  while (n < -180) n += 360
  return n
}

/**
 * Every geohash cell (at the given precision) whose bounding box intersects
 * `bounds`, found by stepping a grid across the rectangle. Capped at
 * `maxCells` as a circuit breaker — a single pan/zoom should never be able to
 * fire more Firestore queries than that, even if the viewport turns out to be
 * larger than expected for the chosen precision.
 *
 * Doesn't handle wraparound across the antimeridian or the poles — same
 * assumption geohash.ts already makes (continental US usage only).
 */
export function geohashCellsForBounds(bounds: LatLngBounds, precision: number, maxCells: number): string[] {
  const { latDeg, lonDeg } = geohashCellSizeDegrees(precision)
  const cells = new Set<string>()

  const south = clampLat(Math.min(bounds.south, bounds.north))
  const north = clampLat(Math.max(bounds.south, bounds.north))
  const west = bounds.west
  const east = bounds.east > bounds.west ? bounds.east : bounds.east + 360

  for (let lat = south; lat <= north + latDeg / 2; lat += latDeg) {
    for (let lon = west; lon <= east + lonDeg / 2; lon += lonDeg) {
      cells.add(geohashEncode(clampLat(lat), normalizeLon(lon), precision))
      if (cells.size >= maxCells) return [...cells]
    }
  }

  return [...cells]
}
