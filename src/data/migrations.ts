import { validateFinanceData } from '../domain/schemas'
import { AttachmentRepository } from './attachments'
import {
  CURRENT_DATA_SCHEMA_VERSION,
  type FinTrackDatabase,
  metadataKeys,
} from './database'
import { validateRelations } from './invariants'
import { FinanceRepository } from './repository'

export class UnsupportedDataSchemaError extends Error {}

export function validatedDataSchemaVersion(value: unknown): 1 | 2 | 3 {
  if (value === 1 || value === 2 || value === CURRENT_DATA_SCHEMA_VERSION) return value
  if (Number.isInteger(value) && Number(value) > CURRENT_DATA_SCHEMA_VERSION) {
    throw new UnsupportedDataSchemaError(
      'This workspace requires a newer version of FinTrack. Install the latest APK; your data has not been changed.',
    )
  }
  throw new UnsupportedDataSchemaError(
    'The workspace schema version is invalid. Your data has not been changed.',
  )
}

export function upgradeFinanceData(value: unknown, version: unknown) {
  validatedDataSchemaVersion(version)
  return validateFinanceData(value)
}

export async function migrateUnlockedWorkspace(
  dataKey: CryptoKey,
  db: FinTrackDatabase,
): Promise<void> {
  const marker = await db.metadata.get(metadataKeys.dataSchema)
  const version = validatedDataSchemaVersion(marker?.value)
  if (version === CURRENT_DATA_SCHEMA_VERSION) return

  const records = upgradeFinanceData(
    await new FinanceRepository(dataKey, db).loadAll(),
    version,
  )
  const attachments = await new AttachmentRepository(dataKey, db).listMetadata()
  validateRelations(records, attachments)

  await db.transaction('rw', db.metadata, async () => {
    const current = await db.metadata.get(metadataKeys.dataSchema)
    if (current?.value !== version) {
      throw new Error('The workspace schema changed during upgrade; retry unlock')
    }
    await db.metadata.put({
      key: metadataKeys.dataSchema,
      value: CURRENT_DATA_SCHEMA_VERSION,
    })
  })
}
