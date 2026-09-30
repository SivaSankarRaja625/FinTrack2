import { differenceInCalendarDays, parseISO } from 'date-fns'

import type { InsurancePolicy, Loan, RecurringRule, Transaction } from './types'
import { addFrequency } from './dates'

function sameSchedule(
  left: string,
  right: string,
  frequency: RecurringRule['frequency'],
) {
  let date = left < right ? left : right
  const target = left < right ? right : left
  while (date < target) date = addFrequency(date, frequency)
  return date === target
}

export function forecastReviews(
  rules: readonly RecurringRule[],
  transactions: readonly Transaction[],
  loans: readonly Loan[] = [],
  policies: readonly InsurancePolicy[] = [],
) {
  return rules
    .filter((rule) => rule.active && !rule.obligation)
    .flatMap((rule) => {
      const reviews: {
        ruleId: string
        kind: 'obligation' | 'posted'
        message: string
      }[] = []
      if (
        !rule.independentObligation &&
        rule.kind === 'expense' &&
        (loans.some(
          (loan) =>
            loan.active &&
            rule.frequency === 'monthly' &&
            loan.emiPaise === rule.amountPaise &&
            sameSchedule(loan.nextPaymentDate, rule.nextDate, rule.frequency),
        ) ||
          policies.some(
            (policy) =>
              policy.active &&
              policy.premiumPaise === rule.amountPaise &&
              sameSchedule(policy.nextPremiumDate, rule.nextDate, rule.frequency) &&
              policy.premiumFrequency === rule.frequency,
          ))
      )
        reviews.push({
          ruleId: rule.id,
          kind: 'obligation',
          message: `${rule.name} may duplicate a recorded loan or premium. Edit it to link that source or confirm it is separate.`,
        })
      if (
        rule.unmatchedConfirmedForDate !== rule.nextDate &&
        transactions.some(
          (transaction) =>
            !transaction.financialEventId &&
            transaction.accountId === rule.accountId &&
            transaction.kind === rule.kind &&
            transaction.amountPaise === rule.amountPaise &&
            (rule.kind !== 'transfer' ||
              transaction.destinationAccountId === rule.destinationAccountId) &&
            Math.abs(
              differenceInCalendarDays(
                parseISO(transaction.date),
                parseISO(rule.nextDate),
              ),
            ) <= 7,
        )
      )
        reviews.push({
          ruleId: rule.id,
          kind: 'posted',
          message: `${rule.name} may already be recorded in Activity. Match its occurrence or confirm it is still unpaid.`,
        })
      return reviews
    })
}
