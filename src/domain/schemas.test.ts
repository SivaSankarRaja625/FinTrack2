import { describe, expect, it } from 'vitest'

import { transaction } from '../test/fixtures'
import { transactionSchema } from './schemas'

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
