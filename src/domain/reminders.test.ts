import { describe, expect, it } from 'vitest'

import { collectDatedReminders } from './reminders'
import { createDefaultSettings, emptyFinanceData } from './defaults'

describe('SMS expense daily reminder', () => {
  it('includes daily SMS expense reminder when enabled', () => {
    const data = emptyFinanceData()
    const settings = {
      ...createDefaultSettings(),
      smsExpenseReminderEnabled: true,
      smsExpenseReminderTime: '21:00',
    }

    const reminders = collectDatedReminders(data, settings)
    const smsReminder = reminders.find((r) => r.key.startsWith('sms-expense-reminder:'))

    expect(smsReminder).toBeDefined()
    expect(smsReminder?.route).toBe('/transactions?action=scan-sms')
    expect(smsReminder?.ruleType).toBe('recurring-due')
    expect(smsReminder?.title).toContain('expenses')
  })

  it('excludes daily SMS expense reminder when explicitly disabled', () => {
    const data = emptyFinanceData()
    const settings = {
      ...createDefaultSettings(),
      smsExpenseReminderEnabled: false,
    }

    const reminders = collectDatedReminders(data, settings)
    const smsReminder = reminders.find((r) => r.key.startsWith('sms-expense-reminder:'))

    expect(smsReminder).toBeUndefined()
  })
})
