import assert from 'node:assert/strict'
import { test } from 'node:test'

import { resolveReleaseVersion } from './release-version.mjs'

test('stable tags map to increasing Android version codes across minor and major releases', () => {
  assert.deepEqual(resolveReleaseVersion('v0.1.0', '0.1.0', []), {
    name: '0.1.0',
    code: 1000,
  })
  assert.deepEqual(resolveReleaseVersion('v0.1.1', '0.1.1', ['v0.1.0']), {
    name: '0.1.1',
    code: 1001,
  })
  assert.deepEqual(resolveReleaseVersion('v1.0.0', '1.0.0', ['v0.999.999']), {
    name: '1.0.0',
    code: 1_000_000,
  })
})

test('rejects colliding, invalid, mismatched and older release tags', () => {
  for (const [tag, packageVersion, otherTags] of [
    ['v1.02.3', '1.02.3', []],
    ['v1.2.3-rc.1', '1.2.3-rc.1', []],
    ['v1.1000.0', '1.1000.0', []],
    ['v2100.0.0', '2100.0.0', []],
    ['v0.0.0', '0.0.0', []],
    ['v0.1.1', '0.1.0', []],
    ['v0.1.0', '0.1.0', ['v0.1.1']],
  ]) {
    assert.throws(() => resolveReleaseVersion(tag, packageVersion, otherTags), {
      name: 'Error',
    })
  }
})

test('permits rebuilding the newest tag without changing its package version', () => {
  assert.deepEqual(resolveReleaseVersion('v0.1.0', '0.1.0', ['v0.1.0']), {
    name: '0.1.0',
    code: 1000,
  })
})

test('an out-of-range tag cannot block a valid signed release', () => {
  assert.deepEqual(resolveReleaseVersion('v0.1.0', '0.1.0', ['v2100.0.0', 'v0.1.0']), {
    name: '0.1.0',
    code: 1000,
  })
})
