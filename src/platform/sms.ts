import { Capacitor, registerPlugin } from '@capacitor/core'

import type { RawSmsMessage } from '../domain/sms'

interface FinTrackSmsPlugin {
  checkPermissions(): Promise<{ sms: string }>
  requestPermissions(): Promise<{ sms: string }>
  listMessages(options: {
    sinceMs: number
    untilMs?: number
  }): Promise<{ messages: RawSmsMessage[] }>
}

const nativeSms = registerPlugin<FinTrackSmsPlugin>('FinTrackSms')

export interface SmsCapability {
  available: boolean
  platform: 'android' | 'web'
}

export function getSmsCapability(): SmsCapability {
  const isAndroid = Capacitor.getPlatform() === 'android'
  return {
    available: isAndroid,
    platform: isAndroid ? 'android' : 'web',
  }
}

export async function requestSmsPermission(): Promise<boolean> {
  if (!getSmsCapability().available) return false
  const status = await nativeSms.requestPermissions()
  return status.sms === 'granted'
}

export async function fetchInboxSms(options: {
  sinceMs: number
  untilMs?: number
}): Promise<RawSmsMessage[]> {
  if (!getSmsCapability().available) return []
  const result = await nativeSms.listMessages(options)
  return result.messages ?? []
}
