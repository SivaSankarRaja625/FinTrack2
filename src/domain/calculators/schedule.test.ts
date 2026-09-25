import { describe, expect, it } from 'vitest'

import { marketGrowth, monthlyDate, validateHorizon } from './schedule'

describe('calculator dates and returns', () => {
  it('keeps the original monthly anchor through short months and leap years', () => {
    expect(monthlyDate('2026-01-31', 1)).toBe('2026-02-28')
    expect(monthlyDate('2026-01-31', 2)).toBe('2026-03-31')
    expect(monthlyDate('2024-02-29', 48)).toBe('2028-02-29')
  })

  it('bounds scenarios to valid dates within 60 years', () => {
    expect(() => validateHorizon('2026-02-01', '2026-01-01')).toThrow()
    expect(() => validateHorizon('2026-01-01', '2087-01-01')).toThrow()
    expect(() => validateHorizon('2026-01-01', '2086-01-01')).not.toThrow()
  })

  it('requires every entered monthly rate and rejects invalid returns', () => {
    expect(() =>
      marketGrowth({ kind: 'monthly', months: [] }, '2026-01-01', '2026-02-01'),
    ).toThrow(/2026-01/)
    expect(() =>
      marketGrowth(
        { kind: 'constant', annualPercent: '-101' },
        '2026-01-01',
        '2027-01-01',
      ),
    ).toThrow()
    expect(() =>
      marketGrowth(
        { kind: 'constant', annualPercent: 'NaN' },
        '2026-01-01',
        '2027-01-01',
      ),
    ).toThrow()
    expect(() =>
      marketGrowth(
        {
          kind: 'monthly',
          months: [
            { month: '2026-01', percent: '1' },
            { month: '2026-01', percent: '2' },
          ],
        },
        '2026-01-01',
        '2026-02-01',
      ),
    ).toThrow(/duplicate/)
    expect(
      marketGrowth(
        { kind: 'constant', annualPercent: '0' },
        '2026-01-01',
        '2027-01-01',
      ).toNumber(),
    ).toBe(1)
    expect(
      marketGrowth(
        {
          kind: 'monthly',
          months: [
            { month: '2026-01', percent: '-50' },
            { month: '2026-02', percent: '10' },
          ],
        },
        '2026-01-01',
        '2026-03-01',
      ).toNumber(),
    ).toBeCloseTo(0.55, 10)
  })
})
