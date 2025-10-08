import JSZip from 'jszip'
import { clearDatabase, exportDatabase, importDatabase } from './db'
import type { Place } from '../types'

interface ExportedPhoto {
  id: string
  createdAtISO: string
  thumbDataURL?: string
  photoPath?: string
}

interface ExportedPlace {
  id: string
  lat: number
  lng: number
  address: string
  createdAtISO: string
  note?: string
  photos: ExportedPhoto[]
}

interface ExportEnvelope {
  places: ExportedPlace[]
  routes: Awaited<ReturnType<typeof exportDatabase>>['routes']
  exportedAtISO: string
  schemaVersion: number
}

export interface ImportBundle {
  envelope: ExportEnvelope
  toPlaces(filterIds?: string[]): Promise<Place[]>
}

interface ExportOptions {
  includeOriginals: boolean
  includeThumbnails: boolean
}

type ExportPayload = Awaited<ReturnType<typeof exportDatabase>>

function buildEnvelope(payload: ExportPayload, options: ExportOptions): ExportEnvelope {
  const places: ExportedPlace[] = payload.places.map((place) => {
    const photos: ExportedPhoto[] = place.photos.map((photo) => ({
      id: photo.id,
      createdAtISO: photo.createdAtISO,
      thumbDataURL: options.includeThumbnails ? photo.thumbDataURL : undefined,
      photoPath:
        options.includeOriginals && photo.blob
          ? `media/${place.id}/${photo.id}.jpg`
          : undefined,
    }))

    return {
      id: place.id,
      lat: place.lat,
      lng: place.lng,
      address: place.address,
      createdAtISO: place.createdAtISO,
      note: place.note,
      photos,
    }
  })
  return {
    places,
    routes: payload.routes,
    exportedAtISO: payload.exportedAtISO,
    schemaVersion: payload.schemaVersion,
  }
}

function filterPayload(payload: ExportPayload, selectedIds?: string[]): ExportPayload {
  if (!selectedIds || selectedIds.length === 0) {
    return payload
  }
  const idSet = new Set(selectedIds)
  return {
    places: payload.places.filter((place) => idSet.has(place.id)),
    routes: payload.routes,
    exportedAtISO: payload.exportedAtISO,
    schemaVersion: payload.schemaVersion,
  }
}

export async function createJsonExport(
  options: ExportOptions,
  selectedIds?: string[],
): Promise<{ blob: Blob; filename: string }> {
  const payload = filterPayload(await exportDatabase(), selectedIds)
  const envelope = buildEnvelope(payload, options)
  const json = JSON.stringify(envelope, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const filename = `walktrace-export-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  return { blob, filename }
}

export async function createZipExport(
  options: ExportOptions,
  selectedIds?: string[],
): Promise<{ blob: Blob; filename: string }> {
  const payload = filterPayload(await exportDatabase(), selectedIds)
  const envelope = buildEnvelope(payload, options)
  const zip = new JSZip()
  zip.file('walktrace.json', JSON.stringify(envelope, null, 2))
  await Promise.all(
    payload.places.map(async (place) => {
      if (!options.includeOriginals) {
        return
      }
      const target = envelope.places.find((item) => item.id === place.id)
      if (!target) {
        return
      }
      await Promise.all(
        place.photos.map(async (photo, index) => {
          const path = target.photos[index]?.photoPath
          if (!path || !photo.blob) {
            return
          }
          const arrayBuffer = await photo.blob.arrayBuffer()
          zip.file(path, arrayBuffer)
        }),
      )
    }),
  )
  const blob = await zip.generateAsync({ type: 'blob' })
  const filename = `walktrace-export-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`
  return { blob, filename }
}

export async function importFromFile(file: File): Promise<void> {
  const bundle = await loadImportBundle(file)
  const places = await bundle.toPlaces()
  await importDatabase({
    places,
    routes: bundle.envelope.routes,
    exportedAtISO: bundle.envelope.exportedAtISO,
    schemaVersion: bundle.envelope.schemaVersion,
  })
}

export async function resetAll(): Promise<void> {
  await clearDatabase()
}

export async function loadImportBundle(file: File): Promise<ImportBundle> {
  if (file.name.endsWith('.zip')) {
    return loadZipBundle(file)
  }
  return loadJsonBundle(file)
}

async function loadJsonBundle(file: File): Promise<ImportBundle> {
  const text = await file.text()
  const envelope = JSON.parse(text) as ExportEnvelope
  return {
    envelope,
    async toPlaces(filterIds) {
      const idSet = filterIds ? new Set(filterIds) : null
      return Promise.all(
        envelope.places
          .filter((place) => (idSet ? idSet.has(place.id) : true))
          .map(async (place) => {
            const photosFromExport = Array.isArray(place.photos) ? place.photos : []
            const legacyThumb = (place as { thumbDataURL?: string }).thumbDataURL
            const legacyPhotoPath = (place as { photoPath?: string }).photoPath
            const legacyPhotos = !photosFromExport.length && (legacyThumb || legacyPhotoPath)
              ? [{
                  id: `${place.id}-legacy`,
                  createdAtISO: place.createdAtISO,
                  thumbDataURL: legacyThumb,
                  photoPath: legacyPhotoPath,
                }]
              : []
            const photos = [...photosFromExport, ...legacyPhotos]
            return {
              id: place.id,
              lat: place.lat,
              lng: place.lng,
              address: place.address,
              createdAtISO: place.createdAtISO,
              note: place.note ?? undefined,
              photos: photos.map((photo) => ({
                id: photo.id,
                createdAtISO: photo.createdAtISO ?? place.createdAtISO,
                thumbDataURL: photo.thumbDataURL,
              })),
            }
          }),
      )
    },
  }
}

async function loadZipBundle(file: File): Promise<ImportBundle> {
  const zip = await JSZip.loadAsync(file)
  const jsonFile = zip.file('walktrace.json')
  if (!jsonFile) {
    throw new Error('ZIP内にwalktrace.jsonが見つかりません')
  }
  const jsonText = await jsonFile.async('string')
  const envelope = JSON.parse(jsonText) as ExportEnvelope
  return {
    envelope,
    async toPlaces(filterIds) {
      const idSet = filterIds ? new Set(filterIds) : null
      return Promise.all(
        envelope.places
          .filter((place) => (idSet ? idSet.has(place.id) : true))
          .map(async (place) => {
            const exportedPhotos = Array.isArray(place.photos) ? place.photos : []
            const legacyPath = (place as { photoPath?: string }).photoPath
            const legacyThumb = (place as { thumbDataURL?: string }).thumbDataURL
            const photosSource = exportedPhotos.length
              ? exportedPhotos
              : legacyPath || legacyThumb
              ? [{
                  id: `${place.id}-legacy`,
                  createdAtISO: place.createdAtISO,
                  photoPath: legacyPath,
                  thumbDataURL: legacyThumb,
                }]
              : []
            return {
              id: place.id,
              lat: place.lat,
              lng: place.lng,
              address: place.address,
              createdAtISO: place.createdAtISO,
              note: place.note ?? undefined,
              photos: await Promise.all(
                photosSource.map(async (photo) => {
                  let blob: Blob | undefined
                  if (photo.photoPath) {
                    const entry = zip.file(photo.photoPath)
                    if (entry) {
                      blob = await entry.async('blob')
                    }
                  }
                  if (!blob && photo.thumbDataURL) {
                    blob = dataUrlToBlob(photo.thumbDataURL)
                  }
                  return {
                    id: photo.id,
                    createdAtISO: photo.createdAtISO ?? place.createdAtISO,
                    blob,
                    thumbDataURL: photo.thumbDataURL,
                  }
                }),
              ),
            }
          }),
      )
    },
  }
}

function dataUrlToBlob(dataUrl: string): Blob | undefined {
  if (!dataUrl.startsWith('data:')) {
    return undefined
  }
  const [header, base64] = dataUrl.split(',')
  if (!base64) {
    return undefined
  }
  const mimeMatch = header.match(/data:(.*);base64/)
  const mime = mimeMatch?.[1] ?? 'application/octet-stream'
  const binary = typeof atob === 'function' ? atob(base64) : Buffer.from(base64, 'base64').toString('binary')
  const len = binary.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: mime })
}
