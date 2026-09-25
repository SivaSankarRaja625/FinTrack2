import type { BaseEntity, EntityId, ISODateTime } from './types'

export function newId(): EntityId {
  return crypto.randomUUID()
}

export function nowIso(): ISODateTime {
  return new Date().toISOString()
}

export function entityTimestamps(existing?: Pick<BaseEntity, 'createdAt'>) {
  const now = nowIso()
  return {
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
}
