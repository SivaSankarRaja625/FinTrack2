import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { webcrypto } from 'node:crypto'

Object.defineProperty(globalThis, 'crypto', {
  value: webcrypto,
  configurable: true,
})

Object.defineProperty(globalThis.URL, 'createObjectURL', {
  value: () => 'blob:fintrack-test',
  configurable: true,
})

Object.defineProperty(globalThis.URL, 'revokeObjectURL', {
  value: () => undefined,
  configurable: true,
})
