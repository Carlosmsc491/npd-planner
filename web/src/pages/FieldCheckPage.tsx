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
import FieldCheckMap, { type FieldCheckMapHandle } from '../components/FieldCheckMap'
import BottomSheet from '../components/BottomSheet'

// Quota guards (task A / gospotcheck README §7.8) — never scan the whole
// 36k-doc fieldPlaces collection. Each geohash cell is capped, and the
// merged/sorted result list shown to the user is capped again.
const QUERY_LIMIT_PER_CELL = 200
const NEARBY_RESULT_LIMIT = 30
const SEARCH_LIMIT = 25

// Last store the user looked at — seeds the map's initial center when GPS
// is denied/unavailable (task C).
const LAST_PLACE_KEY = 'fieldcheck:lastPlaceCoords'

function readLastPlaceCoords(): SimpleCoords | null {
  try {
    const raw = localStorage.getItem(LAST_PLACE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SimpleCoords>
    if (typeof parsed.lat === 'number' && typeof parsed.lon === 'number') return { lat: parsed.lat, lon: parsed.lon }
    return null
  } catch {
    return null
  }
}

function persistLastPlaceCoords(coords: SimpleCoords) {
  try {
    localStorage.setItem(LAST_PLACE_KEY, JSON.stringify(coords))
  } catch {
    // best-effort only — losing this just means the map falls back to the US center
  }
}

/** Tablet/desktop gets a permanent list+map split; a phone gets a List|Map toggle (task B). */
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia('(min-width: 768px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const listener = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    mq.addEventListener('change', listener)
    return () => mq.removeEventListener('change', listener)
  }, [])
  return isDesktop
}

type GeoStatus = 'locating' | 'granted' | 'denied' | 'unsupported'
type ViewMode = 'list' | 'map'

interface NearbyResult {
  place: FieldPlace
  distanceMiles: number
}

export default function FieldCheckPage() {
  const navigate = useNavigate()
  const isDesktop = useIsDesktop()

  const [geoStatus, setGeoStatus] = useState<GeoStatus>('locating')
  const [userLocation, setUserLocation] = useState<SimpleCoords | null>(null)
  const [nearby, setNearby] = useState<NearbyResult[]>([])
  const [loadingNearby, setLoadingNearby] = useState(false)
  const [nearbyError, setNearbyError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<FieldPlace[]>([])
  const [searching, setSearching] = useState(false)
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [queuedCount, setQueuedCount] = useState(0)

  // Map view state (tasks B–F).
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [lastPlaceCoords] = useState<SimpleCoords | null>(() => readLastPlaceCoords())
  const [mapVisiblePlaces, setMapVisiblePlaces] = useState<FieldPlace[]>([])
  const [mapCenter, setMapCenter] = useState<SimpleCoords | null>(null)
  const [mapIsClusterView, setMapIsClusterView] = useState(false)
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null)
  const mapHandleRef = useRef<FieldCheckMapHandle | null>(null)
  const rowRefs = useRef<Map<string, HTMLButtonElement>>(new Map())

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
        setUserLocation(pos)
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
      const nameQ = query(collection(db, 'fieldPlaces'), orderBy('name'), startAt(q), endAt(`${q}`), limit(SEARCH_LIMIT))
      const cityQ = query(collection(db, 'fieldPlaces'), orderBy('city'), startAt(q), endAt(`${q}`), limit(SEARCH_LIMIT))
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
    if (place.lat != null && place.lon != null) persistLastPlaceCoords({ lat: place.lat, lon: place.lon })
    navigate(`/field-check/${place.id}`, { state: { place, distanceMiles } })
  }

  // Map ↔ list sync (task E).
  function handleMapVisibleChange(places: FieldPlace[], center: SimpleCoords, isClusterView: boolean) {
    setMapVisiblePlaces(places)
    setMapCenter(center)
    setMapIsClusterView(isClusterView)
  }

  function handlePinSelected(place: FieldPlace) {
    setSelectedPlaceId(place.id)
    requestAnimationFrame(() => {
      rowRefs.current.get(place.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }

  function handleRowTapOnMap(place: FieldPlace) {
    setSelectedPlaceId(place.id)
    mapHandleRef.current?.flyToPlace(place)
  }

  function registerRowRef(id: string, el: HTMLButtonElement | null) {
    if (el) rowRefs.current.set(id, el)
    else rowRefs.current.delete(id)
  }

  const mapSyncedItems = useMemo(() => {
    const items = mapVisiblePlaces.map((place) => ({
      place,
      distanceMiles:
        mapCenter && place.lat != null && place.lon != null
          ? haversineMiles(mapCenter.lat, mapCenter.lon, place.lat, place.lon)
          : undefined,
    }))
    return items.sort((a, b) => (a.distanceMiles ?? Infinity) - (b.distanceMiles ?? Infinity))
  }, [mapVisiblePlaces, mapCenter])

  const showSearchFallback = geoStatus === 'denied' || geoStatus === 'unsupported' || (geoStatus === 'granted' && !loadingNearby && nearby.length === 0)

  const syncedListPanel = (
    <SyncedListPanel
      search={search}
      onSearchChange={onSearchChange}
      searching={searching}
      searchResults={searchResults}
      onRowTap={handleRowTapOnMap}
      items={mapSyncedItems}
      selectedPlaceId={selectedPlaceId}
      registerRowRef={registerRowRef}
      isClusterView={mapIsClusterView}
    />
  )

  const mapElement = (
    <FieldCheckMap
      ref={mapHandleRef}
      userLocation={userLocation}
      fallbackCenter={lastPlaceCoords}
      selectedPlaceId={selectedPlaceId}
      onSelectPlace={handlePinSelected}
      onStartVisit={openPlace}
      onVisibleChange={handleMapVisibleChange}
    />
  )

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

        {/* List | Map toggle — phone only; tablet/desktop always shows both side by side (task B). */}
        {!isDesktop && (
          <div className="px-4 pb-3">
            <div className="inline-flex rounded-xl bg-gray-100 p-1">
              <button
                onClick={() => setViewMode('list')}
                className={`rounded-lg px-5 py-2 text-sm font-semibold transition ${
                  viewMode === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                }`}
              >
                List
              </button>
              <button
                onClick={() => setViewMode('map')}
                className={`rounded-lg px-5 py-2 text-sm font-semibold transition ${
                  viewMode === 'map' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                }`}
              >
                Map
              </button>
            </div>
          </div>
        )}
      </div>

      {isDesktop ? (
        <div className="flex-1 flex overflow-hidden">
          <div className="w-[400px] shrink-0 overflow-y-auto border-r border-gray-200 bg-white px-4 py-4">
            {syncedListPanel}
          </div>
          <div className="relative flex-1">{mapElement}</div>
        </div>
      ) : viewMode === 'map' ? (
        <div className="relative flex-1 overflow-hidden">
          {mapElement}
          <BottomSheet>{syncedListPanel}</BottomSheet>
        </div>
      ) : (
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
      )}
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

/**
 * Store list synced to the map (task E) — shown in the desktop sidebar and
 * the phone's bottom sheet. Always ordered by distance from the map's
 * current center, and rows here never navigate directly: tapping one flies
 * the map to that store and opens its popup, which carries the actual
 * "Start visit" action.
 */
function SyncedListPanel({
  search,
  onSearchChange,
  searching,
  searchResults,
  onRowTap,
  items,
  selectedPlaceId,
  registerRowRef,
  isClusterView,
}: {
  search: string
  onSearchChange: (value: string) => void
  searching: boolean
  searchResults: FieldPlace[]
  onRowTap: (place: FieldPlace) => void
  items: { place: FieldPlace; distanceMiles?: number }[]
  selectedPlaceId: string | null
  registerRowRef: (id: string, el: HTMLButtonElement | null) => void
  isClusterView: boolean
}) {
  return (
    <div className="space-y-5">
      <div className="relative">
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
      {!searching && search.trim().length >= 2 && (
        <div>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 mb-2">Search results</h2>
          {searchResults.length === 0 ? (
            <p className="text-xs text-gray-400 px-1">No stores match &quot;{search.trim()}&quot;.</p>
          ) : (
            <div className="space-y-2">
              {searchResults.map((place) => (
                <SyncedPlaceRow
                  key={`search-${place.id}`}
                  place={place}
                  highlighted={place.id === selectedPlaceId}
                  onTap={() => onRowTap(place)}
                  registerRef={registerRowRef}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <div>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 mb-2">Stores on map</h2>
        {isClusterView ? (
          <p className="text-xs text-gray-400 px-1">Zoom in on the map to see individual stores.</p>
        ) : items.length === 0 ? (
          <p className="text-xs text-gray-400 px-1">No stores in view. Pan or zoom the map.</p>
        ) : (
          <div className="space-y-2">
            {items.map(({ place, distanceMiles }) => (
              <SyncedPlaceRow
                key={place.id}
                place={place}
                distanceMiles={distanceMiles}
                highlighted={place.id === selectedPlaceId}
                onTap={() => onRowTap(place)}
                registerRef={registerRowRef}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SyncedPlaceRow({
  place,
  distanceMiles,
  highlighted,
  onTap,
  registerRef,
}: {
  place: FieldPlace
  distanceMiles?: number
  highlighted: boolean
  onTap: () => void
  registerRef: (id: string, el: HTMLButtonElement | null) => void
}) {
  const locationLine = [place.city, place.state].filter(Boolean).join(', ')

  return (
    <button
      ref={(el) => registerRef(place.id, el)}
      onClick={onTap}
      className={`w-full text-left rounded-xl border px-4 py-3 shadow-sm transition active:scale-[0.99] ${
        highlighted ? 'border-amber-400 bg-amber-50' : 'border-gray-100 bg-white hover:border-gray-300 hover:shadow'
      }`}
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
