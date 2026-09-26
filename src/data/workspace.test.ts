import { afterEach, describe, expect, it } from 'vitest'

import { testKdfParameters } from './crypto'
import { createCompleteBackup } from './backup'
import { FinTrackDatabase, getSecurityConfig, metadataKeys } from './database'
import {
  changeWorkspacePin,
  initializeWorkspace,
  unlockWorkspace,
  wipeWorkspace,
} from './workspace'

let db: FinTrackDatabase | null = null

afterEach(async () => {
  if (db) {
    db.close()
    await db.delete()
    db = null
  }
})

describe('workspace lifecycle', () => {
  it('initializes defaults and unlocks only with the configured PIN', async () => {
    db = new FinTrackDatabase(`workspace-test-${crypto.randomUUID()}`)
    const workspace = await initializeWorkspace(
      'secure-pin',
      {
        name: 'Asha',
        locale: 'en-IN',
        currency: 'INR',
        monthlyIncomePaise: 100_000_00,
        essentialMonthlyPaise: 30_000_00,
        payDay: 1,
        emergencyFundMonths: 6,
      },
      { db, kdf: testKdfParameters },
    )
    const data = await workspace.records.loadAll()
    expect(data.profiles[0]?.name).toBe('Asha')
    expect(data.profiles[0]?.id).toMatch(/^[0-9a-f]{8}-/u)
    expect(data.settings).toHaveLength(1)
    expect(data.categories.length).toBeGreaterThan(5)
    await expect(unlockWorkspace('wrong-pin', db)).rejects.toThrow()
    await expect(unlockWorkspace('secure-pin', db)).resolves.toBeDefined()
  })

  it('rewraps and wipes the workspace without leaving metadata', async () => {
    db = new FinTrackDatabase(`workspace-test-${crypto.randomUUID()}`)
    await initializeWorkspace(
      'old-pin',
      {
        name: 'Asha',
        locale: 'en-IN',
        currency: 'INR',
        monthlyIncomePaise: 0,
        essentialMonthlyPaise: 0,
        payDay: 1,
        emergencyFundMonths: 0,
      },
      { db, kdf: testKdfParameters },
    )
    await changeWorkspacePin('old-pin', 'new-pin', db)
    await expect(unlockWorkspace('old-pin', db)).rejects.toThrow()
    await expect(unlockWorkspace('new-pin', db)).resolves.toBeDefined()
    await wipeWorkspace(db)
    await expect(getSecurityConfig(db)).resolves.toBeNull()
    await expect(db.records.count()).resolves.toBe(0)
  })

  it('marks restored schema-v2 records as v2 without losing existing security', async () => {
    db = new FinTrackDatabase(`workspace-test-${crypto.randomUUID()}`)
    const workspace = await initializeWorkspace(
      'secure-pin',
      {
        name: 'Asha',
        locale: 'en-IN',
        currency: 'INR',
        monthlyIncomePaise: 0,
        essentialMonthlyPaise: 0,
        payDay: 1,
        emergencyFundMonths: 0,
      },
      { db, kdf: testKdfParameters },
    )
    const records = await workspace.records.loadAll()
    const bytes = await createCompleteBackup(
      {
        dataSchemaVersion: 2,
        records: {
          ...records,
          settings: [
            {
              ...records.settings[0]!,
              notificationCatchUps: ['insurance:policy:2026-09-25'],
              verifiedBackup: {
                createdAt: '2026-09-24T12:00:00.000Z',
                verifiedAt: '2026-09-24T12:00:00.000Z',
                recordCount: 2,
                attachmentCount: 0,
              },
            },
          ],
        },
        attachments: [],
      },
      'backup-pin',
      { kdf: testKdfParameters },
    )
    await db.metadata.put({ key: metadataKeys.dataSchema, value: 1 })
    await workspace.restoreComplete(bytes, 'backup-pin')

    expect((await db.metadata.get(metadataKeys.dataSchema))?.value).toBe(2)
    const restoredSettings = (await workspace.records.loadAll()).settings[0]
    expect(restoredSettings?.notificationCatchUps).toEqual([])
    expect(restoredSettings?.verifiedBackup).toBeNull()
    await expect(unlockWorkspace('secure-pin', db)).resolves.toBeDefined()
  })
})
