import { describe, expect, it } from 'vitest'

import { calculateSip, calculateStp, calculateSwp, requiredGoalSip } from './market'

const flat = { kind: 'constant' as const, annualPercent: '0' }

describe('SIP illustrations', () => {
  it('posts twelve dated payments before growth and counts the opening amount once', () => {
    const result = calculateSip({
      opened: '2026-01-31',
      matures: '2027-01-31',
      instalmentPaise: 100_000,
      openingPaise: 200_000,
      cadenceMonths: 1,
      returnPath: flat,
    })
    expect(result.events.filter((event) => event.kind === 'contribution')).toMatchObject([
      { date: '2026-01-31', deltaPaise: 200_000 },
      { date: '2026-01-31', deltaPaise: 100_000 },
      { date: '2026-02-28', deltaPaise: 100_000 },
      { date: '2026-03-31', deltaPaise: 100_000 },
      ...Array.from({ length: 9 }, () => ({ deltaPaise: 100_000 })),
    ])
    expect(result.contributedPaise).toBe(1_400_000)
    expect(result.endingBalancesPaise.main).toBe(1_400_000)
    expect(result.gainPaise).toBe(0)
  })

  it('makes quarterly contributions at the original anchored dates', () => {
    const result = calculateSip({
      opened: '2026-01-31',
      matures: '2027-01-31',
      instalmentPaise: 100_000,
      cadenceMonths: 3,
      returnPath: flat,
    })
    expect(
      result.events
        .filter((event) => event.kind === 'contribution')
        .map((event) => event.date),
    ).toEqual(['2026-01-31', '2026-04-30', '2026-07-31', '2026-10-31'])
    expect(result.contributedPaise).toBe(400_000)
  })

  it('steps up at the seventh or thirteenth installment, not one installment earlier', () => {
    const base = {
      opened: '2026-01-01',
      matures: '2027-02-01',
      instalmentPaise: 100_000,
      cadenceMonths: 1 as const,
      returnPath: flat,
    }
    const annual = calculateSip({ ...base, stepUp: { everyMonths: 12, percent: '10' } })
    const halfYear = calculateSip({ ...base, stepUp: { everyMonths: 6, paise: 25_000 } })
    expect(
      annual.events
        .filter((event) => event.kind === 'contribution')
        .map((event) => event.deltaPaise),
    ).toEqual([...Array<number>(12).fill(100_000), 110_000])
    expect(
      halfYear.events
        .filter((event) => event.kind === 'contribution')
        .map((event) => event.deltaPaise),
    ).toEqual([
      ...Array<number>(6).fill(100_000),
      ...Array<number>(6).fill(125_000),
      150_000,
    ])
  })

  it('records losses and rejects unsafe or ambiguous contributions', () => {
    const input = {
      opened: '2026-01-01',
      matures: '2027-01-01',
      instalmentPaise: 100_000,
      cadenceMonths: 1 as const,
      returnPath: { kind: 'constant' as const, annualPercent: '-50' },
    }
    expect(calculateSip(input).gainPaise).toBeLessThan(0)
    expect(() =>
      calculateSip({ ...input, instalmentPaise: Number.MAX_SAFE_INTEGER }),
    ).toThrow(/safe integer/u)
    expect(() => calculateSip({ ...input, instalmentPaise: -1 })).toThrow(/instalment/u)
    expect(() => calculateSip({ ...input, stepUp: { everyMonths: 6 } })).toThrow(
      /step-up/u,
    )
    expect(() =>
      calculateSip({ ...input, stepUp: { everyMonths: 6, paise: 100, percent: '1' } }),
    ).toThrow(/step-up/u)
  })

  it('requires every dated return month, including the final growth interval', () => {
    expect(() =>
      calculateSip({
        opened: '2026-01-01',
        matures: '2026-03-01',
        instalmentPaise: 100,
        cadenceMonths: 1,
        returnPath: { kind: 'monthly', months: [{ month: '2026-01', percent: '0' }] },
      }),
    ).toThrow(/2026-02/u)
  })

  it('records supplied monthly rates as assumptions for reproducing the projection', () => {
    const result = calculateSip({
      opened: '2026-01-01',
      matures: '2026-03-01',
      instalmentPaise: 100,
      cadenceMonths: 1,
      returnPath: {
        kind: 'monthly',
        months: [
          { month: '2026-01', percent: '-5' },
          { month: '2026-02', percent: '2' },
        ],
      },
    })
    expect(result.assumptions.join(' ')).toContain('2026-01: -5%')
    expect(result.assumptions.join(' ')).toContain('2026-02: 2%')
  })
})

describe('inverse goal SIP', () => {
  const goal = {
    opened: '2026-01-01',
    matures: '2027-01-01',
    cadenceMonths: 1 as const,
    returnPath: flat,
  }

  it('rounds upward to the least paise meeting the goal using the forward calculator', () => {
    const payment = requiredGoalSip({ ...goal, targetPaise: 1_001 })
    expect(payment).toBe(84)
    expect(
      calculateSip({ ...goal, instalmentPaise: payment }).endingBalancesPaise.main,
    ).toBeGreaterThanOrEqual(1_001)
    expect(
      calculateSip({ ...goal, instalmentPaise: payment - 1 }).endingBalancesPaise.main,
    ).toBeLessThan(1_001)
  })

  it('can require no new contributions if the opening amount already meets the goal', () => {
    expect(requiredGoalSip({ ...goal, openingPaise: 2_000, targetPaise: 1_000 })).toBe(0)
  })

  it('reports an unreachable goal when all returns eliminate every installment', () => {
    expect(() =>
      requiredGoalSip({
        ...goal,
        returnPath: { kind: 'constant', annualPercent: '-100' },
        targetPaise: 1_000,
      }),
    ).toThrow(/unreachable/u)
  })
})

describe('systematic transfer plan', () => {
  const base = {
    sourcePaise: 1_200_000,
    opened: '2026-01-01',
    matures: '2026-04-01',
    cadenceMonths: 1 as const,
    sourceFundHouse: 'Same AMC',
    targetFundHouse: 'Same AMC',
    sourceReturn: flat,
    targetReturn: flat,
    transfer: { kind: 'amount' as const, paise: 100_000 },
    insufficient: 'stop' as const,
  }

  it('moves three paired dated amounts without counting transfers as deposits', () => {
    const result = calculateStp(base)
    const transfers = result.events.filter((event) => event.kind === 'transfer')
    expect(transfers).toHaveLength(6)
    expect(
      transfers.map((event) => [event.date, event.account, event.deltaPaise]),
    ).toEqual([
      ['2026-01-01', 'source', -100_000],
      ['2026-01-01', 'target', 100_000],
      ['2026-02-01', 'source', -100_000],
      ['2026-02-01', 'target', 100_000],
      ['2026-03-01', 'source', -100_000],
      ['2026-03-01', 'target', 100_000],
    ])
    for (let index = 0; index < transfers.length; index += 2) {
      expect(transfers[index]?.transferId).toBe(transfers[index + 1]?.transferId)
      expect(transfers[index]?.date).toBe(transfers[index + 1]?.date)
      expect(new Set([transfers[index]?.account, transfers[index + 1]?.account])).toEqual(
        new Set(['source', 'target']),
      )
    }
    expect(result.contributedPaise).toBe(1_200_000)
    expect(result.endingBalancesPaise).toEqual({ source: 900_000, target: 300_000 })
    expect(result.gainPaise).toBe(0)
  })

  it('stops before an unaffordable transfer, or caps it as explicitly chosen', () => {
    const short = {
      ...base,
      sourcePaise: 100_000,
      transfer: { kind: 'amount' as const, paise: 70_000 },
    }
    const stopped = calculateStp({ ...short, insufficient: 'stop' })
    const capped = calculateStp({ ...short, insufficient: 'cap' })
    expect(stopped.endingBalancesPaise).toEqual({ source: 30_000, target: 70_000 })
    expect(capped.endingBalancesPaise).toEqual({ source: 0, target: 100_000 })
    expect(stopped.events.filter((event) => event.kind === 'transfer')).toHaveLength(2)
    expect(capped.events.filter((event) => event.kind === 'transfer')).toHaveLength(4)
    expect(stopped.warnings.join(' ')).toMatch(/2026-02-01/u)
    expect(capped.contributedPaise).toBe(100_000)
  })

  it('values the source and target along their own return paths after transfers', () => {
    const sourceGrows = calculateStp({
      ...base,
      sourcePaise: 500_000,
      sourceReturn: { kind: 'constant', annualPercent: '100' },
    })
    const targetGrows = calculateStp({
      ...base,
      sourcePaise: 500_000,
      targetReturn: { kind: 'constant', annualPercent: '100' },
    })
    expect(sourceGrows.endingBalancesPaise.source).toBeGreaterThan(200_000)
    expect(sourceGrows.endingBalancesPaise.target).toBe(300_000)
    expect(targetGrows.endingBalancesPaise.source).toBe(200_000)
    expect(targetGrows.endingBalancesPaise.target).toBeGreaterThan(300_000)
  })

  it('redeems decimal units at a changing source NAV and buys target units', () => {
    const result = calculateStp({
      ...base,
      sourcePaise: 100_000,
      sourceUnits: '10',
      matures: '2026-03-01',
      sourceReturn: { kind: 'constant', annualPercent: '100' },
      transfer: {
        kind: 'units',
        units: '2.5',
        sourceNavPaise: 10_000,
        targetNavPaise: 5_000,
      },
    })
    const redemptions = result.events.filter(
      (event) => event.kind === 'transfer' && event.account === 'source',
    )
    expect(redemptions[0]?.deltaPaise).toBe(-25_000)
    expect(redemptions[1]?.deltaPaise).toBeLessThan(-25_000)
    expect(result.endingBalancesPaise.source).toBeGreaterThan(0)
    expect(result.endingBalancesPaise.target).toBe(
      -redemptions.reduce((sum, event) => sum + event.deltaPaise, 0),
    )
  })

  it('exposes separate return assumptions and opening NAVs needed to reproduce unit transfers', () => {
    const result = calculateStp({
      ...base,
      sourcePaise: 100_000,
      sourceUnits: '10',
      sourceReturn: { kind: 'constant', annualPercent: '12' },
      targetReturn: { kind: 'constant', annualPercent: '-5' },
      transfer: {
        kind: 'units',
        units: '2.5',
        sourceNavPaise: 10_000,
        targetNavPaise: 5_000,
      },
    })
    const assumptions = result.assumptions.join(' ')
    expect(assumptions).toContain('12%')
    expect(assumptions).toContain('-5%')
    expect(assumptions).toContain('2.5')
    expect(assumptions).toContain('10000')
    expect(assumptions).toContain('5000')
  })

  it('caps requested units to available units before converting to safe integer paise', () => {
    const input = {
      ...base,
      sourcePaise: 100_000,
      sourceUnits: '10',
      matures: '2026-02-01',
      transfer: {
        kind: 'units' as const,
        units: '1000000000000000',
        sourceNavPaise: 10_000,
        targetNavPaise: 5_000,
      },
    }
    expect(
      calculateStp({ ...input, insufficient: 'stop' }).endingBalancesPaise.target,
    ).toBe(0)
    const capped = calculateStp({ ...input, insufficient: 'cap' })
    expect(capped.endingBalancesPaise).toEqual({ source: 0, target: 100_000 })
    expect(capped.contributedPaise).toBe(100_000)
  })

  it('rejects mismatched fund houses, starting units/NAV and missing return months', () => {
    expect(() => calculateStp({ ...base, targetFundHouse: 'Different AMC' })).toThrow(
      /fund house/u,
    )
    expect(() =>
      calculateStp({
        ...base,
        sourceUnits: '10',
        transfer: {
          kind: 'units',
          units: '1',
          sourceNavPaise: 10_000,
          targetNavPaise: 0,
        },
      }),
    ).toThrow(/NAV/u)
    expect(() =>
      calculateStp({
        ...base,
        sourceUnits: '10',
        transfer: {
          kind: 'units',
          units: '1',
          sourceNavPaise: 10_000,
          targetNavPaise: 5_000,
        },
      }),
    ).toThrow(/starting value/u)
    expect(() =>
      calculateStp({
        ...base,
        sourcePaise: 100_000,
        transfer: { kind: 'amount', paise: 70_000 },
        targetReturn: { kind: 'monthly', months: [{ month: '2026-01', percent: '0' }] },
      }),
    ).toThrow(/2026-02/u)
  })
})

describe('systematic withdrawal plan', () => {
  const base = {
    capitalPaise: 100_000,
    opened: '2026-01-01',
    matures: '2026-04-01',
    cadenceMonths: 1 as const,
    returnPath: flat,
    withdrawal: { kind: 'amount' as const, paise: 30_000 },
    annualIncreasePercent: '0',
  }

  it('separates cash paid out from the remaining zero-return corpus', () => {
    const result = calculateSwp(base)
    expect(result.contributedPaise).toBe(100_000)
    expect(result.withdrawnPaise).toBe(90_000)
    expect(result.endingBalancesPaise.main).toBe(10_000)
    expect(
      result.events
        .filter((event) => event.kind === 'withdrawal')
        .map((event) => event.date),
    ).toEqual(['2026-01-01', '2026-02-01', '2026-03-01'])
  })

  it('steps up withdrawals only on the annual boundary', () => {
    const result = calculateSwp({
      ...base,
      capitalPaise: 2_000_000,
      matures: '2027-02-01',
      withdrawal: { kind: 'amount', paise: 100_000 },
      annualIncreasePercent: '10',
    })
    expect(
      result.events
        .filter((event) => event.kind === 'withdrawal')
        .map((event) => event.deltaPaise),
    ).toEqual([...Array<number>(12).fill(-100_000), -110_000])
    expect(result.withdrawnPaise).toBe(1_310_000)
  })

  it('redeems a chosen number of units at the changing NAV without negative units', () => {
    const units = {
      ...base,
      initialUnits: '10',
      withdrawal: { kind: 'units' as const, units: '2.5', initialNavPaise: 10_000 },
    }
    const level = calculateSwp(units)
    expect(level.withdrawnPaise).toBe(75_000)
    expect(level.endingBalancesPaise.main).toBe(25_000)
    const rising = calculateSwp({
      ...units,
      returnPath: { kind: 'constant', annualPercent: '100' },
    })
    const payouts = rising.events.filter((event) => event.kind === 'withdrawal')
    expect(payouts[0]?.deltaPaise).toBe(-25_000)
    expect(payouts[1]?.deltaPaise).toBeLessThan(-25_000)
    const unavailable = calculateSwp({
      ...units,
      withdrawal: { ...units.withdrawal, units: '6' },
    })
    expect(unavailable.withdrawnPaise).toBe(60_000)
    expect(unavailable.endingBalancesPaise.main).toBe(40_000)
    expect(unavailable.warnings.join(' ')).toMatch(
      /requested withdrawal unavailable on 2026-02-01/iu,
    )
    expect(unavailable.warnings.join(' ')).not.toMatch(/depleted on 2026-02-01/iu)
  })

  it('exposes the starting NAV and unit payout in its reproducible assumptions', () => {
    const result = calculateSwp({
      ...base,
      initialUnits: '10',
      withdrawal: { kind: 'units', units: '2.5', initialNavPaise: 10_000 },
    })
    expect(result.assumptions.join(' ')).toContain('10000')
    expect(result.assumptions.join(' ')).toContain('2.5')
  })

  it('reports the first unavailable payout after poor early returns without going negative', () => {
    const result = calculateSwp({
      ...base,
      capitalPaise: 1_000_000,
      withdrawal: { kind: 'amount', paise: 600_000 },
      returnPath: {
        kind: 'monthly',
        months: [
          { month: '2026-01', percent: '-50' },
          { month: '2026-02', percent: '0' },
          { month: '2026-03', percent: '0' },
        ],
      },
    })
    expect(result.withdrawnPaise).toBe(600_000)
    expect(result.endingBalancesPaise.main).toBe(200_000)
    expect(result.warnings.join(' ')).toMatch(
      /requested withdrawal unavailable on 2026-02-01/iu,
    )
    expect(result.warnings.join(' ')).not.toMatch(/depleted on 2026-02-01/iu)
    expect(result.events.filter((event) => event.kind === 'withdrawal')).toHaveLength(1)
  })

  it('reports corpus depletion only after the remaining balance actually reaches zero', () => {
    const result = calculateSwp({
      ...base,
      withdrawal: { kind: 'amount', paise: 100_000 },
    })
    expect(result.withdrawnPaise).toBe(100_000)
    expect(result.endingBalancesPaise.main).toBe(0)
    expect(result.warnings.join(' ')).toMatch(/corpus depleted on 2026-02-01/iu)
    expect(result.events.filter((event) => event.kind === 'withdrawal')).toHaveLength(1)
  })

  it('reports unpayable unit requests without converting the oversized units to paise', () => {
    const result = calculateSwp({
      ...base,
      initialUnits: '10',
      withdrawal: {
        kind: 'units',
        units: '1000000000000000',
        initialNavPaise: 10_000,
      },
    })
    expect(result.withdrawnPaise).toBe(0)
    expect(result.endingBalancesPaise.main).toBe(100_000)
    expect(result.warnings.join(' ')).toMatch(
      /requested withdrawal unavailable on 2026-01-01/iu,
    )
    expect(result.warnings.join(' ')).not.toMatch(/depleted on 2026-01-01/iu)
  })

  it('rejects inconsistent units/NAV and requires returns through maturity after depletion', () => {
    expect(() =>
      calculateSwp({
        ...base,
        initialUnits: '10',
        withdrawal: { kind: 'units', units: '1', initialNavPaise: 0 },
      }),
    ).toThrow(/NAV/u)
    expect(() =>
      calculateSwp({
        ...base,
        initialUnits: '10',
        withdrawal: { kind: 'units', units: '1', initialNavPaise: 5_000 },
      }),
    ).toThrow(/starting value/u)
    expect(() =>
      calculateSwp({
        ...base,
        withdrawal: { kind: 'amount', paise: 120_000 },
        returnPath: { kind: 'monthly', months: [{ month: '2026-01', percent: '0' }] },
      }),
    ).toThrow(/2026-02/u)
  })
})
