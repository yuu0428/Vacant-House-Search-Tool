import { create } from 'zustand'
import type { CurrentPosition } from '../types'

interface TrackingStore {
  currentPosition?: CurrentPosition
  heading?: number
  isTracking: boolean
  setCurrentPosition(position: CurrentPosition): void
  setHeading(heading?: number): void
  setTracking(isTracking: boolean): void
}

export const useTrackingStore = create<TrackingStore>((set) => ({
  currentPosition: undefined,
  heading: undefined,
  isTracking: false,
  setCurrentPosition: (position) => set({ currentPosition: position }),
  setHeading: (heading) => set({ heading }),
  setTracking: (isTracking) => set({ isTracking }),
}))
