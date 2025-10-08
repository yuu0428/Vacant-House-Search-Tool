import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Modal } from '../components/Modal'
import { clearGeocodeCache } from '../lib/geocode'
import { createJsonExport, createZipExport, importFromFile, resetAll } from '../lib/export'
import { usePlacesStore } from '../stores/usePlacesStore'
import { useRouteStore } from '../stores/useRouteStore'
import { useSettingsStore } from '../stores/useSettingsStore'
import { useToastStore } from '../stores/useToastStore'
import { hasFirebaseConfig } from '../lib/firebase'
import type { Place } from '../types'

interface PhotoExportItem {
  id: string
  address: string
  lat: number
  lng: number
  note?: string
  previewUrl?: string
  objectUrl?: string
  place: Place
}

export function SettingsPage() {
  const settings = useSettingsStore()
  const setAccuracyMode = useSettingsStore((state) => state.setAccuracyMode)
  const setDistanceThreshold = useSettingsStore((state) => state.setDistanceThreshold)
  const setTimeThreshold = useSettingsStore((state) => state.setTimeThreshold)
  const setIncludeOriginal = useSettingsStore((state) => state.setIncludeOriginalOnExport)
  const setIncludeThumbs = useSettingsStore((state) => state.setIncludeThumbsOnExport)
  const setFirebaseEnabled = useSettingsStore((state) => state.setFirebaseSyncEnabled)
  const pushToast = useToastStore((state) => state.push)
  const places = usePlacesStore((state) => state.places)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [photoModalOpen, setPhotoModalOpen] = useState(false)
  const [photoItems, setPhotoItems] = useState<PhotoExportItem[]>([])
  const [photoSelection, setPhotoSelection] = useState<Set<string>>(new Set())
  const [photoProcessing, setPhotoProcessing] = useState(false)
  const [photoResults, setPhotoResults] = useState<Array<{ id: string; url: string; filename: string; blob: Blob }>>([])

  const handleExportJson = async () => {
    try {
      const { blob, filename } = await createJsonExport({
        includeOriginals: settings.includeOriginalOnExport,
        includeThumbnails: settings.includeThumbnailsOnExport,
      })
      triggerDownload(blob, filename)
      pushToast({ kind: 'info', message: 'JSONを書き出しました' })
    } catch (error) {
      console.error(error)
      pushToast({ kind: 'error', message: 'エクスポートに失敗しました' })
    }
  }

  const handleExportZip = async () => {
    try {
      const { blob, filename } = await createZipExport({
        includeOriginals: settings.includeOriginalOnExport,
        includeThumbnails: settings.includeThumbnailsOnExport,
      })
      triggerDownload(blob, filename)
      pushToast({ kind: 'info', message: 'ZIPを書き出しました' })
    } catch (error) {
      console.error(error)
      pushToast({ kind: 'error', message: 'エクスポートに失敗しました' })
    }
  }

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }
    setIsBusy(true)
    try {
      await importFromFile(file)
      await Promise.all([usePlacesStore.getState().load(), useRouteStore.getState().load()])
      pushToast({ kind: 'info', message: 'データを読み込みました' })
    } catch (error) {
      console.error(error)
      pushToast({ kind: 'error', message: 'インポートに失敗しました' })
    } finally {
      setIsBusy(false)
      event.target.value = ''
    }
  }

  const handleClearCaches = async () => {
    await resetAll()
    clearGeocodeCache()
    await Promise.all([usePlacesStore.getState().load(), useRouteStore.getState().load()])
    pushToast({ kind: 'info', message: '保存データをリセットしました' })
  }

  const handlePhotoExportClick = () => {
    photoResults.forEach((existing) => URL.revokeObjectURL(existing.url))
    setPhotoResults([])
    const items = preparePhotoExportItems(places)
    if (items.length === 0) {
      pushToast({ kind: 'info', message: '写真付きの地点がありません' })
      return
    }
    setPhotoItems(items)
    setPhotoSelection(new Set(items.map((item) => item.id)))
    setPhotoModalOpen(true)
  }

  const preparePhotoExportItems = (source: Place[]): PhotoExportItem[] => {
    return source.map((place) => {
      let previewUrl = place.thumbDataURL
      let objectUrl: string | undefined
      if (!previewUrl && place.photoBlob) {
        objectUrl = URL.createObjectURL(place.photoBlob)
        previewUrl = objectUrl
      }
      return {
        id: place.id,
        address: place.address,
        lat: place.lat,
        lng: place.lng,
        note: place.note ?? undefined,
        previewUrl,
        objectUrl,
        place,
      }
    })
  }

  const createPhotoExportImages = async (items: PhotoExportItem[]) => {
    const chunks: PhotoExportItem[][] = []
    const copy = [...items]
    const pageSize = 3
    while (copy.length > 0) {
      chunks.push(copy.splice(0, pageSize))
    }
    const results: Array<{ blob: Blob; index: number }> = []
    for (let i = 0; i < chunks.length; i += 1) {
      const blob = await renderPhotoExportImage(chunks[i])
      if (blob) {
        results.push({ blob, index: i })
      }
    }
    return results
  }

  const renderPhotoExportImage = async (itemsGrouped: PhotoExportItem[]): Promise<Blob | null> => {
    const CANVAS_WIDTH = 1080
    const CARD_HEIGHT = 520
    const CARD_GAP = 36
    const PADDING = 48
    const canvas = document.createElement('canvas')
    const height = PADDING * 2 + itemsGrouped.length * CARD_HEIGHT + (itemsGrouped.length - 1) * CARD_GAP
    canvas.width = CANVAS_WIDTH
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return null
    }
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(0, 0, CANVAS_WIDTH, height)
    ctx.font = '24px "Noto Sans JP", sans-serif'
    ctx.textBaseline = 'top'

    const photoWidth = 360
    const photoHeight = 480
    const textStartX = PADDING + photoWidth + 40

    for (let i = 0; i < itemsGrouped.length; i += 1) {
      const top = PADDING + i * (CARD_HEIGHT + CARD_GAP)
      const item = itemsGrouped[i]
      ctx.fillStyle = '#ffffff'
      ctx.shadowColor = 'rgba(15, 23, 42, 0.08)'
      ctx.shadowBlur = 20
      ctx.shadowOffsetX = 0
      ctx.shadowOffsetY = 12
      ctx.fillRect(PADDING, top, CANVAS_WIDTH - PADDING * 2, CARD_HEIGHT)
      ctx.shadowColor = 'transparent'

      const photoX = PADDING + 12
      const photoY = top + 20
      ctx.fillStyle = '#e2e8f0'
      ctx.fillRect(photoX, photoY, photoWidth, photoHeight)

      const drawPlaceholder = () => {
        ctx.fillStyle = '#cbd5f5'
        ctx.fillRect(photoX, photoY, photoWidth, photoHeight)
        ctx.fillStyle = '#64748b'
        ctx.font = 'bold 32px "Noto Sans JP", sans-serif'
        const placeholder = 'NO IMAGE'
        const metrics = ctx.measureText(placeholder)
        ctx.fillText(
          placeholder,
          photoX + (photoWidth - metrics.width) / 2,
          photoY + photoHeight / 2 - 16,
        )
      }

      if (item.previewUrl) {
        try {
          const image = await loadImage(item.previewUrl)
          const scale = Math.min(photoWidth / image.width, photoHeight / image.height)
          const drawWidth = image.width * scale
          const drawHeight = image.height * scale
          const offsetX = photoX + (photoWidth - drawWidth) / 2
          const offsetY = photoY + (photoHeight - drawHeight) / 2
          ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight)
        } catch (error) {
          console.warn('写真描画に失敗しました', error)
          drawPlaceholder()
        }
      } else {
        drawPlaceholder()
      }

      ctx.fillStyle = '#0f172a'
      ctx.font = 'bold 28px "Noto Sans JP", sans-serif'
      wrapText(ctx, item.address, textStartX, top + 30, CANVAS_WIDTH - textStartX - PADDING, 34)

      ctx.font = '22px "Noto Sans JP", sans-serif'
      ctx.fillStyle = '#475569'
      const detailStartY = top + 150
      ctx.fillText(`座標: ${item.lat.toFixed(5)}, ${item.lng.toFixed(5)}`, textStartX, detailStartY)
      const memoText = item.note && item.note.trim().length > 0 ? item.note : 'なし'
      wrapText(ctx, `メモ: ${memoText}`, textStartX, detailStartY + 40, CANVAS_WIDTH - textStartX - PADDING, 28)
    }

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob)
      }, 'image/jpeg', 0.9)
    })
  }

  const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = (event) => reject(event)
      img.crossOrigin = 'anonymous'
      img.src = src
    })
  }

  const wrapText = (
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number,
  ) => {
    const chars = Array.from(text)
    let line = ''
    let currentY = y
    chars.forEach((char) => {
      const testLine = line + char
      if (ctx.measureText(testLine).width > maxWidth && line) {
        ctx.fillText(line, x, currentY)
        line = char
        currentY += lineHeight
      } else {
        line = testLine
      }
    })
    if (line) {
      ctx.fillText(line, x, currentY)
    }
  }

  useEffect(() => {
    return () => {
      photoItems.forEach((item) => {
        if (item.objectUrl) {
          URL.revokeObjectURL(item.objectUrl)
        }
      })
      photoResults.forEach((result) => {
        URL.revokeObjectURL(result.url)
      })
    }
  }, [photoItems, photoResults])

  const closePhotoModal = () => {
    setPhotoModalOpen(false)
    setPhotoProcessing(false)
    setPhotoItems([])
    setPhotoSelection(new Set())
    photoResults.forEach((result) => URL.revokeObjectURL(result.url))
    setPhotoResults([])
  }

  const togglePhotoSelection = (id: string) => {
    setPhotoSelection((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleSelectAllPhotos = () => {
    setPhotoSelection(new Set(photoItems.map((item) => item.id)))
  }

  const handleClearSelection = () => {
    setPhotoSelection(new Set())
  }

  const handleConfirmPhotoExport = async () => {
    const selectedItems = photoItems.filter((item) => photoSelection.has(item.id))
    if (selectedItems.length === 0) {
      pushToast({ kind: 'error', message: 'エクスポートする写真を選んでください' })
      return
    }
    setPhotoProcessing(true)
    try {
      const images = await createPhotoExportImages(selectedItems)
      if (images.length === 0) {
        throw new Error('出力対象の画像を生成できませんでした')
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      photoResults.forEach((existing) => URL.revokeObjectURL(existing.url))
      const results = images.map(({ blob, index }) => {
        const indexLabel = String(index + 1).padStart(2, '0')
        const filename = `walktrace-photos-${timestamp}-${indexLabel}.jpg`
        const url = URL.createObjectURL(blob)
        return { id: `${timestamp}-${index}`, url, filename, blob }
      })
      setPhotoResults(results)
      setPhotoProcessing(false)
      pushToast({ kind: 'info', message: '画像が生成されました' })
    } catch (error) {
      console.error(error)
      pushToast({ kind: 'error', message: '写真の書き出しに失敗しました' })
      setPhotoProcessing(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-50 px-4 pb-32 pt-4">
      <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-800">位置追跡</h2>
        <div className="grid gap-3 text-sm text-slate-600">
          <div className="flex items-center justify-between">
            <span>GPS精度モード</span>
            <div className="flex gap-2">
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="accuracy"
                  value="balanced"
                  checked={settings.accuracyMode === 'balanced'}
                  onChange={() => setAccuracyMode('balanced')}
                />
                標準
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="accuracy"
                  value="high"
                  checked={settings.accuracyMode === 'high'}
                  onChange={() => setAccuracyMode('high')}
                />
                高精度
              </label>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span>距離しきい値</span>
            <select
              value={settings.distanceThresholdMeters}
              onChange={(event) => setDistanceThreshold(Number(event.target.value))}
              className="rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value={5}>5m</option>
              <option value={8}>8m</option>
              <option value={12}>12m</option>
            </select>
          </div>
          <div className="flex items-center justify-between">
            <span>時間しきい値</span>
            <select
              value={settings.timeThresholdSeconds}
              onChange={(event) => setTimeThreshold(Number(event.target.value))}
              className="rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value={3000}>3秒</option>
              <option value={5000}>5秒</option>
              <option value={8000}>8秒</option>
            </select>
          </div>
        </div>
      </section>

      <section className="mt-4 space-y-3 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-800">エクスポート / インポート</h2>
        <div className="grid gap-3 text-sm text-slate-600">
          <label className="flex items-center justify-between">
            元ファイルも含める
            <input
              type="checkbox"
              checked={settings.includeOriginalOnExport}
              onChange={(event) => setIncludeOriginal(event.target.checked)}
            />
          </label>
          <label className="flex items-center justify-between">
            サムネイルを含める
            <input
              type="checkbox"
              checked={settings.includeThumbnailsOnExport}
              onChange={(event) => setIncludeThumbs(event.target.checked)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-full bg-slate-800 px-4 py-2 text-xs font-semibold text-white"
              onClick={handleExportJson}
            >
              JSONでエクスポート
            </button>
            <button
              type="button"
              className="rounded-full bg-sky-500 px-4 py-2 text-xs font-semibold text-white"
              onClick={handleExportZip}
            >
              ZIPでエクスポート
            </button>
            <button
              type="button"
              className="rounded-full border border-slate-300 px-4 py-2 text-xs"
              onClick={() => fileInputRef.current?.click()}
            >
              ファイルをインポート
            </button>
            <button
              type="button"
              className="rounded-full border border-sky-300 px-4 py-2 text-xs text-sky-600"
              onClick={handlePhotoExportClick}
            >
              写真でエクスポート
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,application/zip,.zip,.json"
              onChange={handleImport}
              className="hidden"
            />
          </div>
        </div>
      </section>

      <section className="mt-4 space-y-3 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-800">メンテナンス</h2>
        <div className="grid gap-3 text-sm text-slate-600">
          <button
            type="button"
            className="rounded-full border border-slate-300 px-4 py-2 text-xs"
            onClick={() => {
              clearGeocodeCache()
              pushToast({ kind: 'info', message: '逆ジオコーディングのキャッシュを削除しました' })
            }}
          >
            住所キャッシュを消去
          </button>
          <button
            type="button"
            className="rounded-full bg-rose-500 px-4 py-2 text-xs font-semibold text-white"
            onClick={handleClearCaches}
          >
            IndexedDBを初期化
          </button>
        </div>
      </section>

      {hasFirebaseConfig() ? (
        <section className="mt-4 space-y-3 rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-slate-800">Firebase連携</h2>
          <p className="text-xs text-slate-500">
            FirestoreとCloud Storageに同期します。安全なキー管理の上で有効化してください。
          </p>
          <label className="flex items-center justify-between text-sm text-slate-600">
            同期を有効化
            <input
              type="checkbox"
              checked={settings.firebaseSyncEnabled}
              onChange={(event) => setFirebaseEnabled(event.target.checked)}
            />
          </label>
        </section>
      ) : null}

      {isBusy ? <p className="mt-4 text-center text-xs text-slate-500">処理中…</p> : null}

      <Modal
        open={photoModalOpen}
        title={photoResults.length > 0 ? '画像が生成されました' : 'どれをエクスポートしますか？'}
        onClose={closePhotoModal}
        footer={
          photoResults.length > 0 ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-full border border-slate-300 px-4 py-2 text-xs"
                onClick={closePhotoModal}
              >
                閉じる
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-full border border-slate-300 px-4 py-2 text-xs"
                onClick={handleSelectAllPhotos}
              >
                全部
              </button>
              <button
                type="button"
                className="rounded-full border border-slate-300 px-4 py-2 text-xs"
                onClick={handleClearSelection}
              >
                取り消し
              </button>
              <button
                type="button"
                className="rounded-full border border-slate-300 px-4 py-2 text-xs"
                onClick={closePhotoModal}
              >
                キャンセル
              </button>
              <button
                type="button"
                className="rounded-full bg-sky-500 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                onClick={handleConfirmPhotoExport}
                disabled={photoProcessing}
              >
                写真を書き出す
              </button>
            </div>
          )
        }
      >
        {photoResults.length > 0 ? (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">生成された画像を個別にダウンロードできます。</p>
            <ul className="space-y-2">
              {photoResults.map((result, index) => (
                <li key={result.id} className="flex items-center justify-between rounded-2xl bg-slate-100 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-slate-700">第{index + 1}枚</span>
                    <img src={result.url} alt={`第${index + 1}枚`} className="h-16 w-16 rounded-lg object-cover" />
                  </div>
                  <button
                    type="button"
                    className="rounded-full bg-sky-500 px-4 py-2 text-xs font-semibold text-white"
                    onClick={() => triggerDownload(result.blob, result.filename)}
                  >
                    ダウンロード
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">#写真</p>
            <ul className="space-y-3">
              {photoItems.map((item) => {
                const checked = photoSelection.has(item.id)
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => togglePhotoSelection(item.id)}
                      className={`grid w-full grid-cols-[auto,1fr] items-center gap-3 rounded-2xl border px-3 py-3 text-left transition ${checked ? 'border-sky-400 bg-sky-50' : 'border-slate-200 bg-white'}`}
                    >
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full border text-xs ${checked ? 'border-sky-500 bg-sky-500 text-white' : 'border-slate-300 text-slate-400'}`}
                        aria-hidden
                      >
                        {checked ? '✓' : ''}
                      </span>
                      <div className="flex items-center gap-3">
                        <div className="h-28 w-24 flex-shrink-0 overflow-hidden rounded-xl bg-slate-200">
                          {item.previewUrl ? (
                            <img src={item.previewUrl} alt={`${item.address}の写真`} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-500">
                              写真なし
                            </div>
                          )}
                        </div>
                        <div className="flex flex-1 flex-col gap-2">
                          <div className="text-sm font-semibold text-slate-800">{item.address}</div>
                          <div className="flex flex-wrap gap-1 text-xs text-slate-600">
                            <span className="rounded-full bg-white px-2 py-1 shadow-sm">座標: {item.lat.toFixed(4)}, {item.lng.toFixed(4)}</span>
                            <span className="rounded-full bg-white px-2 py-1 shadow-sm">メモ: {item.note ? item.note : 'なし'}</span>
                          </div>
                        </div>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
            {photoItems.length === 0 ? <p className="text-xs text-slate-500">写真の候補がありません。</p> : null}
            {photoProcessing ? <p className="text-center text-xs text-slate-500">写真を書き出し中です…</p> : null}
          </div>
        )}
      </Modal>
    </div>
  )
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, 0)
}
