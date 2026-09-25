import Decimal from 'decimal.js'

import type { Paise } from './types'

const rupeeFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

const compactRupeeFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  notation: 'compact',
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
})

export function assertPaise(value: number): asserts value is Paise {
  if (!Number.isSafeInteger(value)) {
    throw new Error('Money must be represented as a safe integer number of paise')
  }
}

export function rupeesToPaise(value: string | number): Paise {
  const normalized =
    typeof value === 'number'
      ? value.toString()
      : value
          .trim()
          .replace(/[₹,\s]/gu, '')
          .replace(/^\((.+)\)$/u, '-$1')

  if (normalized === '') return 0
  const decimal = new Decimal(normalized)
  const paise = decimal.mul(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber()
  assertPaise(paise)
  return paise
}

export function paiseToRupees(paise: Paise): string {
  assertPaise(paise)
  return new Decimal(paise).div(100).toFixed(2)
}

export function formatMoney(paise: Paise, options?: { compact?: boolean }): string {
  assertPaise(paise)
  return (options?.compact ? compactRupeeFormatter : rupeeFormatter).format(paise / 100)
}

export function sumPaise(values: readonly Paise[]): Paise {
  const total = values.reduce((sum, value) => sum + value, 0)
  assertPaise(total)
  return total
}

export function percentageOf(part: Paise, whole: Paise): number {
  if (whole <= 0) return 0
  return new Decimal(part).div(whole).mul(100).toDecimalPlaces(1).toNumber()
}

export function multiplyMoney(paise: Paise, multiplier: string | number): Paise {
  const result = new Decimal(paise)
    .mul(multiplier)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber()
  assertPaise(result)
  return result
}
