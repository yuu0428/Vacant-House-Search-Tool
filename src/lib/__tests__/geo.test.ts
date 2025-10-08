import { describe, expect, it } from 'vitest'
import { formatDistance, haversineDistanceMeters, shouldStorePoint } from '../geo'

describe('geoユーティリティ', () => {
  it('ハバーサイン距離を計算できる', () => {
    const tokyo = { lat: 35.681236, lng: 139.767125 }
    const osaka = { lat: 34.702485, lng: 135.495951 }
    const distance = haversineDistanceMeters(tokyo, osaka)
    expect(Math.round(distance / 1000)).toBe(403)
  })

  it('距離表示を整形する', () => {
    expect(formatDistance(85)).toBe('約85m')
    expect(formatDistance(1280)).toBe('約1.3km')
  })

  it('しきい値でサンプリング判定を行う', () => {
    const previous = { lat: 35, lng: 135, timestamp: 0 }
    const nextClose = { lat: 35.00001, lng: 135.00001, timestamp: 1000 }
    expect(
      shouldStorePoint({
        previous,
        next: nextClose,
        minDistanceMeters: 5,
        minIntervalMs: 5000,
      }),
    ).toBe(false)

    const nextFar = { lat: 35.001, lng: 135.001, timestamp: 2000 }
    expect(
      shouldStorePoint({
        previous,
        next: nextFar,
        minDistanceMeters: 5,
        minIntervalMs: 5000,
      }),
    ).toBe(true)
  })
})
