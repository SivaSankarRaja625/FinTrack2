import { constants, access, readFile, readdir } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join, relative } from 'node:path'

const root = process.cwd()
const buildRoot = join(root, 'android/app/build/intermediates')
const apkRoot = join(root, 'android/app/build/outputs/apk')
const execute = promisify(execFile)
const forbiddenPermissions = [
  'android.permission.INTERNET',
  'android.permission.ACCESS_NETWORK_STATE',
  'android.permission.CHANGE_NETWORK_STATE',
  'android.permission.ACCESS_WIFI_STATE',
  'android.permission.CHANGE_WIFI_STATE',
  'android.permission.DOWNLOAD_WITHOUT_NOTIFICATION',
  'android.permission.REQUEST_INSTALL_PACKAGES',
  'android.permission.SCHEDULE_EXACT_ALARM',
  'android.permission.USE_EXACT_ALARM',
]

async function findFiles(directory, predicate) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await findFiles(path, predicate)))
    } else if (predicate(path, entry.name)) files.push(path)
  }
  return files
}

async function findAapt2() {
  if (process.env.AAPT2) return process.env.AAPT2
  const sdkRoot = process.env.ANDROID_SDK_ROOT ?? process.env.ANDROID_HOME
  if (!sdkRoot) return null
  const buildToolsRoot = join(sdkRoot, 'build-tools')
  const versions = (await readdir(buildToolsRoot)).sort().reverse()
  for (const version of versions) {
    const candidate = join(buildToolsRoot, version, 'aapt2')
    try {
      await access(candidate, constants.X_OK)
      return candidate
    } catch {
      // Continue to an older installed build-tools version.
    }
  }
  return null
}

let manifests
try {
  manifests = await findFiles(
    buildRoot,
    (path, name) =>
      name === 'AndroidManifest.xml' && path.toLowerCase().includes('release'),
  )
} catch (error) {
  if (error?.code === 'ENOENT') {
    console.error('No merged Android manifests found; build the release variant first')
    process.exit(1)
  }
  throw error
}

if (manifests.length === 0) {
  console.error('No release AndroidManifest.xml found under Android build intermediates')
  process.exit(1)
}

const failures = []
for (const manifest of manifests) {
  const content = await readFile(manifest, 'utf8')
  for (const permission of forbiddenPermissions) {
    if (content.includes(permission)) {
      failures.push(`${relative(root, manifest)} declares ${permission}`)
    }
  }
  for (const required of [
    'android:allowBackup="true"',
    'android:dataExtractionRules="@xml/data_extraction_rules"',
    'android:fullBackupContent="@xml/backup_rules"',
    'android:usesCleartextTraffic="false"',
  ]) {
    if (!content.includes(required)) {
      failures.push(`${relative(root, manifest)} is missing ${required}`)
    }
  }
}

let apks = []
try {
  apks = await findFiles(
    apkRoot,
    (path, name) => name.endsWith('.apk') && path.toLowerCase().includes('release'),
  )
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
}
if (apks.length === 0) {
  failures.push('No release APK found; assemble the release variant before verification')
} else {
  const aapt2 = await findAapt2()
  if (!aapt2) {
    failures.push('aapt2 was not found; set ANDROID_SDK_ROOT before APK verification')
  } else {
    for (const apk of apks) {
      const { stdout } = await execute(aapt2, ['dump', 'permissions', apk])
      for (const permission of forbiddenPermissions) {
        if (stdout.includes(permission)) {
          failures.push(`${relative(root, apk)} declares ${permission}`)
        }
      }
    }
  }
}

const extractionRules = await readFile(
  join(root, 'android/app/src/main/res/xml/data_extraction_rules.xml'),
  'utf8',
)
const legacyRules = await readFile(
  join(root, 'android/app/src/main/res/xml/backup_rules.xml'),
  'utf8',
)
const fileProviderPaths = await readFile(
  join(root, 'android/app/src/main/res/xml/file_paths.xml'),
  'utf8',
)
for (const [name, content] of [
  ['data_extraction_rules.xml', extractionRules],
  ['backup_rules.xml', legacyRules],
]) {
  if (
    !content.includes('domain="file"') ||
    !content.includes('system-backup/finance.snapshot')
  ) {
    failures.push(`${name} does not whitelist the encrypted snapshot`)
  }
  if (content.includes('domain="root"')) {
    failures.push(`${name} must not include the WebView root domain`)
  }
}
if (!extractionRules.includes('disableIfNoEncryptionCapabilities="true"')) {
  failures.push('Android 12+ cloud backup is not gated on encryption capabilities')
}
if (!legacyRules.includes('requireFlags="clientSideEncryption"')) {
  failures.push('Legacy cloud backup is not gated on client-side encryption')
}
if (
  fileProviderPaths.includes('<external-path') ||
  !fileProviderPaths.includes('<cache-path') ||
  !fileProviderPaths.includes('path="exports/"')
) {
  failures.push('Android file sharing must expose only the cache exports directory')
}

if (failures.length > 0) {
  console.error('Android capability-policy violations:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exitCode = 1
} else {
  console.log(
    `Verified ${manifests.length} merged manifest(s) and ${apks.length} release APK(s): no forbidden permission`,
  )
}
