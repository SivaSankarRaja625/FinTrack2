import {
  addDays,
  addMonths,
  addQuarters,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  endOfMonth,
  format,
  isAfter,
  isBefore,
  isValid,
  parseISO,
  startOfMonth,
} from 'date-fns'

import type { DateRange, ISODate, RecurrenceFrequency } from './types'

export function todayIso(now = new Date()): ISODate {
  return format(now, 'yyyy-MM-dd')
}

export function isIsoDate(value: string): value is ISODate {
  const parsed = parseISO(value)
  return /^\d{4}-\d{2}-\d{2}$/u.test(value) && isValid(parsed)
}

export function currentMonthRange(now = new Date()): DateRange {
  return {
    start: format(startOfMonth(now), 'yyyy-MM-dd'),
    end: format(endOfMonth(now), 'yyyy-MM-dd'),
  }
}

export function indianFinancialYearRange(date = new Date()): DateRange {
  const year = date.getMonth() < 3 ? date.getFullYear() - 1 : date.getFullYear()
  return {
    start: `${year}-04-01`,
    end: `${year + 1}-03-31`,
  }
}

export function isDateInRange(date: ISODate, range: DateRange): boolean {
  return date >= range.start && date <= range.end
}

export function daysUntil(date: ISODate, from = new Date()): number {
  return differenceInCalendarDays(parseISO(date), from)
}

export function monthsUntil(date: ISODate, from = new Date()): number {
  return Math.max(0, differenceInCalendarMonths(parseISO(date), from))
}

export function addFrequency(date: ISODate, frequency: RecurrenceFrequency): ISODate {
  const parsed = parseISO(date)
  const next = {
    weekly: () => addWeeks(parsed, 1),
    monthly: () => addMonths(parsed, 1),
    quarterly: () => addQuarters(parsed, 1),
    'half-yearly': () => addMonths(parsed, 6),
    yearly: () => addYears(parsed, 1),
  }[frequency]()
  return format(next, 'yyyy-MM-dd')
}

export function addIsoDays(date: ISODate, days: number): ISODate {
  return format(addDays(parseISO(date), days), 'yyyy-MM-dd')
}

export function compareIsoDates(left: ISODate, right: ISODate): number {
  const leftDate = parseISO(left)
  const rightDate = parseISO(right)
  if (isBefore(leftDate, rightDate)) return -1
  if (isAfter(leftDate, rightDate)) return 1
  return 0
}
