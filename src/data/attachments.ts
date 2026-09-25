import type { AttachmentMeta } from '../domain/types'
import { decryptBytes, decryptJson, encryptBytes, encryptJson } from './crypto'
import type { FinTrackDatabase } from './database'
import { database } from './database'

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024
export const allowedAttachmentTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
])

export interface Attachment {
  metadata: AttachmentMeta
  content: Uint8Array
}

export async function hashAttachment(content: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(content))
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

function hasExpectedSignature(mimeType: string, content: Uint8Array): boolean {
  if (mimeType === 'application/pdf') {
    return (
      content[0] === 0x25 &&
      content[1] === 0x50 &&
      content[2] === 0x44 &&
      content[3] === 0x46 &&
      content[4] === 0x2d
    )
  }
  if (mimeType === 'image/jpeg') {
    return content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff
  }
  if (mimeType === 'image/png') {
    return (
      content[0] === 0x89 &&
      content[1] === 0x50 &&
      content[2] === 0x4e &&
      content[3] === 0x47 &&
      content[4] === 0x0d &&
      content[5] === 0x0a &&
      content[6] === 0x1a &&
      content[7] === 0x0a
    )
  }
  return (
    mimeType === 'image/webp' &&
    content[0] === 0x52 &&
    content[1] === 0x49 &&
    content[2] === 0x46 &&
    content[3] === 0x46 &&
    content[8] === 0x57 &&
    content[9] === 0x45 &&
    content[10] === 0x42 &&
    content[11] === 0x50
  )
}

export class AttachmentRepository {
  private readonly dataKey: CryptoKey
  private readonly db: FinTrackDatabase

  constructor(dataKey: CryptoKey, db: FinTrackDatabase = database) {
    this.dataKey = dataKey
    this.db = db
  }

  async put(metadata: AttachmentMeta, content: Uint8Array): Promise<void> {
    if (!allowedAttachmentTypes.has(metadata.mimeType)) {
      throw new Error('Only PDF, JPEG, PNG, and WebP files are supported')
    }
    if (content.byteLength !== metadata.size) {
      throw new Error('The attachment size does not match its metadata')
    }
    if (content.byteLength > MAX_ATTACHMENT_BYTES) {
      throw new Error('The attachment exceeds the 20 MB per-file limit')
    }
    if (!hasExpectedSignature(metadata.mimeType, content)) {
      throw new Error('The file contents do not match the selected document type')
    }
    if ((await hashAttachment(content)) !== metadata.contentHash) {
      throw new Error('The attachment content hash does not match its metadata')
    }

    const encryptedMetadata = await encryptJson(
      metadata,
      this.dataKey,
      `fintrack:attachment-meta:v1:${metadata.id}`,
    )
    const encryptedContent = await encryptBytes(
      content,
      this.dataKey,
      `fintrack:attachment-content:v1:${metadata.id}`,
    )
    await this.db.attachments.put({
      id: metadata.id,
      envelopeVersion: 1,
      metadataIv: encryptedMetadata.iv,
      metadataCiphertext: encryptedMetadata.ciphertext,
      contentIv: encryptedContent.iv,
      contentCiphertext: encryptedContent.ciphertext,
      updatedAt: new Date().toISOString(),
    })
  }

  async get(id: string): Promise<Attachment | null> {
    const row = await this.db.attachments.get(id)
    if (!row) return null
    if (row.envelopeVersion !== 1) {
      throw new Error('This attachment encryption version is not supported')
    }
    const metadata = await decryptJson<AttachmentMeta>(
      { iv: row.metadataIv, ciphertext: row.metadataCiphertext },
      this.dataKey,
      `fintrack:attachment-meta:v1:${id}`,
    )
    const content = await decryptBytes(
      { iv: row.contentIv, ciphertext: row.contentCiphertext },
      this.dataKey,
      `fintrack:attachment-content:v1:${id}`,
    )
    if ((await hashAttachment(content)) !== metadata.contentHash) {
      throw new Error('The attachment failed its integrity check')
    }
    return { metadata, content }
  }

  async listMetadata(): Promise<AttachmentMeta[]> {
    const rows = await this.db.attachments.toArray()
    return Promise.all(
      rows.map((row) =>
        decryptJson<AttachmentMeta>(
          { iv: row.metadataIv, ciphertext: row.metadataCiphertext },
          this.dataKey,
          `fintrack:attachment-meta:v1:${row.id}`,
        ),
      ),
    )
  }

  async listAll(): Promise<Attachment[]> {
    const rows = await this.db.attachments.toArray()
    const attachments = await Promise.all(rows.map((row) => this.get(row.id)))
    return attachments.filter((item): item is Attachment => item !== null)
  }

  async delete(id: string): Promise<void> {
    await this.db.attachments.delete(id)
  }

  async clear(): Promise<void> {
    await this.db.attachments.clear()
  }
}
