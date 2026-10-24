import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  listMessages: vi.fn(),
  platform: 'web' as 'web' | 'android',
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => mocks.platform,
    isNativePlatform: () => mocks.platform === 'android',
  },
  registerPlugin: () => ({
    checkPermissions: mocks.checkPermissions,
    requestPermissions: mocks.requestPermissions,
    listMessages: mocks.listMessages,
  }),
}))

import {
  fetchInboxSms,
  getSmsCapability,
  requestSmsPermission,
} from './sms'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.platform = 'web'
})

describe('src/platform/sms', () => {
  it('returns unavailable on web platform', async () => {
    mocks.platform = 'web'
    expect(getSmsCapability()).toEqual({ available: false, platform: 'web' })
    expect(await requestSmsPermission()).toBe(false)
    expect(await fetchInboxSms({ sinceMs: Date.now() - 86400000 })).toEqual([])
    expect(mocks.listMessages).not.toHaveBeenCalled()
  })

  it('delegates to native plugin when on android', async () => {
    mocks.platform = 'android'
    mocks.requestPermissions.mockResolvedValue({ sms: 'granted' })
    mocks.listMessages.mockResolvedValue({
      messages: [
        {
          id: '1',
          address: 'VM-HDFCBK',
          body: 'Spent INR 100 on Card xx1234',
          dateMs: 1729780000000,
        },
      ],
    })

    expect(getSmsCapability()).toEqual({ available: true, platform: 'android' })
    const granted = await requestSmsPermission()
    expect(granted).toBe(true)

    const messages = await fetchInboxSms({ sinceMs: 1729700000000 })
    expect(messages).toHaveLength(1)
    expect(messages[0].address).toBe('VM-HDFCBK')
    expect(mocks.listMessages).toHaveBeenCalledWith({
      sinceMs: 1729700000000,
      untilMs: undefined,
    })
  })
})
