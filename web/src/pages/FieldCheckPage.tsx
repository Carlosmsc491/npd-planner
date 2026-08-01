import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, endAt, getDocs, limit, orderBy, query, startAt, where } from 'firebase/firestore'
import { db } from '../firebase'
import type { FieldPlace } from '../types'
import { geohashCellAndNeighbors, geohashPrefixRange } from '../lib/geohash'
import { haversineMiles } from '../lib/haversine'
import { getCurrentPosition, type SimpleCoords } from '../lib/geolocation'
import { queuedVisitCount } from '../lib/fieldCheckDb'
import { retryQueuedVisits } from '../lib/fieldCheckSync'

// Quota guards (task A / gospotcheck README §7.8) — never scan the whole
// 36k-doc fieldPlaces collection. Each geohash cell is capped, and the
// merged/sorted result list shown to the user is capped again.
const QUERY_LIMIT_PER_CELL = 200
const NEARBY_RESULT_LIMIT = 30
const SEARCH_LIMIT = 25

type GeoStatus = 'locating' | 'granted' | 'denied' | 'unsupported'

interface NearbyResult {
  place: FieldPlace
  distanceMiles: number
}

export default function FieldCheckPage() {
  const navigate = useNavigate()

  const [geoStatus, setGeoStatus] = useState<GeoStatus>('locating')
  const [nearby, setNearby] = useState<NearbyResult[]>([])
  const [loadingNearby, setLoadingNearby] = useState(false)
  const [nearbyError, setNearbyError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<FieldPlace[]>([])
  const [searching, setSearching] = useState(false)
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [queuedCount, setQueuedCount] = useState(0)

  // GPS on mount. Fallback path (search by name/city) is always available
  // regardless of outcome — task A: "Fallback si el usuario niega GPS".
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setGeoStatus('unsupported')
      return
    }
    setGeoStatus('locating')
    getCurrentPosition()
      .then((pos) => {
        setGeoStatus('granted')
        void fetchNearby(pos)
      })
      .catch(() => setGeoStatus('denied'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    refreshQueuedCount()
    retryQueuedVisits()
      .then(refreshQueuedCount)
      .catch(() => {})
  }, [])

  function refreshQueuedCount() {
    queuedVisitCount().then(setQueuedCount).catch(() => {})
  }

  async function fetchNearby(pos: SimpleCoords) {
    setLoadingNearby(true)
    setNearbyError(null)
    try {
      const cells = geohashCellAndNeighbors(pos.lat, pos.lon) // self + 8 neighbors, precision 5
      const found = new Map<string, FieldPlace>()

      for (const cell of cells) {
        const { start, end } = geohashPrefixRange(cell)
        const q = query(
          collection(db, 'fieldPlaces'),
          where('geohash', '>=', start),
          where('geohash', '<', end),
          limit(QUERY_LIMIT_PER_CELL)
        )
        const snap = await getDocs(q)
        snap.docs.forEach((d) => {
          if (!found.has(d.id)) found.set(d.id, { id: d.id, ...d.data() } as FieldPlace)
        })
      }

      const ranked = [...found.values()]
        .filter((p) => p.active && p.lat != null && p.lon != null)
        .map((p) => ({ place: p, distanceMiles: haversineMiles(pos.lat, pos.lon, p.lat as number, p.lon as number) }))
        .sort((a, b) => a.distanceMiles - b.distanceMiles)
        .slice(0, NEARBY_RESULT_LIMIT)

      setNearby(ranked)
    } catch {
      setNearbyError('Could not load nearby stores. Check your connection.')
    } finally {
      setLoadingNearby(false)
    }
  }

  function onSearchChange(value: string) {
    setSearch(value)
    if (searchDebounce.current) clearTimeout(searchDebounce.current)
    searchDebounce.current = setTimeout(() => runSearch(value), 400)
  }

  async function runSearch(raw: string) {
    const q = raw.trim()
    if (q.length < 2) {
      setSearchResults([])
      return
    }
    setSearching(true)
    try {
      // Firestore has no full-text/contains search — this is a case-sensitive
      // "starts with" prefix match on name and city (single-field orderBy,
      // no composite index needed). Good enough as a GPS-denied fallback;
      // not a substitute for real search.
      const nameQ = query(collection(db, 'fieldPlaces'), orderBy('name'), startAt(q), endAt(`${q}`), limit(SEARCH_LIMIT))
      const cityQ = query(collection(db, 'fieldPlaces'), orderBy('city'), startAt(q), endAt(`${q}`), limit(SEARCH_LIMIT))
      const [nameSnap, citySnap] = await Promise.all([getDocs(nameQ), getDocs(cityQ)])
      const merged = new Map<string, FieldPlace>()
      ;[...nameSnap.docs, ...citySnap.docs].forEach((d) => {
        if (!merged.has(d.id)) merged.set(d.id, { id: d.id, ...d.data() } as FieldPlace)
      })
      setSearchResults([...merged.values()].filter((p) => p.active).slice(0, SEARCH_LIMIT))
    } finally {
      setSearching(false)
    }
  }

  function openPlace(place: FieldPlace, distanceMiles?: number) {
    navigate(`/field-check/${place.id}`, { state: { place, distanceMiles } })
  }

  const showSearchFallback = geoStatus === 'denied' || geoStatus === 'unsupported' || (geoStatus === 'granted' && !loadingNearby && nearby.length === 0)

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 safe-top">
        <header className="px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate('/boards')} className="text-gray-400 hover:text-gray-600 p-1">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h1 className="font-bold text-gray-900 flex-1">Field Check</h1>
        </header>

        {queuedCount > 0 && (
          <div className="mx-4 mb-3 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 flex items-center justify-between gap-2">
            <p className="text-xs text-amber-800">
              {queuedCount} visit{queuedCount !== 1 ? 's' : ''} queued — will send automatically when you&apos;re back online.
            </p>
            <button
              onClick={() => retryQueuedVisits().then(refreshQueuedCount)}
              className="text-xs font-semibold text-amber-800 underline shrink-0"
            >
              Retry now
            </button>
          </div>
        )}
      </div>

      <main className="flex-1 overflow-y-auto px-4 py-4 max-w-2xl mx-auto w-full space-y-5">
        {/* Nearby (GPS) */}
        {geoStatus === 'locating' && (
          <div className="flex items-center justify-center gap-2 py-10 text-gray-400 text-sm">
            <div className="h-4 w-4 rounded-full border-2 border-green-500 border-t-transparent animate-spin" />
            Getting your location…
          </div>
        )}

        {geoStatus === 'granted' && (
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide px-1 mb-2">Nearby stores</h2>
            {loadingNearby ? (
              <div className="flex items-center justify-center gap-2 py-8 text-gray-400 text-sm">
                <div className="h-4 w-4 rounded-full border-2 border-green-500 border-t-transparent animate-spin" />
                Searching nearby stores…
              </div>
            ) : nearbyError ? (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{nearbyError}</p>
            ) : nearby.length === 0 ? (
              <p className="text-sm text-gray-400 px-1">No stores found nearby. Try search below.</p>
            ) : (
              <div className="space-y-2">
                {nearby.map(({ place, distanceMiles }) => (
                  <PlaceCard key={place.id} place={place} distanceMiles={distanceMiles} onClick={() => openPlace(place, distanceMiles)} />
                ))}
              </div>
            )}
          </div>
        )}

        {geoStatus === 'denied' && (
          <p className="text-sm text-gray-500 bg-white border border-gray-100 rounded-xl px-3 py-2.5">
            Location access was denied. Search for your store by name or city below.
          </p>
        )}
        {geoStatus === 'unsupported' && (
          <p className="text-sm text-gray-500 bg-white border border-gray-100 rounded-xl px-3 py-2.5">
            Location isn&apos;t available on this device. Search for your store by name or city below.
          </p>
        )}

        {/* Search fallback — always available, primary path when GPS is denied/unavailable */}
        {showSearchFallback && (
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide px-1 mb-2">Search stores</h2>
            <div className="relative mb-2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" strokeLinecap="round" />
              </svg>
              <input
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Store name or city…"
                className="w-full rounded-xl border border-gray-300 bg-white pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30"
              />
            </div>
            {searching && <p className="text-xs text-gray-400 px-1">Searching…</p>}
            {!searching && search.trim().length >= 2 && searchResults.length === 0 && (
              <p className="text-xs text-gray-400 px-1">No stores match &quot;{search.trim()}&quot;.</p>
            )}
            <div className="space-y-2">
              {searchResults.map((place) => (
                <PlaceCard key={place.id} place={place} onClick={() => openPlace(place)} />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function PlaceCard({ place, distanceMiles, onClick }: { place: FieldPlace; distanceMiles?: number; onClick: () => void }) {
  const locationLine = useMemo(
    () => [place.city, place.state].filter(Boolean).join(', '),
    [place.city, place.state]
  )

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 hover:border-gray-300 hover:shadow active:scale-[0.99] transition"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{place.name ?? 'Unnamed store'}</p>
          {place.chain && <p className="text-xs text-gray-400 mt-0.5">{place.chain}</p>}
          {locationLine && <p className="text-xs text-gray-400">{locationLine}</p>}
        </div>
        {distanceMiles != null && (
          <span className="text-xs font-semibold text-green-600 shrink-0">{distanceMiles.toFixed(1)} mi</span>
        )}
      </div>
    </button>
  )
}
