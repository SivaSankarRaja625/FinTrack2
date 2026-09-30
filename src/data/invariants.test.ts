import { describe, expect, it } from 'vitest'

import {
  account,
  financeData,
  profile,
  settings,
  timestamp,
  transaction,
  loan,
} from '../test/fixtures'
import { validateRelations } from './invariants'
import { applyFinancialCommand } from '../domain/financial-events'

describe('validateRelations', () => {
  it.each(['cash', 'source', 'amount'] as const)(
    'checks broken event %s even in a workspace with no goals',
    (problem) => {
      const data = applyFinancialCommand(
        financeData({
          profiles: [profile()],
          settings: [settings()],
          accounts: [account()],
          loans: [loan()],
        }),
        {
          id: 'payment',
          timestamp,
          kind: 'loan-payment',
          sourceId: 'loan-1',
          date: '2026-09-24',
          principalPaise: 100,
          interestPaise: 10,
          prepaymentPaise: 0,
          note: '',
          cash: { mode: 'new', accountId: 'account-1', categoryId: null },
        },
      )
      const broken =
        problem === 'cash'
          ? { ...data, transactions: [] }
          : {
              ...data,
              financialEvents: data.financialEvents.map((event) =>
                problem === 'source'
                  ? { ...event, sourceId: 'missing' }
                  : { ...event, amountPaise: 111 },
              ),
            }
      expect(() => validateRelations(broken)).toThrow(/financial event|Financial event/)
    },
  )

  it('checks deposit account references without requiring an unrelated goal', () => {
    const data = financeData({
      profiles: [profile()],
      settings: [settings()],
      assets: [
        {
          id: 'fd',
          name: 'Deposit',
          kind: 'asset',
          type: 'fixed-deposit',
          valuePaise: 100_000,
          valuationDate: '2026-09-01',
          includeInNetWorth: true,
          note: '',
          createdAt: timestamp,
          updatedAt: timestamp,
          deposit: {
            principalPaise: 100_000,
            maturityDate: '2027-09-01',
            maturityAmountPaise: 110_000,
            maturityInstruction: 'payout',
            cashAccountId: 'missing',
            interestFrequency: 'at-maturity',
            interestPaise: 0,
            nextInterestDate: null,
            paidInterestDates: [],
            status: 'active',
          },
        },
      ],
    })
    expect(() => validateRelations(data)).toThrow('valid cash account')
  })
  it('requires one profile and settings record', () => {
    expect(() => validateRelations(financeData())).toThrow(/profile/u)
    expect(() => validateRelations(financeData({ profiles: [profile()] }))).toThrow(
      /settings/u,
    )
  })

  it('rejects transaction splits that do not reconcile to the posted amount', () => {
    const records = financeData({
      profiles: [profile()],
      settings: [settings()],
      accounts: [account()],
      categories: [
        {
          id: 'category-1',
          name: 'Food',
          kind: 'expense',
          parentId: null,
          essential: true,
          color: '#000000',
          system: false,
          archived: false,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      transactions: [
        transaction({
          amountPaise: 10_000,
          splits: [
            {
              id: 'split',
              categoryId: 'category-1',
              amountPaise: 9_999,
            },
          ],
        }),
      ],
    })

    expect(() => validateRelations(records)).toThrow(/do not balance/u)
  })

  it('requires every encrypted document to have its owning policy', () => {
    const records = financeData({
      profiles: [profile()],
      settings: [settings()],
    })
    expect(() =>
      validateRelations(records, [
        {
          id: 'document',
          ownerType: 'insurance',
          ownerId: 'missing-policy',
          filename: 'policy.pdf',
          mimeType: 'application/pdf',
          size: 10,
          contentHash: 'hash',
          createdAt: timestamp,
        },
      ]),
    ).toThrow(/owning policy/u)
  })
})
