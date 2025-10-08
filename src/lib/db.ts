import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { ExportPayload, Place, RouteBucket, RoutePoint } from '../types'

const DB_NAME = 'walktrace-db'
const DB_VERSION = 1

interface WalkTraceDB extends DBSchema {
  places: {
    key: string
    value: Place
    indexes: { byCreatedAt: string }
  }
  routeBuckets: {
    key: string
    value: RouteBucket
  }
  meta: {
    key: string
    value: { schemaVersion: number; updatedAtISO: string }
  }
}

let dbPromise: Promise<IDBPDatabase<WalkTraceDB>> | null = null

async function getDB(): Promise<IDBPDatabase<WalkTraceDB>> {
  if (!dbPromise) {
    dbPromise = openDB<WalkTraceDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('places')) {
          const store = db.createObjectStore('places', { keyPath: 'id' })
          store.createIndex('byCreatedAt', 'createdAtISO')
        }
        if (!db.objectStoreNames.contains('routeBuckets')) {
          db.createObjectStore('routeBuckets', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta')
        }
      },
    })
  }
  return dbPromise
}

export async function getAllPlaces(): Promise<Place[]> {
  const db = await getDB()
  const tx = db.transaction('places', 'readonly')
  const store = tx.objectStore('places')
  const places = await store.getAll()
  await tx.done
  return places.sort((a, b) => (a.createdAtISO < b.createdAtISO ? 1 : -1))
}

export async function putPlace(place: Place): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(['places', 'meta'], 'readwrite')
  await tx.objectStore('places').put(place)
  await tx
    .objectStore('meta')
    .put({ schemaVersion: DB_VERSION, updatedAtISO: new Date().toISOString() }, 'places-meta')
  await tx.done
}

export async function deletePlace(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('places', id)
}

export async function getRouteBucket(date: string): Promise<RouteBucket | undefined> {
  const db = await getDB()
  return db.get('routeBuckets', date)
}

export async function putRouteBucket(bucket: RouteBucket): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(['routeBuckets', 'meta'], 'readwrite')
  await tx.objectStore('routeBuckets').put(bucket)
  await tx
    .objectStore('meta')
    .put({ schemaVersion: DB_VERSION, updatedAtISO: new Date().toISOString() }, 'routes-meta')
  await tx.done
}

export async function appendRoutePoint(date: string, point: RoutePoint): Promise<RouteBucket> {
  const existing = (await getRouteBucket(date)) ?? { id: date, date, points: [] }
  existing.points = [...existing.points, point]
  await putRouteBucket(existing)
  return existing
}

export async function listRouteBuckets(): Promise<RouteBucket[]> {
  const db = await getDB()
  const buckets = await db.getAll('routeBuckets')
  return buckets.sort((a, b) => (a.date < b.date ? 1 : -1))
}

export async function clearDatabase(): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(['places', 'routeBuckets', 'meta'], 'readwrite')
  await Promise.all([
    tx.objectStore('places').clear(),
    tx.objectStore('routeBuckets').clear(),
    tx.objectStore('meta').clear(),
  ])
  await tx.done
}

export async function exportDatabase(): Promise<ExportPayload> {
  const [places, routes] = await Promise.all([getAllPlaces(), listRouteBuckets()])
  return {
    places,
    routes,
    exportedAtISO: new Date().toISOString(),
    schemaVersion: DB_VERSION,
  }
}

export async function importDatabase(payload: ExportPayload): Promise<void> {
  if (payload.schemaVersion > DB_VERSION) {
    throw new Error('未対応のスキーマです')
  }
  const db = await getDB()
  const tx = db.transaction(['places', 'routeBuckets', 'meta'], 'readwrite')
  await Promise.all([
    tx.objectStore('places').clear(),
    tx.objectStore('routeBuckets').clear(),
  ])
  for (const place of payload.places) {
    await tx.objectStore('places').put(place)
  }
  for (const route of payload.routes) {
    await tx.objectStore('routeBuckets').put(route)
  }
  await tx
    .objectStore('meta')
    .put({ schemaVersion: DB_VERSION, updatedAtISO: new Date().toISOString() }, 'import-meta')
  await tx.done
}
