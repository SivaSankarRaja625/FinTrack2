import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'

import type { AppSettings, FinanceData } from '../domain/types'
import { collectDatedReminders, planScheduledReminders } from '../domain/reminders'

export type NotificationPermissionState =
  'unsupported' | 'unknown' | 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied'

export interface NotificationSyncResult {
  supported: boolean
  permission: NotificationPermissionState
  scheduled: number
  scheduledCatchUpKeys?: string[]
}

function notificationId(key: string): number {
  let hash = 0
  for (let index = 0; index < key.length; index += 1) {
    hash = (Math.imul(hash, 31) + key.charCodeAt(index)) | 0
  }
  return hash & 0x7fffffff || 1
}

export async function syncLocalNotifications(
  data: FinanceData,
  settings: AppSettings,
  requestPermission: boolean,
): Promise<NotificationSyncResult> {
  if (!Capacitor.isNativePlatform()) {
    return { supported: false, permission: 'unsupported', scheduled: 0 }
  }

  let status = await LocalNotifications.checkPermissions()
  if (requestPermission && status.display !== 'granted') {
    status = await LocalNotifications.requestPermissions()
  }
  const permission = status.display as NotificationPermissionState
  const pending = await LocalNotifications.getPending()
  const owned = pending.notifications.filter(
    (notification) => notification.extra?.source === 'finapp',
  )
  const now = new Date()
  const reminders = collectDatedReminders(data, settings)
  const activeKeys = new Set(reminders.map((reminder) => reminder.key))
  const preserved =
    settings.notificationsEnabled && permission === 'granted'
      ? owned.filter((notification) => {
          const key = String(notification.extra?.key)
          if (!activeKeys.has(key) || !settings.notificationCatchUps?.includes(key)) {
            return false
          }
          if (notification.extra?.stage === 'snoozed') {
            return settings.snoozedAlerts.some(
              (entry) =>
                entry.key === key && entry.until === notification.extra?.snoozedUntil,
            )
          }
          return (
            notification.extra?.stage === 'catch-up' &&
            !settings.snoozedAlerts.some(
              (entry) =>
                entry.key === key && new Date(entry.until).getTime() > now.getTime(),
            )
          )
        })
      : []
  const preservedIds = new Set(preserved.map((notification) => notification.id))
  const toCancel = owned.filter((notification) => !preservedIds.has(notification.id))
  if (toCancel.length > 0) {
    await LocalNotifications.cancel({
      notifications: toCancel.map((notification) => ({ id: notification.id })),
    })
  }
  if (!settings.notificationsEnabled || permission !== 'granted') {
    return { supported: true, permission, scheduled: 0 }
  }

  await LocalNotifications.createChannel({
    id: 'finance-reminders',
    name: 'Finance reminders',
    description: 'User-enabled reminders for locally recorded due dates',
    importance: 3,
    visibility: 0,
  })
  const planned = planScheduledReminders(
    reminders,
    now,
    settings.quietHoursStart,
    settings.quietHoursEnd,
  )
    .filter(
      (item) =>
        (item.stage !== 'catch-up' ||
          !settings.notificationCatchUps?.includes(item.key)) &&
        !preservedIds.has(notificationId(`${item.key}:${item.stage}`)),
    )
    .slice(0, Math.max(0, 64 - preserved.length))
  const notifications = planned.map((item) => {
    return {
      title: item.title,
      body: 'Open FinTrack to review the recorded due date.',
      id: notificationId(`${item.key}:${item.stage}`),
      channelId: 'finance-reminders',
      isExactNotification: false,
      schedule: { at: item.at },
      extra: {
        source: 'finapp',
        route: item.route,
        key: item.key,
        stage: item.stage,
        snoozedUntil: item.snoozedUntil ?? null,
      },
    }
  })

  if (notifications.length > 0) {
    await LocalNotifications.schedule({ notifications })
  }
  return {
    supported: true,
    permission,
    scheduled: notifications.length + preserved.length,
    ...(planned.some(
      (item) =>
        (item.stage === 'catch-up' || item.stage === 'snoozed') &&
        !settings.notificationCatchUps?.includes(item.key),
    )
      ? {
          scheduledCatchUpKeys: planned
            .filter(
              (item) =>
                (item.stage === 'catch-up' || item.stage === 'snoozed') &&
                !settings.notificationCatchUps?.includes(item.key),
            )
            .map((item) => item.key),
        }
      : {}),
  }
}
