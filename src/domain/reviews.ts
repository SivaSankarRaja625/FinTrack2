import { differenceInCalendarDays, format, parseISO } from 'date-fns'

import { formatMoney, multiplyMoney } from './money'
import type { AppSettings, FinanceAlert, FinanceData } from './types'

export function evaluateProtectionReviews(
  data: FinanceData,
  settings: AppSettings,
  now: Date,
): FinanceAlert[] {
  const alerts: FinanceAlert[] = []
  const reviewDates = settings.reviewDates
  const today = format(now, 'yyyy-MM-dd')
  const dueReview = (
    kind: keyof NonNullable<AppSettings['reviewDates']>,
    applicable: boolean,
    title: string,
    detail: string,
    firstRecordedAt: string | undefined,
    missingDetails = false,
  ) => {
    if (!applicable) return
    const last = reviewDates?.[kind]
    if (last && differenceInCalendarDays(now, parseISO(last)) < 365) return
    if (
      !last &&
      !missingDetails &&
      firstRecordedAt &&
      differenceInCalendarDays(now, parseISO(firstRecordedAt)) < 365
    ) {
      return
    }
    alerts.push({
      key: `review:${kind}:${last ?? 'never'}`,
      ruleType: 'financial-review',
      title,
      detail,
      severity: 'info',
      dueDate: null,
      route: '/resilience',
      evidence: last
        ? `Last recorded review: ${last}; interval: 365 days.`
        : 'No completed review date is recorded.',
    })
  }

  const policies = data.insurancePolicies.filter((policy) => policy.active)
  const oldestPolicy = [...policies].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  )[0]
  const missingNominee = policies.some((policy) => !policy.nomineeName)
  dueReview(
    'nominees',
    policies.length > 0,
    'Review policy nominees and insured people',
    missingNominee
      ? 'At least one active policy has no recorded nominee. Check policyholder, insured people and nominee details with the insurer.'
      : 'Confirm nominees and insured people directly with each insurer.',
    oldestPolicy?.createdAt,
    missingNominee,
  )
  dueReview(
    'documents',
    policies.length > 0,
    'Review claim documents and contacts',
    'Check claim contacts, document copies, exclusions and whether a verified complete backup is accessible off-device.',
    oldestPolicy?.createdAt,
  )
  dueReview(
    'retirement',
    data.profiles.some((profile) => profile.monthlyIncomePaise > 0) ||
      data.investments.some((holding) => ['epf', 'ppf', 'nps'].includes(holding.type)),
    'Review retirement assumptions',
    'Review contribution amounts, time horizon, dependents and manually entered rates; no return is predicted.',
    data.profiles[0]?.createdAt ?? data.investments[0]?.createdAt,
  )
  dueReview(
    'tax',
    data.profiles.some((profile) => profile.monthlyIncomePaise > 0),
    'Review tax and financial documents',
    'Check tax proofs and policy, debt and investment records with your adviser; FinTrack does not file taxes.',
    data.profiles[0]?.createdAt,
  )

  const jobChangeDate = data.profiles[0]?.jobChangeReviewDate
  if (jobChangeDate && differenceInCalendarDays(parseISO(jobChangeDate), now) <= 30) {
    alerts.push({
      key: `job-change:${jobChangeDate}`,
      ruleType: 'financial-review',
      title: 'Review cover for a job change',
      detail:
        'Employer health or life benefits may end or change. Confirm effective dates and continuation with both employers and insurers.',
      severity: 'warning',
      dueDate: jobChangeDate,
      route: '/resilience',
      evidence: `User-entered job-change review date: ${jobChangeDate}.`,
    })
  }

  const debtThreshold = settings.highCostDebtBps
  if (debtThreshold != null) {
    for (const debt of data.loans.filter(
      (loan) => loan.active && loan.outstandingPaise > 0,
    )) {
      const currentRateBps =
        [...debt.rateChanges]
          .filter((change) => change.effectiveDate <= today)
          .sort((left, right) => left.effectiveDate.localeCompare(right.effectiveDate))
          .at(-1)?.annualInterestRateBps ?? debt.annualInterestRateBps
      if (currentRateBps < debtThreshold) continue
      alerts.push({
        key: `debt-rate:${debt.id}:${settings.highCostDebtBps}`,
        ruleType: 'high-cost-debt',
        title: `${debt.name} rate meets your review threshold`,
        detail:
          'Check the actual lender rate, fees and repayment terms before considering changes.',
        severity: 'warning',
        dueDate: null,
        route: '/loans',
        evidence: `Recorded rate ${currentRateBps / 100}%; chosen threshold ${debtThreshold / 100}%; outstanding ${formatMoney(debt.outstandingPaise)}.`,
      })
    }
  }

  if (settings.concentrationWarningPercent != null) {
    const holdings = data.investments.filter(
      (holding) => holding.includeInNetWorth && Number(holding.units) > 0,
    )
    if (
      holdings.length >= 2 &&
      holdings.every(
        (holding) =>
          differenceInCalendarDays(now, parseISO(holding.priceDate)) <= 30 &&
          holding.priceDate <= today,
      )
    ) {
      const values = holdings.map((holding) => ({
        holding,
        paise: multiplyMoney(holding.currentPricePaise, holding.units),
      }))
      const total = values.reduce((sum, value) => sum + value.paise, 0)
      const biggest = values.sort((left, right) => right.paise - left.paise)[0]
      if (biggest && total > 0) {
        const share = (biggest.paise / total) * 100
        if (share >= settings.concentrationWarningPercent) {
          alerts.push({
            key: `concentration:${biggest.holding.id}:${settings.concentrationWarningPercent}:${today.slice(0, 7)}`,
            ruleType: 'investment-concentration',
            title: 'Review concentration in one holding',
            detail: `${biggest.holding.name} is ${share.toFixed(0)}% of recorded, included holdings.`,
            severity: 'info',
            dueDate: null,
            route: '/investments',
            evidence: `Manual values only: ${formatMoney(biggest.paise)} of ${formatMoney(total)}; threshold ${settings.concentrationWarningPercent}%. Stale prices prevent this comparison.`,
          })
        }
      }
    }
  }
  return alerts
}
