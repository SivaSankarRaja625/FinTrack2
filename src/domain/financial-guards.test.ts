import { describe, expect, it } from 'vitest'

import { prepareSourceRemoval } from './financial-guards'
import {
  account,
  financeData,
  loan,
  profile,
  settings,
  timestamp,
  transaction,
} from '../test/fixtures'
import { validateRelations } from '../data/invariants'

describe('financial source removal', () => {
  it('pauses a linked duplicate schedule when its owning loan is removed', () => {
    const data = financeData({
      loans: [loan()],
      recurringRules: [
        {
          id: 'duplicate',
          name: 'Loan EMI',
          kind: 'expense',
          amountPaise: 100_000,
          accountId: 'account-1',
          destinationAccountId: null,
          categoryId: null,
          frequency: 'monthly',
          startDate: '2026-09-01',
          nextDate: '2026-10-05',
          endDate: null,
          active: true,
          reminderDays: 3,
          obligation: { kind: 'loan', id: 'loan-1' },
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
    })
    const next = prepareSourceRemoval(data, 'loans', 'loan-1', timestamp)
    expect(next.recurringRules[0]?.active).toBe(false)
    expect(next.recurringRules[0]?.obligation).toBeUndefined()
  })
  it('preserves import audit history while removing the deleted row from active rollback references', () => {
    const imported = transaction({ categoryId: null, importBatchId: 'batch' })
    const data = financeData({
      profiles: [profile()],
      settings: [settings()],
      accounts: [account()],
      transactions: [imported],
      importBatches: [
        {
          id: 'batch',
          filename: 'statement.csv',
          importedAt: timestamp,
          rowCount: 1,
          createdTransactionIds: [imported.id],
          duplicateCount: 0,
          rolledBackAt: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
    })
    const prepared = prepareSourceRemoval(data, 'transactions', imported.id, timestamp)
    const next = { ...prepared, transactions: [] }
    expect(() => validateRelations(next)).not.toThrow()
    expect(next.importBatches[0]?.createdTransactionIds).toEqual([])
    expect(next.importBatches[0]?.removedTransactionIds).toEqual([imported.id])
    expect(next.importBatches[0]?.rowCount).toBe(1)
  })
  it('does not resurrect a stale linked account when deleting a paid loan', () => {
    const data = financeData({
      accounts: [
        account({ id: 'loan-account', type: 'loan', openingBalancePaise: -10_000_000 }),
      ],
      loans: [loan({ accountId: 'loan-account', active: false, outstandingPaise: 0 })],
    })
    expect(() => prepareSourceRemoval(data, 'loans', 'loan-1', timestamp)).toThrow(
      'linked account',
    )
    expect(() =>
      prepareSourceRemoval(
        { ...data, accounts: [{ ...data.accounts[0]!, archived: true }] },
        'loans',
        'loan-1',
        timestamp,
      ),
    ).not.toThrow()
  })
})
