import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

import { bytesToBase64, toArrayBuffer } from '../data/encoding'

export async function downloadBytes(
  bytes: Uint8Array,
  filename: string,
  mimeType: string,
): Promise<'downloaded' | 'shared'> {
  if (Capacitor.isNativePlatform()) {
    const extension = /\.([a-z0-9]{1,10})$/iu.exec(filename)?.[1]?.toLowerCase() ?? 'bin'
    const path = `exports/fintrack-export.${extension}`
    await Filesystem.writeFile({
      path,
      directory: Directory.Cache,
      data: bytesToBase64(bytes),
      recursive: true,
    })
    const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache })
    await Share.share({
      title: 'FinTrack export',
      text: 'Save this file somewhere separate from the device.',
      files: [uri],
      dialogTitle: 'Save or share FinTrack export',
    })
    return 'shared'
  }

  const blob = new Blob([toArrayBuffer(bytes)], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
  return 'downloaded'
}

export function downloadText(
  text: string,
  filename: string,
  mimeType = 'text/plain;charset=utf-8',
): Promise<'downloaded' | 'shared'> {
  return downloadBytes(new TextEncoder().encode(text), filename, mimeType)
}

export async function readFileBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer())
}

export async function requestPersistentStorage(): Promise<{
  supported: boolean
  persisted: boolean
}> {
  if (!navigator.storage?.persist) {
    return { supported: false, persisted: false }
  }
  return { supported: true, persisted: await navigator.storage.persist() }
}

export async function estimateStorage(): Promise<{
  usage: number
  quota: number
}> {
  if (!navigator.storage?.estimate) return { usage: 0, quota: 0 }
  const estimate = await navigator.storage.estimate()
  return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 }
}
