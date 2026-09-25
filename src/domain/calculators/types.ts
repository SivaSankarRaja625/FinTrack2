import type { ISODate, Paise } from '../types'

export type ReturnPath =
  | { kind: 'constant'; annualPercent: string }
  | { kind: 'monthly'; months: readonly { month: string; percent: string }[] }

export type ScenarioKind =
  | 'fd'
  | 'rd'
  | 'sip'
  | 'step-up-sip'
  | 'goal-sip'
  | 'stp'
  | 'swp'
  | 'lump-sum'
  | 'retirement'

export type EventKind =
  'contribution' | 'withdrawal' | 'transfer' | 'interest' | 'valuation' | 'fee'

export interface CashEvent {
  date: ISODate
  account: string
  kind: EventKind
  deltaPaise: Paise
  label: string
  transferId?: string
}

export interface ScenarioResult {
  version: 1
  kind: ScenarioKind
  startDate: ISODate
  endDate: ISODate
  assumptions: readonly string[]
  events: readonly CashEvent[]
  endingBalancesPaise: Readonly<Record<string, Paise>>
  contributedPaise: Paise
  withdrawnPaise: Paise
  gainPaise: Paise
  warnings: readonly string[]
  xirrPercent: number | null
}
