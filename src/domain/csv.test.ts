import { describe, expect, it } from 'vitest'

import { account, timestamp, transaction } from '../test/fixtures'
import {
  parseCsv,
  previewCsvTransactions,
  transactionFingerprint,
  transactionsToCsv,
} from './csv'

describe('CSV interoperability', () => {
  it('parses quoted cells and escaped quotes', () => {
    expect(
      parseCsv('Date,Description,Amount\r\n24/09/2026,"Cafe, ""Central""",250.50'),
    ).toEqual([
      {
        Date: '24/09/2026',
        Description: 'Cafe, "Central"',
        Amount: '250.50',
      },
    ])
  })

  it('normalizes Indian statement rows and identifies duplicates', () => {
    const existing = transaction({
      date: '2026-09-24',
      description: 'Rent',
      amountPaise: 25_000_00,
    })
    const preview = previewCsvTransactions({
      rows: [{ Date: '24/09/2026', Description: 'Rent', Debit: '25,000.00' }],
      mapping: {
        date: 'Date',
        description: 'Description',
        amount: '',
        type: null,
        debit: 'Debit',
        credit: null,
        category: null,
        reference: null,
      },
      accountId: existing.accountId,
      categories: [],
      existing: [existing],
      importBatchId: 'batch',
    })
    expect(preview[0]?.transaction).toMatchObject({
      date: '2026-09-24',
      kind: 'expense',
      amountPaise: 25_000_00,
    })
    expect(preview[0]?.duplicate).toBe(true)
  })

  it('round trips safe CSV quoting', () => {
    const value = transaction({ description: 'Cafe, Central', note: 'Line "A"' })
    const csv = transactionsToCsv(
      [value],
      new Map([[account().id, 'Main']]),
      new Map([['category-1', 'Food']]),
    )
    expect(csv).toContain('"Cafe, Central"')
    expect(csv).toContain('"Line ""A"""')
    expect(transactionFingerprint(value)).toContain('cafe, central')
    expect(timestamp).toBeTruthy()
  })
})
