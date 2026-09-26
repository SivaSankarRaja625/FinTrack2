import { describe, expect, it } from 'vitest'

import { account, financeData, profile, timestamp } from '../test/fixtures'
import {
  calculateEmergencyReserve,
  calculateShockScenario,
  estimateEssentialMonthlySpend,
} from './resilience'

const asOf = new Date('2026-09-24T12:00:00.000Z')

describe('available emergency reserves', () => {
  it('nets overdrafts and excludes goal-linked savings and stale or locked holdings', () => {
    const data = financeData({
      accounts: [
        account({ id: 'cash', openingBalancePaise: 4_000_000, emergencyReserve: true }),
        account({ id: 'trip', openingBalancePaise: 2_000_000, emergencyReserve: true }),
        account({
          id: 'overdrawn',
          type: 'current',
          openingBalancePaise: -500_000,
        }),
      ],
      goals: [
        {
          id: 'trip-goal',
          name: 'Holiday',
          targetPaise: 2_000_000,
          currentPaise: 0,
          targetDate: '2027-01-01',
          priority: 'medium',
          linkedAccountId: 'trip',
          plannedMonthlyPaise: 0,
          archived: false,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      investments: [
        {
          id: 'liquid',
          accountId: null,
          name: 'Chosen liquid fund',
          symbol: '',
          type: 'mutual-fund',
          units: '300',
          averageCostPaise: 10_000,
          currentPricePaise: 10_000,
          priceDate: '2026-09-23',
          investedPaise: 3_000_000,
          activities: [],
          priceHistory: [],
          includeInNetWorth: true,
          reserveAccess: {
            instrument: 'liquid-fund',
            accessDays: 2,
            lockedUntil: null,
          },
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        {
          id: 'stale',
          accountId: null,
          name: 'Stale value',
          symbol: '',
          type: 'mutual-fund',
          units: '100',
          averageCostPaise: 10_000,
          currentPricePaise: 10_000,
          priceDate: '2026-07-01',
          investedPaise: 1_000_000,
          activities: [],
          priceHistory: [],
          includeInNetWorth: true,
          reserveAccess: {
            instrument: 'overnight-fund',
            accessDays: 1,
            lockedUntil: null,
          },
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
    })
    const reserve = calculateEmergencyReserve(data, profile(), asOf)
    expect(reserve.immediatePaise).toBe(3_500_000)
    expect(reserve.secondaryPaise).toBe(3_000_000)
    expect(reserve.targetPaise).toBe(18_000_000)
    expect(reserve.exclusions).toEqual(
      expect.arrayContaining(['Holiday: linked goal', 'Stale value: price is stale']),
    )
  })

  it('does not silently claim that all untagged cash is a reserve', () => {
    const reserve = calculateEmergencyReserve(
      financeData({ accounts: [account({ openingBalancePaise: 50_000_00 })] }),
      profile(),
      asOf,
    )
    expect(reserve.immediatePaise).toBe(0)
    expect(reserve.secondaryPaise).toBe(0)
    expect(reserve.designated).toBe(false)
  })

  it('excludes future-valued and goal-linked funds from second-line reserves', () => {
    const data = financeData({
      accounts: [account({ id: 'investment', type: 'investment' })],
      goals: [
        {
          id: 'goal',
          name: 'Education',
          targetPaise: 5_000_000,
          currentPaise: 0,
          targetDate: '2028-01-01',
          priority: 'high',
          linkedAccountId: 'investment',
          plannedMonthlyPaise: 0,
          archived: false,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      investments: [
        {
          id: 'linked',
          accountId: 'investment',
          name: 'Goal fund',
          symbol: '',
          type: 'mutual-fund',
          units: '10',
          currentPricePaise: 10_000,
          averageCostPaise: 10_000,
          investedPaise: 100_000,
          priceDate: '2026-09-23',
          activities: [],
          priceHistory: [],
          includeInNetWorth: true,
          reserveAccess: {
            instrument: 'liquid-fund',
            accessDays: 1,
            lockedUntil: null,
          },
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        {
          id: 'future',
          accountId: null,
          name: 'Future price',
          symbol: '',
          type: 'mutual-fund',
          units: '10',
          currentPricePaise: 10_000,
          averageCostPaise: 10_000,
          investedPaise: 100_000,
          priceDate: '2026-10-01',
          activities: [],
          priceHistory: [],
          includeInNetWorth: true,
          reserveAccess: {
            instrument: 'overnight-fund',
            accessDays: 1,
            lockedUntil: null,
          },
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
    })
    const reserve = calculateEmergencyReserve(data, profile(), asOf)
    expect(reserve.secondaryPaise).toBe(0)
    expect(reserve.exclusions).toEqual(
      expect.arrayContaining([
        'Goal fund: linked goal',
        'Future price: price date is in the future',
      ]),
    )
  })
})

describe('income and medical shock', () => {
  it('accounts only for expenses the user explicitly chose as extra', () => {
    const result = calculateShockScenario({
      availablePaise: 3_000_000,
      monthlyEssentialsPaise: 1_000_000,
      additionalMonthlyPaise: 200_000,
      medicalPaise: 500_000,
      monthsWithoutIncome: 3,
    })
    expect(result.requiredPaise).toBe(4_100_000)
    expect(result.shortfallPaise).toBe(1_100_000)
    expect(result.monthsCovered).toBeCloseTo(2.08, 2)
  })

  it('reports observed essential spending separately from the entered target', () => {
    const data = financeData({
      categories: [
        {
          id: 'food',
          name: 'Groceries',
          kind: 'expense',
          parentId: null,
          essential: true,
          color: '#123456',
          system: false,
          archived: false,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      transactions: [
        {
          id: 'food-expense',
          accountId: 'salary',
          destinationAccountId: null,
          categoryId: 'food',
          kind: 'expense',
          amountPaise: 900_000,
          date: '2026-08-15',
          description: 'Food',
          note: '',
          tags: [],
          cleared: true,
          splits: [],
          recurringRuleId: null,
          importBatchId: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
    })
    expect(estimateEssentialMonthlySpend(data, asOf)).toBe(300_000)
  })
})
