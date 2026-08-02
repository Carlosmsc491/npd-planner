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
  onSelectPlaceRef.current = onSelectPlace
  onStartVisitRef.current = onStartVisit

  // Init the Leaflet map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const initialCenter = userLocation ?? fallbackCenter ?? US_CENTER
    const initialZoom = userLocation || fallbackCenter ? LOCATED_ZOOM : DEFAULT_ZOOM

    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView([initialCenter.lat, initialCenter.lon], initialZoom)

    // OSM attribution is required by license (task C) — tileLayer's
    // `attribution` option wires it into Leaflet's attribution control.
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
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
        const marker = L.marker([p.lat, p.lon], { icon: placeDivIcon(p.id === selectedPlaceId) })
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

  return <div ref={containerRef} className="absolute inset-0" />
})

export default FieldCheckMap
