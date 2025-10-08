const EARTH_RADIUS_M = 6371000

interface LatLng {
  lat: number
  lng: number
}

export function toDayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function haversineDistanceMeters(a: LatLng, b: LatLng): number {
  const toRad = (value: number) => (value * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const sinLat = Math.sin(dLat / 2)
  const sinLng = Math.sin(dLng / 2)
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

export function formatDistance(distanceMeters: number): string {
  if (!Number.isFinite(distanceMeters)) {
    return '測定不可'
  }
  if (distanceMeters < 1000) {
    return `約${Math.round(distanceMeters)}m`
  }
  return `約${(distanceMeters / 1000).toFixed(1)}km`
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(date)
}

export function shouldStorePoint(options: {
  previous?: LatLng & { timestamp?: number }
  next: LatLng & { timestamp: number }
  minDistanceMeters: number
  minIntervalMs: number
}): boolean {
  const { previous, next, minDistanceMeters, minIntervalMs } = options
  if (!previous) {
    return true
  }
  const distance = haversineDistanceMeters(previous, next)
  if (distance >= minDistanceMeters) {
    return true
  }
  const timeDiff = Math.abs(next.timestamp - (previous.timestamp ?? 0))
  return timeDiff >= minIntervalMs
}
