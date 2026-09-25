import Decimal from 'decimal.js'

import { assertPaise } from '../money'
import type { ISODate, Paise } from '../types'
import { calculateSip, calculateSwp, type SipInput } from './market'
import { buildResult } from './result'
import { marketGrowth, monthlyDate, ratePercent, validateHorizon } from './schedule'
import type { CashEvent, ReturnPath, ScenarioResult } from './types'

export function futureCost(
  todayPaise: Paise,
  annualInflationPercent: string,
  years: number,
): Paise {
  assertPaise(todayPaise)
  if (todayPaise < 0 || !Number.isFinite(years) || years < 0 || years > 60) {
    throw new Error('Enter an amount and a horizon of up to 60 years')
  }
  const inflation = ratePercent(annualInflationPercent, 'Inflation rate')
  if (inflation.lte(-100)) throw new Error('Inflation must exceed -100%')
  const adjusted = new Decimal(todayPaise)
    .mul(inflation.div(100).plus(1).pow(years))
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber()
  assertPaise(adjusted)
  return adjusted
}

export function wealthMultiple(
  initialPaise: Paise,
  annualPercent: string,
  multiple: 2 | 3,
  horizonYears: number,
): number | null {
  assertPaise(initialPaise)
  if (initialPaise <= 0 || ![2, 3].includes(multiple)) {
    throw new Error('Choose a positive starting amount and a 2x or 3x target')
  }
  if (!Number.isFinite(horizonYears) || horizonYears <= 0 || horizonYears > 60) {
    throw new Error('Choose a horizon within 60 years')
  }
  const rate = ratePercent(annualPercent)
  if (rate.lte(0)) return null
  const years = new Decimal(multiple).ln().div(rate.div(100).plus(1).ln())
  return years.lte(horizonYears) ? years.toNumber() : null
}

export function projectLumpSum(input: {
  principalPaise: Paise
  opened: ISODate
  matures: ISODate
  returnPath: ReturnPath
}): ScenarioResult {
  validateHorizon(input.opened, input.matures)
  assertPaise(input.principalPaise)
  if (input.principalPaise <= 0) throw new Error('Enter a positive initial amount')
  const events: CashEvent[] = [
    {
      date: input.opened,
      account: 'main',
      kind: 'contribution',
      deltaPaise: input.principalPaise,
      label: 'Initial amount',
    },
  ]
  let balance = new Decimal(input.principalPaise)
  let shown = input.principalPaise
  let from = input.opened
  for (let year = 1; from < input.matures; year++) {
    const anniversary = monthlyDate(input.opened, year * 12)
    const to = anniversary < input.matures ? anniversary : input.matures
    balance = balance.mul(marketGrowth(input.returnPath, from, to))
    const next = balance.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber()
    assertPaise(next)
    if (next !== shown) {
      events.push({
        date: to,
        account: 'main',
        kind: 'valuation',
        deltaPaise: next - shown,
        label: 'Illustrative value change',
      })
    }
    shown = next
    from = to
  }
  return buildResult(
    'lump-sum',
    input.opened,
    input.matures,
    [`User-entered ${input.returnPath.kind} market return; not a forecast`],
    events,
  )
}

export function costOfDelay(
  input: SipInput,
  delayMonths: number,
): { now: ScenarioResult; delayed: ScenarioResult } {
  if (!Number.isSafeInteger(delayMonths) || delayMonths < 1 || delayMonths > 720) {
    throw new Error('Enter a delay of 1 to 720 months')
  }
  const delayedStart = monthlyDate(input.opened, delayMonths)
  if (delayedStart >= input.matures) {
    throw new Error('The delayed start must precede the target date')
  }
  return {
    now: calculateSip(input),
    delayed: calculateSip({ ...input, opened: delayedStart }),
  }
}

export function retirementProjection(
  input: SipInput & {
    monthlyWithdrawalPaise: Paise
    withdrawalMonths: number
  },
): ScenarioResult {
  if (
    !Number.isSafeInteger(input.withdrawalMonths) ||
    input.withdrawalMonths < 1 ||
    input.withdrawalMonths > 720
  ) {
    throw new Error('Enter a retirement drawdown within 60 years')
  }
  const finish = monthlyDate(input.matures, input.withdrawalMonths)
  validateHorizon(input.opened, finish)
  const saved = calculateSip(input)
  const drawdown = calculateSwp({
    capitalPaise: saved.endingBalancesPaise.main ?? 0,
    opened: input.matures,
    matures: finish,
    cadenceMonths: 1,
    returnPath: input.returnPath,
    withdrawal: { kind: 'amount', paise: input.monthlyWithdrawalPaise },
    annualIncreasePercent: '0',
  })
  return buildResult(
    'retirement',
    input.opened,
    finish,
    [...saved.assumptions, 'Same illustrative return assumed during withdrawals'],
    [
      ...saved.events,
      ...drawdown.events.filter((event) => event.kind !== 'contribution'),
    ],
    drawdown.warnings,
  )
}
