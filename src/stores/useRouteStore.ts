import { create } from 'zustand'
import { appendRoutePoint, listRouteBuckets, putRouteBucket } from '../lib/db'
import { getFirebaseServices, hasFirebaseConfig } from '../lib/firebase'
import type { RouteBucket, RoutePoint } from '../types'
import { useSettingsStore } from './useSettingsStore'

interface RouteStore {
  buckets: Record<string, RouteBucket>
  load(): Promise<void>
  appendPoint(date: string, point: RoutePoint): Promise<void>
  replaceBucket(bucket: RouteBucket): Promise<void>
}

export const useRouteStore = create<RouteStore>((set) => ({
  buckets: {},
  async load() {
    const list = await listRouteBuckets()
    const map: Record<string, RouteBucket> = {}
    list.forEach((bucket) => {
      map[bucket.id] = bucket
    })
    set({ buckets: map })
  },
  async appendPoint(date, point) {
    const updated = await appendRoutePoint(date, point)
    set((state) => ({ buckets: { ...state.buckets, [updated.id]: updated } }))
    await maybeSyncRoutes()
  },
  async replaceBucket(bucket) {
    await putRouteBucket(bucket)
    set((state) => ({ buckets: { ...state.buckets, [bucket.id]: bucket } }))
    await maybeSyncRoutes()
  },
}))

async function maybeSyncRoutes(): Promise<void> {
  const settings = useSettingsStore.getState()
  if (!settings.firebaseSyncEnabled || !hasFirebaseConfig()) {
    return
  }
  const services = await getFirebaseServices()
  const buckets = Object.values(useRouteStore.getState().buckets)
  await services?.syncRoutes(buckets)
}
