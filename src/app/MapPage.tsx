import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import maplibregl from 'maplibre-gl'
import { Fab } from '../components/Fab'
import { MapAttribution } from '../components/MapAttribution'
import { Modal } from '../components/Modal'
import { Spinner } from '../components/Spinner'
import { createBaseMap, ensureRouteLayer, updateRouteGeometry } from '../lib/maps'
import { createThumbnailDataUrl } from '../lib/image'
import { reverseGeocode } from '../lib/geocode'
import { formatDateTime, haversineDistanceMeters, shouldStorePoint, toDayKey } from '../lib/geo'
import { usePlacesStore } from '../stores/usePlacesStore'
import { useRouteStore } from '../stores/useRouteStore'
import { useSettingsStore } from '../stores/useSettingsStore'
import { useToastStore } from '../stores/useToastStore'
import { useTrackingStore } from '../stores/useTrackingStore'
import type { Place, RoutePoint } from '../types'

interface PendingLocation {
  lat: number
  lng: number
}

export function MapPage() {
  const addPlace = usePlacesStore((state) => state.addPlace)
  const places = usePlacesStore((state) => state.places)
  const buckets = useRouteStore((state) => state.buckets)
  const appendPoint = useRouteStore((state) => state.appendPoint)
  const { distanceThresholdMeters, timeThresholdSeconds, accuracyMode } = useSettingsStore()
  const { isTracking, currentPosition, heading } = useTrackingStore()
  const setTracking = useTrackingStore((state) => state.setTracking)
  const setCurrentPosition = useTrackingStore((state) => state.setCurrentPosition)
  const setHeading = useTrackingStore((state) => state.setHeading)
  const pushToast = useToastStore((state) => state.push)

  const mapRef = useRef<maplibregl.Map | null>(null)
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const markerRef = useRef<maplibregl.Marker | null>(null)
  const headingMarkerRef = useRef<maplibregl.Marker | null>(null)
  const watchIdRef = useRef<number | null>(null)
  const lastStoredRef = useRef<{ lat: number; lng: number; timestamp: number } | undefined>(undefined)
  const routePointsRef = useRef<RoutePoint[]>([])
  const followUserRef = useRef(true)
  const pendingGapRef = useRef(false)
  const defaultCenterRef = useRef<[number, number]>([138.568321, 35.667331])
  const [pendingLocation, setPendingLocation] = useState<PendingLocation | null>(null)
  const [pendingAddress, setPendingAddress] = useState<string>('')
  const [pendingSource, setPendingSource] = useState<string>('')
  const [pendingPhoto, setPendingPhoto] = useState<{ blob: Blob; thumb?: string } | null>(null)
  const [pendingNote, setPendingNote] = useState('')
  const [modalLoading, setModalLoading] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const todayKey = useMemo(() => toDayKey(new Date()), [])
  const todayPoints = useMemo(() => buckets[todayKey]?.points ?? [], [buckets, todayKey])

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return
    }
    const center: [number, number] = currentPosition
      ? [currentPosition.lng, currentPosition.lat]
      : defaultCenterRef.current
    const map = createBaseMap(mapContainerRef.current, center)
    mapRef.current = map

    const handleLoad = () => {
      ensureRouteLayer(map)
      updateRouteGeometry(map, routePointsRef.current)
    }
    const handleClick = (event: maplibregl.MapMouseEvent) => {
      openLocationModal({ lat: event.lngLat.lat, lng: event.lngLat.lng })
    }

    map.on('load', handleLoad)
    map.on('click', handleClick)
    const disableFollow = () => {
      followUserRef.current = false
    }
    map.on('dragstart', disableFollow)
    map.on('zoomstart', disableFollow)
    map.on('rotatestart', disableFollow)
    map.on('pitchstart', disableFollow)

    return () => {
      map.off('load', handleLoad)
      map.off('click', handleClick)
      map.off('dragstart', disableFollow)
      map.off('zoomstart', disableFollow)
      map.off('rotatestart', disableFollow)
      map.off('pitchstart', disableFollow)
      map.remove()
      mapRef.current = null
    }
  }, [currentPosition])

  useEffect(() => {
    routePointsRef.current = todayPoints
    const map = mapRef.current
    if (!map) {
      return
    }
    ensureRouteLayer(map)
    if (todayPoints.length === 0) {
      updateRouteGeometry(map, [])
      return
    }
    updateRouteGeometry(map, todayPoints)
  }, [todayPoints])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !currentPosition) {
      return
    }
    if (!markerRef.current) {
      const el = document.createElement('div')
      el.className = 'h-3 w-3 rounded-full border-[3px] border-white bg-sky-500 shadow shadow-sky-500/40'
      markerRef.current = new maplibregl.Marker({ element: el })
    }
    markerRef.current.setLngLat([currentPosition.lng, currentPosition.lat]).addTo(map)
    if (!headingMarkerRef.current) {
      const el = document.createElement('div')
      el.className = 'flex h-6 w-6 items-center justify-center opacity-0 transition-opacity'
      const arrow = document.createElement('div')
      arrow.className = 'h-5 w-5 -translate-y-1 rotate-0 text-sky-600'
      arrow.innerHTML = '▲'
      arrow.style.transformOrigin = '50% 70%'
      el.appendChild(arrow)
      headingMarkerRef.current = new maplibregl.Marker({ element: el })
    }
    headingMarkerRef.current.setLngLat([currentPosition.lng, currentPosition.lat]).addTo(map)
    const pointerEl = headingMarkerRef.current.getElement().firstElementChild as HTMLElement | null
    if (typeof heading === 'number' && pointerEl) {
      pointerEl.style.transform = `rotate(${Math.round(heading)}deg)`
      headingMarkerRef.current.getElement().classList.remove('opacity-0')
    } else {
      headingMarkerRef.current.getElement().classList.add('opacity-0')
    }
  }, [currentPosition, heading])

  useEffect(() => {
    if (!isTracking) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      pendingGapRef.current = true
      lastStoredRef.current = undefined
      return
    }
    if (!('geolocation' in navigator)) {
      pushToast({ kind: 'error', message: 'この端末ではGPSが利用できません' })
      setTracking(false)
      return
    }
    const minDistance = distanceThresholdMeters
    const minInterval = timeThresholdSeconds
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords
        const timestamp = position.timestamp
        const now = Date.now()
        const point = { lat: latitude, lng: longitude, timestamp: now }
        setCurrentPosition({ lat: latitude, lng: longitude, accuracy, timestamp })
        const previous = lastStoredRef.current
        const shouldStore = shouldStorePoint({
          previous,
          next: point,
          minDistanceMeters: minDistance,
          minIntervalMs: minInterval,
        })
        if (shouldStore) {
          lastStoredRef.current = point
          const routePoint: RoutePoint = {
            lat: latitude,
            lng: longitude,
            tISO: new Date(timestamp).toISOString(),
            gapBefore: pendingGapRef.current,
          }
          pendingGapRef.current = false
          appendPoint(todayKey, routePoint).catch((error) => {
            console.error(error)
            pushToast({ kind: 'error', message: '経路保存に失敗しました' })
          })
        }
        if (!mapRef.current) {
          return
        }
        const map = mapRef.current
        const currentLngLat = map.getCenter()
        const distance = haversineDistanceMeters({ lat: currentLngLat.lat, lng: currentLngLat.lng }, point)
        if (followUserRef.current && (distance > 500 || !previous)) {
          map.easeTo({ center: [longitude, latitude], zoom: Math.max(map.getZoom(), 15) })
        }
      },
      (error) => {
        console.error(error)
        if (error.code === error.PERMISSION_DENIED) {
          pushToast({ kind: 'error', message: '位置情報の権限が拒否されました' })
          setTracking(false)
          return
        }
        pushToast({ kind: 'error', message: '位置情報の取得に失敗しました' })
      },
      {
        enableHighAccuracy: accuracyMode === 'high',
        maximumAge: 0,
        timeout: 15000,
      },
    )
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
    }
  }, [isTracking, accuracyMode, distanceThresholdMeters, timeThresholdSeconds, appendPoint, pushToast, setCurrentPosition, setTracking, todayKey])

  useEffect(() => {
    if (!isTracking) {
      setHeading(undefined)
      return
    }
    const handler = (event: DeviceOrientationEvent) => {
      if (typeof event.alpha === 'number') {
        setHeading(360 - event.alpha)
      }
    }
    window.addEventListener('deviceorientation', handler)
    return () => {
      window.removeEventListener('deviceorientation', handler)
    }
  }, [isTracking, setHeading])

  const handleToggleTracking = async () => {
    if (isTracking) {
      setTracking(false)
      return
    }
    await requestOrientationPermission()
    followUserRef.current = true
    pendingGapRef.current = true
    lastStoredRef.current = undefined
    setTracking(true)
  }

  const requestOrientationPermission = async () => {
    if (typeof DeviceOrientationEvent === 'undefined') {
      return
    }
    const anyDeviceOrientation = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<'granted' | 'denied'>
    }
    if (typeof anyDeviceOrientation.requestPermission === 'function') {
      try {
        await anyDeviceOrientation.requestPermission()
      } catch (error) {
        console.warn('方位許可要求失敗', error)
      }
    }
  }

  const openLocationModal = (location: PendingLocation) => {
    setPendingLocation(location)
    setPendingPhoto(null)
    setPendingNote('')
    setPendingAddress('住所を取得中…')
    setPendingSource('')
    setModalLoading(true)
    setIsModalOpen(true)
    reverseGeocode(location.lat, location.lng)
      .then((result) => {
        setPendingAddress(result.address)
        setPendingSource(result.source)
      })
      .catch(() => {
        setPendingAddress('住所取得に失敗しました')
        setPendingSource('エラー')
      })
      .finally(() => setModalLoading(false))
  }

  const handleSaveHere = () => {
    if (!currentPosition) {
      pushToast({ kind: 'error', message: '現在地が取得できるまでお待ちください' })
      return
    }
    openLocationModal({ lat: currentPosition.lat, lng: currentPosition.lng })
  }

  const handlePhotoChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      setPendingPhoto(null)
      return
    }
    try {
      const thumb = await createThumbnailDataUrl(file)
      setPendingPhoto({ blob: file, thumb })
    } catch (error) {
      console.error(error)
      pushToast({ kind: 'error', message: 'サムネイル生成に失敗しました' })
    }
  }

  const handlePlaceSubmit = async () => {
    if (!pendingLocation) {
      return
    }
    const now = new Date()
    const place: Place = {
      id: crypto.randomUUID(),
      lat: pendingLocation.lat,
      lng: pendingLocation.lng,
      address: pendingAddress,
      createdAtISO: now.toISOString(),
      note: pendingNote.trim() || undefined,
      photoBlob: pendingPhoto?.blob,
      thumbDataURL: pendingPhoto?.thumb,
    }
    await addPlace(place)
    pushToast({ kind: 'info', message: '地点を保存しました' })
    setIsModalOpen(false)
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div ref={mapContainerRef} className="h-full w-full" />
      <MapAttribution />
      <div className="pointer-events-none absolute inset-x-0 bottom-24 flex flex-col items-end gap-3 px-4">
        <div className="pointer-events-auto flex flex-col gap-3">
          <Fab
            label={isTracking ? '追跡を停止' : '追跡を開始'}
            onClick={handleToggleTracking}
            icon={isTracking ? '■' : '▶'}
            tone={isTracking ? 'secondary' : 'primary'}
          />
          <Fab label="ここを保存" onClick={handleSaveHere} icon="★" tone="secondary" />
        </div>
      </div>
      <Modal
        open={isModalOpen}
        title="地点を保存"
        onClose={() => setIsModalOpen(false)}
        footer={
          <>
            <button
              type="button"
              className="rounded-full border border-slate-300 px-4 py-2 text-sm"
              onClick={() => setIsModalOpen(false)}
            >
              キャンセル
            </button>
            <button
              type="button"
              className="rounded-full bg-sky-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              onClick={handlePlaceSubmit}
              disabled={modalLoading}
            >
              保存する
            </button>
          </>
        }
      >
        {modalLoading ? (
          <div className="flex items-center gap-2 text-slate-600">
            <Spinner />
            <span>住所を取得中です…</span>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-700">住所</h3>
              <p className="mt-1 text-sm text-slate-600">
                {pendingAddress}
                <span className="ml-2 text-xs text-slate-400">{pendingSource}</span>
              </p>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-semibold text-slate-700" htmlFor="place-photo">
                写真（任意）
              </label>
              <input
                id="place-photo"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoChange}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              {pendingPhoto?.thumb ? (
                <img
                  src={pendingPhoto.thumb}
                  alt="サムネイル"
                  className="h-32 w-32 rounded-lg object-cover"
                />
              ) : null}
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-semibold text-slate-700" htmlFor="place-note">
                メモ（任意）
              </label>
              <textarea
                id="place-note"
                rows={4}
                className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
                placeholder="気づいた点をメモしましょう"
                value={pendingNote}
                onChange={(event) => setPendingNote(event.target.value)}
              />
            </div>
            <div className="text-xs text-slate-400">
              登録済み {places.length} 件 / {formatDateTime(new Date().toISOString())}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
