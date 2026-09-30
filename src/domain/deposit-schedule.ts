import { addFrequency, isIsoDate } from './dates'
import { assertPaise } from './money'
import type { Asset } from './types'

export function nextDepositInterestDate(asset: Asset): string | null {
  const terms = asset.deposit
  if (
    !terms ||
    terms.status !== 'active' ||
    terms.interestFrequency === 'at-maturity' ||
    !terms.nextInterestDate
  )
    return null
  let date = terms.nextInterestDate
  while (date <= terms.maturityDate && terms.paidInterestDates.includes(date))
    date = addFrequency(date, terms.interestFrequency)
  return date <= terms.maturityDate ? date : null
}

export function validateDepositTerms(asset: Asset) {
  const terms = asset.deposit
  if (!terms) return
  for (const value of [
    terms.principalPaise,
    terms.maturityAmountPaise,
    terms.interestPaise,
  ])
    assertPaise(value)
  if (
    terms.principalPaise <= 0 ||
    terms.maturityAmountPaise < 0 ||
    terms.interestPaise < 0
  )
    throw new Error('Enter positive principal and nonnegative confirmed payout amounts')
  if (!terms.cashAccountId)
    throw new Error('Choose a receiving account for deposit payouts')
  if (terms.status === 'active' && asset.valuePaise <= 0)
    throw new Error('An active deposit needs a positive current carrying value')
  if (asset.type !== 'fixed-deposit' || asset.kind !== 'asset')
    throw new Error('Deposit terms require a fixed-deposit asset')
  if (
    !isIsoDate(terms.maturityDate) ||
    (terms.nextInterestDate && !isIsoDate(terms.nextInterestDate))
  )
    throw new Error('Choose valid deposit dates')
  if (terms.interestFrequency === 'at-maturity') {
    if (terms.nextInterestDate !== null || terms.interestPaise !== 0)
      throw new Error('At-maturity interest belongs in the confirmed maturity proceeds')
  } else if (
    !terms.nextInterestDate ||
    terms.nextInterestDate > terms.maturityDate ||
    terms.interestPaise <= 0
  ) {
    throw new Error(
      'Enter a positive periodic payout and a first interest date on or before maturity',
    )
  } else if (terms.maturityAmountPaise !== terms.principalPaise) {
    throw new Error(
      'For periodic-interest deposits, maturity proceeds must be principal only; interest payouts are scheduled separately',
    )
  }
}
