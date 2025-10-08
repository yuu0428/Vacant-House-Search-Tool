export interface PlacePhoto {
  id: string
  createdAtISO: string
  blob?: Blob
  thumbDataURL?: string
}

export interface Place {
  id: string
  lat: number
  lng: number
  address: string
  createdAtISO: string
  note?: string
  photos: PlacePhoto[]
}

export interface RoutePoint {
  lat: number
  lng: number
  tISO: string
  gapBefore?: boolean
}

export interface RouteBucket {
  id: string
  date: string
  points: RoutePoint[]
}

export type AccuracyMode = 'high' | 'balanced'

export interface SettingsState {
  accuracyMode: AccuracyMode
  distanceThresholdMeters: number
  timeThresholdSeconds: number
  includeOriginalOnExport: boolean
  includeThumbnailsOnExport: boolean
  firebaseSyncEnabled: boolean
}

export interface CurrentPosition {
  lat: number
  lng: number
  accuracy?: number
  heading?: number
  timestamp: number
}

export interface ReverseGeocodeResult {
  address: string
  source: 'opencage' | 'nominatim' | 'mock'
}

export interface ExportPayload {
  places: Place[]
  routes: RouteBucket[]
  exportedAtISO: string
  schemaVersion: number
}

export interface FirebaseEnv {
  apiKey: string
  authDomain: string
  projectId: string
  storageBucket: string
  messagingSenderId: string
  appId: string
}
