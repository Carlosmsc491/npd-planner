// React hook that turns a (debounced) map viewport into either cluster
// bubbles or real store markers, per task D's zoom thresholds. The 400ms
// pan/zoom debounce lives in FieldCheckMap (it owns the Leaflet moveend/
// zoomend events) — this hook just reacts to whatever viewport it's given,
// discarding results from any in-flight fetch that a newer viewport has
// already superseded.
import { useEffect, useRef, useState } from 'react'
import type { FieldPlace, FieldPlaceCluster } from '../types'
import {
  createClusterCache,
  createPlacesCache,
  fetchClusters,
  fetchRealPlaces,
  zoomBucket,
} from './mapPlacesQuery'
import type { LatLngBounds } from './mapGeo'

export interface MapViewport {
  bounds: LatLngBounds
  zoom: number
}

export type MapDataPoint = { kind: 'cluster'; cluster: FieldPlaceCluster } | { kind: 'place'; place: FieldPlace }

export interface MapViewportData {
  points: MapDataPoint[]
  loading: boolean
  isClusterView: boolean
}

export function useMapViewportData(viewport: MapViewport | null): MapViewportData {
  const clusterCache = useRef(createClusterCache())
  const placesCache = useRef(createPlacesCache())
  const requestSeq = useRef(0)

  const [points, setPoints] = useState<MapDataPoint[]>([])
  const [loading, setLoading] = useState(false)
  const isClusterView = viewport ? zoomBucket(viewport.zoom).kind === 'cluster' : false

  useEffect(() => {
    if (!viewport) return
    const seq = ++requestSeq.current
    const bucket = zoomBucket(viewport.zoom)
    setLoading(true)

    const run = async () => {
      try {
        if (bucket.kind === 'cluster') {
          const clusters = await fetchClusters(bucket.level, viewport.bounds, clusterCache.current)
          if (seq !== requestSeq.current) return
          setPoints(clusters.map((cluster) => ({ kind: 'cluster', cluster })))
        } else {
          const places = await fetchRealPlaces(viewport.bounds, placesCache.current)
          if (seq !== requestSeq.current) return
          setPoints(places.map((place) => ({ kind: 'place', place })))
        }
      } catch {
        if (seq === requestSeq.current) setPoints([])
      } finally {
        if (seq === requestSeq.current) setLoading(false)
      }
    }

    void run()
  }, [viewport])

  return { points, loading, isClusterView }
}
