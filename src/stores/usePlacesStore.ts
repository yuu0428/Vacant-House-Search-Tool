import { create } from 'zustand'
import type { Place } from '../types'
import { deletePlace, getAllPlaces, putPlace } from '../lib/db'
import { getFirebaseServices, hasFirebaseConfig } from '../lib/firebase'
import { useSettingsStore } from './useSettingsStore'

interface PlacesStore {
  places: Place[]
  initialized: boolean
  load(): Promise<void>
  addPlace(place: Place): Promise<void>
  updatePlace(id: string, updater: (prev: Place) => Place): Promise<void>
  removePlace(id: string): Promise<void>
}

export const usePlacesStore = create<PlacesStore>((set, get) => ({
  places: [],
  initialized: false,
  async load() {
    const places = await getAllPlaces()
    set({ places, initialized: true })
  },
  async addPlace(place) {
    await putPlace(place)
    set((state) => ({ places: [place, ...state.places] }))
    await maybeSyncPlace(place)
  },
  async updatePlace(id, updater) {
    const nextPlaces = get().places.map((item) => (item.id === id ? updater(item) : item))
    const updated = nextPlaces.find((item) => item.id === id)
    if (!updated) {
      return
    }
    await putPlace(updated)
    set({ places: nextPlaces })
    await maybeSyncPlace(updated)
  },
  async removePlace(id) {
    await deletePlace(id)
    set((state) => ({ places: state.places.filter((item) => item.id !== id) }))
    await maybeRemoveRemote(id)
  },
}))

async function maybeSyncPlace(place: Place): Promise<void> {
  const settings = useSettingsStore.getState()
  if (!settings.firebaseSyncEnabled || !hasFirebaseConfig()) {
    return
  }
  const services = await getFirebaseServices()
  await services?.syncPlace(place)
}

async function maybeRemoveRemote(id: string): Promise<void> {
  const settings = useSettingsStore.getState()
  if (!settings.firebaseSyncEnabled || !hasFirebaseConfig()) {
    return
  }
  const services = await getFirebaseServices()
  await services?.removePlace(id)
}
