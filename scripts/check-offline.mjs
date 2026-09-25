import { readFile, readdir } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'

const root = process.cwd()
const sourceRoots = ['src']
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx'])
const forbiddenSourcePatterns = [
  { pattern: /\bfetch\s*\(/u, label: 'fetch()' },
  { pattern: /\bXMLHttpRequest\b/u, label: 'XMLHttpRequest' },
  { pattern: /\bWebSocket\b/u, label: 'WebSocket' },
  { pattern: /\bEventSource\b/u, label: 'EventSource' },
  { pattern: /\bhttps?:\/\//u, label: 'remote URL' },
  { pattern: /@capacitor\/community\/http|@capacitor\/http/u, label: 'Capacitor HTTP' },
]
const forbiddenDependencies = new Set([
  '@capacitor-community/http',
  '@capacitor/http',
  '@firebase/app',
  'axios',
  'got',
  'graphql-request',
  'socket.io-client',
])
const forbiddenAndroidPermissions = [
  'android.permission.INTERNET',
  'android.permission.ACCESS_NETWORK_STATE',
  'android.permission.CHANGE_NETWORK_STATE',
  'android.permission.ACCESS_WIFI_STATE',
  'android.permission.CHANGE_WIFI_STATE',
  'android.permission.DOWNLOAD_WITHOUT_NOTIFICATION',
  'android.permission.REQUEST_INSTALL_PACKAGES',
]

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await walk(path)))
    } else {
      files.push(path)
    }
  }
  return files
}

const failures = []
for (const sourceRoot of sourceRoots) {
  for (const file of await walk(join(root, sourceRoot))) {
    if (!sourceExtensions.has(extname(file)) || file.endsWith('.test.ts')) continue
    const content = await readFile(file, 'utf8')
    for (const { pattern, label } of forbiddenSourcePatterns) {
      if (pattern.test(content)) {
        failures.push(`${relative(root, file)} contains forbidden ${label}`)
      }
    }
  }
}

const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
for (const name of Object.keys(packageJson.dependencies ?? {})) {
  if (forbiddenDependencies.has(name)) {
    failures.push(`package.json contains forbidden runtime dependency ${name}`)
  }
}

const sourceManifest = join(root, 'android/app/src/main/AndroidManifest.xml')
try {
  const manifest = await readFile(sourceManifest, 'utf8')
  for (const permission of forbiddenAndroidPermissions) {
    if (manifest.includes(permission)) {
      failures.push(`AndroidManifest.xml declares forbidden ${permission}`)
    }
  }
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
}

const indexHtml = await readFile(join(root, 'index.html'), 'utf8')
if (!indexHtml.includes('connect-src __FINAPP_CONNECT_SOURCE__')) {
  failures.push('index.html is missing the build-time connect-src policy')
}

if (failures.length > 0) {
  console.error('Offline policy violations:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exitCode = 1
} else {
  console.log('Offline policy check passed')
}
