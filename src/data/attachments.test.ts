import 'fake-indexeddb/auto'

import { afterEach, describe, expect, it } from 'vitest'

import { createSecurityConfig, testKdfParameters } from './crypto'
import { FinTrackDatabase } from './database'
import { AttachmentRepository, hashAttachment } from './attachments'

const databases: FinTrackDatabase[] = []

afterEach(async () => {
  for (const db of databases) {
    db.close()
    await db.delete()
  }
  databases.length = 0
})

describe('AttachmentRepository', () => {
  it('encrypts and verifies a file with the expected content signature', async () => {
    const db = new FinTrackDatabase(`attachments-${crypto.randomUUID()}`)
    databases.push(db)
    const { dataKey } = await createSecurityConfig('secure-pin', testKdfParameters)
    const repository = new AttachmentRepository(dataKey, db)
    const content = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])

    await repository.put(
      {
        id: 'document',
        ownerType: 'insurance',
        ownerId: 'policy',
        filename: 'policy.pdf',
        mimeType: 'application/pdf',
        size: content.byteLength,
        contentHash: await hashAttachment(content),
        createdAt: '2026-09-24T12:00:00.000Z',
      },
      content,
    )

    const restored = await repository.get('document')
    expect(restored?.metadata.filename).toBe('policy.pdf')
    expect(restored?.content).toEqual(content)
    expect(JSON.stringify(await db.attachments.get('document'))).not.toContain(
      'policy.pdf',
    )
  })

  it('rejects a file whose bytes do not match its declared type', async () => {
    const db = new FinTrackDatabase(`attachments-${crypto.randomUUID()}`)
    databases.push(db)
    const { dataKey } = await createSecurityConfig('secure-pin', testKdfParameters)
    const repository = new AttachmentRepository(dataKey, db)
    const content = new Uint8Array([1, 2, 3, 4])

    await expect(
      repository.put(
        {
          id: 'document',
          ownerType: 'insurance',
          ownerId: 'policy',
          filename: 'not-a-pdf.pdf',
          mimeType: 'application/pdf',
          size: content.byteLength,
          contentHash: await hashAttachment(content),
          createdAt: '2026-09-24T12:00:00.000Z',
        },
        content,
      ),
    ).rejects.toThrow(/contents/u)
  })

  it('rejects content that does not match the recorded integrity hash', async () => {
    const db = new FinTrackDatabase(`attachments-${crypto.randomUUID()}`)
    databases.push(db)
    const { dataKey } = await createSecurityConfig('secure-pin', testKdfParameters)
    const repository = new AttachmentRepository(dataKey, db)
    const content = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])

    await expect(
      repository.put(
        {
          id: 'document',
          ownerType: 'insurance',
          ownerId: 'policy',
          filename: 'policy.pdf',
          mimeType: 'application/pdf',
          size: content.byteLength,
          contentHash: '0'.repeat(64),
          createdAt: '2026-09-24T12:00:00.000Z',
        },
        content,
      ),
    ).rejects.toThrow(/hash/u)
  })
})
