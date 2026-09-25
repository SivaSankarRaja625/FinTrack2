import type { Table } from 'dexie'

import { emptyFinanceData } from '../domain/defaults'
import type {
  CollectionName,
  FinanceData,
  FinanceEntity,
  ImportBatch,
  Transaction,
} from '../domain/types'
import { decryptJson, encryptJson } from './crypto'
import type { FinTrackDatabase } from './database'
import { type EncryptedRecordRow, database, metadataKeys } from './database'

const DATA_SCHEMA_VERSION = 1
const collections = [
  'profiles',
  'settings',
  'accounts',
  'categories',
  'transactions',
  'recurringRules',
  'budgets',
  'assets',
  'loans',
  'investments',
  'insurancePolicies',
  'goals',
  'importBatches',
  'netWorthSnapshots',
] as const satisfies readonly CollectionName[]

function recordContext(collection: CollectionName, recordId: string): string {
  return `fintrack:record:v1:${collection}:${recordId}`
}

function recordKey(collection: CollectionName, recordId: string): string {
  return `${collection}:${recordId}`
}

export class FinanceRepository {
  private readonly dataKey: CryptoKey
  private readonly db: FinTrackDatabase

  constructor(dataKey: CryptoKey, db: FinTrackDatabase = database) {
    this.dataKey = dataKey
    this.db = db
  }

  async loadAll(): Promise<FinanceData> {
    const data = emptyFinanceData()
    const rows = await this.db.records.toArray()
    for (const row of rows) {
      if (!collections.includes(row.collection)) continue
      const entity = await this.decryptRow(row)
      ;(data[row.collection] as FinanceEntity[]).push(entity)
    }
    return data
  }

  async list<K extends CollectionName>(collection: K): Promise<FinanceData[K]> {
    const rows = await this.db.records.where('collection').equals(collection).toArray()
    const entities = await Promise.all(rows.map((row) => this.decryptRow(row)))
    return entities as FinanceData[K]
  }

  async put<K extends CollectionName>(
    collection: K,
    entity: FinanceData[K][number],
  ): Promise<void> {
    await this.db.records.put(await this.encryptEntity(collection, entity))
  }

  async bulkPut<K extends CollectionName>(
    collection: K,
    entities: FinanceData[K],
  ): Promise<void> {
    const rows = await Promise.all(
      entities.map((entity) => this.encryptEntity(collection, entity)),
    )
    await this.db.records.bulkPut(rows)
  }

  async delete(collection: CollectionName, id: string): Promise<void> {
    await this.db.records.delete(recordKey(collection, id))
  }

  async bulkDelete(collection: CollectionName, ids: readonly string[]): Promise<void> {
    await this.db.records.bulkDelete(ids.map((id) => recordKey(collection, id)))
  }

  async commitImport(
    transactions: readonly Transaction[],
    batch: ImportBatch,
  ): Promise<void> {
    const rows = await Promise.all([
      ...transactions.map((transaction) =>
        this.encryptEntity('transactions', transaction),
      ),
      this.encryptEntity('importBatches', batch),
    ])
    await this.db.transaction('rw', this.db.records, async () => {
      await this.db.records.bulkPut(rows)
    })
  }

  async rollbackImport(batch: ImportBatch): Promise<void> {
    const batchRow = await this.encryptEntity('importBatches', batch)
    const transactionKeys = batch.createdTransactionIds.map((id) =>
      recordKey('transactions', id),
    )
    await this.db.transaction('rw', this.db.records, async () => {
      await this.db.records.bulkDelete(transactionKeys)
      await this.db.records.put(batchRow)
    })
  }

  async replaceAll(data: FinanceData): Promise<void> {
    const rows = await this.encryptData(data)

    await this.db.transaction(
      'rw',
      this.db.records as Table<EncryptedRecordRow, string>,
      this.db.metadata,
      async () => {
        await this.db.records.clear()
        await this.db.records.bulkPut(rows)
        await this.db.metadata.put({
          key: metadataKeys.dataSchema,
          value: DATA_SCHEMA_VERSION,
        })
      },
    )
  }

  async encryptData(data: FinanceData): Promise<EncryptedRecordRow[]> {
    const rows: EncryptedRecordRow[] = []
    for (const collection of collections) {
      for (const entity of data[collection]) {
        rows.push(await this.encryptEntity(collection, entity))
      }
    }
    return rows
  }

  private async encryptEntity<K extends CollectionName>(
    collection: K,
    entity: FinanceData[K][number],
  ): Promise<EncryptedRecordRow> {
    const payload = await encryptJson(
      entity,
      this.dataKey,
      recordContext(collection, entity.id),
    )
    return {
      key: recordKey(collection, entity.id),
      collection,
      recordId: entity.id,
      envelopeVersion: 1,
      updatedAt: entity.updatedAt,
      ...payload,
    }
  }

  private async decryptRow(row: EncryptedRecordRow): Promise<FinanceEntity> {
    if (row.envelopeVersion !== 1) {
      throw new Error(`Unsupported record envelope version: ${row.envelopeVersion}`)
    }
    return decryptJson<FinanceEntity>(
      row,
      this.dataKey,
      recordContext(row.collection, row.recordId),
    )
  }
}

export { DATA_SCHEMA_VERSION, collections as financeCollections }
