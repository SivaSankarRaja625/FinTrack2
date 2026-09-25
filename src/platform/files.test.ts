import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  writeFile: vi.fn(),
  getUri: vi.fn(),
  share: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
}))
vi.mock('@capacitor/filesystem', () => ({
  Directory: { Cache: 'CACHE' },
  Filesystem: { writeFile: mocks.writeFile, getUri: mocks.getUri },
}))
vi.mock('@capacitor/share', () => ({
  Share: { share: mocks.share },
}))

import { downloadBytes, downloadText } from './files'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.writeFile.mockResolvedValue(undefined)
  mocks.getUri.mockResolvedValue({ uri: 'content://com.fintrack.app/export' })
  mocks.share.mockResolvedValue(undefined)
})

describe('Android exports', () => {
  it('writes exports to the app cache before opening the native share sheet', async () => {
    const result = await downloadText('date,amount', 'transactions.csv', 'text/csv')

    expect(result).toBe('shared')
    expect(mocks.writeFile).toHaveBeenCalledWith({
      path: 'exports/fintrack-export.csv',
      directory: 'CACHE',
      data: btoa('date,amount'),
      recursive: true,
    })
    expect(mocks.share).toHaveBeenCalledWith(
      expect.objectContaining({
        files: ['content://com.fintrack.app/export'],
      }),
    )
  })

  it('does not derive a cache path from an unsafe filename', async () => {
    await downloadBytes(
      new Uint8Array([1, 2, 3]),
      'policy.pdf/../../outside',
      'application/pdf',
    )

    expect(mocks.writeFile).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'exports/fintrack-export.bin' }),
    )
  })
})
