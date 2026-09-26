import { gunzipSync, gzipSync } from 'fflate'

import { validateFinanceData } from '../domain/schemas'
import type { AttachmentMeta, FinanceData, UserProfile } from '../domain/types'
import { validateRelations } from './invariants'
import {
  type EncryptedPayload,
  type KdfParameters,
  decryptBytes,
  derivePinKey,
  encryptBytes,
  productionKdfParameters,
} from './crypto'
import { base64ToBytes, bytesToBase64, decodeUtf8, utf8 } from './encoding'

const BACKUP_MAGIC = 'FINTRACK-BACKUP'
const BACKUP_FORMAT_VERSION = 1

export interface BackupAttachment {
  metadata: AttachmentMeta
  content: string
}

export interface CompleteBackupPayload {
  dataSchemaVersion: 2
  createdAt: string | null
  records: FinanceData
  attachments: BackupAttachment[]
}

export interface BackupEnvelope extends EncryptedPayload {
  magic: typeof BACKUP_MAGIC
  formatVersion: typeof BACKUP_FORMAT_VERSION
  createdAt: string
  appVersion: string
  salt: string
  kdf: KdfParameters
  compressed: 'gzip'
}

function isBackupEnvelope(value: unknown): value is BackupEnvelope {
  if (!value || typeof value !== 'object') return false
  const envelope = value as Partial<BackupEnvelope>
  return (
    envelope.magic === BACKUP_MAGIC &&
    envelope.formatVersion === BACKUP_FORMAT_VERSION &&
    envelope.compressed === 'gzip' &&
    typeof envelope.salt === 'string' &&
    typeof envelope.iv === 'string' &&
    typeof envelope.ciphertext === 'string' &&
    envelope.kdf?.algorithm === 'argon2id'
  )
}

export async function createCompleteBackup(
  payload: Omit<CompleteBackupPayload, 'dataSchemaVersion' | 'createdAt'> & {
    dataSchemaVersion: 1 | 2
  },
  pin: string,
  options?: { kdf?: KdfParameters; appVersion?: string },
): Promise<Uint8Array> {
  validateFinanceData(payload.records)
  const createdAt = new Date().toISOString()
  const currentPayload: CompleteBackupPayload = {
    ...payload,
    dataSchemaVersion: 2,
    createdAt,
  }
  const kdf = options?.kdf ?? productionKdfParameters
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const backupKey = await derivePinKey(pin, salt, kdf)
  const compressed = gzipSync(utf8(JSON.stringify(currentPayload)), { level: 6 })
  const encrypted = await encryptBytes(
    compressed,
    backupKey,
    `fintrack:complete-backup:v${BACKUP_FORMAT_VERSION}`,
  )
  const envelope: BackupEnvelope = {
    magic: BACKUP_MAGIC,
    formatVersion: BACKUP_FORMAT_VERSION,
    createdAt,
    appVersion: options?.appVersion ?? '0.1.0',
    salt: bytesToBase64(salt),
    kdf,
    compressed: 'gzip',
    ...encrypted,
  }
  return utf8(JSON.stringify(envelope))
}

export async function readCompleteBackup(
  bytes: Uint8Array,
  pin: string,
): Promise<CompleteBackupPayload> {
  let candidate: unknown
  try {
    candidate = JSON.parse(decodeUtf8(bytes))
  } catch {
    throw new Error('This is not a valid FinTrack backup file')
  }
  if (!isBackupEnvelope(candidate)) {
    throw new Error('This backup format or version is not supported')
  }

  const backupKey = await derivePinKey(pin, base64ToBytes(candidate.salt), candidate.kdf)
  const compressed = await decryptBytes(
    candidate,
    backupKey,
    `fintrack:complete-backup:v${candidate.formatVersion}`,
  )
  let parsed: unknown
  try {
    parsed = JSON.parse(decodeUtf8(gunzipSync(compressed)))
  } catch {
    throw new Error('The backup payload is damaged')
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('The backup payload is invalid')
  }
  const payload = parsed as Partial<Omit<CompleteBackupPayload, 'dataSchemaVersion'>> & {
    dataSchemaVersion?: 1 | 2
  }
  if (
    (payload.dataSchemaVersion !== 1 && payload.dataSchemaVersion !== 2) ||
    !Array.isArray(payload.attachments)
  ) {
    throw new Error('The backup data version is not supported')
  }
  if (
    payload.dataSchemaVersion === 2 &&
    (typeof payload.createdAt !== 'string' || Number.isNaN(Date.parse(payload.createdAt)))
  ) {
    throw new Error('The backup creation date is invalid')
  }
  const records = validateFinanceData(payload.records)
  const attachments = payload.attachments.map((attachment, index) => {
    if (
      !attachment ||
      typeof attachment !== 'object' ||
      typeof attachment.content !== 'string' ||
      typeof attachment.metadata?.id !== 'string'
    ) {
      throw new Error(`Attachment ${index + 1} in the backup is invalid`)
    }
    const content = base64ToBytes(attachment.content)
    if (content.byteLength !== attachment.metadata.size) {
      throw new Error(`Attachment ${attachment.metadata.filename} is truncated`)
    }
    return attachment as BackupAttachment
  })
  return {
    dataSchemaVersion: 2,
    createdAt: payload.dataSchemaVersion === 2 ? payload.createdAt! : null,
    records,
    attachments,
  }
}

export async function inspectCompleteBackup(
  bytes: Uint8Array,
  pin: string,
  expectedProfile?: Pick<UserProfile, 'id' | 'createdAt'>,
): Promise<{
  createdAt: string | null
  recordCount: number
  attachmentCount: number
}> {
  const payload = await readCompleteBackup(bytes, pin)
  validateRelations(
    payload.records,
    payload.attachments.map((attachment) => attachment.metadata),
  )
  if (
    expectedProfile &&
    (payload.records.profiles[0]?.id !== expectedProfile.id ||
      payload.records.profiles[0]?.createdAt !== expectedProfile.createdAt)
  ) {
    throw new Error('This backup belongs to a different workspace')
  }
  return {
    createdAt: payload.createdAt,
    recordCount: Object.values(payload.records).reduce(
      (total, collection) => total + collection.length,
      0,
    ),
    attachmentCount: payload.attachments.length,
  }
}

export function attachmentToBackup(
  metadata: AttachmentMeta,
  content: Uint8Array,
): BackupAttachment {
  return { metadata, content: bytesToBase64(content) }
}

export function attachmentFromBackup(attachment: BackupAttachment) {
  return {
    metadata: attachment.metadata,
    content: base64ToBytes(attachment.content),
  }
}
