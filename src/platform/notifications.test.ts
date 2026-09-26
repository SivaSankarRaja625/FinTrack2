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
      scheduled: 2,
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
        expect.objectContaining({
          title: 'Rent due',
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

  it('schedules one combined insurance reminder entered after the first lead day', async () => {
    vi.setSystemTime(new Date(2026, 8, 24, 12, 0, 0))
    const date = '2026-09-25'
    const result = await syncLocalNotifications(
      financeData({
        insurancePolicies: [
          {
            id: 'health',
            type: 'health',
            insurer: 'Example',
            policyName: 'Health plan',
            policyNumber: '',
            sumAssuredPaise: 100_000,
            premiumPaise: 1_000,
            premiumFrequency: 'yearly',
            startDate: '2025-09-25',
            endDate: null,
            nextPremiumDate: date,
            renewalDate: date,
            maturityDate: null,
            nomineeName: '',
            nomineeRelation: '',
            contact: '',
            note: '',
            attachmentIds: [],
            active: true,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
      }),
      settings({ notificationsEnabled: true }),
      false,
    )
    expect(result.scheduled).toBe(2)
    const scheduled = mocks.schedule.mock.calls[0]![0].notifications as Array<{
      title: string
      schedule: { at: Date }
    }>
    expect(scheduled).toHaveLength(2)
    expect(
      scheduled.every((notification) => notification.title.includes('Health plan')),
    ).toBe(true)
    expect(scheduled.every((notification) => notification.schedule.at > new Date())).toBe(
      true,
    )
    expect(scheduled[0]?.title).toContain('renewal')
  })

  it('catches up a newly recorded due date once and honors dismissed reminders', async () => {
    vi.setSystemTime(new Date(2026, 8, 24, 12, 0, 0))
    const dueTomorrow = { ...recurringRule, nextDate: '2026-09-25' }
    const result = await syncLocalNotifications(
      financeData({ recurringRules: [dueTomorrow] }),
      settings({ notificationsEnabled: true }),
      false,
    )
    expect(result.scheduled).toBe(2)
    const scheduled = mocks.schedule.mock.calls[0]![0].notifications as Array<{
      schedule: { at: Date }
    }>
    expect(scheduled[0]?.schedule.at.getTime()).toBeGreaterThan(Date.now())

    mocks.schedule.mockClear()
    const dismissed = await syncLocalNotifications(
      financeData({ recurringRules: [dueTomorrow] }),
      settings({
        notificationsEnabled: true,
        dismissedAlertKeys: ['recurring:recurring-1:2026-09-25'],
      }),
      false,
    )
    expect(dismissed.scheduled).toBe(0)
    expect(mocks.schedule).not.toHaveBeenCalled()
  })

  it('defers missed-lead catch-up until quiet hours have ended', async () => {
    vi.setSystemTime(new Date(2026, 8, 24, 22, 0, 0))
    await syncLocalNotifications(
      financeData({
        recurringRules: [{ ...recurringRule, nextDate: '2026-09-25' }],
      }),
      settings({ notificationsEnabled: true }),
      false,
    )
    const items = mocks.schedule.mock.calls[0]![0].notifications as Array<{
      schedule: { at: Date }
    }>
    expect(items[0]?.schedule.at.getHours()).toBe(8)
    expect(items[0]?.schedule.at.getDate()).toBe(25)
  })

  it('resumes a snoozed reminder after its deadline without requiring the app to reopen', async () => {
    vi.setSystemTime(new Date(2026, 8, 24, 12, 0, 0))
    const dueTomorrow = { ...recurringRule, nextDate: '2026-09-25' }
    await syncLocalNotifications(
      financeData({ recurringRules: [dueTomorrow] }),
      settings({
        notificationsEnabled: true,
        snoozedAlerts: [
          {
            key: 'recurring:recurring-1:2026-09-25',
            until: new Date(2026, 8, 26, 10, 0).toISOString(),
          },
        ],
      }),
      false,
    )
    const items = mocks.schedule.mock.calls[0]![0].notifications as Array<{
      schedule: { at: Date }
    }>
    expect(items).toHaveLength(1)
    expect(items[0]?.schedule.at).toEqual(new Date(2026, 8, 26, 10, 1))
  })

  it('preserves a pending snooze when resync runs after its deadline but before delivery', async () => {
    const until = new Date(2026, 8, 26, 10, 0).toISOString()
    const key = 'recurring:recurring-1:2026-09-25'
    const data = financeData({
      recurringRules: [{ ...recurringRule, nextDate: '2026-09-25' }],
    })
    const userSettings = settings({
      notificationsEnabled: true,
      snoozedAlerts: [{ key, until }],
      notificationCatchUps: [key],
    })
    vi.setSystemTime(new Date(2026, 8, 24, 12, 0, 0))
    await syncLocalNotifications(data, userSettings, false)
    const queued = mocks.schedule.mock.calls[0]![0].notifications[0]
    mocks.getPending.mockResolvedValue({ notifications: [queued] })
    mocks.schedule.mockClear()
    vi.setSystemTime(new Date(2026, 8, 26, 10, 0, 30))

    const result = await syncLocalNotifications(data, userSettings, false)
    expect(result.scheduled).toBe(1)
    expect(mocks.cancel).not.toHaveBeenCalled()
    expect(mocks.schedule).not.toHaveBeenCalled()
  })

  it('replaces a pending snooze when its deadline is extended', async () => {
    const key = 'recurring:recurring-1:2026-09-25'
    const data = financeData({
      recurringRules: [{ ...recurringRule, nextDate: '2026-09-25' }],
    })
    const earlier = settings({
      notificationsEnabled: true,
      snoozedAlerts: [{ key, until: new Date(2026, 8, 26, 10, 0).toISOString() }],
      notificationCatchUps: [key],
    })
    vi.setSystemTime(new Date(2026, 8, 24, 12, 0, 0))
    await syncLocalNotifications(data, earlier, false)
    const queued = mocks.schedule.mock.calls[0]![0].notifications[0]
    mocks.getPending.mockResolvedValue({ notifications: [queued] })
    mocks.schedule.mockClear()
    const later = settings({
      ...earlier,
      snoozedAlerts: [{ key, until: new Date(2026, 8, 26, 12, 0).toISOString() }],
    })

    await syncLocalNotifications(data, later, false)
    expect(mocks.cancel).toHaveBeenCalledWith({
      notifications: [{ id: queued.id }],
    })
    expect(mocks.schedule.mock.calls[0]![0].notifications[0].schedule.at).toEqual(
      new Date(2026, 8, 26, 12, 1),
    )
  })

  it('keeps a queued catch-up across resync and does not replay it after delivery', async () => {
    vi.setSystemTime(new Date(2026, 8, 24, 12, 0, 0))
    const data = financeData({
      recurringRules: [{ ...recurringRule, nextDate: '2026-09-25' }],
    })
    await syncLocalNotifications(data, settings({ notificationsEnabled: true }), false)
    const first = mocks.schedule.mock.calls[0]![0].notifications as Array<{
      id: number
      extra: { source: string; key: string; stage: string }
    }>
    const catchUp = first.find((item) => item.extra.stage === 'catch-up')
    expect(catchUp).toBeDefined()
    const key = 'recurring:recurring-1:2026-09-25'

    mocks.schedule.mockClear()
    mocks.getPending.mockResolvedValueOnce({ notifications: [catchUp] })
    const queued = await syncLocalNotifications(
      data,
      settings({ notificationsEnabled: true, notificationCatchUps: [key] }),
      false,
    )
    expect(queued.scheduled).toBe(2)
    expect(mocks.cancel).not.toHaveBeenCalled()
    expect(
      (mocks.schedule.mock.calls[0]![0].notifications as Array<{ id: number }>).some(
        (item) => item.id === catchUp?.id,
      ),
    ).toBe(false)

    mocks.schedule.mockClear()
    const delivered = await syncLocalNotifications(
      data,
      settings({ notificationsEnabled: true, notificationCatchUps: [key] }),
      false,
    )
    expect(delivered.scheduled).toBe(1)
  })

  it('reports cancellation or scheduling failures instead of claiming an empty schedule', async () => {
    mocks.cancel.mockRejectedValueOnce(new Error('Android scheduler unavailable'))
    mocks.getPending.mockResolvedValueOnce({
      notifications: [{ id: 8, extra: { source: 'finapp' } }],
    })
    await expect(
      syncLocalNotifications(
        financeData(),
        settings({ notificationsEnabled: true }),
        false,
      ),
    ).rejects.toThrow('Android scheduler unavailable')
  })
})
