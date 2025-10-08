import maplibregl, { type LngLatLike, type Map } from 'maplibre-gl'
import type { RoutePoint } from '../types'

export const ROUTE_SOURCE_ID = 'walktrace-route'
export const ROUTE_LAYER_ID = 'walktrace-route-layer'

export function getMapStyleUrl(): string {
  const key = import.meta.env.VITE_MAPTILER_API_KEY
  if (key) {
    return `https://api.maptiler.com/maps/streets/style.json?key=${key}`
  }
  return 'https://demotiles.maplibre.org/style.json'
}

export function createBaseMap(container: HTMLDivElement, center: LngLatLike): Map {
  const map = new maplibregl.Map({
    container,
    style: getMapStyleUrl(),
    center,
    zoom: 15,
    attributionControl: false,
  })

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
  return map
}

export function ensureRouteLayer(map: Map): void {
  if (!map.isStyleLoaded()) {
    map.once('styledata', () => ensureRouteLayer(map))
    return
  }
  if (map.getSource(ROUTE_SOURCE_ID)) {
    return
  }
  map.addSource(ROUTE_SOURCE_ID, {
    type: 'geojson',
    data: {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [] },
      properties: {},
    },
  })
  map.addLayer({
    id: ROUTE_LAYER_ID,
    type: 'line',
    source: ROUTE_SOURCE_ID,
    paint: {
      'line-color': '#0ea5e9',
      'line-width': 4,
      'line-opacity': 0.85,
    },
  })
}

export function updateRouteGeometry(map: Map, points: RoutePoint[]): void {
  const apply = () => {
    const source = map.getSource(ROUTE_SOURCE_ID) as maplibregl.GeoJSONSource | undefined
    if (!source) {
      return
    }
    const segments: number[][][] = []
    let current: number[][] = []

    points.forEach((point) => {
      if (point.gapBefore && current.length) {
        segments.push(current)
        current = []
      }
      current.push([point.lng, point.lat])
    })

    if (current.length) {
      segments.push(current)
    }

    let geometry
    if (segments.length === 0) {
      geometry = {
        type: 'Feature' as const,
        geometry: {
          type: 'LineString' as const,
          coordinates: [],
        },
        properties: {},
      }
    } else if (segments.length === 1) {
      geometry = {
        type: 'Feature' as const,
        geometry: {
          type: 'LineString' as const,
          coordinates: segments[0],
        },
        properties: {},
      }
    } else {
      geometry = {
        type: 'Feature' as const,
        geometry: {
          type: 'MultiLineString' as const,
          coordinates: segments,
        },
        properties: {},
      }
    }

    source.setData(geometry)
  }

  if (!map.isStyleLoaded()) {
    map.once('styledata', apply)
    return
  }

  if (!map.getSource(ROUTE_SOURCE_ID)) {
    ensureRouteLayer(map)
  }

  apply()
}
