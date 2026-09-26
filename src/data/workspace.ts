import { createDefaultCategories, createDefaultSettings } from '../domain/defaults'
import { entityTimestamps, newId } from '../domain/id'
import { validateFinanceData } from '../domain/schemas'
import type { UserProfile } from '../domain/types'
import { AttachmentRepository, type Attachment } from './attachments'
import {
  type CompleteBackupPayload,
  attachmentFromBackup,
  attachmentToBackup,
  createCompleteBackup,
  readCompleteBackup,
} from './backup'
import {
  type KdfParameters,
  type SecurityConfig,
  createSecurityConfig,
  productionKdfParameters,
  rewrapDataKey,
  unlockDataKey,
} from './crypto'
import {
  FinTrackDatabase,
  database,
  getSecurityConfig,
  hasLocalData,
  metadataKeys,
  setSecurityConfig,
} from './database'
import { validateRelations } from './invariants'
import { FinanceRepository } from './repository'
import { resetRestoredDeviceState } from './recovery-settings'

export class Workspace {
  readonly records: FinanceRepository
  readonly attachments: AttachmentRepository
  readonly dataKey: CryptoKey
  readonly db: FinTrackDatabase

  constructor(dataKey: CryptoKey, db: FinTrackDatabase = database) {
    this.dataKey = dataKey
    this.db = db
    this.records = new FinanceRepository(dataKey, db)
    this.attachments = new AttachmentRepository(dataKey, db)
  }

  async exportComplete(pin: string): Promise<Uint8Array> {
    const [records, attachments] = await Promise.all([
      this.records.loadAll(),
      this.attachments.listAll(),
    ])
    validateRelations(
      records,
      attachments.map((item) => item.metadata),
    )
    return createCompleteBackup(
      {
        dataSchemaVersion: 2,
        records,
        attachments: attachments.map((item) =>
          attachmentToBackup(item.metadata, item.content),
        ),
      },
      pin,
    )
  }

  async restoreComplete(bytes: Uint8Array, pin: string): Promise<void> {
    const payload = await readCompleteBackup(bytes, pin)
    const attachments = payload.attachments.map(attachmentFromBackup)
    validateRelations(
      payload.records,
      attachments.map((item) => item.metadata),
    )
    await this.replaceThroughStaging(payload, attachments)
  }

  private async replaceThroughStaging(
    payload: CompleteBackupPayload,
    attachments: Attachment[],
  ): Promise<void> {
    const staging = new FinTrackDatabase(`fintrack-restore-${newId()}`)
    const stagingRecords = new FinanceRepository(this.dataKey, staging)
    const stagingAttachments = new AttachmentRepository(this.dataKey, staging)

    try {
      await stagingRecords.replaceAll(payload.records)
      for (const attachment of attachments) {
        await stagingAttachments.put(attachment.metadata, attachment.content)
      }
      const checkedRecords = validateFinanceData(await stagingRecords.loadAll())
      const checkedAttachments = await stagingAttachments.listMetadata()
      validateRelations(checkedRecords, checkedAttachments)
      const importedSettings = checkedRecords.settings[0]
      if (!importedSettings) throw new Error('The backup has no settings record')
      await stagingRecords.put('settings', resetRestoredDeviceState(importedSettings))

      const [rawRecords, rawAttachments] = await Promise.all([
        staging.records.toArray(),
        staging.attachments.toArray(),
      ])
      await this.db.transaction(
        'rw',
        this.db.records,
        this.db.attachments,
        this.db.metadata,
        async () => {
          await this.db.records.clear()
          await this.db.attachments.clear()
          await this.db.records.bulkPut(rawRecords)
          await this.db.attachments.bulkPut(rawAttachments)
          await this.db.metadata.put({
            key: metadataKeys.dataSchema,
            value: payload.dataSchemaVersion,
          })
        },
      )
    } finally {
      staging.close()
      await staging.delete()
    }
  }
}

export async function initializeWorkspace(
  pin: string,
  profile: Omit<UserProfile, 'id' | 'createdAt' | 'updatedAt'>,
  options?: { db?: FinTrackDatabase; kdf?: KdfParameters },
): Promise<Workspace> {
  const db = options?.db ?? database
  if (await hasLocalData(db)) {
    throw new Error('This installation already contains an encrypted workspace')
  }
  const { config, dataKey } = await createSecurityConfig(
    pin,
    options?.kdf ?? productionKdfParameters,
  )
  try {
    await setSecurityConfig(config, db)
    const workspace = new Workspace(dataKey, db)
    const timestamp = entityTimestamps()
    await workspace.records.replaceAll({
      profiles: [{ ...profile, id: newId(), ...timestamp }],
      settings: [createDefaultSettings()],
      categories: createDefaultCategories(),
      accounts: [],
      transactions: [],
      recurringRules: [],
      budgets: [],
      assets: [],
      loans: [],
      investments: [],
      insurancePolicies: [],
      goals: [],
      importBatches: [],
      netWorthSnapshots: [],
    })
    return workspace
  } catch (error) {
    await wipeWorkspace(db)
    throw error
  }
}

export async function unlockWorkspace(
  pin: string,
  db: FinTrackDatabase = database,
): Promise<Workspace> {
  const config = await getSecurityConfig(db)
  if (!config) throw new Error('No encrypted workspace exists on this device')
  return new Workspace(await unlockDataKey(pin, config), db)
}

export async function changeWorkspacePin(
  currentPin: string,
  nextPin: string,
  db: FinTrackDatabase = database,
): Promise<void> {
  const config = await getSecurityConfig(db)
  if (!config) throw new Error('No encrypted workspace exists on this device')
  await setSecurityConfig(await rewrapDataKey(currentPin, nextPin, config), db)
}

export async function wipeWorkspace(db: FinTrackDatabase = database): Promise<void> {
  await db.transaction('rw', db.metadata, db.records, db.attachments, async () => {
    await db.metadata.clear()
    await db.records.clear()
    await db.attachments.clear()
  })
}

export async function importWorkspaceSecurity(
  config: SecurityConfig,
  db: FinTrackDatabase = database,
): Promise<void> {
  if (await hasLocalData(db)) {
    throw new Error('Security data can only be imported into an empty installation')
  }
  await setSecurityConfig(config, db)
}
