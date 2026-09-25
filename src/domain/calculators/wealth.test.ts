import { describe, expect, it } from 'vitest'

import {
  costOfDelay,
  futureCost,
  projectLumpSum,
  retirementProjection,
  wealthMultiple,
} from './wealth'

describe('wealth and inflation illustrations', () => {
  it('handles zero inflation and unattainable multiples', () => {
    expect(futureCost(100_000, '0', 10)).toBe(100_000)
    expect(() => futureCost(Number.MAX_SAFE_INTEGER, '10', 60)).toThrow(/safe integer/)
    expect(wealthMultiple(100_000, '0', 2, 60)).toBeNull()
    expect(wealthMultiple(100_000, '-5', 3, 60)).toBeNull()
  })

  it('shows a 10% illustrative one-year gain without recurring contributions', () => {
    const result = projectLumpSum({
      principalPaise: 100_000,
      opened: '2026-01-01',
      matures: '2027-01-01',
      returnPath: { kind: 'constant', annualPercent: '10' },
    })
    expect(result.endingBalancesPaise.main).toBe(110_000)
    expect(result.contributedPaise).toBe(100_000)
    expect(result.gainPaise).toBe(10_000)
  })

  it('compares delayed contributions at the same maturity and flags drawdown shortfall', () => {
    const input = {
      instalmentPaise: 100_000,
      cadenceMonths: 1 as const,
      opened: '2026-01-01',
      matures: '2027-01-01',
      returnPath: { kind: 'constant' as const, annualPercent: '0' },
    }
    const { now, delayed } = costOfDelay(input, 3)
    expect(now.contributedPaise).toBe(1_200_000)
    expect(delayed.contributedPaise).toBe(900_000)
    expect(now.endDate).toBe(delayed.endDate)
    const retirement = retirementProjection({
      ...input,
      monthlyWithdrawalPaise: 2_000_000,
      withdrawalMonths: 3,
    })
    expect(retirement.warnings.join(' ')).toMatch(/deplet|unavailable/i)
    expect(retirement.endingBalancesPaise.main).toBeGreaterThanOrEqual(0)
  })
})
