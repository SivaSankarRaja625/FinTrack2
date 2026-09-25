import { describe, expect, it } from 'vitest'

import { buildResult } from './result'
import { compareScenarios, withDatedYield, xirr } from './compare'

describe('dated scenario comparisons', () => {
  const deposited = buildResult(
    'fd',
    '2026-01-01',
    '2027-01-01',
    [],
    [
      {
        date: '2026-01-01',
        account: 'main',
        kind: 'contribution',
        deltaPaise: 100_000,
        label: 'Deposit',
      },
      {
        date: '2027-01-01',
        account: 'main',
        kind: 'interest',
        deltaPaise: 10_000,
        label: 'Interest',
      },
    ],
  )

  it('annualizes a dated lump sum without mistaking a multiple for a return', () => {
    expect(withDatedYield(deposited, '2027-01-01').xirrPercent).toBeCloseTo(10, 3)
    expect(withDatedYield(deposited, '2028-01-01').xirrPercent).toBeNull()
  })

  it('omits an ambiguous or undefined rate', () => {
    expect(xirr([], 0, '2027-01-01')).toBeNull()
    const multipleSigns = [
      {
        date: '2026-01-01',
        account: 'main',
        kind: 'contribution' as const,
        deltaPaise: 100_000,
        label: 'Start',
      },
      {
        date: '2026-03-01',
        account: 'main',
        kind: 'withdrawal' as const,
        deltaPaise: -50_000,
        label: 'Take',
      },
      {
        date: '2026-06-01',
        account: 'main',
        kind: 'contribution' as const,
        deltaPaise: 20_000,
        label: 'Add',
      },
    ]
    expect(xirr(multipleSigns, 80_000, '2027-01-01')).toBeNull()
  })

  it('uses dated periodic contributions instead of ending-value divided by deposits', () => {
    const contributions = [
      {
        date: '2026-01-01',
        account: 'main',
        kind: 'contribution' as const,
        deltaPaise: 100_000,
        label: 'Start',
      },
      {
        date: '2026-07-01',
        account: 'main',
        kind: 'contribution' as const,
        deltaPaise: 100_000,
        label: 'Add',
      },
    ]
    expect(xirr(contributions, 214_880, '2027-01-01')).toBeCloseTo(10, 1)
  })

  it('excludes internal transfer legs from annualized external cash flows', () => {
    const moved = buildResult(
      'stp',
      '2026-01-01',
      '2027-01-01',
      [],
      [
        {
          date: '2026-01-01',
          account: 'source',
          kind: 'contribution',
          deltaPaise: 100_000,
          label: 'Start',
        },
        {
          date: '2026-07-01',
          account: 'source',
          kind: 'transfer',
          transferId: 'one',
          deltaPaise: -50_000,
          label: 'Redeem',
        },
        {
          date: '2026-07-01',
          account: 'target',
          kind: 'transfer',
          transferId: 'one',
          deltaPaise: 50_000,
          label: 'Subscribe',
        },
      ],
    )
    expect(withDatedYield(moved, '2027-01-01').xirrPercent).toBeCloseTo(0, 8)
  })

  it('annualizes non-cumulative FD payouts without reinvesting them', () => {
    const payouts = buildResult(
      'fd',
      '2026-01-01',
      '2027-01-01',
      [],
      [
        {
          date: '2026-01-01',
          account: 'main',
          kind: 'contribution',
          deltaPaise: 100_000,
          label: 'Deposit',
        },
        {
          date: '2026-04-01',
          account: 'main',
          kind: 'interest',
          deltaPaise: 2_000,
          label: 'Interest',
        },
        {
          date: '2026-04-01',
          account: 'main',
          kind: 'withdrawal',
          deltaPaise: -2_000,
          label: 'Payout',
        },
        {
          date: '2026-07-01',
          account: 'main',
          kind: 'interest',
          deltaPaise: 2_000,
          label: 'Interest',
        },
        {
          date: '2026-07-01',
          account: 'main',
          kind: 'withdrawal',
          deltaPaise: -2_000,
          label: 'Payout',
        },
      ],
    )
    expect(payouts.endingBalancesPaise.main).toBe(100_000)
    expect(withDatedYield(payouts, '2027-01-01').xirrPercent).toBeGreaterThan(4)
  })

  it('flags different cash flows and refuses to invent an intermediate value', () => {
    const alternate = buildResult(
      'fd',
      '2026-01-01',
      '2026-07-01',
      [],
      [
        {
          date: '2026-01-01',
          account: 'main',
          kind: 'contribution',
          deltaPaise: 200_000,
          label: 'Deposit',
        },
      ],
    )
    const compared = compareScenarios([deposited, alternate], '2027-01-01', '0')
    expect(compared[1]).toMatchObject({ differentCashFlows: true, realEndPaise: null })
    expect(compared[0]?.realEndPaise).toBe(110_000)
    expect(() => compareScenarios([deposited, alternate], '2026-06-01', '0')).toThrow(
      /Evaluation date/,
    )
  })

  it('expresses all same-date end balances in a single purchasing-power base date', () => {
    const early = buildResult(
      'sip',
      '2026-01-01',
      '2027-01-01',
      [],
      [
        {
          date: '2026-01-01',
          account: 'main',
          kind: 'contribution',
          deltaPaise: 100_000,
          label: 'Start',
        },
      ],
    )
    const late = buildResult(
      'sip',
      '2026-07-01',
      '2027-01-01',
      [],
      [
        {
          date: '2026-07-01',
          account: 'main',
          kind: 'contribution',
          deltaPaise: 100_000,
          label: 'Start',
        },
      ],
    )
    const [first, second] = compareScenarios([early, late], '2027-01-01', '10')
    expect(first?.realEndPaise).toBe(90_909)
    expect(second?.realEndPaise).toBe(first?.realEndPaise)
  })
})
