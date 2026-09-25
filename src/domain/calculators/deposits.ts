import Decimal from 'decimal.js'
import {
  addMonths,
  differenceInCalendarDays,
  endOfQuarter,
  format,
  isLeapYear,
  parseISO,
} from 'date-fns'

import { isIsoDate } from '../dates'
import { assertPaise } from '../money'
import type { ISODate, Paise } from '../types'
import { buildResult } from './result'
import { monthlyDate, validateHorizon } from './schedule'
import type { CashEvent, ScenarioResult } from './types'

export interface BankTerms {
  annualNominalPercent: string
  rest: 'monthly-anniversary' | 'quarterly-anniversary' | 'calendar-quarter'
  dayCount: 'actual-365' | 'actual-actual'
}

export interface FixedDepositInput extends BankTerms {
  principalPaise: Paise
  opened: ISODate
  matures: ISODate
  payout: 'cumulative' | 'monthly' | 'quarterly'
  withdrawal?: {
    date: ISODate
    applicableAnnualPercent: string
    disclosedPenaltyPercent: string
  }
}

export interface RecurringDepositInput extends BankTerms {
  installmentPaise: Paise
  opened: ISODate
  matures: ISODate
  installmentCount: number
  actualDates?: readonly (ISODate | null)[]
}

interface BankPeriod {
  from: ISODate
  to: ISODate
  complete: boolean
}

function positivePaise(value: Paise, field: string): void {
  assertPaise(value)
  if (value <= 0) throw new Error(`${field} must be a positive number of paise`)
}

function bankRate(value: string, field: string): Decimal {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Enter the ${field}`)
  }
  let rate: Decimal
  try {
    rate = new Decimal(value)
  } catch {
    throw new Error(`Enter a finite ${field}`)
  }
  if (!rate.isFinite() || rate.isNegative()) {
    throw new Error(`Enter a finite, non-negative ${field}`)
  }
  return rate
}

function validateTerms(terms: BankTerms): Decimal {
  if (
    !['monthly-anniversary', 'quarterly-anniversary', 'calendar-quarter'].includes(
      terms.rest,
    )
  ) {
    throw new Error('Choose the bank rest/compounding convention')
  }
  if (terms.dayCount !== 'actual-365' && terms.dayCount !== 'actual-actual') {
    throw new Error('Choose the bank day-count convention')
  }
  return bankRate(terms.annualNominalPercent, 'nominal annual rate')
}

function quarterEnd(date: ISODate): ISODate {
  return format(endOfQuarter(parseISO(date)), 'yyyy-MM-dd')
}

function bankPeriods(
  opened: ISODate,
  matures: ISODate,
  rest: BankTerms['rest'],
): BankPeriod[] {
  const periods: BankPeriod[] = []
  let from = opened
  let index = 1
  while (from < matures) {
    const next =
      rest === 'calendar-quarter'
        ? quarterEnd(from) === from
          ? quarterEnd(format(addMonths(parseISO(from), 3), 'yyyy-MM-dd'))
          : quarterEnd(from)
        : monthlyDate(opened, index * (rest === 'monthly-anniversary' ? 1 : 3))
    const fromDate = parseISO(from)
    const fullCalendarQuarter =
      quarterEnd(from) === from ||
      (fromDate.getDate() === 1 && fromDate.getMonth() % 3 === 0)
    const complete = rest === 'calendar-quarter' ? fullCalendarQuarter : true
    const to = next < matures ? next : matures
    periods.push({ from, to, complete: complete && to === next })
    from = to
    index += 1
  }
  return periods
}

function accrueBankBalance(
  balance: Decimal,
  from: ISODate,
  to: ISODate,
  terms: BankTerms,
  complete: boolean,
): Decimal {
  const rate = bankRate(terms.annualNominalPercent, 'nominal annual rate').div(100)
  if (complete) {
    return balance.mul(rate).div(terms.rest === 'monthly-anniversary' ? 12 : 4)
  }
  let cursor = from
  let fraction = new Decimal(0)
  while (cursor < to) {
    const nextYear = `${Number(cursor.slice(0, 4)) + 1}-01-01`
    const until = nextYear < to ? nextYear : to
    const basis =
      terms.dayCount === 'actual-365' ? 365 : isLeapYear(parseISO(cursor)) ? 366 : 365
    fraction = fraction.plus(
      new Decimal(differenceInCalendarDays(parseISO(until), parseISO(cursor))).div(basis),
    )
    cursor = until
  }
  return balance.mul(rate).mul(fraction)
}

function roundedPaise(amount: Decimal): Paise {
  const paise = amount.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber()
  assertPaise(paise)
  return paise
}

function interestEvent(date: ISODate, amount: Paise, label: string): CashEvent {
  return { date, account: 'main', kind: 'interest', deltaPaise: amount, label }
}

function annualizedYield(result: ScenarioResult): number | null {
  const cashFlows = result.events
    .filter((event) => event.kind === 'contribution' || event.kind === 'withdrawal')
    .map((event) => ({
      date: event.date,
      paise: -event.deltaPaise,
    }))
  const ending = Object.values(result.endingBalancesPaise).reduce(
    (total, amount) => total + amount,
    0,
  )
  cashFlows.push({ date: result.endDate, paise: ending })
  if (
    !cashFlows.some((flow) => flow.paise < 0) ||
    !cashFlows.some((flow) => flow.paise > 0)
  ) {
    return null
  }
  const start = parseISO(result.startDate)
  const discounted = (rate: number): number =>
    cashFlows.reduce((sum, flow) => {
      const years = differenceInCalendarDays(parseISO(flow.date), start) / 365
      return sum + flow.paise / Math.pow(1 + rate, years)
    }, 0)
  let lower = -0.999999
  let upper = 1
  while (discounted(upper) > 0 && upper < 1e12) upper = upper * 2 + 1
  if (discounted(lower) < 0 || discounted(upper) > 0) return null
  for (let step = 0; step < 100; step += 1) {
    const midpoint = (lower + upper) / 2
    if (discounted(midpoint) > 0) lower = midpoint
    else upper = midpoint
  }
  const percentage = ((lower + upper) / 2) * 100
  return Number.isFinite(percentage) ? percentage : null
}

function withYield(result: ScenarioResult): ScenarioResult {
  return { ...result, xirrPercent: annualizedYield(result) }
}

function cumulativeCredits(
  principal: Paise,
  opened: ISODate,
  until: ISODate,
  terms: BankTerms,
  events?: CashEvent[],
): Paise {
  let balance = principal
  for (const period of bankPeriods(opened, until, terms.rest)) {
    const amount = roundedPaise(
      accrueBankBalance(
        new Decimal(balance),
        period.from,
        period.to,
        terms,
        period.complete,
      ),
    )
    if (amount !== 0 && events)
      events.push(interestEvent(period.to, amount, 'Interest credited'))
    balance += amount
    assertPaise(balance)
  }
  return balance
}

function payoutDates(input: FixedDepositInput, end: ISODate): Set<ISODate> {
  const dates = new Set<ISODate>([end])
  if (input.payout === 'cumulative') return dates
  const frequency = input.payout === 'monthly' ? 1 : 3
  let previous = input.opened
  for (let index = 1; ; index += 1) {
    const next =
      input.payout === 'quarterly' && input.rest === 'calendar-quarter'
        ? quarterEnd(previous) === previous
          ? quarterEnd(format(addMonths(parseISO(previous), 3), 'yyyy-MM-dd'))
          : quarterEnd(previous)
        : monthlyDate(input.opened, index * frequency)
    if (next >= end) break
    dates.add(next)
    previous = next
  }
  return dates
}

function periodicCredits(
  input: FixedDepositInput,
  end: ISODate,
  terms: BankTerms,
  events: CashEvent[],
  early: boolean,
): { paid: Paise; balance: Paise; referenceInterest: Paise } {
  const rests = bankPeriods(input.opened, end, input.rest)
  const payouts = payoutDates(input, end)
  const boundaries = [
    ...new Set([...rests.map((period) => period.to), ...payouts]),
  ].sort()
  let from = input.opened
  let paid = 0
  let pending = 0
  let referenceInterest = 0
  let restIndex = 0
  for (const date of boundaries) {
    while (restIndex < rests.length && rests[restIndex]!.to < date) restIndex += 1
    const period = rests[restIndex]
    const complete = period?.from === from && period.to === date && period.complete
    const amount = roundedPaise(
      accrueBankBalance(new Decimal(input.principalPaise), from, date, terms, complete),
    )
    referenceInterest += amount
    assertPaise(referenceInterest)
    if (!early || date !== end) {
      if (amount !== 0) {
        events.push(interestEvent(date, amount, 'Interest credited'))
        pending += amount
        assertPaise(pending)
      }
      if (payouts.has(date) && pending !== 0) {
        events.push({
          date,
          account: 'main',
          kind: 'withdrawal',
          deltaPaise: -pending,
          label: 'Interest paid out',
        })
        paid += pending
        assertPaise(paid)
        pending = 0
      }
    }
    from = date
  }
  return { paid, balance: input.principalPaise + pending, referenceInterest }
}

export function calculateFixedDeposit(input: FixedDepositInput): ScenarioResult {
  validateHorizon(input.opened, input.matures)
  positivePaise(input.principalPaise, 'Principal')
  const contractedRate = validateTerms(input)
  if (!['cumulative', 'monthly', 'quarterly'].includes(input.payout)) {
    throw new Error('Choose a cumulative, monthly or quarterly payout')
  }
  const end = input.withdrawal?.date ?? input.matures
  let applicableRate = contractedRate
  let penalty = new Decimal(0)
  if (input.withdrawal) {
    if (!isIsoDate(end) || end <= input.opened || end >= input.matures) {
      throw new Error('Choose a withdrawal date during the deposit')
    }
    applicableRate = bankRate(
      input.withdrawal.applicableAnnualPercent,
      'applicable holding-period rate',
    )
    penalty = bankRate(input.withdrawal.disclosedPenaltyPercent, 'disclosed penalty')
    if (penalty.gt(applicableRate)) {
      throw new Error(
        'Disclosed penalty must not exceed the applicable holding-period rate',
      )
    }
  }
  const assumptions = [
    `Nominal annual contracted rate: ${contractedRate.toString()}%; ${input.rest} rest; ${input.dayCount} day-count; ${input.payout} payout.`,
    'Complete rests use nominal rate divided by rests per year; broken periods use the selected day-count.',
    'Annualized yield uses dated payouts and ending value; paid interest is not reinvested.',
  ]
  if (input.withdrawal) {
    assumptions.push(
      `Early closure: actual holding-period rate ${applicableRate.toString()}%; disclosed penalty ${penalty.toString()} percentage points. Previously paid interest is reconciled at closure.`,
    )
  }
  const events: CashEvent[] = [
    {
      date: input.opened,
      account: 'main',
      kind: 'contribution',
      deltaPaise: input.principalPaise,
      label: 'Fixed deposit principal',
    },
  ]
  if (input.payout === 'cumulative') {
    const actualTerms = { ...input, annualNominalPercent: applicableRate.toString() }
    const gross = cumulativeCredits(
      input.principalPaise,
      input.opened,
      end,
      actualTerms,
      events,
    )
    if (input.withdrawal) {
      const net = cumulativeCredits(input.principalPaise, input.opened, end, {
        ...actualTerms,
        annualNominalPercent: applicableRate.minus(penalty).toString(),
      })
      if (gross > net) {
        events.push({
          date: end,
          account: 'main',
          kind: 'fee',
          deltaPaise: net - gross,
          label: 'Disclosed early-withdrawal penalty',
        })
      }
    }
  } else {
    const { paid, balance } = periodicCredits(
      input,
      end,
      input,
      events,
      !!input.withdrawal,
    )
    if (input.withdrawal) {
      const netTerms: BankTerms = {
        ...input,
        annualNominalPercent: applicableRate.minus(penalty).toString(),
      }
      const net = periodicCredits(input, end, netTerms, [], true).referenceInterest
      const target = input.principalPaise + net - paid
      assertPaise(target)
      if (target < 0) {
        throw new Error(
          'Early closure cannot cover interest already paid; enter the bank recovery terms',
        )
      }
      const adjustment = target - balance
      if (adjustment !== 0) {
        events.push({
          date: end,
          account: 'main',
          kind: adjustment > 0 ? 'interest' : 'fee',
          deltaPaise: adjustment,
          label: 'Early closure rate and penalty adjustment',
        })
      }
    }
  }
  return withYield(buildResult('fd', input.opened, end, assumptions, events))
}

export function calculateRecurringDeposit(input: RecurringDepositInput): ScenarioResult {
  validateHorizon(input.opened, input.matures)
  positivePaise(input.installmentPaise, 'Instalment')
  const rate = validateTerms(input)
  if (
    !Number.isSafeInteger(input.installmentCount) ||
    input.installmentCount < 1 ||
    input.installmentCount > 720
  ) {
    throw new Error('Instalment count must be between 1 and 720')
  }
  if (input.actualDates && input.actualDates.length !== input.installmentCount) {
    throw new Error('Provide one actual date or null per scheduled instalment')
  }
  const warnings: string[] = []
  const events: CashEvent[] = []
  for (let index = 0; index < input.installmentCount; index += 1) {
    const due = monthlyDate(input.opened, index)
    if (due >= input.matures) {
      throw new Error(`Instalment ${index + 1} is scheduled on or after maturity`)
    }
    const actual = input.actualDates ? input.actualDates[index] : due
    if (actual === undefined) {
      throw new Error(`Instalment ${index + 1} needs an actual payment date or null`)
    }
    if (actual === null) {
      warnings.push(`Instalment ${index + 1} due ${due} was missed`)
      continue
    }
    if (!isIsoDate(actual) || actual < due || actual >= input.matures) {
      throw new Error(
        `Instalment ${index + 1} needs an actual payment date from its due date to before maturity`,
      )
    }
    if (actual > due)
      warnings.push(`Instalment ${index + 1} due ${due} was paid ${actual}`)
    events.push({
      date: actual,
      account: 'main',
      kind: 'contribution',
      deltaPaise: input.installmentPaise,
      label: `Instalment ${index + 1} (due ${due})`,
    })
    cumulativeCredits(input.installmentPaise, actual, input.matures, input, events)
  }
  if (!events.some((event) => event.kind === 'contribution')) {
    throw new Error(
      'At least one instalment must be paid to calculate a recurring deposit',
    )
  }
  events.sort(
    (left, right) =>
      left.date.localeCompare(right.date) ||
      (left.kind === 'contribution' ? -1 : 1) - (right.kind === 'contribution' ? -1 : 1),
  )
  return withYield(
    buildResult(
      'rd',
      input.opened,
      input.matures,
      [
        `Nominal annual bank rate: ${rate.toString()}%; ${input.rest} rest; ${input.dayCount} day-count.`,
        'Each paid instalment accrues from its actual payment date; credits are rounded to paise.',
        'Annualized yield uses actual dated instalments and the maturity value.',
      ],
      events,
      warnings,
    ),
  )
}
