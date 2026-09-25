import Decimal from 'decimal.js'

import { calculateEmiPaise } from '../calculations'
import { isIsoDate } from '../dates'
import { assertPaise } from '../money'
import type { ISODate, Paise } from '../types'
import { monthlyDate, ratePercent } from './schedule'

export interface PrepaymentInput {
  balancePaise: Paise
  annualRatePercent: string
  remainingMonths: number
  firstPaymentDate: ISODate
  prepaymentMonth: number
  prepaymentPaise: Paise
  feePaise: Paise
  monthlyEmiPaise?: Paise
  strategy: 'reduce-tenure' | 'reduce-emi'
}

export interface RepaymentRow {
  date: ISODate
  interestPaise: Paise
  paymentPaise: Paise
  prepaymentPaise: Paise
  closingPaise: Paise
}

export interface RepaymentSchedule {
  rows: readonly RepaymentRow[]
  interestPaise: Paise
  monthlyEmiPaise: Paise
}

export interface PrepaymentResult {
  baseline: RepaymentSchedule
  prepaid: RepaymentSchedule
  monthsSaved: number
  netInterestSavedPaise: Paise
}

export function compareLoanPrepayment(input: PrepaymentInput): PrepaymentResult {
  if (
    !Number.isSafeInteger(input.remainingMonths) ||
    input.remainingMonths < 2 ||
    input.remainingMonths > 720 ||
    !Number.isSafeInteger(input.prepaymentMonth) ||
    input.prepaymentMonth < 1 ||
    input.prepaymentMonth >= input.remainingMonths ||
    !isIsoDate(input.firstPaymentDate)
  ) {
    throw new Error('Choose valid EMI dates and a prepayment before the final month')
  }
  for (const amount of [
    input.balancePaise,
    input.prepaymentPaise,
    input.feePaise,
    ...(input.monthlyEmiPaise === undefined ? [] : [input.monthlyEmiPaise]),
  ]) {
    assertPaise(amount)
  }
  if (
    input.balancePaise <= 0 ||
    input.prepaymentPaise <= 0 ||
    input.feePaise < 0 ||
    (input.monthlyEmiPaise !== undefined && input.monthlyEmiPaise <= 0)
  ) {
    throw new Error('Enter positive loan and prepayment amounts and a non-negative fee')
  }
  if (input.strategy !== 'reduce-tenure' && input.strategy !== 'reduce-emi') {
    throw new Error('Choose whether to reduce tenure or EMI')
  }
  const annualRate = ratePercent(input.annualRatePercent, 'Loan annual rate')
  const bps = annualRate.mul(100)
  if (annualRate.lt(0) || annualRate.gt(100) || !bps.isInteger()) {
    throw new Error('Enter a non-negative annual loan rate with at most two decimals')
  }
  const monthlyRate = annualRate.div(1200)
  const originalEmi =
    input.monthlyEmiPaise ??
    calculateEmiPaise(input.balancePaise, bps.toNumber(), input.remainingMonths)

  function amortize(prepay: boolean, payoffMonths: number): RepaymentSchedule {
    let balance = input.balancePaise
    let emi = originalEmi
    let totalInterest = 0
    const rows: RepaymentRow[] = []
    for (let month = 1; month <= payoffMonths && balance > 0; month += 1) {
      const date = monthlyDate(input.firstPaymentDate, month - 1)
      const interestPaise = new Decimal(balance)
        .mul(monthlyRate)
        .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
        .toNumber()
      assertPaise(interestPaise)
      if (emi <= interestPaise) {
        throw new Error('The entered EMI does not repay the monthly interest')
      }
      const due = balance + interestPaise
      assertPaise(due)
      let paymentPaise = Math.min(due, emi)
      if (month === payoffMonths && due - paymentPaise <= payoffMonths) {
        paymentPaise = due
      }
      balance = due - paymentPaise
      let prepaymentPaise = 0
      if (prepay && month === input.prepaymentMonth) {
        if (balance === 0 || input.prepaymentPaise > balance) {
          throw new Error('The prepayment exceeds the balance after this EMI')
        }
        prepaymentPaise = input.prepaymentPaise
        balance -= prepaymentPaise
        if (balance === 0) {
          emi = 0
        } else if (input.strategy === 'reduce-emi') {
          emi = calculateEmiPaise(balance, bps.toNumber(), payoffMonths - month)
        }
      }
      totalInterest += interestPaise
      assertPaise(totalInterest)
      rows.push({
        date,
        interestPaise,
        paymentPaise,
        prepaymentPaise,
        closingPaise: balance,
      })
    }
    if (balance > 0) throw new Error('The entered EMI cannot repay the loan in time')
    if (prepay && rows.length < input.prepaymentMonth) {
      throw new Error('The loan is repaid before the selected prepayment month')
    }
    return { rows, interestPaise: totalInterest, monthlyEmiPaise: emi }
  }

  const baseline = amortize(false, input.remainingMonths)
  if (input.prepaymentMonth >= baseline.rows.length) {
    throw new Error('The loan is repaid before the selected prepayment month')
  }
  const prepaid = amortize(true, baseline.rows.length)
  const netInterestSavedPaise =
    baseline.interestPaise - prepaid.interestPaise - input.feePaise
  assertPaise(netInterestSavedPaise)
  return {
    baseline,
    prepaid,
    monthsSaved: baseline.rows.length - prepaid.rows.length,
    netInterestSavedPaise,
  }
}
