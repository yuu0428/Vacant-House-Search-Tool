import { describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'

vi.mock('../db', () => ({
  exportDatabase: vi.fn(async () => ({
    places: [
      {
        id: 'p-1',
        lat: 35.0,
        lng: 135.0,
        address: 'テスト住所',
        createdAtISO: '2024-01-01T00:00:00.000Z',
        photoBlob: new Blob(['dummy'], { type: 'text/plain' }),
        thumbDataURL: 'data:image/png;base64,AAA',
        note: 'メモ',
      },
    ],
    routes: [],
    exportedAtISO: '2024-01-01T00:00:00.000Z',
    schemaVersion: 1,
  })),
  importDatabase: vi.fn(),
  clearDatabase: vi.fn(),
}))

import { createJsonExport, createZipExport } from '../export'

describe('エクスポートユーティリティ', () => {
  it('JSONエクスポートでバイナリを除外する', async () => {
    const { blob, filename } = await createJsonExport({ includeOriginals: false, includeThumbnails: false })
    expect(filename).toMatch(/walktrace-export/)
    const json = JSON.parse(await blob.text())
    expect(json.places[0].photoPath).toBeUndefined()
    expect(json.places[0].thumbDataURL).toBeUndefined()
  })

  it('ZIPエクスポートで原本を含める', async () => {
    const { blob } = await createZipExport({ includeOriginals: true, includeThumbnails: true })
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    const json = JSON.parse(await zip.file('walktrace.json')!.async('string'))
    expect(json.places[0].photoPath).toBeDefined()
    const files = Object.keys(zip.files)
    expect(files.some((name) => name.startsWith('media/'))).toBe(true)
    expect((zip.file(json.places[0].photoPath) ?? null)).not.toBeNull()
  })
})
