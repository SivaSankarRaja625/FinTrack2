import Decimal from 'decimal.js'
import {
  addMonths,
  addYears,
  differenceInCalendarDays,
  format,
  getDaysInMonth,
  parseISO,
  startOfMonth,
} from 'date-fns'

import { isIsoDate } from '../dates'
import type { ISODate } from '../types'
import type { ReturnPath } from './types'

export function monthlyDate(anchor: ISODate, index: number): ISODate {
  if (!isIsoDate(anchor) || !Number.isSafeInteger(index) || index < 0) {
    throw new Error('Enter a valid start date and month index')
  }
  return format(addMonths(parseISO(anchor), index), 'yyyy-MM-dd')
}

export function validateHorizon(start: ISODate, end: ISODate): void {
  if (
    !isIsoDate(start) ||
    !isIsoDate(end) ||
    start >= end ||
    end > format(addYears(parseISO(start), 60), 'yyyy-MM-dd')
  ) {
    throw new Error('Choose a valid end date within 60 years')
  }
}

export function ratePercent(value: string, name = 'Assumed rate'): Decimal {
  let rate: Decimal
  try {
    rate = new Decimal(value)
  } catch {
    throw new Error(`${name} must be a finite percentage`)
  }
  if (!rate.isFinite() || rate.lt(-100)) {
    throw new Error(`${name} must be finite and at least -100%`)
  }
  return rate
}

export function marketGrowth(path: ReturnPath, start: ISODate, end: ISODate): Decimal {
  if (!isIsoDate(start) || !isIsoDate(end) || start > end) {
    throw new Error('Choose valid return-path dates')
  }
  if (start === end) return new Decimal(1)
  if (path.kind === 'constant') {
    const rate = ratePercent(path.annualPercent)
    return rate
      .div(100)
      .plus(1)
      .pow(new Decimal(differenceInCalendarDays(parseISO(end), parseISO(start))).div(365))
  }
  const rates = new Map<string, Decimal>()
  for (const entry of path.months) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/u.test(entry.month) || rates.has(entry.month)) {
      throw new Error(`Invalid or duplicate return month: ${entry.month}`)
    }
    rates.set(entry.month, ratePercent(entry.percent, `Return for ${entry.month}`))
  }
  let cursor = start
  let factor = new Decimal(1)
  while (cursor < end) {
    const month = cursor.slice(0, 7)
    const rate = rates.get(month)
    if (!rate) throw new Error(`Enter the assumed return for ${month}`)
    const firstDay = startOfMonth(parseISO(cursor))
    const nextMonth = format(addMonths(firstDay, 1), 'yyyy-MM-dd')
    const until = end < nextMonth ? end : nextMonth
    const days = differenceInCalendarDays(parseISO(until), parseISO(cursor))
    factor = factor.mul(
      rate
        .div(100)
        .plus(1)
        .pow(new Decimal(days).div(getDaysInMonth(firstDay))),
    )
    cursor = until
  }
  return factor
}
