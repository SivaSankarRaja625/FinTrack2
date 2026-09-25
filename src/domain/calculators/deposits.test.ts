import { describe, expect, it } from 'vitest'

import {
  calculateFixedDeposit,
  calculateRecurringDeposit,
  type FixedDepositInput,
  type RecurringDepositInput,
} from './deposits'

const fd: FixedDepositInput = {
  principalPaise: 1_000_000,
  opened: '2026-01-01',
  matures: '2027-01-01',
  annualNominalPercent: '8',
  rest: 'quarterly-anniversary',
  dayCount: 'actual-365',
  payout: 'cumulative',
}

const rd: RecurringDepositInput = {
  installmentPaise: 100_000,
  opened: '2026-01-01',
  matures: '2026-04-01',
  installmentCount: 3,
  annualNominalPercent: '12',
  rest: 'monthly-anniversary',
  dayCount: 'actual-365',
}

describe('fixed deposit', () => {
  it('preserves the principal at a valid zero nominal rate', () => {
    const result = calculateFixedDeposit({ ...fd, annualNominalPercent: '0' })
    expect(result.endingBalancesPaise.main).toBe(1_000_000)
    expect(result.gainPaise).toBe(0)
    expect(result.contributedPaise).toBe(1_000_000)
  })

  it('credits four complete quarterly rests at the nominal rate, rounding each credit', () => {
    const result = calculateFixedDeposit(fd)
    expect(
      result.events
        .filter((event) => event.kind === 'interest')
        .map((event) => [event.date, event.deltaPaise]),
    ).toEqual([
      ['2026-04-01', 20_000],
      ['2026-07-01', 20_400],
      ['2026-10-01', 20_808],
      ['2027-01-01', 21_224],
    ])
    expect(result.endingBalancesPaise.main).toBe(1_082_432)
    expect(result.gainPaise).toBe(82_432)
    expect(result.xirrPercent).toBeGreaterThan(8)
  })

  it('does not capitalize interest already paid out quarterly', () => {
    const result = calculateFixedDeposit({ ...fd, payout: 'quarterly' })
    expect(result.endingBalancesPaise.main).toBe(1_000_000)
    expect(result.withdrawnPaise).toBe(80_000)
    expect(result.gainPaise).toBe(80_000)
    expect(
      result.events
        .filter((event) => event.kind === 'withdrawal')
        .map((event) => [event.date, event.deltaPaise]),
    ).toEqual([
      ['2026-04-01', -20_000],
      ['2026-07-01', -20_000],
      ['2026-10-01', -20_000],
      ['2027-01-01', -20_000],
    ])
    expect(result.xirrPercent).toBeGreaterThan(8)
    expect(result.xirrPercent).toBeCloseTo(8.244849, 4)
  })

  it('pays monthly against quarterly rests without reinvesting a payout', () => {
    const result = calculateFixedDeposit({ ...fd, payout: 'monthly' })
    expect(result.events.filter((event) => event.kind === 'withdrawal')).toHaveLength(12)
    expect(result.endingBalancesPaise.main).toBe(fd.principalPaise)
    expect(result.gainPaise).toBe(result.withdrawnPaise)
  })

  it('pays at the next calendar-quarter end even when opened on 31 March', () => {
    const result = calculateFixedDeposit({
      ...fd,
      opened: '2026-03-31',
      matures: '2026-10-01',
      rest: 'calendar-quarter',
      payout: 'quarterly',
    })

    expect(
      result.events
        .filter((event) => event.kind === 'withdrawal')
        .map((event) => [event.date, event.deltaPaise]),
    ).toEqual([
      ['2026-06-30', -20_000],
      ['2026-09-30', -20_000],
      ['2026-10-01', -219],
    ])
    expect(result.endingBalancesPaise.main).toBe(fd.principalPaise)
  })

  it('credits a complete calendar quarter opened on its first day at a full rest', () => {
    const result = calculateFixedDeposit({
      ...fd,
      opened: '2026-01-01',
      matures: '2026-03-31',
      annualNominalPercent: '12',
      rest: 'calendar-quarter',
    })
    expect(result.gainPaise).toBe(30_000)
  })

  it('uses 365 or the actual calendar year for a broken rest including 29 February', () => {
    const input: FixedDepositInput = {
      ...fd,
      opened: '2024-01-01',
      matures: '2024-03-01',
      annualNominalPercent: '10',
    }
    expect(calculateFixedDeposit({ ...input, dayCount: 'actual-365' }).gainPaise).toBe(
      16_438,
    )
    expect(calculateFixedDeposit({ ...input, dayCount: 'actual-actual' }).gainPaise).toBe(
      16_393,
    )
  })

  it('uses actual holding-period rate and discloses penalty at early closure', () => {
    const result = calculateFixedDeposit({
      ...fd,
      annualNominalPercent: '12',
      withdrawal: {
        date: '2026-04-01',
        applicableAnnualPercent: '8',
        disclosedPenaltyPercent: '2',
      },
    })
    expect(result.endDate).toBe('2026-04-01')
    expect(result.endingBalancesPaise.main).toBe(1_015_000)
    expect(result.gainPaise).toBe(15_000)
    expect(result.events.filter((event) => event.kind === 'fee')).toEqual([
      expect.objectContaining({ date: '2026-04-01', deltaPaise: -5_000 }),
    ])
    expect(result.assumptions.join(' ')).toMatch(/8%.*2 percentage points/)
  })

  it('reconciles interest paid before early closure rather than keeping the contracted rate', () => {
    const result = calculateFixedDeposit({
      ...fd,
      payout: 'quarterly',
      withdrawal: {
        date: '2026-08-01',
        applicableAnnualPercent: '4',
        disclosedPenaltyPercent: '1',
      },
    })
    expect(result.withdrawnPaise).toBe(40_000)
    expect(result.endingBalancesPaise.main).toBeLessThan(1_000_000)
    expect(result.endingBalancesPaise.main! + result.withdrawnPaise).toBe(
      result.contributedPaise + result.gainPaise,
    )
  })

  it('rejects missing or invalid bank terms, amounts, horizons and premature closure terms', () => {
    expect(() => calculateFixedDeposit({ ...fd, dayCount: undefined! })).toThrow(
      /day-count/i,
    )
    expect(() => calculateFixedDeposit({ ...fd, rest: undefined! })).toThrow(/rest/i)
    expect(() => calculateFixedDeposit({ ...fd, annualNominalPercent: 'NaN' })).toThrow(
      /rate/i,
    )
    expect(() => calculateFixedDeposit({ ...fd, annualNominalPercent: '-1' })).toThrow(
      /rate/i,
    )
    expect(() =>
      calculateFixedDeposit({ ...fd, principalPaise: Number.MAX_SAFE_INTEGER + 1 }),
    ).toThrow(/safe integer/i)
    expect(() => calculateFixedDeposit({ ...fd, principalPaise: 0 })).toThrow(
      /principal/i,
    )
    expect(() => calculateFixedDeposit({ ...fd, matures: '2087-01-01' })).toThrow(
      /60 years/i,
    )
    expect(() =>
      calculateFixedDeposit({
        ...fd,
        withdrawal: {
          date: '2026-04-01',
          applicableAnnualPercent: '',
          disclosedPenaltyPercent: '1',
        },
      }),
    ).toThrow(/applicable.*rate/i)
    expect(() =>
      calculateFixedDeposit({
        ...fd,
        withdrawal: {
          date: '2026-04-01',
          applicableAnnualPercent: '7',
          disclosedPenaltyPercent: undefined!,
        },
      }),
    ).toThrow(/penalty/i)
    expect(() =>
      calculateFixedDeposit({
        ...fd,
        withdrawal: {
          date: '2027-01-01',
          applicableAnnualPercent: '7',
          disclosedPenaltyPercent: '1',
        },
      }),
    ).toThrow(/withdrawal date/i)
  })
})

describe('recurring deposit', () => {
  it('accrues one instalment from its own date and posts the contribution', () => {
    const result = calculateRecurringDeposit({
      ...rd,
      installmentCount: 1,
      rest: 'quarterly-anniversary',
    })
    expect(
      result.events.map((event) => [event.date, event.kind, event.deltaPaise]),
    ).toEqual([
      ['2026-01-01', 'contribution', 100_000],
      ['2026-04-01', 'interest', 3_000],
    ])
    expect(result.endingBalancesPaise.main).toBe(103_000)
  })

  it('marks a missed instalment rather than crediting imaginary contributions', () => {
    const result = calculateRecurringDeposit({
      ...rd,
      actualDates: ['2026-01-01', null, '2026-03-01'],
    })
    expect(result.contributedPaise).toBe(200_000)
    expect(result.endingBalancesPaise.main).toBe(204_030)
    expect(result.warnings.join(' ')).toMatch(/2026-02-01.*missed/i)
    expect(
      result.events
        .filter((event) => event.kind === 'contribution')
        .map((event) => event.date),
    ).toEqual(['2026-01-01', '2026-03-01'])
  })

  it('calculates late instalments from payment, not from their scheduled due date', () => {
    const onTime = calculateRecurringDeposit(rd)
    const late = calculateRecurringDeposit({
      ...rd,
      actualDates: ['2026-01-01', '2026-02-15', '2026-03-01'],
    })
    expect(late.contributedPaise).toBe(300_000)
    expect(
      late.events.find((event) => event.label.includes('Instalment 2')),
    ).toMatchObject({
      date: '2026-02-15',
      kind: 'contribution',
    })
    expect(late.warnings.join(' ')).toMatch(/2026-02-01.*2026-02-15/)
    expect(late.gainPaise).toBeLessThan(onTime.gainPaise)
    expect(late.endingBalancesPaise.main! + late.withdrawnPaise).toBe(
      late.contributedPaise + late.gainPaise,
    )
    expect(late.events.map((event) => event.date)).toEqual(
      [...late.events.map((event) => event.date)].sort(),
    )
  })

  it('anchors due dates to the original 31st through February', () => {
    const result = calculateRecurringDeposit({
      ...rd,
      opened: '2026-01-31',
      matures: '2026-04-30',
      actualDates: ['2026-01-31', null, '2026-03-31'],
    })
    expect(result.warnings.join(' ')).toMatch(/2026-02-28/)
    expect(
      result.events
        .filter((event) => event.kind === 'contribution')
        .map((event) => event.date),
    ).toEqual(['2026-01-31', '2026-03-31'])
  })

  it('rejects malformed actual schedules, missing conventions, and invalid dates', () => {
    expect(() => calculateRecurringDeposit({ ...rd, dayCount: undefined! })).toThrow(
      /day-count/i,
    )
    expect(() => calculateRecurringDeposit({ ...rd, actualDates: [null] })).toThrow(
      /one actual date/i,
    )
    expect(() =>
      calculateRecurringDeposit({
        ...rd,
        actualDates: ['2026-01-01', '2026-01-15', null],
      }),
    ).toThrow(/instalment 2/i)
    expect(() =>
      calculateRecurringDeposit({
        ...rd,
        actualDates: ['2026-01-01', '2026-02-01', '2026-05-01'],
      }),
    ).toThrow(/maturity/i)
    expect(() => calculateRecurringDeposit({ ...rd, installmentCount: 0 })).toThrow(
      /count/i,
    )
    expect(() => calculateRecurringDeposit({ ...rd, installmentPaise: 0 })).toThrow(
      /instalment/i,
    )
  })
})
