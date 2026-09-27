import assert from 'node:assert/strict'
import { test } from 'node:test'

import { verifyReleaseApk } from './verify-release-apk.mjs'

const fingerprint = 'A1:B2:C3:D4:'.repeat(7) + 'A1:B2:C3:D4'
const badging =
  "package: name='com.fintrack.app' versionCode='1000' versionName='0.1.0'\nsdkVersion:'24'"
const signing =
  `Verifies\nVerified using v2 scheme (APK Signature Scheme v2): true\n` +
  `Signer #1 certificate SHA-256 digest: ${fingerprint.replaceAll(':', '').toLowerCase()}\n`

test('accepts only the expected production identity and signer', () => {
  assert.doesNotThrow(() =>
    verifyReleaseApk(badging, signing, '0.1.0', 1000, fingerprint),
  )
})

test('rejects a different key, package, version or debuggable APK', () => {
  const cases = [
    [badging, signing, '0.1.0', 1000, 'FF'.repeat(32)],
    [
      badging.replace('com.fintrack.app', 'com.fintrack.app.preview'),
      signing,
      '0.1.0',
      1000,
      fingerprint,
    ],
    [
      badging.replace("versionCode='1000'", "versionCode='1'"),
      signing,
      '0.1.0',
      1000,
      fingerprint,
    ],
    [
      badging.replace("versionName='0.1.0'", "versionName='0.0.9'"),
      signing,
      '0.1.0',
      1000,
      fingerprint,
    ],
    [`${badging}\napplication-debuggable`, signing, '0.1.0', 1000, fingerprint],
    [
      badging,
      `${signing}Signer #2 certificate SHA-256 digest: ${'ff'.repeat(32)}\n`,
      '0.1.0',
      1000,
      fingerprint,
    ],
  ]
  for (const args of cases) assert.throws(() => verifyReleaseApk(...args))
})

test('refuses a missing or malformed release certificate pin', () => {
  assert.throws(() => verifyReleaseApk(badging, signing, '0.1.0', 1000, ''))
  assert.throws(() => verifyReleaseApk(badging, signing, '0.1.0', 1000, 'unverified'))
})
