import { describe, expect, it } from 'vitest'

import { calculatePpf, calculateScss } from './government'

describe('Public Provident Fund illustration', () => {
  it('counts fifteen full financial years after the opening year', () => {
    const result = calculatePpf({
      opened: '2026-04-05',
      installmentPaise: 100_000,
      cadence: 'yearly',
      annualRatePercent: '0',
    })
    expect(result.endDate).toBe('2042-03-31')
    expect(result.contributedPaise).toBe(1_600_000)
    expect(result.endingBalancesPaise.main).toBe(1_600_000)
    expect(result.events.filter((event) => event.kind === 'contribution')).toHaveLength(
      16,
    )
    expect(result.events.at(-1)?.date).toBe('2041-04-05')
  })

  it('uses the fifth-day closing balance and credits interest on March 31', () => {
    const input = {
      installmentPaise: 15_000_000,
      cadence: 'yearly' as const,
      annualRatePercent: '7.1',
    }
    const early = calculatePpf({ ...input, opened: '2026-04-05' })
    const late = calculatePpf({ ...input, opened: '2026-04-06' })
    const credited = (events: typeof early.events) =>
      events.find((event) => event.date === '2027-03-31' && event.kind === 'interest')
        ?.deltaPaise
    expect(credited(early.events)).toBe(1_065_000)
    expect(credited(late.events)).toBe(976_250)
  })

  it('applies entered quarter rate overrides without assuming future notified rates', () => {
    const result = calculatePpf({
      opened: '2026-04-05',
      installmentPaise: 100_000,
      cadence: 'yearly',
      annualRatePercent: '12',
      quarterlyRates: [{ quarterStart: '2026-04-01', annualPercent: '0' }],
    })
    expect(result.events.find((event) => event.date === '2027-03-31')?.deltaPaise).toBe(
      9_000,
    )
  })

  it('rejects monthly contributions above the April–March annual cap', () => {
    expect(() =>
      calculatePpf({
        opened: '2026-04-05',
        installmentPaise: 1_300_000,
        cadence: 'monthly',
        annualRatePercent: '7.1',
      }),
    ).toThrow(/1,50,000|cap/i)
    expect(() =>
      calculatePpf({
        opened: '2026-04-05',
        installmentPaise: 5_001,
        cadence: 'yearly',
        annualRatePercent: '7.1',
      }),
    ).toThrow(/multiple/i)
  })

  it('does not apply the 2019 PPF rule pack to an earlier opening date', () => {
    expect(() =>
      calculatePpf({
        opened: '2018-04-05',
        installmentPaise: 100_000,
        cadence: 'yearly',
        annualRatePercent: '7',
      }),
    ).toThrow(/2019|effective/i)
  })
})

describe('Senior Citizens Savings Scheme illustration', () => {
  it('pays a fixed full-quarter coupon without reinvesting it', () => {
    const result = calculateScss({
      opened: '2026-01-01',
      principalPaise: 300_000_000,
      contractedAnnualPercent: '8.2',
    })
    expect(result.endDate).toBe('2031-01-01')
    expect(result.events.filter((event) => event.kind === 'withdrawal')).toHaveLength(20)
    expect(result.events.find((event) => event.kind === 'withdrawal')).toMatchObject({
      date: '2026-04-01',
      kind: 'withdrawal',
      deltaPaise: -6_150_000,
    })
    expect(result.withdrawnPaise).toBe(123_000_000)
    expect(result.endingBalancesPaise.main).toBe(300_000_000)
  })

  it('pro-rates a broken quarter and rounds each payout to whole rupees', () => {
    const result = calculateScss({
      opened: '2026-02-01',
      principalPaise: 100_000,
      contractedAnnualPercent: '8',
    })
    const payouts = result.events.filter((event) => event.kind === 'withdrawal')
    expect(payouts[0]).toMatchObject({ date: '2026-04-01', deltaPaise: -1_300 })
    expect(payouts.at(-1)).toMatchObject({
      date: '2031-02-01',
      deltaPaise: -700,
    })
  })

  it('enforces the single deposit denomination and statutory maximum', () => {
    const input = {
      opened: '2026-04-01',
      contractedAnnualPercent: '8.2',
    }
    expect(() => calculateScss({ ...input, principalPaise: 300_100_000 })).toThrow(
      /30,00,000|limit/i,
    )
    expect(() => calculateScss({ ...input, principalPaise: 100_001 })).toThrow(
      /multiple/i,
    )
  })

  it('uses the lower SCSS maximum for accounts opened before April 2023', () => {
    expect(() =>
      calculateScss({
        opened: '2022-01-01',
        principalPaise: 250_000_000,
        contractedAnnualPercent: '7',
      }),
    ).toThrow(/15,00,000|limit/i)
    expect(() =>
      calculateScss({
        opened: '2018-01-01',
        principalPaise: 100_000,
        contractedAnnualPercent: '7',
      }),
    ).toThrow(/2019|effective/i)
  })
})
