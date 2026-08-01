// Standard geohash (base32, interleaved lat/lon bits) — ported 1:1 from
// gospotcheck/scripts/build_import.py's geohash_encode() so the prefixes we
// compute here in the browser line up exactly with the `geohash` field
// already stored (precision 9) on every fieldPlaces doc. Firestore has no
// native geospatial query, so "nearby stores" works by range-querying this
// string field over the user's cell + its 8 neighbors (see
// geohashCellAndNeighbors) and finishing the ranking with real haversine
// distance client-side (lib/haversine.ts).

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz'

/** Encode a lat/lon into a base32 geohash string of the given precision (default 9, matching fieldPlaces docs). */
export function geohashEncode(latitude: number, longitude: number, precision = 9): string {
  let latMin = -90
  let latMax = 90
  let lonMin = -180
  let lonMax = 180
  const out: string[] = []
  let bit = 0
  let ch = 0
  let even = true // geohash always starts by splitting longitude

  while (out.length < precision) {
    if (even) {
      const mid = (lonMin + lonMax) / 2
      if (longitude > mid) {
        ch |= 1 << (4 - bit)
        lonMin = mid
      } else {
        lonMax = mid
      }
    } else {
      const mid = (latMin + latMax) / 2
      if (latitude > mid) {
        ch |= 1 << (4 - bit)
        latMin = mid
      } else {
        latMax = mid
      }
    }
    even = !even
    if (bit < 4) {
      bit += 1
    } else {
      out.push(BASE32[ch])
      bit = 0
      ch = 0
    }
  }
  return out.join('')
}

/** Decode a geohash back to its bounding box — used only to find neighbor cells below. */
function geohashBounds(hash: string): { latMin: number; latMax: number; lonMin: number; lonMax: number } {
  let latMin = -90
  let latMax = 90
  let lonMin = -180
  let lonMax = 180
  let even = true

  for (const c of hash) {
    const idx = BASE32.indexOf(c)
    if (idx === -1) continue
    for (let n = 4; n >= 0; n--) {
      const bitN = (idx >> n) & 1
      if (even) {
        const mid = (lonMin + lonMax) / 2
        if (bitN === 1) lonMin = mid
        else lonMax = mid
      } else {
        const mid = (latMin + latMax) / 2
        if (bitN === 1) latMin = mid
        else latMax = mid
      }
      even = !even
    }
  }
  return { latMin, latMax, lonMin, lonMax }
}

/**
 * The 8 neighboring cells of a geohash, at the same precision. Implemented by
 * decoding the cell's bounding box and re-encoding the 8 offset centers,
 * rather than the classic bit-twiddling neighbor table — simpler to verify
 * correct and reuses geohashEncode directly. Good enough at the precisions
 * we use for store search (continental US, never near a pole or the
 * antimeridian in practice).
 */
export function geohashNeighbors(hash: string): string[] {
  const precision = hash.length
  const { latMin, latMax, lonMin, lonMax } = geohashBounds(hash)
  const latCenter = (latMin + latMax) / 2
  const lonCenter = (lonMin + lonMax) / 2
  const latStep = latMax - latMin
  const lonStep = lonMax - lonMin

  const offsets: Array<[number, number]> = [
    [1, -1], [1, 0], [1, 1],
    [0, -1],         [0, 1],
    [-1, -1], [-1, 0], [-1, 1],
  ]

  const seen = new Set<string>()
  for (const [dLat, dLon] of offsets) {
    let nLat = latCenter + dLat * latStep
    let nLon = lonCenter + dLon * lonStep
    nLat = Math.max(-90, Math.min(90, nLat))
    if (nLon > 180) nLon -= 360
    if (nLon < -180) nLon += 360
    seen.add(geohashEncode(nLat, nLon, precision))
  }
  return [...seen]
}

// Cell size at precision 5 is roughly 4.9km x 4.9km — the user's cell plus its
// 8 neighbors covers a ~15km / ~9mi square, a reasonable "nearby stores" radius
// given fieldPlaces lat/lon is already only ZIP-centroid accurate (see FieldPlace
// type comment) — going finer would just fragment a single ZIP's stores across
// query cells without buying real precision.
export const NEARBY_GEOHASH_PRECISION = 5

/** The 9 geohash cells (self + 8 neighbors) to range-query for "stores near this point". */
export function geohashCellAndNeighbors(latitude: number, longitude: number, precision = NEARBY_GEOHASH_PRECISION): string[] {
  const center = geohashEncode(latitude, longitude, precision)
  return [center, ...geohashNeighbors(center)]
}

/** Firestore range bounds for a geohash prefix — '~' sorts after every base32 character. */
export function geohashPrefixRange(prefix: string): { start: string; end: string } {
  return { start: prefix, end: `${prefix}~` }
}
