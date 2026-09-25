import { afterEach, describe, expect, it } from 'vitest'

import { account, financeData, timestamp, transaction } from '../test/fixtures'
import type { ImportBatch } from '../domain/types'
import { createSecurityConfig, testKdfParameters } from './crypto'
import { FinTrackDatabase } from './database'
import { FinanceRepository } from './repository'

let db: FinTrackDatabase | null = null

afterEach(async () => {
  if (db) {
    db.close()
    await db.delete()
    db = null
  }
})

describe('encrypted repository', () => {
  it('stores only ciphertext and restores typed collections', async () => {
    db = new FinTrackDatabase(`repository-test-${crypto.randomUUID()}`)
    const { dataKey } = await createSecurityConfig('secure-pin', testKdfParameters)
    const repository = new FinanceRepository(dataKey, db)
    const savedAccount = account({ name: 'Private bank account' })
    await repository.put('accounts', savedAccount)

    const raw = await db.records.toArray()
    expect(JSON.stringify(raw)).not.toContain('Private bank account')
    await expect(repository.list('accounts')).resolves.toEqual([savedAccount])
  })

  it('atomically replaces all structured collections', async () => {
    db = new FinTrackDatabase(`repository-test-${crypto.randomUUID()}`)
    const { dataKey } = await createSecurityConfig('secure-pin', testKdfParameters)
    const repository = new FinanceRepository(dataKey, db)
    const savedAccount = account()
    const savedTransaction = transaction()
    await repository.replaceAll(
      financeData({
        accounts: [savedAccount],
        transactions: [savedTransaction],
      }),
    )

    const loaded = await repository.loadAll()
    expect(loaded.accounts).toEqual([savedAccount])
    expect(loaded.transactions).toEqual([savedTransaction])
    expect(await db.records.count()).toBe(2)
  })

  it('commits and rolls back an import batch in one transaction', async () => {
    db = new FinTrackDatabase(`repository-test-${crypto.randomUUID()}`)
    const { dataKey } = await createSecurityConfig('secure-pin', testKdfParameters)
    const repository = new FinanceRepository(dataKey, db)
    const first = transaction({ id: 'first', importBatchId: 'batch' })
    const second = transaction({ id: 'second', importBatchId: 'batch' })
    const batch: ImportBatch = {
      id: 'batch',
      filename: 'statement.csv',
      importedAt: timestamp,
      rowCount: 2,
      createdTransactionIds: [first.id, second.id],
      duplicateCount: 0,
      rolledBackAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    await repository.commitImport([first, second], batch)
    expect(await repository.list('transactions')).toHaveLength(2)
    await repository.rollbackImport({ ...batch, rolledBackAt: timestamp })
    expect(await repository.list('transactions')).toHaveLength(0)
    expect((await repository.list('importBatches'))[0]?.rolledBackAt).toBe(timestamp)
  })
})
