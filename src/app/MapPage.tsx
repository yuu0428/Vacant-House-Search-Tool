import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
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

interface PendingPhoto {
  id: string
  file: File
  thumb: string
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
  const photoInputRef = useRef<HTMLInputElement | null>(null)
  const lastAcceptedPositionRef = useRef<{ lat: number; lng: number } | undefined>(undefined)
  const [isFollowing, setIsFollowing] = useState(true)
  const [pendingLocation, setPendingLocation] = useState<PendingLocation | null>(null)
  const [pendingAddress, setPendingAddress] = useState<string>('')
  const [pendingSource, setPendingSource] = useState<string>('')
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([])
  const [pendingNote, setPendingNote] = useState('')
  const [modalLoading, setModalLoading] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const openLocationModalRef = useRef<(location: PendingLocation) => void>(() => {})

  const todayKey = useMemo(() => toDayKey(new Date()), [])
  const todayPoints = useMemo(() => buckets[todayKey]?.points ?? [], [buckets, todayKey])

  const openLocationModal = useCallback(
    (location: PendingLocation) => {
      setPendingLocation(location)
      setPendingPhotos([])
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
    },
    [],
  )

  useEffect(() => {
    openLocationModalRef.current = openLocationModal
  }, [openLocationModal])

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return
    }
    const map = createBaseMap(mapContainerRef.current, defaultCenterRef.current)
    mapRef.current = map

    const handleLoad = () => {
      ensureRouteLayer(map)
      updateRouteGeometry(map, routePointsRef.current)
    }
    const handleClick = (event: maplibregl.MapMouseEvent) => {
      openLocationModalRef.current({ lat: event.lngLat.lat, lng: event.lngLat.lng })
    }

    map.on('load', handleLoad)
    map.on('click', handleClick)
    const disableFollow = () => {
      followUserRef.current = false
      setIsFollowing(false)
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
  }, [])

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
      lastAcceptedPositionRef.current = undefined
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
        const candidate = { lat: latitude, lng: longitude }
        const previousAccepted = lastAcceptedPositionRef.current
        if (previousAccepted && typeof accuracy === 'number') {
          const moveDistance = haversineDistanceMeters(previousAccepted, candidate)
          const dynamicThreshold = Math.max(accuracy * 0.8, 3)
          if (accuracy > 40 && moveDistance < dynamicThreshold) {
            return
          }
        }

        const point = { lat: latitude, lng: longitude, timestamp: now }
        setCurrentPosition({ lat: latitude, lng: longitude, accuracy, timestamp })
        lastAcceptedPositionRef.current = candidate
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
          setIsFollowing(false)
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
      setIsFollowing(false)
      return
    }
    await requestOrientationPermission()
    followUserRef.current = true
    pendingGapRef.current = true
    lastStoredRef.current = undefined
    setIsFollowing(true)
    setTracking(true)
  }

  const handleResumeFollow = () => {
    followUserRef.current = true
    setIsFollowing(true)
    if (currentPosition && mapRef.current) {
      mapRef.current.easeTo({
        center: [currentPosition.lng, currentPosition.lat],
        zoom: Math.max(mapRef.current.getZoom(), 15),
        duration: 800,
      })
    }
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

  const handleSaveHere = () => {
    if (!currentPosition) {
      pushToast({ kind: 'error', message: '現在地が取得できるまでお待ちください' })
      return
    }
    openLocationModal({ lat: currentPosition.lat, lng: currentPosition.lng })
  }

  const handlePhotoChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    if (files.length === 0) {
      return
    }
    try {
      const nextPhotos: PendingPhoto[] = []
      for (const file of files) {
        const thumb = await createThumbnailDataUrl(file)
        nextPhotos.push({ id: crypto.randomUUID(), file, thumb })
      }
      setPendingPhotos((prev) => [...prev, ...nextPhotos])
    } catch (error) {
      console.error(error)
      pushToast({ kind: 'error', message: 'サムネイル生成に失敗しました' })
    } finally {
      event.target.value = ''
    }
  }

  const handleRemovePendingPhoto = (id: string) => {
    setPendingPhotos((prev) => prev.filter((item) => item.id !== id))
  }

  const handlePlaceSubmit = async () => {
    if (!pendingLocation) {
      return
    }
    const now = new Date()
    const baseTime = now.getTime()
    const photos = pendingPhotos.map((item, index) => ({
      id: crypto.randomUUID(),
      createdAtISO: new Date(baseTime + index).toISOString(),
      blob: item.file,
      thumbDataURL: item.thumb,
    }))
    const place: Place = {
      id: crypto.randomUUID(),
      lat: pendingLocation.lat,
      lng: pendingLocation.lng,
      address: pendingAddress,
      createdAtISO: now.toISOString(),
      note: pendingNote.trim() || undefined,
      photos,
    }
    await addPlace(place)
    pushToast({ kind: 'info', message: '地点を保存しました' })
    setIsModalOpen(false)
    setPendingPhotos([])
  }

  const handleModalClose = () => {
    setIsModalOpen(false)
    setPendingPhotos([])
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div ref={mapContainerRef} className="h-full w-full" />
      <MapAttribution />
      <div className="pointer-events-none absolute inset-x-0 bottom-24 flex flex-col items-end gap-3 px-4">
        <div className="pointer-events-auto flex flex-col gap-3">
          {!isFollowing && isTracking ? (
            <button
              type="button"
              onClick={handleResumeFollow}
              className="self-end rounded-full border border-sky-300 bg-white px-4 py-2 text-xs font-semibold text-sky-600 shadow-sm shadow-sky-200"
            >
              現在地を追尾
            </button>
          ) : null}
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
        onClose={handleModalClose}
        footer={
          <>
            <button
              type="button"
              className="rounded-full border border-slate-300 px-4 py-2 text-sm"
              onClick={handleModalClose}
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
              <span className="text-sm font-semibold text-slate-700">写真（任意）</span>
              <div className="flex flex-wrap gap-3">
                {pendingPhotos.map((photo) => (
                  <div key={photo.id} className="relative h-24 w-24 overflow-hidden rounded-xl border border-slate-200">
                    <img src={photo.thumb} alt="選択した写真" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      className="absolute right-1 top-1 rounded-full bg-black/60 px-1 text-[10px] text-white"
                      onClick={() => handleRemovePendingPhoto(photo.id)}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="flex h-24 w-24 items-center justify-center rounded-xl border border-dashed border-sky-300 bg-sky-50 text-xs font-semibold text-sky-600"
                  onClick={() => photoInputRef.current?.click()}
                >
                  写真を追加
                </button>
                <input
                  ref={photoInputRef}
                  id="place-photo"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handlePhotoChange}
                  className="hidden"
                />
              </div>
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
