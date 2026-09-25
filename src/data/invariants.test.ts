import { describe, expect, it } from 'vitest'

import {
  account,
  financeData,
  profile,
  settings,
  timestamp,
  transaction,
} from '../test/fixtures'
import { validateRelations } from './invariants'

describe('validateRelations', () => {
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
