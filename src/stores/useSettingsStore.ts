import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SettingsState } from '../types'
import { hasFirebaseConfig } from '../lib/firebase'

interface SettingsStore extends SettingsState {
  setAccuracyMode(mode: SettingsState['accuracyMode']): void
  setDistanceThreshold(value: number): void
  setTimeThreshold(value: number): void
  setIncludeOriginalOnExport(value: boolean): void
  setIncludeThumbsOnExport(value: boolean): void
  setFirebaseSyncEnabled(value: boolean): void
  reset(): void
}

const defaultState: SettingsState = {
  accuracyMode: 'balanced',
  distanceThresholdMeters: 8,
  timeThresholdSeconds: 5000,
  includeOriginalOnExport: false,
  includeThumbnailsOnExport: true,
  firebaseSyncEnabled: false,
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      ...defaultState,
      setAccuracyMode: (mode) => set({ accuracyMode: mode }),
      setDistanceThreshold: (value) => set({ distanceThresholdMeters: value }),
      setTimeThreshold: (value) => set({ timeThresholdSeconds: value }),
      setIncludeOriginalOnExport: (value) => set({ includeOriginalOnExport: value }),
      setIncludeThumbsOnExport: (value) => set({ includeThumbnailsOnExport: value }),
      setFirebaseSyncEnabled: (value) => {
        if (!hasFirebaseConfig()) {
          set({ firebaseSyncEnabled: false })
          return
        }
        set({ firebaseSyncEnabled: value })
      },
      reset: () => set({ ...defaultState }),
    }),
    {
      name: 'walktrace:settings',
      version: 1,
    },
  ),
)
