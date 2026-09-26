import { entityTimestamps } from '../domain/id'
import type { AppSettings } from '../domain/types'

export function resetRestoredDeviceState(settings: AppSettings): AppSettings {
  return {
    ...settings,
    notificationCatchUps: [],
    verifiedBackup: null,
    lastSystemSnapshotAt: null,
    ...entityTimestamps(settings),
  }
}
