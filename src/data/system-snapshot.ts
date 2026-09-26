import type { EncryptedRecordRow, MetadataRow } from './database'
import { FinTrackDatabase, database, getSecurityConfig, metadataKeys } from './database'
import { unlockDataKey } from './crypto'
import { decodeUtf8, utf8 } from './encoding'
import { validateRelations } from './invariants'
import { FinanceRepository } from './repository'
import { resetRestoredDeviceState } from './recovery-settings'
import { validateFinanceData } from '../domain/schemas'
import { newId } from '../domain/id'

export const SYSTEM_SNAPSHOT_MAX_BYTES = 20 * 1024 * 1024
const SYSTEM_SNAPSHOT_MAGIC = 'FINTRACK-SYSTEM-SNAPSHOT'

export interface SystemSnapshot {
  magic: typeof SYSTEM_SNAPSHOT_MAGIC
  formatVersion: 1
  createdAt: string
  metadata: MetadataRow[]
  records: EncryptedRecordRow[]
}

export async function createSystemSnapshot(
  dataKey: CryptoKey,
  db: FinTrackDatabase = database,
): Promise<Uint8Array> {
  const security = await getSecurityConfig(db)
  if (!security) throw new Error('The encrypted workspace is not initialized')
  const repository = new FinanceRepository(dataKey, db)
  const data = await repository.loadAll()
  const records = await repository.encryptData({
    ...data,
    insurancePolicies: data.insurancePolicies.map((policy) => ({
      ...policy,
      attachmentIds: [],
    })),
  })
  const dataSchema = await db.metadata.get(metadataKeys.dataSchema)
  const snapshot: SystemSnapshot = {
    magic: SYSTEM_SNAPSHOT_MAGIC,
    formatVersion: 1,
    createdAt: new Date().toISOString(),
    metadata: [
      { key: metadataKeys.security, value: security },
      dataSchema ?? { key: metadataKeys.dataSchema, value: 2 },
    ],
    records,
  }
  const bytes = utf8(JSON.stringify(snapshot))
  if (bytes.byteLength > SYSTEM_SNAPSHOT_MAX_BYTES) {
    throw new Error(
      'Structured data is too large for reliable Android system backup; create a complete manual backup instead',
    )
  }
  return bytes
}

function parseSystemSnapshot(bytes: Uint8Array): SystemSnapshot {
  if (bytes.byteLength > SYSTEM_SNAPSHOT_MAX_BYTES) {
    throw new Error('The Android system snapshot exceeds the 20 MB safety limit')
  }
  let value: unknown
  try {
    value = JSON.parse(decodeUtf8(bytes))
  } catch {
    throw new Error('The Android system snapshot is not valid JSON')
  }
  if (!value || typeof value !== 'object') {
    throw new Error('The Android system snapshot is invalid')
  }
  const snapshot = value as Partial<SystemSnapshot>
  if (
    snapshot.magic !== SYSTEM_SNAPSHOT_MAGIC ||
    snapshot.formatVersion !== 1 ||
    !Array.isArray(snapshot.metadata) ||
    !Array.isArray(snapshot.records)
  ) {
    throw new Error('The Android system snapshot version is not supported')
  }
  for (const row of snapshot.records) {
    if (
      typeof row.key !== 'string' ||
      typeof row.collection !== 'string' ||
      typeof row.recordId !== 'string' ||
      typeof row.iv !== 'string' ||
      typeof row.ciphertext !== 'string' ||
      row.envelopeVersion !== 1
    ) {
      throw new Error('The Android system snapshot contains an invalid record')
    }
  }
  return snapshot as SystemSnapshot
}

export async function restoreSystemSnapshot(
  bytes: Uint8Array,
  pin: string,
  db: FinTrackDatabase = database,
): Promise<CryptoKey> {
  if (
    (await db.records.count()) > 0 ||
    (await db.metadata.count()) > 0 ||
    (await db.attachments.count()) > 0
  ) {
    throw new Error('System backup can only restore into an empty installation')
  }
  const snapshot = parseSystemSnapshot(bytes)
  const staging = new FinTrackDatabase(`fintrack-system-restore-${newId()}`)
  try {
    await staging.transaction('rw', staging.metadata, staging.records, async () => {
      await staging.metadata.bulkPut(snapshot.metadata)
      await staging.records.bulkPut(snapshot.records)
    })
    const security = await getSecurityConfig(staging)
    if (!security) throw new Error('The Android system snapshot has no security data')
    const dataKey = await unlockDataKey(pin, security)
    const stagedRepository = new FinanceRepository(dataKey, staging)
    const records = validateFinanceData(await stagedRepository.loadAll())
    validateRelations(records, [])
    const importedSettings = records.settings[0]
    if (!importedSettings) throw new Error('The system snapshot has no settings record')
    await stagedRepository.put('settings', resetRestoredDeviceState(importedSettings))

    const [checkedMetadata, checkedRecords] = await Promise.all([
      staging.metadata.toArray(),
      staging.records.toArray(),
    ])
    await db.transaction('rw', db.metadata, db.records, async () => {
      await db.metadata.bulkPut(checkedMetadata)
      await db.records.bulkPut(checkedRecords)
    })
    return dataKey
  } finally {
    staging.close()
    await staging.delete()
  }
}
