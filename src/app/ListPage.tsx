import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import { EmptyState } from '../components/EmptyState'
import { Modal } from '../components/Modal'
import { MapAttribution } from '../components/MapAttribution'
import { formatDateTime, formatDistance, haversineDistanceMeters } from '../lib/geo'
import { createBaseMap } from '../lib/maps'
import { usePlacesStore } from '../stores/usePlacesStore'
import { useToastStore } from '../stores/useToastStore'
import { useTrackingStore } from '../stores/useTrackingStore'
import type { Place } from '../types'

export function ListPage() {
  const places = usePlacesStore((state) => state.places)
  const updatePlace = usePlacesStore((state) => state.updatePlace)
  const removePlace = usePlacesStore((state) => state.removePlace)
  const currentPosition = useTrackingStore((state) => state.currentPosition)
  const pushToast = useToastStore((state) => state.push)

  const sortedPlaces = useMemo(
    () => [...places].sort((a, b) => (a.createdAtISO < b.createdAtISO ? 1 : -1)),
    [places],
  )
  const [selected, setSelected] = useState<Place | null>(null)
  const [memoDraft, setMemoDraft] = useState('')
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const detailMapRef = useRef<maplibregl.Map | null>(null)
  const detailMarkerRef = useRef<maplibregl.Marker | null>(null)
  const detailPhotoUrlsRef = useRef<Array<{ url: string; isObjectUrl: boolean }>>([])
  const [detailPhotos, setDetailPhotos] = useState<Array<{ id: string; url: string; isObjectUrl: boolean }>>([])

  useEffect(() => {
    if (!selected || !mapContainerRef.current) {
      return
    }
    if (detailMapRef.current) {
      detailMapRef.current.setCenter([selected.lng, selected.lat])
      if (!detailMarkerRef.current) {
        detailMarkerRef.current = new maplibregl.Marker()
      }
      detailMarkerRef.current.setLngLat([selected.lng, selected.lat]).addTo(detailMapRef.current)
      return
    }
    const map = createBaseMap(mapContainerRef.current, [selected.lng, selected.lat])
    map.on('load', () => {
      map.setCenter([selected.lng, selected.lat])
      detailMarkerRef.current = new maplibregl.Marker().setLngLat([selected.lng, selected.lat]).addTo(map)
    })
    detailMapRef.current = map
    return () => {
      map.remove()
      detailMapRef.current = null
      detailMarkerRef.current = null
    }
  }, [selected])

  useEffect(() => {
    detailPhotoUrlsRef.current.forEach((photo) => {
      if (photo.isObjectUrl) {
        URL.revokeObjectURL(photo.url)
      }
    })
    detailPhotoUrlsRef.current = []
    if (!selected) {
      setDetailPhotos([])
      setMemoDraft('')
      return () => {}
    }
    setMemoDraft(selected.note ?? '')
    const generated: Array<{ id: string; url: string; isObjectUrl: boolean }> = []
    selected.photos.forEach((photo) => {
      if (photo.blob) {
        const url = URL.createObjectURL(photo.blob)
        generated.push({ id: photo.id, url, isObjectUrl: true })
        return
      }
      if (photo.thumbDataURL) {
        generated.push({ id: photo.id, url: photo.thumbDataURL, isObjectUrl: false })
        return
      }
      generated.push({ id: photo.id, url: '', isObjectUrl: false })
    })
    setDetailPhotos(generated)
    detailPhotoUrlsRef.current = generated.map((photo) => ({ url: photo.url, isObjectUrl: photo.isObjectUrl }))
    return () => {
      generated.forEach((photo) => {
        if (photo.isObjectUrl) {
          URL.revokeObjectURL(photo.url)
        }
      })
    }
  }, [selected])

  useEffect(() => {
    return () => {
      detailPhotoUrlsRef.current.forEach((photo) => {
        if (photo.isObjectUrl) {
          URL.revokeObjectURL(photo.url)
        }
      })
      detailPhotoUrlsRef.current = []
    }
  }, [])

  const handleCardClick = (place: Place) => {
    setSelected(place)
  }

  const handleSaveMemo = async () => {
    if (!selected) {
      return
    }
    await updatePlace(selected.id, (prev) => ({ ...prev, note: memoDraft }))
    pushToast({ kind: 'info', message: 'メモを更新しました' })
  }

  const handleDelete = async () => {
    if (!selected) {
      return
    }
    await removePlace(selected.id)
    pushToast({ kind: 'info', message: '地点を削除しました' })
    setSelected(null)
  }

  const distanceFromCurrent = (place: Place): string => {
    if (!currentPosition) {
      return '距離不明'
    }
    return formatDistance(haversineDistanceMeters(currentPosition, place))
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-50 px-4 pb-32 pt-4">
      {sortedPlaces.length === 0 ? (
        <EmptyState
          title="まだ保存された地点はありません"
          description="地図から気になる場所を保存するとここに表示されます。"
        />
      ) : (
        <ul className="grid gap-3">
          {sortedPlaces.map((place) => (
            <li key={place.id}>
              <button
                type="button"
                onClick={() => handleCardClick(place)}
                className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm shadow-slate-200 transition hover:shadow-md"
              >
                {place.photos[0]?.thumbDataURL ? (
                  <img
                    src={place.photos[0].thumbDataURL}
                    alt="サムネイル"
                    className="h-16 w-16 rounded-xl object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-slate-200 text-xs text-slate-500">
                    写真なし
                  </div>
                )}
                <div className="flex-1 space-y-1">
                  <h3 className="line-clamp-2 text-sm font-semibold text-slate-800">{place.address}</h3>
                  <p className="text-xs text-slate-500">{formatDateTime(place.createdAtISO)}</p>
                </div>
                <div className="text-xs font-medium text-slate-600">{distanceFromCurrent(place)}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Modal
        open={selected !== null}
        title={selected ? '地点の詳細' : ''}
        onClose={() => setSelected(null)}
        footer={
          selected ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-full border border-slate-300 px-4 py-2 text-sm"
                onClick={() => setSelected(null)}
              >
                閉じる
              </button>
              <button
                type="button"
                className="rounded-full bg-sky-500 px-4 py-2 text-sm font-semibold text-white"
                onClick={handleSaveMemo}
              >
                メモを保存
              </button>
              <button
                type="button"
                className="rounded-full bg-rose-500 px-4 py-2 text-sm font-semibold text-white"
                onClick={handleDelete}
              >
                削除
              </button>
            </div>
          ) : null
        }
      >
        {selected ? (
          <div className="space-y-4">
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-700">撮影メディア</h3>
              {detailPhotos.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {detailPhotos.map((photo) => (
                    <div key={photo.id} className="overflow-hidden rounded-xl border border-slate-200">
                      {photo.url ? (
                        <img src={photo.url} alt="保存した写真" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-32 items-center justify-center bg-slate-200 text-xs text-slate-500">
                          NO IMAGE
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">写真は登録されていません。</p>
              )}
            </section>
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-700">概要</h3>
              <ul className="space-y-1 text-sm text-slate-600">
                <li>住所: {selected.address}</li>
                <li>登録日時: {formatDateTime(selected.createdAtISO)}</li>
                <li>現在地から: {distanceFromCurrent(selected)}</li>
              </ul>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${selected.lat},${selected.lng}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-slate-800 px-4 py-2 text-xs font-semibold text-white"
              >
                地図アプリで開く
              </a>
            </section>
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-700">位置</h3>
              <div className="relative h-48 w-full overflow-hidden rounded-2xl border border-slate-200">
                <div ref={mapContainerRef} className="absolute inset-0" />
                <MapAttribution />
              </div>
            </section>
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-700">メモ</h3>
              <textarea
                value={memoDraft}
                onChange={(event) => setMemoDraft(event.target.value)}
                rows={5}
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
                placeholder="メモを追記できます"
              />
            </section>
          </div>
        ) : (
          <p className="text-sm text-slate-500">地点が選択されていません。</p>
        )}
      </Modal>
    </div>
  )
}
