import JSZip from 'jszip'
import { clearDatabase, exportDatabase, importDatabase } from './db'
import type { Place } from '../types'

interface ExportedPlace extends Omit<Place, 'photoBlob'> {
  photoPath?: string
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
  const places: ExportedPlace[] = payload.places.map((place, index) => {
    const { photoBlob, thumbDataURL, ...rest } = place
    return {
      ...rest,
      thumbDataURL: options.includeThumbnails ? thumbDataURL : undefined,
      photoPath: options.includeOriginals && photoBlob ? `media/${rest.id || index}.jpg` : undefined,
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
    routes: [],
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
    payload.places.map(async (place, index) => {
      if (!options.includeOriginals || !place.photoBlob) {
        return
      }
      const path = envelope.places[index]?.photoPath
      if (!path) {
        return
      }
      const arrayBuffer = await place.photoBlob.arrayBuffer()
      zip.file(path, arrayBuffer)
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
            const dataURLBlob = place.thumbDataURL ? dataUrlToBlob(place.thumbDataURL) : undefined
            return {
              id: place.id,
              lat: place.lat,
              lng: place.lng,
              address: place.address,
              createdAtISO: place.createdAtISO,
              note: place.note ?? undefined,
              thumbDataURL: place.thumbDataURL,
              photoBlob: dataURLBlob,
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
  const photoMap = new Map<string, string>()
  envelope.places.forEach((place) => {
    if (place.photoPath) {
      photoMap.set(place.id, place.photoPath)
    }
  })
  return {
    envelope,
    async toPlaces(filterIds) {
      const idSet = filterIds ? new Set(filterIds) : null
      return Promise.all(
        envelope.places
          .filter((place) => (idSet ? idSet.has(place.id) : true))
          .map(async (place) => {
            const { photoPath, ...rest } = place
            let photoBlob: Blob | undefined
            if (photoPath) {
              const entry = zip.file(photoPath)
              if (entry) {
                photoBlob = await entry.async('blob')
              }
            }
            if (!photoBlob && place.thumbDataURL) {
              photoBlob = dataUrlToBlob(place.thumbDataURL)
            }
            return {
              ...rest,
              note: place.note ?? undefined,
              photoBlob,
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
