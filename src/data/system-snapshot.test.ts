import { afterEach, describe, expect, it } from 'vitest'

import { financeData, profile, settings, timestamp } from '../test/fixtures'
import { createSecurityConfig, testKdfParameters } from './crypto'
import { FinTrackDatabase, getSecurityConfig, setSecurityConfig } from './database'
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
        settings: [settings()],
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
})
