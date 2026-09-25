import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { buildResult } from './result'

describe('calculator ledger', () => {
  it('conserves external money across internal transfers', () => {
    expect(
      buildResult(
        'stp',
        '2026-01-01',
        '2026-01-02',
        [],
        [
          {
            date: '2026-01-01',
            account: 'source',
            kind: 'contribution',
            deltaPaise: 10_000,
            label: 'Fund',
          },
          {
            date: '2026-01-02',
            account: 'source',
            kind: 'transfer',
            transferId: 'one',
            deltaPaise: -2_000,
            label: 'Move',
          },
          {
            date: '2026-01-02',
            account: 'target',
            kind: 'transfer',
            transferId: 'one',
            deltaPaise: 2_000,
            label: 'Move',
          },
        ],
      ),
    ).toMatchObject({
      contributedPaise: 10_000,
      endingBalancesPaise: { source: 8_000, target: 2_000 },
      gainPaise: 0,
    })
  })

  it('rejects unsafe totals, unpaired transfers and negative balances', () => {
    expect(() =>
      buildResult(
        'sip',
        '2026-01-01',
        '2026-02-01',
        [],
        [
          {
            date: '2026-01-01',
            account: 'main',
            kind: 'contribution',
            deltaPaise: Number.MAX_SAFE_INTEGER,
            label: 'Start',
          },
          {
            date: '2026-01-02',
            account: 'main',
            kind: 'contribution',
            deltaPaise: 1,
            label: 'Extra',
          },
        ],
      ),
    ).toThrow(/safe integer/)
    expect(() =>
      buildResult(
        'stp',
        '2026-01-01',
        '2026-02-01',
        [],
        [
          {
            date: '2026-01-01',
            account: 'main',
            kind: 'transfer',
            transferId: 'lost',
            deltaPaise: 1,
            label: 'Move',
          },
        ],
      ),
    ).toThrow()
    expect(() =>
      buildResult(
        'stp',
        '2026-01-01',
        '2026-02-01',
        [],
        [
          {
            date: '2026-01-01',
            account: 'main',
            kind: 'contribution',
            deltaPaise: 10,
            label: 'Start',
          },
          {
            date: '2026-01-02',
            account: 'main',
            kind: 'transfer',
            transferId: 'same',
            deltaPaise: -2,
            label: 'Move',
          },
          {
            date: '2026-01-02',
            account: 'main',
            kind: 'transfer',
            transferId: 'same',
            deltaPaise: 2,
            label: 'Move',
          },
        ],
      ),
    ).toThrow(/transfer/)
    expect(() =>
      buildResult(
        'swp',
        '2026-01-01',
        '2026-02-01',
        [],
        [
          {
            date: '2026-01-01',
            account: 'main',
            kind: 'withdrawal',
            deltaPaise: -1,
            label: 'Payout',
          },
        ],
      ),
    ).toThrow()
  })

  it('conserves external funds for any safe transfer and payout', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000_000 }),
        fc.integer({ min: 0, max: 100 }),
        (capital, percent) => {
          const moved = Math.floor((capital * percent) / 100)
          const paid = Math.floor((capital - moved) / 2)
          const result = buildResult(
            'stp',
            '2026-01-01',
            '2026-01-03',
            [],
            [
              {
                date: '2026-01-01',
                account: 'source',
                kind: 'contribution',
                deltaPaise: capital,
                label: 'Start',
              },
              {
                date: '2026-01-02',
                account: 'source',
                kind: 'transfer',
                transferId: 'move',
                deltaPaise: -moved,
                label: 'Send',
              },
              {
                date: '2026-01-02',
                account: 'target',
                kind: 'transfer',
                transferId: 'move',
                deltaPaise: moved,
                label: 'Receive',
              },
              {
                date: '2026-01-03',
                account: 'source',
                kind: 'withdrawal',
                deltaPaise: -paid,
                label: 'Pay',
              },
            ],
          )
          expect(result.contributedPaise).toBe(capital)
          expect(result.withdrawnPaise).toBe(paid)
          expect(
            Object.values(result.endingBalancesPaise).reduce((a, b) => a + b, 0) + paid,
          ).toBe(capital)
        },
      ),
      { numRuns: 100 },
    )
  })
})
