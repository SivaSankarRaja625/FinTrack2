import Decimal from 'decimal.js'
import { differenceInCalendarDays, parseISO } from 'date-fns'

import { isIsoDate } from '../dates'
import { assertPaise } from '../money'
import type { ISODate, Paise } from '../types'
import { ratePercent, validateHorizon } from './schedule'
import type { CashEvent, ScenarioResult } from './types'

export function xirr(
  events: readonly CashEvent[],
  endingValuePaise: Paise,
  asOf: ISODate,
): number | null {
  assertPaise(endingValuePaise)
  if (!isIsoDate(asOf)) throw new Error('Choose a valid evaluation date')
  const flows = events
    .filter((event) => event.kind === 'contribution' || event.kind === 'withdrawal')
    .map((event) => {
      if (!isIsoDate(event.date) || event.date > asOf) {
        throw new Error('Cash flow is outside the evaluation period')
      }
      assertPaise(event.deltaPaise)
      return { date: event.date, amount: -event.deltaPaise }
    })
  if (endingValuePaise > 0) flows.push({ date: asOf, amount: endingValuePaise })
  flows.sort((a, b) => a.date.localeCompare(b.date))
  const nonzero = flows.filter((flow) => flow.amount !== 0)
  if (nonzero.length < 2 || nonzero[0]?.date === nonzero.at(-1)?.date) return null
  const signs = nonzero.reduce(
    (count, flow, index) =>
      index > 0 && Math.sign(flow.amount) !== Math.sign(nonzero[index - 1]!.amount)
        ? count + 1
        : count,
    0,
  )
  if (signs !== 1) return null
  const anchor = parseISO(nonzero[0]!.date)
  const cashFlows = nonzero.map((flow) => ({
    days: differenceInCalendarDays(parseISO(flow.date), anchor),
    paise: flow.amount,
  }))
  const npv = (rate: Decimal): Decimal =>
    cashFlows.reduce(
      (total, flow) =>
        total.plus(
          new Decimal(flow.paise).div(rate.plus(1).pow(new Decimal(flow.days).div(365))),
        ),
      new Decimal(0),
    )

  let lower = new Decimal('-0.999999')
  let upper = new Decimal(1)
  let lowerValue = npv(lower)
  let upperValue = npv(upper)
  for (let index = 0; index < 30 && lowerValue.mul(upperValue).gt(0); index++) {
    upper = upper.mul(2).plus(1)
    upperValue = npv(upper)
  }
  if (lowerValue.mul(upperValue).gt(0)) return null
  for (let index = 0; index < 160; index++) {
    const middle = lower.plus(upper).div(2)
    const value = npv(middle)
    if (value.abs().lte('0.00001')) {
      const percentage = middle.mul(100).toNumber()
      return Number.isFinite(percentage) ? percentage : null
    }
    if (value.mul(lowerValue).gt(0)) {
      lower = middle
      lowerValue = value
    } else {
      upper = middle
      upperValue = value
    }
  }
  return null
}

export function withDatedYield(result: ScenarioResult, asOf: ISODate): ScenarioResult {
  const value = Object.values(result.endingBalancesPaise).reduce(
    (total, balance) => total + balance,
    0,
  )
  assertPaise(value)
  const annualized = result.endDate === asOf ? xirr(result.events, value, asOf) : null
  return {
    ...result,
    xirrPercent: annualized,
    warnings:
      annualized === null
        ? [
            ...result.warnings,
            'Annualized return is unavailable for these dated cash flows.',
          ]
        : result.warnings,
  }
}

export function compareScenarios(
  scenarios: readonly ScenarioResult[],
  asOf: ISODate,
  inflationPercent: string,
): readonly {
  result: ScenarioResult
  realEndPaise: Paise | null
  differentCashFlows: boolean
}[] {
  if (!isIsoDate(asOf) || scenarios.length < 2 || scenarios.length > 3) {
    throw new Error('Select two or three scenarios and an evaluation date')
  }
  const inflation = ratePercent(inflationPercent, 'Inflation rate').div(100)
  if (inflation.lte(-1)) throw new Error('Inflation must exceed -100%')
  const funding = (result: ScenarioResult) =>
    JSON.stringify({
      start: result.startDate,
      end: result.endDate,
      cash: result.events
        .filter((event) => event.kind === 'contribution' || event.kind === 'withdrawal')
        .map(({ kind, date, deltaPaise }) => [kind, date, deltaPaise]),
    })
  const original = funding(scenarios[0]!)
  const baseDate = scenarios.reduce(
    (earliest, result) => (result.startDate < earliest ? result.startDate : earliest),
    asOf,
  )
  validateHorizon(baseDate, asOf)
  const days = differenceInCalendarDays(parseISO(asOf), parseISO(baseDate))
  return scenarios.map((result) => {
    if (result.startDate > asOf || result.endDate > asOf) {
      throw new Error('Evaluation date must include every scenario')
    }
    validateHorizon(result.startDate, asOf)
    const balance = Object.values(result.endingBalancesPaise).reduce(
      (total, amount) => total + amount,
      0,
    )
    assertPaise(balance)
    const adjusted =
      result.endDate === asOf
        ? new Decimal(balance)
            .div(inflation.plus(1).pow(new Decimal(days).div(365)))
            .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
            .toNumber()
        : null
    if (adjusted !== null) assertPaise(adjusted)
    return {
      result: withDatedYield(result, asOf),
      realEndPaise: adjusted,
      differentCashFlows: funding(result) !== original,
    }
  })
}
