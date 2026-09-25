import { describe, expect, it } from 'vitest'

import { account, transaction } from '../test/fixtures'
import { accountSchema, transactionSchema } from './schemas'

describe('transaction schema', () => {
  it('rejects an unbalanced split', () => {
    const result = transactionSchema.safeParse(
      transaction({
        amountPaise: 10_000,
        splits: [{ id: 'split', categoryId: 'food', amountPaise: 9_000 }],
      }),
    )
    expect(result.success).toBe(false)
  })

  it('requires a destination for transfers', () => {
    const result = transactionSchema.safeParse(
      transaction({ kind: 'transfer', destinationAccountId: null }),
    )
    expect(result.success).toBe(false)
  })
})

describe('credit card account schema', () => {
  const details = {
    lastFour: '0042',
    creditLimitPaise: 10_000_000,
    statementDay: 20,
    paymentDueDay: 9,
  }
  const card = account({
    type: 'credit-card',
    openingBalancePaise: -2_500_000,
    creditCardDetails: details,
  })

  it('keeps old accounts valid and preserves the new card details', () => {
    expect(accountSchema.parse(account())).toEqual(account())
    expect(accountSchema.parse(card).creditCardDetails).toEqual(details)
  })

  it('rejects invalid card digits, limits and cycle days', () => {
    for (const lastFour of ['123', '12345', 'abcd']) {
      expect(
        accountSchema.safeParse({
          ...card,
          creditCardDetails: { ...details, lastFour },
        }).success,
      ).toBe(false)
    }
    for (const creditLimitPaise of [0, -1]) {
      expect(
        accountSchema.safeParse({
          ...card,
          creditCardDetails: { ...details, creditLimitPaise },
        }).success,
      ).toBe(false)
    }
    for (const paymentDueDay of [0, 32, 1.5]) {
      expect(
        accountSchema.safeParse({
          ...card,
          creditCardDetails: { ...details, paymentDueDay },
        }).success,
      ).toBe(false)
    }
    for (const statementDay of [0, 32, 1.5]) {
      expect(
        accountSchema.safeParse({
          ...card,
          creditCardDetails: { ...details, statementDay },
        }).success,
      ).toBe(false)
    }
    expect(accountSchema.safeParse({ ...card, type: 'savings' }).success).toBe(false)
  })
})
