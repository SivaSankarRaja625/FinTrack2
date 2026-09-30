import { afterEach, describe, expect, it, vi } from 'vitest'

import { account, financeData, timestamp, transaction } from '../test/fixtures'
import type { ImportBatch } from '../domain/types'
import { createSecurityConfig, testKdfParameters } from './crypto'
import { FinTrackDatabase, metadataKeys } from './database'
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
  it('rolls back deletions if a related encrypted write fails', async () => {
    db = new FinTrackDatabase(`repository-test-${crypto.randomUUID()}`)
    const { dataKey } = await createSecurityConfig('secure-pin', testKdfParameters)
    const repository = new FinanceRepository(dataKey, db)
    await repository.replaceAll(
      financeData({ accounts: [account()], transactions: [transaction()] }),
    )
    const before = await db.records.toArray()
    const write = vi
      .spyOn(db.records, 'bulkPut')
      .mockRejectedValueOnce(new Error('Storage write failed'))
    try {
      await expect(
        repository.mutate((data) => ({
          ...data,
          accounts: [{ ...data.accounts[0]!, name: 'Must not survive' }],
          transactions: [],
        })),
      ).rejects.toThrow('Storage write failed')
    } finally {
      write.mockRestore()
    }
    expect(await db.records.toArray()).toEqual(before)
  })
  it('commits related records together and leaves no partial mutation on failure', async () => {
    db = new FinTrackDatabase(`repository-test-${crypto.randomUUID()}`)
    const { dataKey } = await createSecurityConfig('secure-pin', testKdfParameters)
    const repository = new FinanceRepository(dataKey, db)
    await repository.replaceAll(financeData({ accounts: [account()] }))
    await db.metadata.put({ key: metadataKeys.dataSchema, value: 2 })
    await expect(
      repository.mutate(() => {
        throw new Error('Invalid payment')
      }),
    ).rejects.toThrow('Invalid payment')
    expect((await repository.loadAll()).transactions).toHaveLength(0)
    await repository.mutate((data) => ({
      ...data,
      accounts: [{ ...data.accounts[0]!, name: 'Changed together' }],
      transactions: [transaction()],
    }))
    const loaded = await repository.loadAll()
    expect(loaded.accounts[0]?.name).toBe('Changed together')
    expect(loaded.transactions[0]?.amountPaise).toBe(10_000)
    expect((await db.metadata.get(metadataKeys.dataSchema))?.value).toBe(3)
  })

  it('rejects conflicting concurrent mutations instead of overwriting a newer balance', async () => {
    db = new FinTrackDatabase(`repository-test-${crypto.randomUUID()}`)
    const { dataKey } = await createSecurityConfig('secure-pin', testKdfParameters)
    const repository = new FinanceRepository(dataKey, db)
    await repository.replaceAll(financeData({ accounts: [account()] }))
    const change = (data: ReturnType<typeof financeData>) => ({
      ...data,
      accounts: data.accounts.map((item) => ({
        ...item,
        openingBalancePaise: item.openingBalancePaise + 100,
      })),
    })
    const results = await Promise.allSettled([
      repository.mutate(change),
      repository.mutate(change),
    ])
    expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(1)
    expect((await repository.loadAll()).accounts[0]?.openingBalancePaise).toBe(100_100)
  })
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
