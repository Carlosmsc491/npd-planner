import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { FieldPlace } from '../types'
import type { SimpleCoords } from '../lib/geolocation'
import { useMapViewportData } from '../lib/useMapViewportData'
import type { LatLngBounds } from '../lib/mapGeo'

// Fallback center when there's no GPS fix and no recently-viewed store —
// geographic center of the contiguous US (task C).
const US_CENTER: SimpleCoords = { lat: 39.8283, lon: -98.5795 }
const DEFAULT_ZOOM = 4
const LOCATED_ZOOM = 14
const FLY_TO_ZOOM = 15
const MOVE_DEBOUNCE_MS = 400

const BRAND_GREEN = '#1D9E75'
const HIGHLIGHT_AMBER = '#F59E0B'

function placeDivIcon(highlighted: boolean): L.DivIcon {
  const color = highlighted ? HIGHLIGHT_AMBER : BRAND_GREEN
  return L.divIcon({
    className: '',
    html: `<svg width="34" height="42" viewBox="0 0 32 40" xmlns="http://www.w3.org/2000/svg">
      <path d="M16 0C7.163 0 0 7.163 0 16c0 11 16 24 16 24s16-13 16-24c0-8.837-7.163-16-16-16z" fill="${color}" stroke="#ffffff" stroke-width="2"/>
      <circle cx="16" cy="15" r="6" fill="#ffffff"/>
    </svg>`,
    iconSize: [34, 42],
    iconAnchor: [17, 42],
    popupAnchor: [0, -38],
  })
}

function clusterDivIcon(count: number): L.DivIcon {
  const size = Math.min(64, 36 + Math.round(Math.log10(count + 1) * 14))
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;background:${BRAND_GREEN};border:3px solid #ffffff;border-radius:9999px;display:flex;align-items:center;justify-content:center;color:#ffffff;font-weight:700;font-size:${size >= 50 ? 15 : 13}px;box-shadow:0 2px 6px rgba(0,0,0,0.35);font-family:sans-serif;">${count}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

/**
 * fieldPlaces.lat/lon comes from ZIP-centroid geocoding (see the FieldPlace
 * type comment), not the real storefront — so several stores in the same ZIP
 * often share the EXACT coordinate (six Doral stores sit on one point).
 * Leaflet then stacks their markers on identical pixels, and a tap resolves
 * to whichever one happens to be on top of the DOM stack rather than the one
 * visually under the finger — reported live: tapping a pin near Doral
 * opened a store that was actually in Pompano Beach, because both shared a
 * ZIP-centroid point. This spreads exact/near-exact duplicates into a small,
 * id-ordered ring around their shared point so every marker is independently
 * clickable. Real lat/lon (used for the list below the map and for
 * distances) is untouched — only where a marker is DRAWN moves.
 */
function jitterOverlappingCoords(places: FieldPlace[]): Map<string, SimpleCoords> {
  const groups = new Map<string, FieldPlace[]>()
  for (const p of places) {
    if (p.lat == null || p.lon == null) continue
    // 4 decimals ≈ 11m at the equator — tight enough to catch true
    // ZIP-centroid duplicates without merging genuinely distinct next-door stores.
    const key = `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`
    const group = groups.get(key)
    if (group) group.push(p)
    else groups.set(key, [p])
  }

  const result = new Map<string, SimpleCoords>()
  for (const group of groups.values()) {
    if (group.length === 1) {
      const p = group[0]
      result.set(p.id, { lat: p.lat as number, lon: p.lon as number })
      continue
    }
    // Sorted by id, not array order, so the same store always lands in the
    // same ring position on re-render — a jitter that moves on every
    // refresh would be more confusing than the overlap it fixes.
    const sorted = [...group].sort((a, b) => a.id.localeCompare(b.id))
    const RING_DEG = 0.00025 // ≈ 25-28m — visually distinct at street zoom, negligible at any other
    sorted.forEach((p, i) => {
      const angle = (2 * Math.PI * i) / sorted.length
      result.set(p.id, {
        lat: (p.lat as number) + RING_DEG * Math.cos(angle),
        lon: (p.lon as number) + RING_DEG * Math.sin(angle),
      })
    })
  }
  return result
}

function userDivIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="width:16px;height:16px;border-radius:9999px;background:#3B82F6;border:3px solid #ffffff;box-shadow:0 0 0 5px rgba(59,130,246,0.3), 0 1px 4px rgba(0,0,0,0.4);"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  })
}

function buildPopupContent(place: FieldPlace, onStartVisit: () => void): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'text-sm min-w-[170px]'

  const title = document.createElement('p')
  title.className = 'font-semibold text-gray-900 mb-0.5'
  title.textContent = place.name ?? 'Unnamed store'
  wrap.appendChild(title)

  const locationLine = [place.address, place.city, place.state].filter(Boolean).join(', ')
  if (locationLine) {
    const addr = document.createElement('p')
    addr.className = 'text-xs text-gray-500 mb-2'
    addr.textContent = locationLine
    wrap.appendChild(addr)
  }

  const btn = document.createElement('button')
  btn.type = 'button'
  btn.textContent = 'Start visit'
  btn.className = 'w-full rounded-lg bg-green-500 text-white text-xs font-semibold py-2.5 active:scale-95 transition'
  btn.addEventListener('click', onStartVisit)
  wrap.appendChild(btn)

  return wrap
}

export interface FieldCheckMapHandle {
  /** Flies the map to a store and opens its popup — called when a list row is tapped (task E). */
  flyToPlace: (place: FieldPlace) => void
}

interface FieldCheckMapProps {
  userLocation: SimpleCoords | null
  /** Last store the user looked at, used to center the map when there's no GPS fix (task C). */
  fallbackCenter: SimpleCoords | null
  selectedPlaceId: string | null
  /** Pin tapped — parent highlights + scrolls to the matching list row. */
  onSelectPlace: (place: FieldPlace) => void
  /** "Start visit" tapped inside a popup. */
  onStartVisit: (place: FieldPlace) => void
  /** Fires after every (debounced) viewport fetch with the real stores currently on screen and the map's center — drives the synced, distance-sorted list (task E). Empty array while zoomed out to cluster view. */
  onVisibleChange: (places: FieldPlace[], mapCenter: SimpleCoords, isClusterView: boolean) => void
}

const FieldCheckMap = forwardRef<FieldCheckMapHandle, FieldCheckMapProps>(function FieldCheckMap(
  { userLocation, fallbackCenter, selectedPlaceId, onSelectPlace, onStartVisit, onVisibleChange },
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const placeMarkersRef = useRef<Map<string, L.Marker>>(new Map())
  const clusterMarkersRef = useRef<L.Marker[]>([])
  const userMarkerRef = useRef<L.Marker | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoCenteredOnUser = useRef(false)
  const userDraggedMap = useRef(false)

  const [viewport, setViewport] = useState<{ bounds: LatLngBounds; zoom: number } | null>(null)
  const { points, isClusterView } = useMapViewportData(viewport)
  // A store the caller flyTo'd to (task E, e.g. a search result) that wasn't
  // in the currently-loaded marker set yet — opened as soon as its marker
  // shows up from the next viewport fetch instead of being silently dropped.
  const pendingPopupPlaceId = useRef<string | null>(null)

  const onSelectPlaceRef = useRef(onSelectPlace)
  const onStartVisitRef = useRef(onStartVisit)
  const onVisibleChangeRef = useRef(onVisibleChange)
  onSelectPlaceRef.current = onSelectPlace
  onStartVisitRef.current = onStartVisit
  onVisibleChangeRef.current = onVisibleChange

  // Init the Leaflet map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const initialCenter = userLocation ?? fallbackCenter ?? US_CENTER
    const initialZoom = userLocation || fallbackCenter ? LOCATED_ZOOM : DEFAULT_ZOOM

    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView([initialCenter.lat, initialCenter.lon], initialZoom)

    // CARTO's basemap CDN, not tile.openstreetmap.org directly — the raw OSM
    // tile server rejects app/production traffic per its usage policy
    // (https://operations.osmfoundation.org/policies/tiles/); once
    // carlosmsc491.github.io started sending real requests it came back
    // `x-blocked: Access denied` on every tile, which is why the map was a
    // blank gray rectangle (Leaflet itself was fine — nothing to do with the
    // "location denied" the map was blamed for). CARTO's tiles are the same
    // OSM data, free, no signup/API key, and explicitly allow this kind of
    // embedding — still OSM's own data, so OSM attribution stays required
    // alongside CARTO's.
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    }).addTo(map)

    mapRef.current = map

    const scheduleViewportUpdate = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      // Task D — debounce every moveend/zoomend by 400ms so a dragging thumb
      // doesn't fire dozens of Firestore queries.
      debounceRef.current = setTimeout(() => {
        const b = map.getBounds()
        setViewport({
          bounds: { north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() },
          zoom: map.getZoom(),
        })
      }, MOVE_DEBOUNCE_MS)
    }

    map.on('moveend', scheduleViewportUpdate)
    map.on('zoomend', scheduleViewportUpdate)
    map.on('dragstart', () => { userDraggedMap.current = true })
    // Reported live: panning from one area to another left the "Stores on
    // map" list showing the PREVIOUS viewport's stores for the ~400ms+fetch
    // gap before scheduleViewportUpdate's debounce resolves — e.g. flying
    // from a Pompano Beach store to Doral, a Pompano row was still visible
    // in the list while the map itself already showed Doral. movestart
    // fires the instant ANY pan/zoom begins (drag or programmatic flyTo), so
    // clearing the list right there means it's briefly empty ("No stores in
    // view") instead of briefly WRONG — never shows a real store name at
    // the wrong location, even mid-transition.
    map.on('movestart', () => {
      const center = map.getCenter()
      onVisibleChangeRef.current([], { lat: center.lat, lon: center.lng }, false)
    })
    scheduleViewportUpdate()

    // Leaflet measures the container once, when the map is created, and then
    // trusts that number forever. On a phone the container is still 0px tall
    // at that moment — the flex layout and the bottom sheet settle a frame
    // later — so the map decides it is 0x0 and never draws a single tile,
    // even though the div itself clearly occupies the screen. That is the
    // blank map. Watching the container and re-measuring covers every case
    // that produces it: first paint, rotating the phone, the sheet being
    // dragged, and the desktop switching tabs.
    const observer = new ResizeObserver(() => map.invalidateSize())
    observer.observe(containerRef.current)

    return () => {
      observer.disconnect()
      if (debounceRef.current) clearTimeout(debounceRef.current)
      map.remove()
      mapRef.current = null
    }
    // Intentionally mount-only — initial center/zoom is read once here;
    // later GPS updates are handled by the effect below instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Recenter once the user's GPS fix arrives, if they haven't started
  // panning the map themselves yet.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !userLocation || autoCenteredOnUser.current || userDraggedMap.current) return
    autoCenteredOnUser.current = true
    map.flyTo([userLocation.lat, userLocation.lon], LOCATED_ZOOM, { duration: 0.8 })
  }, [userLocation])

  // User-location marker (blue dot, distinct from store pins — task F).
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (userMarkerRef.current) {
      userMarkerRef.current.remove()
      userMarkerRef.current = null
    }
    if (userLocation) {
      userMarkerRef.current = L.marker([userLocation.lat, userLocation.lon], {
        icon: userDivIcon(),
        zIndexOffset: 1000,
        interactive: false,
        keyboard: false,
      }).addTo(map)
    }
  }, [userLocation])

  // Render markers for whatever the viewport hook currently has loaded —
  // cluster bubbles at low zoom, real store pins at zoom >= 12 (task D).
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    clusterMarkersRef.current.forEach((m) => m.remove())
    clusterMarkersRef.current = []
    placeMarkersRef.current.forEach((m) => m.remove())
    placeMarkersRef.current.clear()

    const realPlaces: FieldPlace[] = []
    const jitteredCoords = jitterOverlappingCoords(
      points.filter((pt) => pt.kind === 'place').map((pt) => pt.place)
    )

    points.forEach((point) => {
      if (point.kind === 'cluster') {
        const c = point.cluster
        const marker = L.marker([c.lat, c.lon], { icon: clusterDivIcon(c.count) })
        marker.on('click', () => {
          map.setView([c.lat, c.lon], Math.min(map.getZoom() + 2, 18))
        })
        marker.addTo(map)
        clusterMarkersRef.current.push(marker)
      } else {
        const p = point.place
        if (p.lat == null || p.lon == null) return
        realPlaces.push(p)
        const markerPos = jitteredCoords.get(p.id) ?? { lat: p.lat, lon: p.lon }
        const marker = L.marker([markerPos.lat, markerPos.lon], { icon: placeDivIcon(p.id === selectedPlaceId) })
        marker.bindPopup(buildPopupContent(p, () => onStartVisitRef.current(p)))
        marker.on('click', () => onSelectPlaceRef.current(p))
        marker.addTo(map)
        placeMarkersRef.current.set(p.id, marker)
      }
    })

    const pendingId = pendingPopupPlaceId.current
    if (pendingId) {
      const pendingMarker = placeMarkersRef.current.get(pendingId)
      if (pendingMarker) {
        pendingMarker.openPopup()
        pendingPopupPlaceId.current = null
      }
    }

    const center = map.getCenter()
    onVisibleChange(realPlaces, { lat: center.lat, lon: center.lng }, isClusterView)
    // onVisibleChange intentionally excluded — parent doesn't need to
    // re-trigger this effect when its own callback identity changes, only
    // when the underlying map data does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, selectedPlaceId, isClusterView])

  // Re-style the selected marker without waiting for the next data fetch.
  useEffect(() => {
    placeMarkersRef.current.forEach((marker, id) => {
      marker.setIcon(placeDivIcon(id === selectedPlaceId))
    })
  }, [selectedPlaceId])

  const flyToPlace = useCallback((place: FieldPlace) => {
    const map = mapRef.current
    if (!map || place.lat == null || place.lon == null) return
    pendingPopupPlaceId.current = place.id
    map.flyTo([place.lat, place.lon], Math.max(map.getZoom(), FLY_TO_ZOOM), { duration: 0.6 })
    map.once('moveend', () => {
      const marker = placeMarkersRef.current.get(place.id)
      if (marker) {
        marker.openPopup()
        pendingPopupPlaceId.current = null
      }
      // else: not loaded yet (e.g. a search result outside the previous
      // viewport) — the marker-render effect above will open it once the
      // debounced viewport fetch this flyTo triggers comes back.
    })
  }, [])

  useImperativeHandle(ref, () => ({ flyToPlace }), [flyToPlace])

  const recenterOnUser = useCallback(() => {
    const map = mapRef.current
    if (!map || !userLocation) return
    // The initial auto-center only fires once (autoCenteredOnUser) and stops
    // forever the moment the user pans — this button is the manual escape
    // hatch back to "where am I" after that, so it doesn't re-trigger any
    // further auto-following, just this one fly.
    map.flyTo([userLocation.lat, userLocation.lon], LOCATED_ZOOM, { duration: 0.6 })
  }, [userLocation])

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="absolute inset-0" />
      {userLocation && (
        <button
          type="button"
          onClick={recenterOnUser}
          aria-label="Center on my location"
          className="absolute bottom-4 right-3 z-[1000] flex h-11 w-11 items-center justify-center rounded-full bg-white text-blue-500 shadow-lg border border-gray-200 active:scale-95 transition-transform"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
          </svg>
        </button>
      )}
    </div>
  )
})

export default FieldCheckMap
