import { describe, expect, it } from 'vitest'

import { compareLoanPrepayment } from './debt'

const loan = {
  balancePaise: 1_200_000,
  annualRatePercent: '0',
  remainingMonths: 12,
  firstPaymentDate: '2026-01-31',
  prepaymentMonth: 3,
  prepaymentPaise: 300_000,
  feePaise: 0,
} as const

describe('reducing-balance prepayment', () => {
  it('keeps the EMI and ends three months earlier for a zero-rate loan', () => {
    const result = compareLoanPrepayment({ ...loan, strategy: 'reduce-tenure' })
    expect(result.baseline.rows).toHaveLength(12)
    expect(result.prepaid.rows).toHaveLength(9)
    expect(result.baseline.monthlyEmiPaise).toBe(100_000)
    expect(result.prepaid.monthlyEmiPaise).toBe(100_000)
    expect(result.prepaid.rows[2]?.prepaymentPaise).toBe(300_000)
    expect(result.prepaid.rows[2]?.date).toBe('2026-03-31')
    expect(result.prepaid.rows.at(-1)?.date).toBe('2026-09-30')
    expect(result.monthsSaved).toBe(3)
    expect(result.netInterestSavedPaise).toBe(0)
  })

  it('can lower the EMI without claiming an earlier maturity', () => {
    const result = compareLoanPrepayment({ ...loan, strategy: 'reduce-emi' })
    expect(result.prepaid.rows).toHaveLength(12)
    expect(result.prepaid.rows.at(-1)?.closingPaise).toBe(0)
    expect(result.prepaid.monthlyEmiPaise).toBe(66_667)
    expect(result.monthsSaved).toBe(0)
  })

  it('uses the baseline actual payoff date when an entered EMI pays early', () => {
    const result = compareLoanPrepayment({
      ...loan,
      monthlyEmiPaise: 200_000,
      strategy: 'reduce-emi',
    })
    expect(result.baseline.rows).toHaveLength(6)
    expect(result.prepaid.rows).toHaveLength(6)
    expect(result.prepaid.monthlyEmiPaise).toBe(100_000)
    expect(result.monthsSaved).toBe(0)
  })

  it('reports no further EMI when the extra payment clears the balance', () => {
    const result = compareLoanPrepayment({
      ...loan,
      prepaymentMonth: 1,
      prepaymentPaise: 1_100_000,
      strategy: 'reduce-tenure',
    })
    expect(result.prepaid.rows).toHaveLength(1)
    expect(result.prepaid.monthlyEmiPaise).toBe(0)
    expect(result.monthsSaved).toBe(11)
  })

  it('trues up a final EMI when paise rounding leaves a tiny remainder', () => {
    const result = compareLoanPrepayment({
      ...loan,
      balancePaise: 10,
      remainingMonths: 3,
      prepaymentMonth: 1,
      prepaymentPaise: 1,
      strategy: 'reduce-tenure',
    })
    expect(result.baseline.rows.at(-1)?.paymentPaise).toBe(4)
    expect(result.baseline.rows.at(-1)?.closingPaise).toBe(0)
  })

  it('accounts for lender fees separately from interest saved', () => {
    const result = compareLoanPrepayment({
      ...loan,
      annualRatePercent: '12',
      feePaise: 10_000,
      strategy: 'reduce-tenure',
    })
    expect(result.prepaid.interestPaise).toBeLessThan(result.baseline.interestPaise)
    expect(result.netInterestSavedPaise).toBe(
      result.baseline.interestPaise - result.prepaid.interestPaise - 10_000,
    )
  })

  it('rejects non-amortizing payments and a prepayment larger than the balance', () => {
    expect(() =>
      compareLoanPrepayment({
        ...loan,
        annualRatePercent: '12',
        monthlyEmiPaise: 10_000,
        strategy: 'reduce-tenure',
      }),
    ).toThrow(/EMI|repay/i)
    expect(() =>
      compareLoanPrepayment({
        ...loan,
        prepaymentPaise: 2_000_000,
        strategy: 'reduce-tenure',
      }),
    ).toThrow(/prepayment/i)
  })
})
