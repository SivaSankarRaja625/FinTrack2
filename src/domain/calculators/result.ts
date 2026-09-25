import { isIsoDate } from '../dates'
import { assertPaise } from '../money'
import type { ISODate, Paise } from '../types'
import { validateHorizon } from './schedule'
import type { CashEvent, ScenarioKind, ScenarioResult } from './types'

export function buildResult(
  kind: ScenarioKind,
  startDate: ISODate,
  endDate: ISODate,
  assumptions: readonly string[],
  events: readonly CashEvent[],
  warnings: readonly string[] = [],
): ScenarioResult {
  validateHorizon(startDate, endDate)
  const balances: Record<string, Paise> = {}
  const transfers = new Map<
    string,
    { count: number; sum: number; date: string; accounts: Set<string> }
  >()
  let contributed = 0
  let withdrawn = 0
  let previousDate = startDate
  for (const event of events) {
    assertPaise(event.deltaPaise)
    if (!isIsoDate(event.date) || event.date < previousDate || event.date > endDate) {
      throw new Error('Cash-flow events must have ordered dates within the scenario')
    }
    if (!event.account.trim()) throw new Error('A cash-flow account is required')
    if (event.kind === 'contribution') {
      if (event.deltaPaise < 0) throw new Error('Contribution cannot be negative')
      contributed += event.deltaPaise
      assertPaise(contributed)
    } else if (event.kind === 'withdrawal') {
      if (event.deltaPaise > 0) throw new Error('Withdrawal must reduce the balance')
      withdrawn -= event.deltaPaise
      assertPaise(withdrawn)
    } else if (event.kind === 'transfer') {
      if (!event.transferId) throw new Error('Transfers need a matching transfer ID')
      const current = transfers.get(event.transferId)
      if (current && current.date !== event.date) {
        throw new Error('Transfer legs must share a date')
      }
      transfers.set(event.transferId, {
        date: event.date,
        count: (current?.count ?? 0) + 1,
        sum: (current?.sum ?? 0) + event.deltaPaise,
        accounts: new Set([...(current?.accounts ?? []), event.account]),
      })
    } else if (event.kind === 'fee' && event.deltaPaise > 0) {
      throw new Error('A fee must reduce the balance')
    }
    const balance = (balances[event.account] ?? 0) + event.deltaPaise
    assertPaise(balance)
    if (balance < 0) throw new Error('A scenario account cannot become negative')
    balances[event.account] = balance
    previousDate = event.date
  }
  if (
    [...transfers.values()].some(
      (transfer) =>
        transfer.count !== 2 || transfer.sum !== 0 || transfer.accounts.size !== 2,
    )
  ) {
    throw new Error('Both legs of every internal transfer must balance')
  }
  const ending = Object.values(balances).reduce((sum, value) => sum + value, 0)
  assertPaise(ending)
  const gain = ending + withdrawn - contributed
  assertPaise(gain)
  return {
    version: 1,
    kind,
    startDate,
    endDate,
    assumptions,
    events,
    endingBalancesPaise: balances,
    contributedPaise: contributed,
    withdrawnPaise: withdrawn,
    gainPaise: gain,
    warnings,
    xirrPercent: null,
  }
}
