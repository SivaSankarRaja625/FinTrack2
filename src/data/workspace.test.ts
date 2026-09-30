import { afterEach, describe, expect, it } from 'vitest'

import { account, loan, transaction, timestamp } from '../test/fixtures'
import { applyFinancialCommand, undoFinancialEvent } from '../domain/financial-events'
import { calculateAccountBalances } from '../domain/calculations'
import { hashAttachment } from './attachments'
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
  it('preserves linked cash and undo state through a complete encrypted restore', async () => {
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
    await workspace.records.put('accounts', account({ openingBalancePaise: 9_000_000 }))
    await workspace.records.put('loans', loan())
    await workspace.records.mutate((data) =>
      applyFinancialCommand(data, {
        id: 'payment',
        kind: 'loan-payment',
        sourceId: 'loan-1',
        timestamp,
        date: '2026-09-24',
        note: '',
        principalPaise: 900_000,
        interestPaise: 100_000,
        prepaymentPaise: 0,
        cash: { mode: 'new', accountId: 'account-1', categoryId: null },
      }),
    )
    const records = await workspace.records.loadAll()
    const bytes = await createCompleteBackup(
      { dataSchemaVersion: 3, records, attachments: [] },
      'backup-pin',
      { kdf: testKdfParameters },
    )
    await workspace.restoreComplete(bytes, 'backup-pin')
    const restored = await workspace.records.loadAll()
    expect(restored.financialEvents).toHaveLength(1)
    expect(
      calculateAccountBalances(restored.accounts, restored.transactions).get('account-1'),
    ).toBe(8_000_000)
    const undone = undoFinancialEvent(restored, 'payment', timestamp)
    expect(undone.loans[0]?.outstandingPaise).toBe(10_000_000)
    expect(
      calculateAccountBalances(undone.accounts, undone.transactions).get('account-1'),
    ).toBe(9_000_000)
  })
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

  it('promotes restored records to schema v3 without losing existing security', async () => {
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

    expect((await db.metadata.get(metadataKeys.dataSchema))?.value).toBe(3)
    const restoredSettings = (await workspace.records.loadAll()).settings[0]
    expect(restoredSettings?.notificationCatchUps).toEqual([])
    expect(restoredSettings?.verifiedBackup).toBeNull()
    await expect(unlockWorkspace('secure-pin', db)).resolves.toBeDefined()
  })

  it('upgrades a schema-v1 installation on unlock without rewriting encrypted records', async () => {
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
    await workspace.records.put('accounts', account())
    await workspace.records.put('transactions', transaction({ categoryId: null }))
    const document = new TextEncoder().encode('%PDF-1.4 upgrade test')
    await workspace.records.put('insurancePolicies', {
      id: 'policy-1',
      type: 'health',
      insurer: 'Insurer',
      policyName: 'Health cover',
      policyNumber: '1234',
      sumAssuredPaise: 1_000_000,
      premiumPaise: 10_000,
      premiumFrequency: 'yearly',
      startDate: '2025-01-01',
      endDate: null,
      nextPremiumDate: '2027-01-01',
      renewalDate: null,
      maturityDate: null,
      nomineeName: '',
      nomineeRelation: '',
      contact: '',
      note: '',
      attachmentIds: ['document-1'],
      active: true,
      createdAt: '2026-09-24T12:00:00.000Z',
      updatedAt: '2026-09-24T12:00:00.000Z',
    })
    await workspace.attachments.put(
      {
        id: 'document-1',
        ownerType: 'insurance',
        ownerId: 'policy-1',
        filename: 'policy.pdf',
        mimeType: 'application/pdf',
        size: document.byteLength,
        contentHash: await hashAttachment(document),
        createdAt: '2026-09-24T12:00:00.000Z',
      },
      document,
    )
    const before = await db.records.toArray()
    const attachmentsBefore = await db.attachments.toArray()
    const security = await getSecurityConfig(db)
    await db.metadata.put({ key: metadataKeys.dataSchema, value: 1 })

    const upgraded = await unlockWorkspace('secure-pin', db)
    expect((await db.metadata.get(metadataKeys.dataSchema))?.value).toBe(3)
    expect(await db.records.toArray()).toEqual(before)
    expect(await db.attachments.toArray()).toEqual(attachmentsBefore)
    expect(await getSecurityConfig(db)).toEqual(security)
    expect((await upgraded.records.loadAll()).transactions[0]?.amountPaise).toBe(10_000)
    expect((await upgraded.attachments.get('document-1'))?.content).toEqual(document)
  })

  it.each([4, '2', null])(
    'refuses unsupported workspace schema %s without changing user data',
    async (version) => {
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
      const before = await db.records.toArray()
      await db.metadata.put({ key: metadataKeys.dataSchema, value: version })

      await expect(unlockWorkspace('secure-pin', db)).rejects.toThrow(
        version === 4 ? /newer version/u : /schema version is invalid/u,
      )
      expect(await db.records.toArray()).toEqual(before)
      expect((await db.metadata.get(metadataKeys.dataSchema))?.value).toBe(version)
      expect(workspace).toBeDefined()
    },
  )

  it('does not promote invalid schema-v1 records to the current version', async () => {
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
    await workspace.records.put('transactions', transaction({ categoryId: null }))
    await db.metadata.put({ key: metadataKeys.dataSchema, value: 1 })

    await expect(unlockWorkspace('secure-pin', db)).rejects.toThrow(/no source account/u)
    expect((await db.metadata.get(metadataKeys.dataSchema))?.value).toBe(1)
    expect((await workspace.records.loadAll()).transactions).toHaveLength(1)
  })
})
