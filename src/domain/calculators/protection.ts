import Decimal from 'decimal.js'

import { assertPaise } from '../money'
import type { Paise } from '../types'
import { ratePercent } from './schedule'

export interface CoverGapInput {
  annualExpensePaise: Paise
  dependencyYears: number
  inflationPercent: string
  investmentReturnPercent: string
  outstandingDebtPaise: Paise
  goalCostPaise: Paise
  liquidAssetsPaise: Paise
  existingLifeCoverPaise: Paise
}

export interface CoverGapResult {
  expensePresentValuePaise: Paise
  grossNeedPaise: Paise
  availableResourcesPaise: Paise
  coverGapPaise: Paise
}

export function calculateCoverGap(input: CoverGapInput): CoverGapResult {
  if (
    !Number.isSafeInteger(input.dependencyYears) ||
    input.dependencyYears < 1 ||
    input.dependencyYears > 60
  ) {
    throw new Error('Enter a dependency period of 1 to 60 years')
  }
  for (const amount of [
    input.annualExpensePaise,
    input.outstandingDebtPaise,
    input.goalCostPaise,
    input.liquidAssetsPaise,
    input.existingLifeCoverPaise,
  ]) {
    assertPaise(amount)
    if (amount < 0) throw new Error('Protection inputs must be non-negative')
  }
  if (input.annualExpensePaise === 0) {
    throw new Error('Enter positive annual dependent expenses')
  }
  const inflation = ratePercent(input.inflationPercent, 'Inflation rate').div(100).plus(1)
  const discount = ratePercent(input.investmentReturnPercent, 'Investment return')
    .div(100)
    .plus(1)
  if (inflation.lte(0) || discount.lte(0)) {
    throw new Error('Inflation and investment return must exceed -100%')
  }
  let annualExpense = new Decimal(input.annualExpensePaise)
  let presentValue = new Decimal(0)
  for (let year = 1; year <= input.dependencyYears; year += 1) {
    annualExpense = annualExpense.mul(inflation)
    presentValue = presentValue.plus(annualExpense.div(discount.pow(year)))
  }
  const rounded = (value: Decimal) => {
    const paise = value.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber()
    assertPaise(paise)
    return paise
  }
  const expensePresentValuePaise = rounded(presentValue)
  const grossNeedPaise = rounded(
    presentValue.plus(input.outstandingDebtPaise).plus(input.goalCostPaise),
  )
  const availableResourcesPaise = rounded(
    new Decimal(input.liquidAssetsPaise).plus(input.existingLifeCoverPaise),
  )
  return {
    expensePresentValuePaise,
    grossNeedPaise,
    availableResourcesPaise,
    coverGapPaise: Math.max(0, grossNeedPaise - availableResourcesPaise),
  }
}
