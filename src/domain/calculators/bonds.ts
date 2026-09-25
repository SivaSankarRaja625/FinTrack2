import Decimal from 'decimal.js'
import { addMonths, addYears, differenceInCalendarDays, format, parseISO } from 'date-fns'

import { isIsoDate } from '../dates'
import { assertPaise } from '../money'
import type { ISODate, Paise } from '../types'
import { buildResult } from './result'
import { ratePercent } from './schedule'
import type { CashEvent, ScenarioResult } from './types'

export interface FloatingBondInput {
  subscribed: ISODate
  principalPaise: Paise
  nscAnnualPercent: string
  resetNscRates?: readonly { resetDate: ISODate; nscAnnualPercent: string }[]
}

const halfYearStart = (date: ISODate): ISODate =>
  `${date.slice(0, 4)}-${Number(date.slice(5, 7)) <= 6 ? '01' : '07'}-01`

const thirtyDayCount = (from: ISODate, to: ISODate): number => {
  const first = parseISO(from)
  const last = parseISO(to)
  return (
    (last.getFullYear() - first.getFullYear()) * 360 +
    (last.getMonth() - first.getMonth()) * 30 +
    Math.min(last.getDate(), 30) -
    Math.min(first.getDate(), 30)
  )
}

export function calculateFloatingSavingsBond(input: FloatingBondInput): ScenarioResult {
  if (!isIsoDate(input.subscribed)) {
    throw new Error('Enter a valid date of bond subscription')
  }
  if (input.subscribed < '2020-07-01') {
    throw new Error('Floating Rate Savings Bonds 2020 began on 1 July 2020')
  }
  assertPaise(input.principalPaise)
  if (input.principalPaise < 100_000 || input.principalPaise % 100_000 !== 0) {
    throw new Error('Bond face value must be at least ₹1,000, in multiples of ₹1,000')
  }
  const nscRate = (value: string): Decimal => {
    const rate = ratePercent(value, 'NSC benchmark rate')
    if (rate.lt(0) || rate.gt(100)) {
      throw new Error('Enter an NSC benchmark rate from 0% to 100%')
    }
    return rate
  }
  const baseNscRate = nscRate(input.nscAnnualPercent)
  const endDate: ISODate = format(addYears(parseISO(input.subscribed), 7), 'yyyy-MM-dd')
  const resets = new Map<ISODate, Decimal>()
  for (const entry of input.resetNscRates ?? []) {
    if (
      !isIsoDate(entry.resetDate) ||
      halfYearStart(entry.resetDate) !== entry.resetDate ||
      entry.resetDate < halfYearStart(input.subscribed) ||
      entry.resetDate < '2021-01-01' ||
      entry.resetDate >= endDate ||
      resets.has(entry.resetDate)
    ) {
      throw new Error('Enter each in-range bond reset once, on Jan 1 or Jul 1')
    }
    resets.set(entry.resetDate, nscRate(entry.nscAnnualPercent))
  }
  const events: CashEvent[] = [
    {
      date: input.subscribed,
      account: 'main',
      kind: 'contribution',
      deltaPaise: input.principalPaise,
      label: 'Floating bond subscription',
    },
  ]
  let from = input.subscribed
  while (from < endDate) {
    const start = halfYearStart(from)
    const next: ISODate = format(addMonths(parseISO(start), 6), 'yyyy-MM-dd')
    const to = next < endDate ? next : endDate
    const currentGuidelines = to >= '2026-04-02'
    const days = currentGuidelines
      ? thirtyDayCount(from, to)
      : differenceInCalendarDays(parseISO(to), parseISO(from))
    const halfYearDays = currentGuidelines
      ? 180
      : differenceInCalendarDays(parseISO(next), parseISO(start))
    const initialFixedCoupon = start === '2020-07-01'
    const couponRate = initialFixedCoupon
      ? new Decimal('7.15')
      : (resets.get(start) ?? baseNscRate).plus('0.35')
    const couponPaise = new Decimal(input.principalPaise)
      .mul(couponRate)
      .div(200)
      .mul(days)
      .div(halfYearDays)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
      .toNumber()
    assertPaise(couponPaise)
    if (couponPaise > 0) {
      events.push(
        {
          date: to,
          account: 'main',
          kind: 'interest',
          deltaPaise: couponPaise,
          label: initialFixedCoupon
            ? 'Initial fixed coupon (7.15%)'
            : 'NSC benchmark plus 0.35 percentage points',
        },
        {
          date: to,
          account: 'main',
          kind: 'withdrawal',
          deltaPaise: -couponPaise,
          label: 'Floating bond coupon received (not reinvested)',
        },
      )
    }
    from = to
  }
  return buildResult(
    'frsb',
    input.subscribed,
    endDate,
    [
      `Entered NSC annual benchmark ${input.nscAnnualPercent}% is held at future Jan/Jul resets except ${resets.size} entered override(s); coupon adds 0.35 percentage points.`,
      ...(input.subscribed < '2021-01-01'
        ? [
            'The first coupon paid on 1 January 2021 was fixed at 7.15%, before benchmark-linked resets began.',
          ]
        : []),
      'Coupon resets on Jan 1 and Jul 1 apply to the following half-year. Cash coupons are not reinvested.',
      'For coupon payments under the RBI guidelines effective 2 April 2026, broken periods use 30/360 (31st treated as 30th); confirm the receiving office’s exact month-end convention. Earlier broken periods use illustrative actual days / days in that half-year.',
      'End value shows principal due after seven years; calendar dates omit holiday shifts. No early redemption, taxes or TDS are modelled.',
    ],
    events,
  )
}
