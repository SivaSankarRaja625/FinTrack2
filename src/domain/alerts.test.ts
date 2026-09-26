import { describe, expect, it } from 'vitest'

import { account, financeData, profile, settings, timestamp } from '../test/fixtures'
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

  it('stops prompting for a paid premium while keeping unconfirmed renewal visible', () => {
    const policy = {
      id: 'health',
      type: 'health' as const,
      insurer: 'Example',
      policyName: 'Family health',
      policyNumber: '1234',
      sumAssuredPaise: 5_000_000,
      premiumPaise: 20_000,
      premiumFrequency: 'yearly' as const,
      startDate: '2025-09-25',
      endDate: null,
      nextPremiumDate: '2026-09-25',
      renewalDate: '2026-09-25',
      maturityDate: null,
      nomineeName: '',
      nomineeRelation: '',
      contact: '',
      note: '',
      attachmentIds: [],
      active: true,
      coverage: {
        source: 'personal' as const,
        insuredPeople: ['Ananya'],
        layer: 'base' as const,
        deductiblePaise: 0,
        coPayPercent: null,
        restrictions: '',
        claimContact: '',
        premiumPaidForDate: '2026-09-25',
        renewalConfirmedForDate: null,
        reminderDays: [30, 7, 1, 0],
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    const result = evaluateAlerts(
      financeData({ insurancePolicies: [policy] }),
      settings(),
      null,
      now,
    )
    expect(result.some((alert) => alert.title.includes('premium'))).toBe(false)
    expect(result.some((alert) => alert.title.includes('renewal'))).toBe(true)
    const confirmed = evaluateAlerts(
      financeData({
        insurancePolicies: [
          {
            ...policy,
            coverage: {
              ...policy.coverage,
              renewalConfirmedForDate: '2026-09-25',
            },
          },
        ],
      }),
      settings(),
      null,
      now,
    )
    expect(confirmed.some((alert) => alert.ruleType === 'insurance-due')).toBe(false)
  })

  it('alerts on the manually entered card statement rather than a cycle day', () => {
    const result = evaluateAlerts(
      financeData({
        accounts: [
          {
            ...account({
              type: 'credit-card',
              openingBalancePaise: -10_000,
              creditCardDetails: {
                lastFour: '0042',
                creditLimitPaise: null,
                statementDay: 2,
                paymentDueDay: 12,
                statement: {
                  date: '2026-09-01',
                  dueDate: '2026-09-25',
                  totalPaise: 10_000,
                  minimumPaise: 1_000,
                  paidPaise: 2_000,
                },
              },
            }),
            id: 'card',
            name: 'Work card',
          },
        ],
      }),
      settings(),
      null,
      now,
    )
    const card = result.find((alert) => alert.ruleType === 'card-statement-due')
    expect(card?.title).toContain('Work card')
    expect(card?.detail).toContain('₹80')
  })

  it('reports only designated emergency cash net of overdrafts', () => {
    const result = evaluateAlerts(
      financeData({
        accounts: [
          account({
            id: 'reserve',
            openingBalancePaise: 4_000_000,
            emergencyReserve: true,
          }),
          account({
            id: 'overdraft',
            type: 'current',
            openingBalancePaise: -2_000_000,
          }),
        ],
      }),
      settings(),
      profile({ essentialMonthlyPaise: 3_000_000, emergencyFundMonths: 1 }),
      now,
    )
    const emergency = result.find((alert) => alert.ruleType === 'emergency-fund')
    expect(emergency?.evidence).toContain('₹20,000')
    expect(emergency?.route).toBe('/resilience')
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

  it('does not treat export generation or verification of an old file as a fresh backup', () => {
    const result = evaluateAlerts(
      financeData(),
      settings({
        lastManualBackupAt: '2026-09-24T11:00:00.000Z',
        verifiedBackup: {
          createdAt: '2025-08-01T12:00:00.000Z',
          verifiedAt: '2026-09-24T11:00:00.000Z',
          recordCount: 2,
          attachmentCount: 0,
        },
      }),
      null,
      now,
    )
    expect(result.some((alert) => alert.ruleType === 'backup-due')).toBe(true)
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
