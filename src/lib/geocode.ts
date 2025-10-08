import type { ReverseGeocodeResult } from '../types'

const cache = new Map<string, ReverseGeocodeResult>()
const SESSION_KEY = 'walktrace:reverse-geocode-cache'
const sessionAvailable = typeof window !== 'undefined' && !!window.sessionStorage
let lastNominatimRequestAt = 0

if (sessionAvailable) {
  const sessionCacheRaw = window.sessionStorage.getItem(SESSION_KEY)
  if (sessionCacheRaw) {
    try {
      const parsed = JSON.parse(sessionCacheRaw) as Record<string, ReverseGeocodeResult>
      Object.entries(parsed).forEach(([key, value]) => cache.set(key, value))
    } catch (error) {
      console.warn('ジオコーディングキャッシュ読込失敗', error)
    }
  }
}

function persistSession(): void {
  if (!sessionAvailable) {
    return
  }
  const payload: Record<string, ReverseGeocodeResult> = {}
  cache.forEach((value, key) => {
    payload[key] = value
  })
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload))
}

function buildKey(lat: number, lng: number): string {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`
}

async function fetchOpenCage(lat: number, lng: number, key: string): Promise<ReverseGeocodeResult | null> {
  const params = new URLSearchParams({
    q: `${lat}+${lng}`,
    key,
    language: 'ja',
    no_record: '1',
  })
  const response = await fetch(`https://api.opencagedata.com/geocode/v1/json?${params.toString()}`)
  if (!response.ok) {
    return null
  }
  const body = (await response.json()) as {
    results?: Array<{ formatted?: string }>
  }
  const formatted = body.results?.[0]?.formatted
  if (!formatted) {
    return null
  }
  return { address: formatted, source: 'opencage' }
}

async function fetchNominatim(lat: number, lng: number): Promise<ReverseGeocodeResult | null> {
  const now = Date.now()
  const diff = now - lastNominatimRequestAt
  if (diff < 1100) {
    await new Promise((resolve) => setTimeout(resolve, 1100 - diff))
  }
  lastNominatimRequestAt = Date.now()
  const url = new URL('https://nominatim.openstreetmap.org/reverse')
  url.searchParams.set('lat', String(lat))
  url.searchParams.set('lon', String(lng))
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('accept-language', 'ja')
  url.searchParams.set('email', 'walktrace-noreply@example.com')
  const response = await fetch(url.toString(), {
    headers: {
      'Accept-Language': 'ja',
    },
  })
  if (!response.ok) {
    return null
  }
  const body = (await response.json()) as { display_name?: string }
  const formatted = body.display_name
  if (!formatted) {
    return null
  }
  return { address: formatted, source: 'nominatim' }
}

function fallbackAddress(lat: number, lng: number): ReverseGeocodeResult {
  return {
    address: `緯度${lat.toFixed(5)} 経度${lng.toFixed(5)}`,
    source: 'mock',
  }
}

export async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult> {
  const key = buildKey(lat, lng)
  const cached = cache.get(key)
  if (cached) {
    return cached
  }
  const openCageKey = import.meta.env.VITE_OPENCAGE_API_KEY
  let result: ReverseGeocodeResult | null = null
  if (openCageKey) {
    try {
      result = await fetchOpenCage(lat, lng, openCageKey)
    } catch (error) {
      console.warn('OpenCage失敗', error)
    }
  }
  if (!result) {
    try {
      result = await fetchNominatim(lat, lng)
    } catch (error) {
      console.warn('Nominatim失敗', error)
    }
  }
  if (!result) {
    result = fallbackAddress(lat, lng)
  }
  cache.set(key, result)
  persistSession()
  return result
}

export function clearGeocodeCache(): void {
  cache.clear()
  if (sessionAvailable) {
    window.sessionStorage.removeItem(SESSION_KEY)
  }
}
