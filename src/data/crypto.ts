import { argon2id } from 'hash-wasm'

import { base64ToBytes, bytesToBase64, decodeUtf8, toArrayBuffer, utf8 } from './encoding'

export interface KdfParameters {
  algorithm: 'argon2id'
  memorySize: number
  iterations: number
  parallelism: number
  hashLength: 32
}

export interface EncryptedPayload {
  iv: string
  ciphertext: string
}

export interface SecurityConfig {
  version: 1
  salt: string
  kdf: KdfParameters
  wrappedDataKey: EncryptedPayload
  createdAt: string
}

export const productionKdfParameters: KdfParameters = {
  algorithm: 'argon2id',
  memorySize: 65_536,
  iterations: 3,
  parallelism: 1,
  hashLength: 32,
}

export const testKdfParameters: KdfParameters = {
  algorithm: 'argon2id',
  memorySize: 1_024,
  iterations: 1,
  parallelism: 1,
  hashLength: 32,
}

function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length))
}

async function importAesKey(bytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    toArrayBuffer(bytes),
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function derivePinKey(
  pin: string,
  salt: Uint8Array,
  parameters: KdfParameters,
): Promise<CryptoKey> {
  if (pin.length < 6) throw new Error('PIN must contain at least six characters')
  const result = await argon2id({
    password: pin,
    salt,
    iterations: parameters.iterations,
    parallelism: parameters.parallelism,
    memorySize: parameters.memorySize,
    hashLength: parameters.hashLength,
    outputType: 'binary',
  })
  if (!(result instanceof Uint8Array)) {
    throw new Error('Argon2id returned an unexpected output format')
  }
  return importAesKey(result)
}

export async function encryptBytes(
  bytes: Uint8Array,
  key: CryptoKey,
  authenticatedContext: string,
): Promise<EncryptedPayload> {
  const iv = randomBytes(12)
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(iv),
      additionalData: toArrayBuffer(utf8(authenticatedContext)),
      tagLength: 128,
    },
    key,
    toArrayBuffer(bytes),
  )
  return {
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  }
}

export async function decryptBytes(
  payload: EncryptedPayload,
  key: CryptoKey,
  authenticatedContext: string,
): Promise<Uint8Array> {
  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(base64ToBytes(payload.iv)),
        additionalData: toArrayBuffer(utf8(authenticatedContext)),
        tagLength: 128,
      },
      key,
      toArrayBuffer(base64ToBytes(payload.ciphertext)),
    )
    return new Uint8Array(plaintext)
  } catch {
    throw new Error('The PIN is incorrect or the encrypted data is damaged')
  }
}

export async function encryptJson(
  value: unknown,
  key: CryptoKey,
  authenticatedContext: string,
): Promise<EncryptedPayload> {
  return encryptBytes(utf8(JSON.stringify(value)), key, authenticatedContext)
}

export async function decryptJson<T>(
  payload: EncryptedPayload,
  key: CryptoKey,
  authenticatedContext: string,
): Promise<T> {
  const bytes = await decryptBytes(payload, key, authenticatedContext)
  try {
    return JSON.parse(decodeUtf8(bytes)) as T
  } catch {
    throw new Error('The decrypted data is not valid JSON')
  }
}

export async function createSecurityConfig(
  pin: string,
  kdf: KdfParameters = productionKdfParameters,
): Promise<{ config: SecurityConfig; dataKey: CryptoKey }> {
  const salt = randomBytes(16)
  const dataKeyBytes = randomBytes(32)
  const pinKey = await derivePinKey(pin, salt, kdf)
  const wrappedDataKey = await encryptBytes(dataKeyBytes, pinKey, 'fintrack:data-key:v1')
  const dataKey = await importAesKey(dataKeyBytes)
  dataKeyBytes.fill(0)
  return {
    config: {
      version: 1,
      salt: bytesToBase64(salt),
      kdf,
      wrappedDataKey,
      createdAt: new Date().toISOString(),
    },
    dataKey,
  }
}

export async function unlockDataKey(
  pin: string,
  config: SecurityConfig,
): Promise<CryptoKey> {
  if (config.version !== 1 || config.kdf.algorithm !== 'argon2id') {
    throw new Error('This security format is not supported')
  }
  const pinKey = await derivePinKey(pin, base64ToBytes(config.salt), config.kdf)
  const dataKeyBytes = await decryptBytes(
    config.wrappedDataKey,
    pinKey,
    'fintrack:data-key:v1',
  )
  if (dataKeyBytes.length !== 32) {
    throw new Error('The encrypted data key has an invalid length')
  }
  const dataKey = await importAesKey(dataKeyBytes)
  dataKeyBytes.fill(0)
  return dataKey
}

export async function rewrapDataKey(
  currentPin: string,
  nextPin: string,
  config: SecurityConfig,
): Promise<SecurityConfig> {
  const currentPinKey = await derivePinKey(
    currentPin,
    base64ToBytes(config.salt),
    config.kdf,
  )
  const rawDataKey = await decryptBytes(
    config.wrappedDataKey,
    currentPinKey,
    'fintrack:data-key:v1',
  )
  const salt = randomBytes(16)
  const pinKey = await derivePinKey(nextPin, salt, config.kdf)
  const wrappedDataKey = await encryptBytes(rawDataKey, pinKey, 'fintrack:data-key:v1')
  rawDataKey.fill(0)
  return { ...config, salt: bytesToBase64(salt), wrappedDataKey }
}

export function isSecurityConfig(value: unknown): value is SecurityConfig {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<SecurityConfig>
  return (
    candidate.version === 1 &&
    typeof candidate.salt === 'string' &&
    candidate.kdf?.algorithm === 'argon2id' &&
    typeof candidate.wrappedDataKey?.iv === 'string' &&
    typeof candidate.wrappedDataKey.ciphertext === 'string'
  )
}
