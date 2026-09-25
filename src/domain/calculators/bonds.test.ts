import { describe, expect, it } from 'vitest'

import { calculateFloatingSavingsBond } from './bonds'

const bond = {
  subscribed: '2026-01-01',
  principalPaise: 100_000_000,
  nscAnnualPercent: '7.7',
} as const

describe('RBI floating-rate savings bond cash flows', () => {
  it('pays fourteen semiannual NSC-plus-35-bps coupons without reinvestment', () => {
    const result = calculateFloatingSavingsBond(bond)
    const payouts = result.events.filter((event) => event.kind === 'withdrawal')
    expect(result.endDate).toBe('2033-01-01')
    expect(payouts).toHaveLength(14)
    expect(payouts[0]).toMatchObject({
      date: '2026-07-01',
      deltaPaise: -4_025_000,
    })
    expect(result.withdrawnPaise).toBe(56_350_000)
    expect(result.endingBalancesPaise.main).toBe(100_000_000)
  })

  it('uses a January reset for the following half-year, not the coupon already earned', () => {
    const result = calculateFloatingSavingsBond({
      ...bond,
      resetNscRates: [{ resetDate: '2027-01-01', nscAnnualPercent: '6.7' }],
    })
    const payouts = result.events.filter((event) => event.kind === 'withdrawal')
    expect(payouts[1]).toMatchObject({
      date: '2027-01-01',
      deltaPaise: -4_025_000,
    })
    expect(payouts[2]).toMatchObject({
      date: '2027-07-01',
      deltaPaise: -3_525_000,
    })
  })

  it('illustrates a pre-April-2026 broken half-year using the disclosed older assumption', () => {
    const result = calculateFloatingSavingsBond({
      subscribed: '2025-04-01',
      principalPaise: 100_000,
      nscAnnualPercent: '11.65',
    })
    expect(result.events.find((event) => event.kind === 'withdrawal')).toMatchObject({
      date: '2025-07-01',
      deltaPaise: -3_017,
    })
    expect(result.endDate).toBe('2032-04-01')
  })

  it('uses the current RBI 30/360 rule for a bond issued after April 2026', () => {
    const result = calculateFloatingSavingsBond({
      subscribed: '2026-04-03',
      principalPaise: 100_000,
      nscAnnualPercent: '11.65',
    })
    expect(result.events.find((event) => event.kind === 'withdrawal')).toMatchObject({
      date: '2026-07-01',
      deltaPaise: -2_933,
    })
    expect(result.assumptions.join(' ')).toMatch(/30\/360/)
  })

  it('rejects invalid reset dates instead of using stale assumptions silently', () => {
    expect(() =>
      calculateFloatingSavingsBond({
        ...bond,
        resetNscRates: [{ resetDate: '2027-02-01', nscAnnualPercent: '6.7' }],
      }),
    ).toThrow(/Jan|Jul|reset/i)
    expect(() => calculateFloatingSavingsBond({ ...bond, nscAnnualPercent: '' })).toThrow(
      /rate|percent/i,
    )
    expect(() =>
      calculateFloatingSavingsBond({
        ...bond,
        resetNscRates: [{ resetDate: '2033-01-01', nscAnnualPercent: '6' }],
      }),
    ).toThrow(/reset/i)
  })

  it('enforces bond face-value denominations of ₹1,000', () => {
    expect(() => calculateFloatingSavingsBond({ ...bond, principalPaise: 1 })).toThrow(
      /₹1,000|multiple/i,
    )
    expect(() =>
      calculateFloatingSavingsBond({ ...bond, principalPaise: 100_001 }),
    ).toThrow(/₹1,000|multiple/i)
  })

  it('rejects subscriptions before this bond was issued in July 2020', () => {
    expect(() =>
      calculateFloatingSavingsBond({ ...bond, subscribed: '2020-06-30' }),
    ).toThrow(/2020|issue/i)
  })

  it('uses the statutory 7.15% first coupon before the January 2021 reset', () => {
    const result = calculateFloatingSavingsBond({
      ...bond,
      subscribed: '2020-07-01',
    })
    const payouts = result.events.filter((event) => event.kind === 'withdrawal')
    expect(payouts[0]).toMatchObject({
      date: '2021-01-01',
      deltaPaise: -3_575_000,
    })
    expect(payouts[1]).toMatchObject({
      date: '2021-07-01',
      deltaPaise: -4_025_000,
    })
    expect(() =>
      calculateFloatingSavingsBond({
        ...bond,
        subscribed: '2020-07-01',
        resetNscRates: [{ resetDate: '2020-07-01', nscAnnualPercent: '6' }],
      }),
    ).toThrow(/first|2021|reset/i)
  })
})
