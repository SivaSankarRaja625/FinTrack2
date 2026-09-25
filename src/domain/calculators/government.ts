import Decimal from 'decimal.js'
import {
  addMonths,
  addYears,
  differenceInCalendarDays,
  format,
  parseISO,
  startOfMonth,
  startOfQuarter,
} from 'date-fns'

import { isIsoDate } from '../dates'
import { assertPaise } from '../money'
import type { ISODate, Paise } from '../types'
import { buildResult } from './result'
import { monthlyDate, ratePercent } from './schedule'
import type { CashEvent, ScenarioResult } from './types'

export interface PpfInput {
  opened: ISODate
  installmentPaise: Paise
  cadence: 'monthly' | 'yearly'
  annualRatePercent: string
  quarterlyRates?: readonly { quarterStart: ISODate; annualPercent: string }[]
}

export interface ScssInput {
  opened: ISODate
  principalPaise: Paise
  contractedAnnualPercent: string
}

function nonNegativeRate(value: string): Decimal {
  const rate = ratePercent(value, 'Scheme annual rate')
  if (rate.lt(0) || rate.gt(100)) {
    throw new Error('Enter a scheme annual rate from 0% to 100%')
  }
  return rate
}

function asDate(date: Date): ISODate {
  return format(date, 'yyyy-MM-dd')
}

function fiscalYearEnd(date: ISODate): number {
  const year = Number(date.slice(0, 4))
  return Number(date.slice(5, 7)) >= 4 ? year + 1 : year
}

function quarterStart(date: ISODate): ISODate {
  return asDate(startOfQuarter(parseISO(date)))
}

function roundedPaise(value: Decimal): Paise {
  const result = value.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber()
  assertPaise(result)
  return result
}

export function calculatePpf(input: PpfInput): ScenarioResult {
  if (!isIsoDate(input.opened)) throw new Error('Enter a valid PPF opening date')
  if (input.opened < '2019-12-12') {
    throw new Error('This PPF rule pack applies to accounts opened from 12 December 2019')
  }
  const endDate: ISODate = `${fiscalYearEnd(input.opened) + 15}-03-31`
  if (input.cadence !== 'monthly' && input.cadence !== 'yearly') {
    throw new Error('Choose monthly or yearly PPF contributions')
  }
  assertPaise(input.installmentPaise)
  if (input.installmentPaise < 50_000 || input.installmentPaise % 5_000 !== 0) {
    throw new Error('The initial PPF deposit must be at least ₹500, in multiples of ₹50')
  }
  const baseRate = nonNegativeRate(input.annualRatePercent)
  const overrides = new Map<ISODate, Decimal>()
  for (const entry of input.quarterlyRates ?? []) {
    if (
      !isIsoDate(entry.quarterStart) ||
      quarterStart(entry.quarterStart) !== entry.quarterStart ||
      entry.quarterStart < quarterStart(input.opened) ||
      entry.quarterStart > endDate ||
      overrides.has(entry.quarterStart)
    ) {
      throw new Error('Enter each in-range PPF quarter once, starting Jan/Apr/Jul/Oct 1')
    }
    overrides.set(entry.quarterStart, nonNegativeRate(entry.annualPercent))
  }
  const contributions: CashEvent[] = []
  const totalsByYear = new Map<number, Paise>()
  for (let index = 0; ; index += 1) {
    const date = monthlyDate(input.opened, index * (input.cadence === 'yearly' ? 12 : 1))
    if (date > endDate) break
    const fy = fiscalYearEnd(date)
    const total = (totalsByYear.get(fy) ?? 0) + input.installmentPaise
    assertPaise(total)
    if (total > 15_000_000) {
      throw new Error('PPF contributions exceed the ₹1,50,000 financial-year cap')
    }
    totalsByYear.set(fy, total)
    contributions.push({
      date,
      account: 'main',
      kind: 'contribution',
      deltaPaise: input.installmentPaise,
      label: 'PPF deposit',
    })
  }
  let balance = 0
  let accrued = new Decimal(0)
  const events: CashEvent[] = []
  let month = asDate(startOfMonth(parseISO(input.opened)))
  let contributionIndex = 0
  while (month <= endDate) {
    const monthStart = month.slice(0, 7)
    const monthDeposits: CashEvent[] = []
    while (contributions[contributionIndex]?.date.startsWith(monthStart)) {
      monthDeposits.push(contributions[contributionIndex]!)
      contributionIndex += 1
    }
    const early = monthDeposits
      .filter((deposit) => Number(deposit.date.slice(8, 10)) <= 5)
      .reduce((sum, deposit) => sum + deposit.deltaPaise, 0)
    assertPaise(early)
    const eligibleBalance = balance + early
    assertPaise(eligibleBalance)
    const annualRate = overrides.get(quarterStart(month)) ?? baseRate
    accrued = accrued.plus(new Decimal(eligibleBalance).mul(annualRate).div(1200))
    for (const deposit of monthDeposits) {
      balance += deposit.deltaPaise
      assertPaise(balance)
      events.push(deposit)
    }
    if (month.endsWith('-03-01')) {
      const interestPaise = roundedPaise(accrued)
      if (interestPaise > 0) {
        balance += interestPaise
        assertPaise(balance)
        events.push({
          date: `${month.slice(0, 4)}-03-31`,
          account: 'main',
          kind: 'interest',
          deltaPaise: interestPaise,
          label: 'PPF interest credited at financial-year end',
        })
      }
      accrued = new Decimal(0)
    }
    month = asDate(addMonths(parseISO(month), 1))
  }
  return buildResult(
    'ppf',
    input.opened,
    endDate,
    [
      'New PPF account; the entered deposit repeats until maturity (15 financial years after the opening year).',
      `Entered ${input.annualRatePercent}% annual rate held for all future quarters except ${overrides.size} entered override(s); future rates are unknown.`,
      'Interest uses the lowest balance from close of the 5th through month-end and is credited on March 31; annual accrual is rounded once to paise.',
      '₹500 minimum initial deposit; deposits in multiples of ₹50 and at most ₹1,50,000 each financial year. Other PPF accounts are not checked.',
      'No withdrawals, loans, defaults, extension, taxes or bank-specific rounding are modelled.',
    ],
    events,
  )
}

export function calculateScss(input: ScssInput): ScenarioResult {
  if (!isIsoDate(input.opened)) throw new Error('Enter a valid SCSS opening date')
  if (input.opened < '2019-12-12') {
    throw new Error(
      'This SCSS rule pack applies to accounts opened from 12 December 2019',
    )
  }
  assertPaise(input.principalPaise)
  if (input.principalPaise < 100_000 || input.principalPaise % 100_000 !== 0) {
    throw new Error(
      'SCSS requires a single deposit of at least ₹1,000 in multiples of ₹1,000',
    )
  }
  const capPaise = input.opened < '2023-04-01' ? 150_000_000 : 300_000_000
  if (input.principalPaise > capPaise) {
    throw new Error(
      `SCSS deposit exceeds the ₹${input.opened < '2023-04-01' ? '15,00,000' : '30,00,000'} opening-date limit`,
    )
  }
  const rate = nonNegativeRate(input.contractedAnnualPercent)
  const endDate = asDate(addYears(parseISO(input.opened), 5))
  const events: CashEvent[] = [
    {
      date: input.opened,
      account: 'main',
      kind: 'contribution',
      deltaPaise: input.principalPaise,
      label: 'SCSS single deposit',
    },
  ]
  let from = input.opened
  while (from < endDate) {
    const start = quarterStart(from)
    const next = asDate(addMonths(parseISO(start), 3))
    const to = next < endDate ? next : endDate
    const days = differenceInCalendarDays(parseISO(to), parseISO(from))
    const quarterDays = differenceInCalendarDays(parseISO(next), parseISO(start))
    const payoutPaise = new Decimal(input.principalPaise)
      .mul(rate)
      .div(400)
      .mul(days)
      .div(quarterDays)
      .div(100)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
      .mul(100)
      .toNumber()
    assertPaise(payoutPaise)
    if (payoutPaise > 0) {
      events.push(
        {
          date: to,
          account: 'main',
          kind: 'interest',
          deltaPaise: payoutPaise,
          label: 'SCSS interest payable (not reinvested)',
        },
        {
          date: to,
          account: 'main',
          kind: 'withdrawal',
          deltaPaise: -payoutPaise,
          label: 'SCSS cash interest received',
        },
      )
    }
    from = to
  }
  return buildResult(
    'scss',
    input.opened,
    endDate,
    [
      `SCSS rate ${input.contractedAnnualPercent}% is entered for the opening-date contract and held for five years.`,
      'Quarterly cash interest is not reinvested; broken periods use days in period / days in quarter, with each payout rounded to whole rupees.',
      'Calendar quarter start is shown as the nominal payout date; the actual first working day may differ. Final broken-period interest is illustrated at maturity.',
      'End value is principal available at maturity, not an extra payout. No early closure, extensions, taxes or eligibility checks are modelled.',
      `₹1,000 deposit multiples; ₹${input.opened < '2023-04-01' ? '15,00,000' : '30,00,000'} opening-date limit. Other SCSS accounts are not checked.`,
    ],
    events,
  )
}
