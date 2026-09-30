import { afterEach, describe, expect, it } from 'vitest'

import {
  account,
  financeData,
  loan,
  profile,
  settings,
  timestamp,
} from '../test/fixtures'
import { applyFinancialCommand, undoFinancialEvent } from '../domain/financial-events'
import { createSecurityConfig, testKdfParameters } from './crypto'
import {
  FinTrackDatabase,
  getSecurityConfig,
  metadataKeys,
  setSecurityConfig,
} from './database'
import { FinanceRepository } from './repository'
import { createSystemSnapshot, restoreSystemSnapshot } from './system-snapshot'

const databases: FinTrackDatabase[] = []

afterEach(async () => {
  for (const db of databases) {
    db.close()
    await db.delete()
  }
  databases.length = 0
})

describe('Android structured-data snapshot', () => {
  it('keeps linked financial events and source reversals through system snapshot restore', async () => {
    const source = new FinTrackDatabase(`snapshot-source-${crypto.randomUUID()}`)
    const target = new FinTrackDatabase(`snapshot-target-${crypto.randomUUID()}`)
    databases.push(source, target)
    const { config, dataKey } = await createSecurityConfig(
      'secure-pin',
      testKdfParameters,
    )
    await setSecurityConfig(config, source)
    const data = applyFinancialCommand(
      financeData({
        profiles: [profile()],
        settings: [settings()],
        accounts: [account()],
        loans: [loan()],
      }),
      {
        id: 'payment',
        kind: 'loan-payment',
        sourceId: 'loan-1',
        timestamp,
        date: '2026-09-24',
        note: '',
        principalPaise: 100,
        interestPaise: 10,
        prepaymentPaise: 0,
        cash: { mode: 'new', accountId: 'account-1', categoryId: null },
      },
    )
    await new FinanceRepository(dataKey, source).replaceAll(data)
    const restoredKey = await restoreSystemSnapshot(
      await createSystemSnapshot(dataKey, source),
      'secure-pin',
      target,
    )
    const restored = await new FinanceRepository(restoredKey, target).loadAll()
    expect(restored.financialEvents).toHaveLength(1)
    expect(restored.transactions[0]?.financialEventId).toBe('payment')
    expect(undoFinancialEvent(restored, 'payment', timestamp).transactions).toHaveLength(
      0,
    )
    expect((await target.metadata.get(metadataKeys.dataSchema))?.value).toBe(3)
  })
  it('restores encrypted records while removing attachment references', async () => {
    const source = new FinTrackDatabase(`snapshot-source-${crypto.randomUUID()}`)
    const target = new FinTrackDatabase(`snapshot-target-${crypto.randomUUID()}`)
    databases.push(source, target)
    const { config, dataKey } = await createSecurityConfig(
      'secure-pin',
      testKdfParameters,
    )
    await setSecurityConfig(config, source)
    const repository = new FinanceRepository(dataKey, source)
    await repository.replaceAll(
      financeData({
        profiles: [profile()],
        settings: [
          settings({
            notificationCatchUps: ['insurance:policy:2026-09-25'],
            lastSystemSnapshotAt: timestamp,
            verifiedBackup: {
              createdAt: timestamp,
              verifiedAt: timestamp,
              recordCount: 2,
              attachmentCount: 0,
            },
          }),
        ],
        insurancePolicies: [
          {
            id: 'policy',
            type: 'term-life',
            insurer: 'Insurer',
            policyName: 'Term plan',
            policyNumber: '1234',
            sumAssuredPaise: 10_000_000,
            premiumPaise: 10_000,
            premiumFrequency: 'yearly',
            startDate: '2026-01-01',
            endDate: null,
            nextPremiumDate: '2027-01-01',
            renewalDate: null,
            maturityDate: null,
            nomineeName: '',
            nomineeRelation: '',
            contact: '',
            note: '',
            attachmentIds: ['document'],
            active: true,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
      }),
    )

    const snapshot = await createSystemSnapshot(dataKey, source)
    expect(new TextDecoder().decode(snapshot)).not.toContain('Term plan')
    const restoredKey = await restoreSystemSnapshot(snapshot, 'secure-pin', target)

    const restoredConfig = await getSecurityConfig(target)
    expect(restoredConfig).toEqual(config)
    const restored = await new FinanceRepository(restoredKey, target).loadAll()
    expect(restored.insurancePolicies[0]?.attachmentIds).toEqual([])
    expect(restored.settings[0]?.notificationCatchUps).toEqual([])
    expect(restored.settings[0]?.verifiedBackup).toBeNull()
    expect(restored.settings[0]?.lastSystemSnapshotAt).toBeNull()
  })

  it('refuses to overwrite an initialized installation', async () => {
    const source = new FinTrackDatabase(`snapshot-source-${crypto.randomUUID()}`)
    const target = new FinTrackDatabase(`snapshot-target-${crypto.randomUUID()}`)
    databases.push(source, target)
    const { config, dataKey } = await createSecurityConfig(
      'secure-pin',
      testKdfParameters,
    )
    await setSecurityConfig(config, source)
    await setSecurityConfig(config, target)
    const snapshot = await createSystemSnapshot(dataKey, source)
    await expect(restoreSystemSnapshot(snapshot, 'secure-pin', target)).rejects.toThrow(
      /empty/u,
    )
  })

  it('leaves the target empty after a wrong PIN', async () => {
    const source = new FinTrackDatabase(`snapshot-source-${crypto.randomUUID()}`)
    const target = new FinTrackDatabase(`snapshot-target-${crypto.randomUUID()}`)
    databases.push(source, target)
    const { config, dataKey } = await createSecurityConfig(
      'secure-pin',
      testKdfParameters,
    )
    await setSecurityConfig(config, source)
    await new FinanceRepository(dataKey, source).replaceAll(
      financeData({ profiles: [profile()], settings: [settings()] }),
    )
    const snapshot = await createSystemSnapshot(dataKey, source)

    await expect(restoreSystemSnapshot(snapshot, 'wrong-pin', target)).rejects.toThrow()
    await expect(target.metadata.count()).resolves.toBe(0)
    await expect(target.records.count()).resolves.toBe(0)
  })

  it('promotes a validated schema-v1 system snapshot before importing it', async () => {
    const source = new FinTrackDatabase(`snapshot-source-${crypto.randomUUID()}`)
    const target = new FinTrackDatabase(`snapshot-target-${crypto.randomUUID()}`)
    databases.push(source, target)
    const { config, dataKey } = await createSecurityConfig(
      'secure-pin',
      testKdfParameters,
    )
    await setSecurityConfig(config, source)
    await new FinanceRepository(dataKey, source).replaceAll(
      financeData({ profiles: [profile()], settings: [settings()] }),
    )
    await source.metadata.put({ key: metadataKeys.dataSchema, value: 1 })
    const snapshot = await createSystemSnapshot(dataKey, source)

    await restoreSystemSnapshot(snapshot, 'secure-pin', target)
    expect((await target.metadata.get(metadataKeys.dataSchema))?.value).toBe(3)
    expect((await new FinanceRepository(dataKey, target).loadAll()).profiles).toEqual([
      profile(),
    ])
  })

  it.each([4, '2'])(
    'rejects unsupported system snapshot schema %s before writing target data',
    async (version) => {
      const source = new FinTrackDatabase(`snapshot-source-${crypto.randomUUID()}`)
      const target = new FinTrackDatabase(`snapshot-target-${crypto.randomUUID()}`)
      databases.push(source, target)
      const { config, dataKey } = await createSecurityConfig(
        'secure-pin',
        testKdfParameters,
      )
      await setSecurityConfig(config, source)
      await new FinanceRepository(dataKey, source).replaceAll(
        financeData({ profiles: [profile()], settings: [settings()] }),
      )
      const snapshot = JSON.parse(
        new TextDecoder().decode(await createSystemSnapshot(dataKey, source)),
      ) as { metadata: { key: string; value: unknown }[] }
      snapshot.metadata.find((row) => row.key === metadataKeys.dataSchema)!.value =
        version

      await expect(
        restoreSystemSnapshot(
          new TextEncoder().encode(JSON.stringify(snapshot)),
          'secure-pin',
          target,
        ),
      ).rejects.toThrow(version === 4 ? /newer version/u : /schema version is invalid/u)
      expect(await target.metadata.count()).toBe(0)
      expect(await target.records.count()).toBe(0)
    },
  )
})
