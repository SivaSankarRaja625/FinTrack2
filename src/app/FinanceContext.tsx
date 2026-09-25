import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import type { Attachment } from '../data/attachments'
import { attachmentFromBackup, readCompleteBackup } from '../data/backup'
import { validateRelations } from '../data/invariants'
import { createSystemSnapshot } from '../data/system-snapshot'
import type { Workspace } from '../data/workspace'
import { evaluateAlerts } from '../domain/alerts'
import { emptyFinanceData } from '../domain/defaults'
import { entityTimestamps, newId, nowIso } from '../domain/id'
import { validateFinanceData } from '../domain/schemas'
import type {
  AppSettings,
  AttachmentMeta,
  CollectionName,
  FinanceAlert,
  FinanceData,
  ImportBatch,
  Transaction,
} from '../domain/types'
import {
  deleteSystemBackupSnapshot,
  getSystemBackupCapability,
  writeSystemBackupSnapshot,
} from '../platform/system-backup'
import {
  syncLocalNotifications,
  type NotificationPermissionState,
} from '../platform/notifications'
import { useSecurity } from './SecurityContext'

export interface NotificationStatus {
  supported: boolean
  permission: NotificationPermissionState
  scheduled: number
  error: string | null
}

interface FinanceContextValue {
  data: FinanceData
  alerts: FinanceAlert[]
  attachmentMetadata: AttachmentMeta[]
  loading: boolean
  error: string | null
  notificationStatus: NotificationStatus
  save: <K extends CollectionName>(
    collection: K,
    entity: FinanceData[K][number],
  ) => Promise<void>
  saveMany: <K extends CollectionName>(
    collection: K,
    entities: FinanceData[K],
  ) => Promise<void>
  remove: (collection: CollectionName, id: string) => Promise<void>
  removeMany: (collection: CollectionName, ids: readonly string[]) => Promise<void>
  addAttachment: (attachment: Attachment) => Promise<void>
  getAttachment: (id: string) => Promise<Attachment | null>
  deleteAttachment: (id: string) => Promise<void>
  exportCompleteBackup: (pin: string) => Promise<Uint8Array>
  restoreCompleteBackup: (bytes: Uint8Array, pin: string) => Promise<void>
  setAndroidBackup: (enabled: boolean) => Promise<void>
  dismissAlert: (alert: FinanceAlert) => Promise<void>
  snoozeAlert: (alert: FinanceAlert, until: string) => Promise<void>
  restoreAlert: (key: string) => Promise<void>
  syncNotifications: (requestPermission?: boolean) => Promise<NotificationStatus>
  commitImport: (
    transactions: readonly Transaction[],
    batch: ImportBatch,
  ) => Promise<void>
  rollbackImport: (batch: ImportBatch) => Promise<void>
  refresh: () => Promise<void>
}

const FinanceContext = createContext<FinanceContextValue | null>(null)

function replaceEntity<K extends CollectionName>(
  data: FinanceData,
  collection: K,
  entity: FinanceData[K][number],
): FinanceData {
  const items = data[collection]
  const next = [...items.filter((item) => item.id !== entity.id), entity]
  return { ...data, [collection]: next } as FinanceData
}

function removeEntities(
  data: FinanceData,
  collection: CollectionName,
  ids: ReadonlySet<string>,
): FinanceData {
  return {
    ...data,
    [collection]: data[collection].filter((item) => !ids.has(item.id)),
  } as FinanceData
}

function currentSettings(data: FinanceData): AppSettings | null {
  return data.settings[0] ?? null
}

async function loadWorkspaceData(workspace: Workspace) {
  const [records, attachments] = await Promise.all([
    workspace.records.loadAll(),
    workspace.attachments.listMetadata(),
  ])
  const validated = validateFinanceData(records)
  validateRelations(validated, attachments)
  return { records: validated, attachments }
}

export function FinanceProvider({
  workspace,
  children,
}: {
  workspace: Workspace
  children: ReactNode
}) {
  const { setAutoLockMinutes } = useSecurity()
  const [data, setData] = useState<FinanceData>(emptyFinanceData)
  const [attachmentMetadata, setAttachmentMetadata] = useState<AttachmentMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notificationStatus, setNotificationStatus] = useState<NotificationStatus>({
    supported: false,
    permission: 'unsupported',
    scheduled: 0,
    error: null,
  })
  const dataRef = useRef(data)
  const snapshotTimer = useRef<number | null>(null)

  useEffect(() => {
    dataRef.current = data
    const settings = currentSettings(data)
    if (settings) {
      setAutoLockMinutes(settings.autoLockMinutes)
      document.documentElement.dataset.theme =
        settings.theme === 'system' ? '' : settings.theme
    }
  }, [data, setAutoLockMinutes])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const loaded = await loadWorkspaceData(workspace)
      setData(loaded.records)
      setAttachmentMetadata(loaded.attachments)
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Encrypted data could not be read',
      )
    } finally {
      setLoading(false)
    }
  }, [workspace])

  useEffect(() => {
    let active = true
    void loadWorkspaceData(workspace)
      .then((loaded) => {
        if (!active) return
        setData(loaded.records)
        setAttachmentMetadata(loaded.attachments)
      })
      .catch((caught: unknown) => {
        if (!active) return
        setError(
          caught instanceof Error ? caught.message : 'Encrypted data could not be read',
        )
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
      if (snapshotTimer.current !== null) {
        window.clearTimeout(snapshotTimer.current)
      }
    }
  }, [workspace])

  const updateSystemSnapshotTimestamp = useCallback(async () => {
    const settings = currentSettings(dataRef.current)
    if (!settings) return
    const updated: AppSettings = {
      ...settings,
      lastSystemSnapshotAt: new Date().toISOString(),
      ...entityTimestamps(settings),
    }
    await workspace.records.put('settings', updated)
    setData((current) => replaceEntity(current, 'settings', updated))
  }, [workspace])

  const writeLatestSystemSnapshot = useCallback(async () => {
    const settings = currentSettings(dataRef.current)
    if (!settings?.androidBackupEnabled) return
    if (!getSystemBackupCapability().available) return
    const bytes = await createSystemSnapshot(workspace.dataKey, workspace.db)
    await writeSystemBackupSnapshot(bytes)
    await updateSystemSnapshotTimestamp()
  }, [updateSystemSnapshotTimestamp, workspace])

  const scheduleSystemSnapshot = useCallback(() => {
    if (!currentSettings(dataRef.current)?.androidBackupEnabled) return
    if (snapshotTimer.current !== null) window.clearTimeout(snapshotTimer.current)
    snapshotTimer.current = window.setTimeout(() => {
      snapshotTimer.current = null
      void writeLatestSystemSnapshot().catch((caught: unknown) => {
        setError(
          caught instanceof Error
            ? `Android backup snapshot failed: ${caught.message}`
            : 'Android backup snapshot failed',
        )
      })
    }, 2_000)
  }, [writeLatestSystemSnapshot])

  const syncNotifications = useCallback(
    async (requestPermission = false): Promise<NotificationStatus> => {
      const settings = currentSettings(dataRef.current)
      if (!settings) {
        return {
          supported: false,
          permission: 'unsupported',
          scheduled: 0,
          error: 'Application settings are not available',
        }
      }
      try {
        const result = await syncLocalNotifications(
          dataRef.current,
          settings,
          requestPermission,
        )
        const next = { ...result, error: null }
        setNotificationStatus(next)
        return next
      } catch (caught) {
        const message =
          caught instanceof Error
            ? `Notifications could not be scheduled: ${caught.message}`
            : 'Notifications could not be scheduled'
        const next: NotificationStatus = {
          supported: true,
          permission: 'denied',
          scheduled: 0,
          error: message,
        }
        setNotificationStatus(next)
        return next
      }
    },
    [],
  )

  useEffect(() => {
    if (!currentSettings(data)) return
    const timer = window.setTimeout(() => {
      void syncNotifications(false)
    }, 500)
    return () => window.clearTimeout(timer)
  }, [data, syncNotifications])

  const save = useCallback(
    async <K extends CollectionName>(collection: K, entity: FinanceData[K][number]) => {
      await workspace.records.put(collection, entity)
      const next = replaceEntity(dataRef.current, collection, entity)
      dataRef.current = next
      setData(next)
      scheduleSystemSnapshot()
    },
    [scheduleSystemSnapshot, workspace],
  )

  const saveMany = useCallback(
    async <K extends CollectionName>(collection: K, entities: FinanceData[K]) => {
      await workspace.records.bulkPut(collection, entities)
      const ids = new Set(entities.map((item) => item.id))
      const kept = dataRef.current[collection].filter((item) => !ids.has(item.id))
      const next = {
        ...dataRef.current,
        [collection]: [...kept, ...entities],
      } as FinanceData
      dataRef.current = next
      setData(next)
      scheduleSystemSnapshot()
    },
    [scheduleSystemSnapshot, workspace],
  )

  const removeMany = useCallback(
    async (collection: CollectionName, ids: readonly string[]) => {
      await workspace.records.bulkDelete(collection, ids)
      const idSet = new Set(ids)
      const next = removeEntities(dataRef.current, collection, idSet)
      dataRef.current = next
      setData(next)
      scheduleSystemSnapshot()
    },
    [scheduleSystemSnapshot, workspace],
  )

  const remove = useCallback(
    async (collection: CollectionName, id: string) => removeMany(collection, [id]),
    [removeMany],
  )

  const addAttachment = useCallback(
    async (attachment: Attachment) => {
      await workspace.attachments.put(attachment.metadata, attachment.content)
      setAttachmentMetadata((current) => [
        ...current.filter((item) => item.id !== attachment.metadata.id),
        attachment.metadata,
      ])
    },
    [workspace],
  )

  const getAttachment = useCallback(
    (id: string) => workspace.attachments.get(id),
    [workspace],
  )

  const deleteAttachment = useCallback(
    async (id: string) => {
      await workspace.attachments.delete(id)
      setAttachmentMetadata((current) => current.filter((item) => item.id !== id))
    },
    [workspace],
  )

  const exportCompleteBackup = useCallback(
    async (pin: string) => {
      const settings = currentSettings(dataRef.current)
      if (settings) {
        const updated: AppSettings = {
          ...settings,
          lastManualBackupAt: new Date().toISOString(),
          ...entityTimestamps(settings),
        }
        await workspace.records.put('settings', updated)
        setData((current) => replaceEntity(current, 'settings', updated))
      }
      return workspace.exportComplete(pin)
    },
    [workspace],
  )

  const restoreCompleteBackup = useCallback(
    async (bytes: Uint8Array, pin: string) => {
      const candidate = await readCompleteBackup(bytes, pin)
      const attachments = candidate.attachments.map(attachmentFromBackup)
      validateRelations(
        candidate.records,
        attachments.map((item) => item.metadata),
      )
      await workspace.restoreComplete(bytes, pin)
      await refresh()
      scheduleSystemSnapshot()
    },
    [refresh, scheduleSystemSnapshot, workspace],
  )

  const setAndroidBackup = useCallback(
    async (enabled: boolean) => {
      const settings = currentSettings(dataRef.current)
      if (!settings) throw new Error('Application settings are not available')
      if (enabled && !getSystemBackupCapability().available) {
        throw new Error('Android system backup is only available in the Android app')
      }
      const updated: AppSettings = {
        ...settings,
        androidBackupEnabled: enabled,
        lastSystemSnapshotAt: enabled ? settings.lastSystemSnapshotAt : null,
        ...entityTimestamps(settings),
      }
      await workspace.records.put('settings', updated)
      setData((current) => replaceEntity(current, 'settings', updated))
      dataRef.current = replaceEntity(dataRef.current, 'settings', updated)
      if (enabled) {
        await writeLatestSystemSnapshot()
      } else {
        await deleteSystemBackupSnapshot()
      }
    },
    [workspace, writeLatestSystemSnapshot],
  )

  const dismissAlert = useCallback(
    async (alert: FinanceAlert) => {
      const settings = currentSettings(dataRef.current)
      if (!settings) return
      const actionAt = nowIso()
      const updated: AppSettings = {
        ...settings,
        dismissedAlertKeys: [...new Set([...settings.dismissedAlertKeys, alert.key])],
        snoozedAlerts: settings.snoozedAlerts.filter((item) => item.key !== alert.key),
        alertHistory: [
          {
            id: newId(),
            key: alert.key,
            ruleType: alert.ruleType,
            title: alert.title,
            detail: alert.detail,
            action: 'dismissed' as const,
            actionAt,
            snoozedUntil: null,
          },
          ...settings.alertHistory,
        ].slice(0, 200),
        ...entityTimestamps(settings),
      }
      await save('settings', updated)
    },
    [save],
  )

  const snoozeAlert = useCallback(
    async (alert: FinanceAlert, until: string) => {
      const settings = currentSettings(dataRef.current)
      if (!settings) return
      const actionAt = nowIso()
      const updated: AppSettings = {
        ...settings,
        snoozedAlerts: [
          ...settings.snoozedAlerts.filter((item) => item.key !== alert.key),
          { key: alert.key, until },
        ],
        alertHistory: [
          {
            id: newId(),
            key: alert.key,
            ruleType: alert.ruleType,
            title: alert.title,
            detail: alert.detail,
            action: 'snoozed' as const,
            actionAt,
            snoozedUntil: until,
          },
          ...settings.alertHistory,
        ].slice(0, 200),
        ...entityTimestamps(settings),
      }
      await save('settings', updated)
    },
    [save],
  )

  const restoreAlert = useCallback(
    async (key: string) => {
      const settings = currentSettings(dataRef.current)
      if (!settings) return
      await save('settings', {
        ...settings,
        dismissedAlertKeys: settings.dismissedAlertKeys.filter((item) => item !== key),
        snoozedAlerts: settings.snoozedAlerts.filter((item) => item.key !== key),
        ...entityTimestamps(settings),
      })
    },
    [save],
  )

  const commitImport = useCallback(
    async (transactions: readonly Transaction[], batch: ImportBatch) => {
      await workspace.records.commitImport(transactions, batch)
      setData((current) => ({
        ...current,
        transactions: [...current.transactions, ...transactions],
        importBatches: [
          ...current.importBatches.filter((item) => item.id !== batch.id),
          batch,
        ],
      }))
      scheduleSystemSnapshot()
    },
    [scheduleSystemSnapshot, workspace],
  )

  const rollbackImport = useCallback(
    async (batch: ImportBatch) => {
      const updated: ImportBatch = {
        ...batch,
        rolledBackAt: new Date().toISOString(),
        ...entityTimestamps(batch),
      }
      await workspace.records.rollbackImport(updated)
      const transactionIds = new Set(batch.createdTransactionIds)
      setData((current) => ({
        ...current,
        transactions: current.transactions.filter(
          (transaction) => !transactionIds.has(transaction.id),
        ),
        importBatches: [
          ...current.importBatches.filter((item) => item.id !== batch.id),
          updated,
        ],
      }))
      scheduleSystemSnapshot()
    },
    [scheduleSystemSnapshot, workspace],
  )

  const settings = currentSettings(data)
  const profile = data.profiles[0] ?? null
  const alerts = useMemo(
    () => (settings ? evaluateAlerts(data, settings, profile) : []),
    [data, profile, settings],
  )

  const value = useMemo<FinanceContextValue>(
    () => ({
      data,
      alerts,
      attachmentMetadata,
      loading,
      error,
      notificationStatus,
      save,
      saveMany,
      remove,
      removeMany,
      addAttachment,
      getAttachment,
      deleteAttachment,
      exportCompleteBackup,
      restoreCompleteBackup,
      setAndroidBackup,
      dismissAlert,
      snoozeAlert,
      restoreAlert,
      syncNotifications,
      commitImport,
      rollbackImport,
      refresh,
    }),
    [
      addAttachment,
      alerts,
      attachmentMetadata,
      commitImport,
      data,
      deleteAttachment,
      dismissAlert,
      error,
      exportCompleteBackup,
      getAttachment,
      loading,
      notificationStatus,
      refresh,
      remove,
      removeMany,
      restoreCompleteBackup,
      restoreAlert,
      rollbackImport,
      save,
      saveMany,
      setAndroidBackup,
      snoozeAlert,
      syncNotifications,
    ],
  )

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>
}

export function useFinance() {
  const context = useContext(FinanceContext)
  if (!context) throw new Error('useFinance must be used inside FinanceProvider')
  return context
}
