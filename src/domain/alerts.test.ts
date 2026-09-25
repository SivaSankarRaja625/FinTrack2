import { describe, expect, it } from 'vitest'

import { financeData, settings, timestamp } from '../test/fixtures'
import { evaluateAlerts } from './alerts'

const now = new Date('2026-09-24T12:00:00.000Z')

describe('evaluateAlerts', () => {
  it('evaluates insurance renewal independently from the premium date', () => {
    const alerts = evaluateAlerts(
      financeData({
        insurancePolicies: [
          {
            id: 'policy',
            type: 'health',
            insurer: 'Insurer',
            policyName: 'Health cover',
            policyNumber: '1234',
            sumAssuredPaise: 5_000_000,
            premiumPaise: 20_000,
            premiumFrequency: 'yearly',
            startDate: '2026-01-01',
            endDate: null,
            nextPremiumDate: '2027-01-01',
            renewalDate: '2026-09-25',
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
      settings(),
      null,
      now,
    )

    expect(alerts.some((alert) => alert.key.startsWith('insurance-renewal:'))).toBe(true)
  })

  it('filters disabled and currently snoozed rules', () => {
    const alerts = evaluateAlerts(
      financeData(),
      settings({
        lastManualBackupAt: null,
        snoozedAlerts: [
          {
            key: 'backup:2026-09',
            until: '2026-09-25T12:00:00.000Z',
          },
        ],
      }),
      null,
      now,
    )
    expect(alerts.find((alert) => alert.ruleType === 'backup-due')).toBeUndefined()

    const disabled = evaluateAlerts(
      financeData(),
      settings({
        lastManualBackupAt: null,
        disabledAlertRules: ['backup-due'],
      }),
      null,
      now,
    )
    expect(disabled.find((alert) => alert.ruleType === 'backup-due')).toBeUndefined()
  })

  it('uses a linked account balance for goal contribution requirements', () => {
    const alerts = evaluateAlerts(
      financeData({
        accounts: [
          {
            id: 'goal-account',
            name: 'Goal savings',
            institution: '',
            type: 'savings',
            openingBalancePaise: 1_000_000,
            includeInNetWorth: true,
            archived: false,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
        goals: [
          {
            id: 'goal',
            name: 'Course',
            targetPaise: 1_000_000,
            currentPaise: 0,
            targetDate: '2027-09-24',
            priority: 'high',
            linkedAccountId: 'goal-account',
            plannedMonthlyPaise: 0,
            archived: false,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
      }),
      settings(),
      null,
      now,
    )

    expect(alerts.find((alert) => alert.ruleType === 'goal-contribution')).toBeUndefined()
  })

  it('explains a projected balance below the configured floor', () => {
    const alerts = evaluateAlerts(
      financeData({
        accounts: [
          {
            id: 'account',
            name: 'Current account',
            institution: '',
            type: 'current',
            openingBalancePaise: 200_000,
            includeInNetWorth: true,
            archived: false,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
        recurringRules: [
          {
            id: 'rent',
            name: 'Rent',
            kind: 'expense',
            amountPaise: 150_000,
            accountId: 'account',
            destinationAccountId: null,
            categoryId: null,
            frequency: 'monthly',
            startDate: '2026-09-25',
            nextDate: '2026-09-25',
            endDate: null,
            reminderDays: 3,
            active: true,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
      }),
      settings({ cashFlowFloorPaise: 100_000 }),
      null,
      now,
    )

    const alert = alerts.find((item) => item.ruleType === 'cash-flow-risk')
    expect(alert?.evidence).toContain('Configured floor')
    expect(alert?.dueDate).toBe('2026-09-25')
  })
})
