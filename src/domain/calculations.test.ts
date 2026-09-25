import { describe, expect, it } from 'vitest'

import { account, loan, timestamp, transaction } from '../test/fixtures'
import {
  calculateAccountBalances,
  calculateBudgetStatuses,
  calculateCashFlowForecast,
  calculateEmiPaise,
  calculateLoanSchedule,
  calculateMonthlySummary,
  calculateNetWorth,
  requiredMonthlyForGoal,
} from './calculations'
import type { Asset, Budget, Category, Goal, InvestmentHolding } from './types'

describe('finance calculations', () => {
  it('posts transfers once on each side without treating them as income', () => {
    const accounts = [
      account({ id: 'source', openingBalancePaise: 100_000 }),
      account({ id: 'destination', openingBalancePaise: 50_000 }),
    ]
    const transfer = transaction({
      kind: 'transfer',
      accountId: 'source',
      destinationAccountId: 'destination',
      amountPaise: 20_000,
    })

    const balances = calculateAccountBalances(accounts, [transfer])
    expect(balances.get('source')).toBe(80_000)
    expect(balances.get('destination')).toBe(70_000)
    expect(
      calculateMonthlySummary([transfer], [], {
        start: '2026-09-01',
        end: '2026-09-30',
      }),
    ).toMatchObject({ incomePaise: 0, expensePaise: 0, netPaise: 0 })
  })

  it('reconciles category budgets including split transactions', () => {
    const budget: Budget = {
      id: 'budget',
      name: 'Food',
      categoryId: 'food',
      monthlyLimitPaise: 50_000,
      rollover: false,
      active: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    const expense = transaction({
      amountPaise: 30_000,
      categoryId: null,
      splits: [
        { id: 'split-1', categoryId: 'food', amountPaise: 25_000 },
        { id: 'split-2', categoryId: 'travel', amountPaise: 5_000 },
      ],
    })

    expect(
      calculateBudgetStatuses([budget], [expense], {
        start: '2026-09-01',
        end: '2026-09-30',
      })[0],
    ).toMatchObject({
      spentPaise: 25_000,
      remainingPaise: 25_000,
      usedPercent: 50,
    })
  })

  it('rolls unused allowance from the previous month when enabled', () => {
    const budget: Budget = {
      id: 'budget',
      name: 'Food',
      categoryId: 'food',
      monthlyLimitPaise: 50_000,
      rollover: true,
      active: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    const statuses = calculateBudgetStatuses(
      [budget],
      [
        transaction({
          id: 'previous',
          date: '2026-08-10',
          categoryId: 'food',
          amountPaise: 20_000,
        }),
        transaction({
          id: 'current',
          date: '2026-09-10',
          categoryId: 'food',
          amountPaise: 40_000,
        }),
      ],
      { start: '2026-09-01', end: '2026-09-30' },
    )
    expect(statuses[0]).toMatchObject({
      rolloverPaise: 30_000,
      effectiveLimitPaise: 80_000,
      spentPaise: 40_000,
      remainingPaise: 40_000,
      usedPercent: 50,
    })
  })

  it('separates essential and discretionary expense', () => {
    const categories: Category[] = [
      {
        id: 'essential',
        name: 'Housing',
        kind: 'expense',
        parentId: null,
        essential: true,
        color: '#000000',
        system: false,
        archived: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ]
    expect(
      calculateMonthlySummary(
        [
          transaction({
            categoryId: 'essential',
            amountPaise: 40_000,
          }),
          transaction({
            id: 'income',
            kind: 'income',
            categoryId: null,
            amountPaise: 100_000,
          }),
        ],
        categories,
        { start: '2026-09-01', end: '2026-09-30' },
      ),
    ).toEqual({
      incomePaise: 100_000,
      expensePaise: 40_000,
      netPaise: 60_000,
      essentialExpensePaise: 40_000,
      discretionaryExpensePaise: 0,
    })
  })

  it('avoids double counting linked investment and loan accounts', () => {
    const investmentAccount = account({
      id: 'investment-account',
      type: 'investment',
      openingBalancePaise: 500_000,
    })
    const loanAccount = account({
      id: 'loan-account',
      type: 'loan',
      openingBalancePaise: -1_000_000,
    })
    const holding: InvestmentHolding = {
      id: 'holding',
      accountId: investmentAccount.id,
      name: 'Index fund',
      symbol: '',
      type: 'mutual-fund',
      units: '10',
      averageCostPaise: 40_000,
      currentPricePaise: 50_000,
      priceDate: '2026-09-01',
      investedPaise: 400_000,
      activities: [],
      priceHistory: [],
      includeInNetWorth: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    const property: Asset = {
      id: 'property',
      name: 'Home',
      kind: 'asset',
      type: 'property',
      valuePaise: 5_000_000,
      valuationDate: '2026-09-01',
      includeInNetWorth: true,
      note: '',
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    expect(
      calculateNetWorth({
        accounts: [investmentAccount, loanAccount],
        transactions: [],
        assets: [property],
        loans: [loan({ accountId: loanAccount.id, outstandingPaise: 1_000_000 })],
        investments: [holding],
      }),
    ).toEqual({
      cashPaise: 0,
      investmentPaise: 500_000,
      assetPaise: 5_000_000,
      debtPaise: 1_000_000,
      totalPaise: 4_500_000,
    })
  })

  it('builds a reducing-balance amortization schedule', () => {
    expect(calculateEmiPaise(10_000_000, 800, 120)).toBeGreaterThan(120_000)
    const schedule = calculateLoanSchedule(loan())
    expect(schedule).toHaveLength(120)
    expect(schedule[0]?.interestPaise).toBe(66_667)
    expect(schedule.at(-1)?.closingPaise).toBe(0)
  })

  it('applies an interest-rate change from its effective date', () => {
    const schedule = calculateLoanSchedule(
      loan({
        rateChanges: [
          {
            id: 'rate-change',
            effectiveDate: '2026-10-05',
            annualInterestRateBps: 1_200,
          },
        ],
      }),
    )
    expect(schedule[0]?.interestPaise).toBe(100_000)
  })

  it('calculates the required goal contribution conservatively', () => {
    const goal: Goal = {
      id: 'goal',
      name: 'Emergency fund',
      targetPaise: 1_200_000,
      currentPaise: 200_000,
      targetDate: '2027-09-24',
      priority: 'high',
      linkedAccountId: null,
      plannedMonthlyPaise: 0,
      archived: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    expect(requiredMonthlyForGoal(goal, new Date('2026-09-24T00:00:00Z'))).toBe(83_334)
  })

  it('projects recurring liquid cash flow without double counting transfers', () => {
    const forecast = calculateCashFlowForecast({
      accounts: [
        account({ id: 'bank', openingBalancePaise: 100_000 }),
        account({
          id: 'investment',
          type: 'investment',
          openingBalancePaise: 0,
        }),
      ],
      transactions: [],
      recurringRules: [
        {
          id: 'salary',
          name: 'Salary',
          kind: 'income',
          amountPaise: 50_000,
          accountId: 'bank',
          destinationAccountId: null,
          categoryId: null,
          frequency: 'monthly',
          startDate: '2026-09-01',
          nextDate: '2026-10-01',
          endDate: null,
          reminderDays: 1,
          active: true,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        {
          id: 'sip',
          name: 'Investment transfer',
          kind: 'transfer',
          amountPaise: 20_000,
          accountId: 'bank',
          destinationAccountId: 'investment',
          categoryId: null,
          frequency: 'monthly',
          startDate: '2026-09-01',
          nextDate: '2026-10-05',
          endDate: null,
          reminderDays: 1,
          active: true,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      startDate: '2026-09-24',
      endDate: '2026-10-31',
    })
    expect(forecast.openingBalancePaise).toBe(100_000)
    expect(forecast.events).toHaveLength(2)
    expect(forecast.endingBalancePaise).toBe(130_000)
  })
})
