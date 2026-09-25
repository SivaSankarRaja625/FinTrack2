import { Capacitor, registerPlugin } from '@capacitor/core'

import { base64ToBytes, bytesToBase64 } from '../data/encoding'

interface SystemBackupPlugin {
  writeSnapshot(options: { data: string }): Promise<{ size: number }>
  readSnapshot(): Promise<{ data: string | null }>
  deleteSnapshot(): Promise<void>
}

const nativeBackup = registerPlugin<SystemBackupPlugin>('FinTrackSystemBackup')

export interface SystemBackupCapability {
  available: boolean
  platform: 'android' | 'web'
}

export function getSystemBackupCapability(): SystemBackupCapability {
  return {
    available: Capacitor.getPlatform() === 'android',
    platform: Capacitor.getPlatform() === 'android' ? 'android' : 'web',
  }
}

export async function writeSystemBackupSnapshot(
  bytes: Uint8Array,
): Promise<{ size: number }> {
  if (!getSystemBackupCapability().available) {
    throw new Error('Android system backup is only available in the Android app')
  }
  return nativeBackup.writeSnapshot({ data: bytesToBase64(bytes) })
}

export async function readSystemBackupSnapshot(): Promise<Uint8Array | null> {
  if (!getSystemBackupCapability().available) return null
  const result = await nativeBackup.readSnapshot()
  return result.data ? base64ToBytes(result.data) : null
}

export async function deleteSystemBackupSnapshot(): Promise<void> {
  if (!getSystemBackupCapability().available) return
  await nativeBackup.deleteSnapshot()
}
