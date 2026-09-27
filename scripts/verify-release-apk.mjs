import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

function normalizedFingerprint(value) {
  const normalized = value.replaceAll(':', '').toLowerCase()
  if (!/^[0-9a-f]{64}$/u.test(normalized)) {
    throw new Error('Set ANDROID_SIGNING_CERT_SHA256 to the pinned release certificate')
  }
  return normalized
}

export function verifyReleaseApk(
  badging,
  signing,
  versionName,
  versionCode,
  expectedFingerprint,
) {
  const expected = normalizedFingerprint(expectedFingerprint)
  const packageLine = badging.split('\n').find((line) => line.startsWith('package:'))
  const details =
    /^package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'/u.exec(
      packageLine ?? '',
    )
  if (
    details?.[1] !== 'com.fintrack.app' ||
    Number(details?.[2]) !== versionCode ||
    details?.[3] !== versionName ||
    badging.includes('application-debuggable')
  ) {
    throw new Error('Release APK package, version or debuggable flag is incorrect')
  }
  const signers = [
    ...signing.matchAll(/^Signer #(\d+) certificate SHA-256 digest: ([0-9a-fA-F:]+)$/gmu),
  ]
  if (
    signers.length !== 1 ||
    signers[0]?.[1] !== '1' ||
    normalizedFingerprint(signers[0][2]) !== expected
  ) {
    throw new Error('Release APK is not signed by the pinned certificate')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const root = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT
    if (!root) throw new Error('Android SDK path is not configured')
    const apk = process.argv[2]
    if (!apk) throw new Error('Provide the signed release APK path')
    const tools = join(root, 'build-tools', '35.0.0')
    const badging = execFileSync(join(tools, 'aapt2'), ['dump', 'badging', apk], {
      encoding: 'utf8',
    })
    const signing = execFileSync(
      join(tools, 'apksigner'),
      ['verify', '--verbose', '--print-certs', apk],
      { encoding: 'utf8' },
    )
    verifyReleaseApk(
      badging,
      signing,
      process.env.FINTRACK_VERSION_NAME,
      Number(process.env.FINTRACK_VERSION_CODE),
      process.env.ANDROID_SIGNING_CERT_SHA256 ?? '',
    )
    console.log('Release package, version and pinned signing certificate verified')
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'Release APK verification failed',
    )
    process.exitCode = 1
  }
}
