import { describe, expect, it } from 'vitest'

import { calculateCashFlowForecast } from './calculations'
import { applyFinancialCommand } from './financial-events'
import type { InsurancePolicy, RecurringRule } from './types'
import { account, financeData, loan, timestamp, transaction } from '../test/fixtures'

const salary: RecurringRule = {
  id: 'salary',
  name: 'Salary',
  kind: 'income',
  amountPaise: 12_000_000,
  accountId: 'account-1',
  destinationAccountId: null,
  categoryId: null,
  frequency: 'monthly',
  startDate: '2026-09-30',
  nextDate: '2026-10-05',
  endDate: '2026-12-05',
  reminderDays: 3,
  active: true,
  createdAt: timestamp,
  updatedAt: timestamp,
}
const policy: InsurancePolicy = {
  id: 'policy',
  type: 'health',
  insurer: 'Example',
  policyName: 'Family health',
  policyNumber: '',
  sumAssuredPaise: 50_000_000,
  premiumPaise: 1_500_000,
  premiumFrequency: 'yearly',
  startDate: '2026-01-01',
  endDate: null,
  nextPremiumDate: '2026-10-04',
  renewalDate: null,
  maturityDate: null,
  nomineeName: '',
  nomineeRelation: '',
  contact: '',
  note: '',
  attachmentIds: [],
  active: true,
  createdAt: timestamp,
  updatedAt: timestamp,
}

describe('connected cash-flow forecast', () => {
  it('includes loan and premium obligations and ignores hypothetical prepayments and linked duplicate rules', () => {
    const data = financeData({
      accounts: [account({ openingBalancePaise: 30_500_000 })],
      recurringRules: [
        salary,
        {
          ...salary,
          id: 'emi',
          name: 'EMI',
          kind: 'expense',
          amountPaise: 2_500_000,
          nextDate: '2026-10-03',
          obligation: { kind: 'loan', id: 'loan-1' },
        },
      ],
      loans: [
        loan({
          outstandingPaise: 100_000_000,
          principalPaise: 100_000_000,
          nextPaymentDate: '2026-10-03',
          termMonths: 60,
          emiPaise: 2_500_000,
          prepaymentPaise: 100_000_000,
        }),
      ],
      insurancePolicies: [policy],
    })
    const result = calculateCashFlowForecast({
      ...data,
      startDate: '2026-09-30',
      endDate: '2026-12-29',
    })
    expect(result.endingBalancePaise).toBe(57_500_000)
    expect(
      result.events.filter((event) => event.name.includes('Home loan')),
    ).toHaveLength(3)
    expect(
      result.events.filter((event) => event.name.includes('Family health')),
    ).toHaveLength(1)
  })

  it('matches already posted payday entries without forecasting or posting them again', () => {
    let data = financeData({
      accounts: [account({ openingBalancePaise: 5_600_000 })],
      transactions: [
        transaction({
          id: 'salary-cash',
          kind: 'income',
          categoryId: null,
          amountPaise: 6_000_000,
          date: '2026-10-05',
        }),
        transaction({
          id: 'rent-cash',
          categoryId: null,
          amountPaise: 1_400_000,
          date: '2026-10-02',
        }),
      ],
      recurringRules: [
        { ...salary, amountPaise: 6_000_000 },
        {
          ...salary,
          id: 'rent',
          name: 'Rent',
          kind: 'expense',
          amountPaise: 1_400_000,
          nextDate: '2026-10-02',
          endDate: '2026-12-02',
        },
      ],
    })
    data = applyFinancialCommand(data, {
      id: 'match-salary',
      kind: 'recurring',
      sourceId: 'salary',
      occurrenceDate: '2026-10-05',
      date: '2026-10-05',
      timestamp,
      note: '',
      cash: {
        mode: 'match',
        transactionId: 'salary-cash',
        expected: data.transactions.find((item) => item.id === 'salary-cash')!,
      },
    })
    data = applyFinancialCommand(data, {
      id: 'match-rent',
      kind: 'recurring',
      sourceId: 'rent',
      occurrenceDate: '2026-10-02',
      date: '2026-10-02',
      timestamp,
      note: '',
      cash: {
        mode: 'match',
        transactionId: 'rent-cash',
        expected: data.transactions.find((item) => item.id === 'rent-cash')!,
      },
    })
    const result = calculateCashFlowForecast({
      ...data,
      startDate: '2026-10-05',
      endDate: '2027-01-03',
    })
    expect(data.transactions).toHaveLength(2)
    expect(result.openingBalancePaise).toBe(10_200_000)
    expect(result.endingBalancePaise).toBe(19_400_000)
    expect(result.events).toHaveLength(4)
  })
})
