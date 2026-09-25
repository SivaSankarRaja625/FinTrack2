import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { RecurringRule } from '../domain/types'
import { financeData, settings, timestamp } from '../test/fixtures'

const mocks = vi.hoisted(() => ({
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  getPending: vi.fn(),
  cancel: vi.fn(),
  createChannel: vi.fn(),
  schedule: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
}))
vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: mocks,
}))

import { syncLocalNotifications } from './notifications'

const recurringRule: RecurringRule = {
  id: 'recurring-1',
  name: 'Rent',
  kind: 'expense',
  amountPaise: 25_000_00,
  accountId: 'account-1',
  destinationAccountId: null,
  categoryId: null,
  frequency: 'monthly',
  startDate: '2026-09-01',
  nextDate: '2026-10-01',
  endDate: null,
  reminderDays: 3,
  active: true,
  createdAt: timestamp,
  updatedAt: timestamp,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-24T00:00:00.000Z'))
  mocks.checkPermissions.mockResolvedValue({ display: 'granted' })
  mocks.requestPermissions.mockResolvedValue({ display: 'granted' })
  mocks.getPending.mockResolvedValue({ notifications: [] })
  mocks.cancel.mockResolvedValue(undefined)
  mocks.createChannel.mockResolvedValue(undefined)
  mocks.schedule.mockResolvedValue(undefined)
})

describe('Android local notifications', () => {
  it('schedules finance reminders as inexact alarms', async () => {
    const result = await syncLocalNotifications(
      financeData({ recurringRules: [recurringRule] }),
      settings({ notificationsEnabled: true }),
      false,
    )

    expect(result).toEqual({
      supported: true,
      permission: 'granted',
      scheduled: 1,
    })
    expect(mocks.schedule).toHaveBeenCalledWith({
      notifications: [
        expect.objectContaining({
          title: 'Rent due',
          channelId: 'finance-reminders',
          isExactNotification: false,
          extra: expect.objectContaining({
            source: 'finapp',
            route: '/plan',
          }),
        }),
      ],
    })
  })

  it('does not schedule reminders without display permission', async () => {
    mocks.checkPermissions.mockResolvedValue({ display: 'denied' })

    const result = await syncLocalNotifications(
      financeData({ recurringRules: [recurringRule] }),
      settings({ notificationsEnabled: true }),
      false,
    )

    expect(result.scheduled).toBe(0)
    expect(mocks.createChannel).not.toHaveBeenCalled()
    expect(mocks.schedule).not.toHaveBeenCalled()
  })
})
