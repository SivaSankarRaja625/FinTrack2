import Dexie, { type EntityTable } from 'dexie'

import type { CollectionName, ISODateTime } from '../domain/types'
import type { EncryptedPayload, SecurityConfig } from './crypto'

export interface MetadataRow {
  key: string
  value: unknown
}

export interface EncryptedRecordRow extends EncryptedPayload {
  key: string
  collection: CollectionName
  recordId: string
  envelopeVersion: 1
  updatedAt: ISODateTime
}

export interface EncryptedAttachmentRow {
  id: string
  envelopeVersion: 1
  metadataIv: string
  metadataCiphertext: string
  contentIv: string
  contentCiphertext: string
  updatedAt: ISODateTime
}

export class FinTrackDatabase extends Dexie {
  metadata!: EntityTable<MetadataRow, 'key'>
  records!: EntityTable<EncryptedRecordRow, 'key'>
  attachments!: EntityTable<EncryptedAttachmentRow, 'id'>

  constructor(name = 'fintrack') {
    super(name)
    this.version(1).stores({
      metadata: '&key',
      records: '&key, collection, recordId, updatedAt',
      attachments: '&id, updatedAt',
    })
  }
}

export const database = new FinTrackDatabase()

export const metadataKeys = {
  security: 'security',
  dataSchema: 'data-schema',
} as const

export async function getSecurityConfig(
  db: FinTrackDatabase = database,
): Promise<SecurityConfig | null> {
  const row = await db.metadata.get(metadataKeys.security)
  return (row?.value as SecurityConfig | undefined) ?? null
}

export async function setSecurityConfig(
  config: SecurityConfig,
  db: FinTrackDatabase = database,
): Promise<void> {
  await db.metadata.put({ key: metadataKeys.security, value: config })
}

export async function hasLocalData(db: FinTrackDatabase = database): Promise<boolean> {
  return (await db.records.count()) > 0 || (await getSecurityConfig(db)) !== null
}
