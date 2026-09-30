import { describe, expect, it } from 'vitest'

import { collectDatedReminders } from './reminders'
import { nextDepositInterestDate, validateDepositTerms } from './deposit-schedule'
import type { Asset } from './types'
import { financeData, settings, timestamp } from '../test/fixtures'

const deposit: Asset = {
  id: 'fd',
  name: 'Retirement FD',
  kind: 'asset',
  type: 'fixed-deposit',
  valuePaise: 100_000,
  valuationDate: '2026-09-01',
  includeInNetWorth: true,
  note: '',
  createdAt: timestamp,
  updatedAt: timestamp,
  deposit: {
    principalPaise: 100_000,
    maturityDate: '2026-10-01',
    maturityAmountPaise: 100_000,
    maturityInstruction: 'renew',
    cashAccountId: 'bank',
    interestFrequency: 'monthly',
    interestPaise: 500,
    nextInterestDate: '2026-09-01',
    paidInterestDates: ['2026-09-01'],
    status: 'active',
  },
}

describe('deposit schedules and reminders', () => {
  it('reminds about the next unpaid interest date and renewal decision without claiming a principal payout', () => {
    expect(nextDepositInterestDate(deposit)).toBe('2026-10-01')
    const reminders = collectDatedReminders(
      financeData({ assets: [deposit] }),
      settings(),
    )
    expect(reminders.map((item) => [item.ruleType, item.date])).toEqual([
      ['deposit-due', '2026-10-01'],
      ['deposit-due', '2026-10-01'],
    ])
    expect(reminders[0]?.detail).toContain('renew')
  })
  it('honors disabled deposit alerts and stops reminders after maturity is recorded', () => {
    expect(
      collectDatedReminders(
        financeData({ assets: [deposit] }),
        settings({ disabledAlertRules: ['deposit-due'] }),
      ),
    ).toEqual([])
    expect(
      collectDatedReminders(
        financeData({
          assets: [
            {
              ...deposit,
              valuePaise: 0,
              deposit: { ...deposit.deposit!, status: 'matured' },
            },
          ],
        }),
        settings(),
      ),
    ).toEqual([])
  })
  it('rejects maturity proceeds that would double-count periodic interest', () => {
    expect(() =>
      validateDepositTerms({
        ...deposit,
        deposit: { ...deposit.deposit!, maturityAmountPaise: 101_000 },
      }),
    ).toThrow('principal only')
  })
})
