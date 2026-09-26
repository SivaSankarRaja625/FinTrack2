import { describe, expect, it } from 'vitest'
import { gzipSync } from 'fflate'

import {
  account,
  financeData,
  loan,
  profile,
  settings,
  transaction,
} from '../test/fixtures'
import { bytesToBase64, utf8 } from './encoding'
import {
  attachmentFromBackup,
  attachmentToBackup,
  createCompleteBackup,
  inspectCompleteBackup,
  readCompleteBackup,
} from './backup'
import { derivePinKey, encryptBytes, testKdfParameters } from './crypto'

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

  it('retains optional credit card details through encrypted export and restore', async () => {
    const details = {
      lastFour: '0042',
      creditLimitPaise: 10_000_000,
      statementDay: 20,
      paymentDueDay: 9,
    }
    const records = financeData({
      accounts: [
        account({
          type: 'credit-card',
          openingBalancePaise: -2_500_000,
          creditCardDetails: details,
        }),
      ],
    })
    const bytes = await createCompleteBackup(
      { dataSchemaVersion: 1, records, attachments: [] },
      'backup-pin',
      { kdf: testKdfParameters },
    )
    const restored = await readCompleteBackup(bytes, 'backup-pin')
    expect(restored.records.accounts[0]?.creditCardDetails).toEqual(details)
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

  it('marks new backups as schema v2 and authenticates their creation date', async () => {
    const bytes = await createCompleteBackup(
      { dataSchemaVersion: 1, records: financeData(), attachments: [] },
      'backup-pin',
      { kdf: testKdfParameters },
    )
    const decoded = await readCompleteBackup(bytes, 'backup-pin')
    expect(decoded.dataSchemaVersion).toBe(2)
    expect(decoded.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/u)
  })

  it('imports a real schema-v1 encrypted payload without inventing its creation date', async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const key = await derivePinKey('backup-pin', salt, testKdfParameters)
    const encrypted = await encryptBytes(
      gzipSync(
        utf8(
          JSON.stringify({
            dataSchemaVersion: 1,
            records: financeData(),
            attachments: [],
          }),
        ),
      ),
      key,
      'fintrack:complete-backup:v1',
    )
    const bytes = utf8(
      JSON.stringify({
        magic: 'FINTRACK-BACKUP',
        formatVersion: 1,
        createdAt: '2020-01-01T00:00:00.000Z',
        appVersion: '0.1.0',
        salt: bytesToBase64(salt),
        kdf: testKdfParameters,
        compressed: 'gzip',
        ...encrypted,
      }),
    )
    const restored = await readCompleteBackup(bytes, 'backup-pin')
    expect(restored.dataSchemaVersion).toBe(2)
    expect(restored.createdAt).toBeNull()
    expect(restored.records).toEqual(financeData())
  })

  it('verifies a selected file and its relations without restoring anything', async () => {
    const records = financeData({
      profiles: [profile()],
      settings: [settings()],
      accounts: [account()],
      transactions: [transaction({ categoryId: null })],
    })
    const bytes = await createCompleteBackup(
      { dataSchemaVersion: 2, records, attachments: [] },
      'backup-pin',
      { kdf: testKdfParameters },
    )
    const summary = await inspectCompleteBackup(bytes, 'backup-pin', profile())
    expect(summary.recordCount).toBe(4)
    expect(summary.attachmentCount).toBe(0)
    expect(summary.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/u)
    await expect(inspectCompleteBackup(bytes, 'wrong-pin', profile())).rejects.toThrow()
    await expect(
      inspectCompleteBackup(bytes, 'backup-pin', profile({ id: 'other-profile' })),
    ).rejects.toThrow('different workspace')
  })

  it('rejects a separate legacy workspace even if its profile ID is also profile', async () => {
    const records = financeData({
      profiles: [profile({ createdAt: '2026-09-20T00:00:00.000Z' })],
      settings: [settings()],
    })
    const bytes = await createCompleteBackup(
      { dataSchemaVersion: 2, records, attachments: [] },
      'backup-pin',
      { kdf: testKdfParameters },
    )
    await expect(
      inspectCompleteBackup(bytes, 'backup-pin', {
        id: 'profile',
        createdAt: '2026-09-20T00:00:00.000Z',
      }),
    ).resolves.toBeDefined()
    await expect(
      inspectCompleteBackup(bytes, 'backup-pin', {
        id: 'profile',
        createdAt: '2026-09-21T00:00:00.000Z',
      }),
    ).rejects.toThrow('different workspace')
  })

  it('refuses to call a decryptable but incomplete backup verified', async () => {
    const records = financeData({
      profiles: [profile()],
      settings: [settings()],
      transactions: [transaction()],
    })

    const bytes = await createCompleteBackup(
      { dataSchemaVersion: 2, records, attachments: [] },
      'backup-pin',
      { kdf: testKdfParameters },
    )
    await expect(inspectCompleteBackup(bytes, 'backup-pin', profile())).rejects.toThrow(
      'no source account',
    )
  })

  it('checks linked loan accounts even with no recurring rules', async () => {
    const records = financeData({
      profiles: [profile()],
      settings: [settings()],
      loans: [loan({ accountId: 'missing' })],
    })
    const bytes = await createCompleteBackup(
      { dataSchemaVersion: 2, records, attachments: [] },
      'backup-pin',
      { kdf: testKdfParameters },
    )
    await expect(inspectCompleteBackup(bytes, 'backup-pin', profile())).rejects.toThrow(
      'missing account',
    )
  })
})
