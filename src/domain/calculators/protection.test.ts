import { describe, expect, it } from 'vitest'

import { calculateCoverGap } from './protection'

describe('dependent protection gap', () => {
  it('discounts living expenses and deducts only entered resources', () => {
    const result = calculateCoverGap({
      annualExpensePaise: 10_000_000,
      dependencyYears: 5,
      inflationPercent: '0',
      investmentReturnPercent: '0',
      outstandingDebtPaise: 20_000_000,
      goalCostPaise: 10_000_000,
      liquidAssetsPaise: 20_000_000,
      existingLifeCoverPaise: 30_000_000,
    })
    expect(result.expensePresentValuePaise).toBe(50_000_000)
    expect(result.grossNeedPaise).toBe(80_000_000)
    expect(result.availableResourcesPaise).toBe(50_000_000)
    expect(result.coverGapPaise).toBe(30_000_000)
  })

  it('handles equal inflation and investment return without dividing by zero', () => {
    const result = calculateCoverGap({
      annualExpensePaise: 10_000_000,
      dependencyYears: 4,
      inflationPercent: '6',
      investmentReturnPercent: '6',
      outstandingDebtPaise: 0,
      goalCostPaise: 0,
      liquidAssetsPaise: 0,
      existingLifeCoverPaise: 0,
    })
    expect(result.expensePresentValuePaise).toBe(40_000_000)
  })

  it('shows no additional need if entered resources already cover it', () => {
    const input = {
      annualExpensePaise: 10_000_000,
      dependencyYears: 1,
      inflationPercent: '0',
      investmentReturnPercent: '0',
      outstandingDebtPaise: 0,
      goalCostPaise: 0,
      liquidAssetsPaise: 20_000_000,
      existingLifeCoverPaise: 0,
    }
    expect(calculateCoverGap(input).coverGapPaise).toBe(0)
    expect(() => calculateCoverGap({ ...input, dependencyYears: 0 })).toThrow(/years/i)
    expect(() => calculateCoverGap({ ...input, existingLifeCoverPaise: -1 })).toThrow(
      /non-negative/i,
    )
  })
})
