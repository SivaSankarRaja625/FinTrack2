import { describe, expect, it } from 'vitest'
import { previewSmsTransactions, type RawSmsMessage } from '../../domain/sms'
import { createImportBatch } from '../../domain/csv'
import type { Account, Category, Transaction } from '../../domain/types'

describe('SMS import workflow', () => {
  it('previews candidates, matches accounts, detects duplicates and prepares batch', () => {
    const messages: RawSmsMessage[] = [
      {
        id: 'sms-1',
        address: 'VM-HDFCBK',
        body: 'Spent INR 500.00 on CARD xx1234 at SWIGGY on 24-10-2026.',
        dateMs: new Date('2026-10-24T12:00:00Z').getTime(),
      },
      {
        id: 'sms-2',
        address: 'VM-HDFCBK',
        body: 'Spent INR 1,200.00 on CARD xx1234 at AMAZON on 24-10-2026.',
        dateMs: new Date('2026-10-24T14:00:00Z').getTime(),
      },
    ]

    const accounts: Account[] = [
      {
        id: 'acc-1',
        name: 'HDFC Card',
        institution: 'HDFC Bank',
        type: 'credit-card',
        openingBalancePaise: 0,
        includeInNetWorth: true,
        archived: false,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        creditCardDetails: {
          lastFour: '1234',
          creditLimitPaise: 100_000_00,
          statementDay: 1,
          paymentDueDay: 20,
        },
      },
    ]

    const categories: Category[] = [
      {
        id: 'cat-food',
        name: 'Food & Dining',
        kind: 'expense',
        parentId: null,
        essential: true,
        color: '#f97316',
        system: false,
        archived: false,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ]

    const existingTransactions: Transaction[] = [
      {
        id: 'txn-1',
        accountId: 'acc-1',
        destinationAccountId: null,
        categoryId: 'cat-food',
        kind: 'expense',
        amountPaise: 50_000,
        date: '2026-10-24',
        description: 'SWIGGY',
        note: '',
        tags: [],
        cleared: true,
        splits: [],
        recurringRuleId: null,
        importBatchId: null,
        createdAt: '2026-10-24T12:00:00Z',
        updatedAt: '2026-10-24T12:00:00Z',
      },
    ]

    const previews = previewSmsTransactions({
      messages,
      accounts,
      categories,
      existingTransactions,
    })

    expect(previews).toHaveLength(2)
    expect(previews[0]?.duplicate).toBe(true)
    expect(previews[0]?.matchedAccountId).toBe('acc-1')
    expect(previews[0]?.suggestedCategoryId).toBe('cat-food')

    expect(previews[1]?.duplicate).toBe(false)
    expect(previews[1]?.amountPaise).toBe(120_000)

    // Build batch for unselected duplicate vs selected new transaction
    const selected = previews.filter((p) => !p.duplicate)
    expect(selected).toHaveLength(1)

    const now = '2026-10-24T15:00:00Z'
    const batch = createImportBatch(
      'SMS inbox import',
      [],
      previews.filter((p) => p.duplicate).length,
      now,
    )
    expect(batch.filename).toBe('SMS inbox import')
    expect(batch.duplicateCount).toBe(1)
  })
})
