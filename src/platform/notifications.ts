import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { parseISO, subDays } from 'date-fns'

import type { AppSettings, FinanceData } from '../domain/types'

export type NotificationPermissionState =
  'unsupported' | 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied'

export interface NotificationSyncResult {
  supported: boolean
  permission: NotificationPermissionState
  scheduled: number
}

interface DatedNotification {
  key: string
  title: string
  body: string
  date: string
  route: string
}

function notificationId(key: string): number {
  let hash = 0
  for (let index = 0; index < key.length; index += 1) {
    hash = (Math.imul(hash, 31) + key.charCodeAt(index)) | 0
  }
  return hash & 0x7fffffff || 1
}

function scheduledTime(date: string, leadDays: number, quietHoursEnd: string): Date {
  const result = subDays(parseISO(date), leadDays)
  const [hour = 8, minute = 0] = quietHoursEnd.split(':').map(Number)
  result.setHours(hour, minute, 0, 0)
  return result
}

function collectNotifications(data: FinanceData): DatedNotification[] {
  const notifications: DatedNotification[] = []
  for (const loan of data.loans.filter((item) => item.active)) {
    notifications.push({
      key: `loan:${loan.id}:${loan.nextPaymentDate}`,
      title: `${loan.name} EMI due`,
      body: 'Open FinTrack to review the scheduled payment.',
      date: loan.nextPaymentDate,
      route: '/loans',
    })
  }
  for (const policy of data.insurancePolicies.filter((item) => item.active)) {
    notifications.push({
      key: `insurance:${policy.id}:${policy.nextPremiumDate}`,
      title: `${policy.policyName} premium due`,
      body: 'Open FinTrack to review the premium details.',
      date: policy.nextPremiumDate,
      route: '/insurance',
    })
    if (policy.renewalDate) {
      notifications.push({
        key: `insurance-renewal:${policy.id}:${policy.renewalDate}`,
        title: `${policy.policyName} renewal approaching`,
        body: 'Open FinTrack to review the recorded renewal date.',
        date: policy.renewalDate,
        route: '/insurance',
      })
    }
    if (policy.maturityDate) {
      notifications.push({
        key: `insurance-maturity:${policy.id}:${policy.maturityDate}`,
        title: `${policy.policyName} maturity approaching`,
        body: 'Open FinTrack to review the recorded maturity date.',
        date: policy.maturityDate,
        route: '/insurance',
      })
    }
  }
  for (const rule of data.recurringRules.filter((item) => item.active)) {
    notifications.push({
      key: `recurring:${rule.id}:${rule.nextDate}`,
      title: `${rule.name} due`,
      body: 'Open FinTrack to review this recurring item.',
      date: rule.nextDate,
      route: '/plan',
    })
  }
  return notifications
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
  if (owned.length > 0) {
    await LocalNotifications.cancel({
      notifications: owned.map((notification) => ({ id: notification.id })),
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
  const now = new Date()
  const notifications = collectNotifications(data)
    .map((item) => {
      const at = scheduledTime(
        item.date,
        settings.notificationLeadDays,
        settings.quietHoursEnd,
      )
      return {
        title: item.title,
        body: item.body,
        id: notificationId(item.key),
        channelId: 'finance-reminders',
        isExactNotification: false,
        schedule: { at },
        extra: { source: 'finapp', route: item.route, key: item.key },
      }
    })
    .filter((notification) => notification.schedule.at.getTime() > now.getTime())

  if (notifications.length > 0) {
    await LocalNotifications.schedule({ notifications })
  }
  return {
    supported: true,
    permission,
    scheduled: notifications.length,
  }
}
