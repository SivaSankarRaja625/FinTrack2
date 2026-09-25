import { describe, expect, it } from 'vitest'

import {
  createSecurityConfig,
  decryptJson,
  encryptJson,
  rewrapDataKey,
  testKdfParameters,
  unlockDataKey,
} from './crypto'

describe('local cryptography', () => {
  it('wraps a random data key with the PIN and encrypts authenticated records', async () => {
    const { config, dataKey } = await createSecurityConfig(
      'correct-horse',
      testKdfParameters,
    )
    const encrypted = await encryptJson(
      { amount: 12345, note: 'private' },
      dataKey,
      'record:1',
    )

    const unlocked = await unlockDataKey('correct-horse', config)
    await expect(decryptJson(encrypted, unlocked, 'record:1')).resolves.toEqual({
      amount: 12345,
      note: 'private',
    })
    await expect(unlockDataKey('wrong-pin', config)).rejects.toThrow(/incorrect|damaged/u)
  })

  it('detects ciphertext or context tampering', async () => {
    const { dataKey } = await createSecurityConfig('long-pin', testKdfParameters)
    const encrypted = await encryptJson({ value: 1 }, dataKey, 'record:1')
    await expect(decryptJson(encrypted, dataKey, 'record:2')).rejects.toThrow(
      /incorrect|damaged/u,
    )
  })

  it('changes the PIN without re-encrypting business data', async () => {
    const { config } = await createSecurityConfig('old-pin', testKdfParameters)
    const changed = await rewrapDataKey('old-pin', 'new-pin', config)
    await expect(unlockDataKey('old-pin', changed)).rejects.toThrow()
    await expect(unlockDataKey('new-pin', changed)).resolves.toBeDefined()
  })
})
