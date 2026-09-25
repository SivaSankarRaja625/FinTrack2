import { describe, expect, it } from 'vitest'

import { financeData } from '../test/fixtures'
import {
  attachmentFromBackup,
  attachmentToBackup,
  createCompleteBackup,
  readCompleteBackup,
} from './backup'
import { testKdfParameters } from './crypto'

describe('complete encrypted backup', () => {
  const metadata = {
    id: 'attachment-1',
    ownerType: 'insurance' as const,
    ownerId: 'policy-1',
    filename: 'policy.pdf',
    mimeType: 'application/pdf',
    size: 4,
    contentHash: 'test-hash',
    createdAt: '2026-09-24T12:00:00.000Z',
  }
  const content = new Uint8Array([1, 2, 3, 4])

  it('round trips records and attachment bytes', async () => {
    const bytes = await createCompleteBackup(
      {
        dataSchemaVersion: 1,
        records: financeData(),
        attachments: [attachmentToBackup(metadata, content)],
      },
      'backup-pin',
      { kdf: testKdfParameters },
    )
    const restored = await readCompleteBackup(bytes, 'backup-pin')
    expect(restored.records).toEqual(financeData())
    expect(attachmentFromBackup(restored.attachments[0]!).content).toEqual(content)
  })

  it('rejects a wrong PIN and tampering', async () => {
    const bytes = await createCompleteBackup(
      {
        dataSchemaVersion: 1,
        records: financeData(),
        attachments: [],
      },
      'backup-pin',
      { kdf: testKdfParameters },
    )
    await expect(readCompleteBackup(bytes, 'wrong-pin')).rejects.toThrow()

    const envelope = JSON.parse(new TextDecoder().decode(bytes)) as {
      ciphertext: string
    }
    envelope.ciphertext = `${envelope.ciphertext.slice(0, -2)}AA`
    await expect(
      readCompleteBackup(
        new TextEncoder().encode(JSON.stringify(envelope)),
        'backup-pin',
      ),
    ).rejects.toThrow()
  })
})
