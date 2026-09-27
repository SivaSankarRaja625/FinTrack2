import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const stableTag = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u

function codeForTag(tag) {
  const match = stableTag.exec(tag)
  if (!match) throw new Error(`Invalid stable release tag: ${tag}`)
  const [major, minor, patch] = match.slice(1).map(Number)
  if (major > 2099 || minor > 999 || patch > 999) {
    throw new Error('Release version exceeds the Android version-code limit')
  }
  const code = major * 1_000_000 + minor * 1_000 + patch
  if (code < 1 || code > 2_100_000_000) {
    throw new Error('Android requires a positive version code below 2,100,000,001')
  }
  return code
}

export function resolveReleaseVersion(tag, packageVersion, existingTags) {
  const code = codeForTag(tag)
  const name = tag.slice(1)
  if (name !== packageVersion) {
    throw new Error(`Tag ${tag} does not match package.json version ${packageVersion}`)
  }
  const later = existingTags
    .filter((candidate) => {
      const match = stableTag.exec(candidate)
      return (
        match &&
        Number(match[1]) <= 2099 &&
        Number(match[2]) <= 999 &&
        Number(match[3]) <= 999
      )
    })
    .find((candidate) => codeForTag(candidate) > code)
  if (later) throw new Error(`Cannot build ${tag}: newer release tag ${later} exists`)
  return { name, code }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const tag = process.argv[2]
    const packageVersion = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ).version
    const tags = execFileSync('git', ['tag', '--list', 'v*'], {
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .filter(Boolean)
    const version = resolveReleaseVersion(tag, packageVersion, tags)
    process.stdout.write(
      `FINTRACK_VERSION_NAME=${version.name}\nFINTRACK_VERSION_CODE=${version.code}\n`,
    )
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Release version failed')
    process.exitCode = 1
  }
}
