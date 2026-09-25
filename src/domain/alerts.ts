import { addDays, differenceInCalendarDays, format, parseISO, subMonths } from 'date-fns'

import {
  calculateAccountBalances,
  calculateBudgetStatuses,
  calculateCashFlowForecast,
  calculateNetWorth,
  requiredMonthlyForGoal,
} from './calculations'
import { currentMonthRange, daysUntil, isDateInRange, todayIso } from './dates'
import { formatMoney, percentageOf } from './money'
import type {
  AppSettings,
  FinanceAlert,
  FinanceData,
  Transaction,
  UserProfile,
} from './types'

function dueSeverity(days: number): FinanceAlert['severity'] {
  return days < 0 ? 'critical' : days <= 1 ? 'warning' : 'info'
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  const current = sorted[middle] ?? 0
  if (sorted.length % 2 === 1) return current
  return ((sorted[middle - 1] ?? 0) + current) / 2
}

function recentExpenseMedian(
  transactions: readonly Transaction[],
  categoryId: string | null,
  now: Date,
): number {
  const lowerBound = subMonths(now, 3).toISOString().slice(0, 10)
  return median(
    transactions
      .filter(
        (transaction) =>
          transaction.kind === 'expense' &&
          transaction.date >= lowerBound &&
          transaction.categoryId === categoryId,
      )
      .map((transaction) => transaction.amountPaise),
  )
}

export function evaluateAlerts(
  data: FinanceData,
  settings: AppSettings,
  profile: UserProfile | null,
  now = new Date(),
): FinanceAlert[] {
  const alerts: FinanceAlert[] = []
  const today = todayIso(now)
  const monthRange = currentMonthRange(now)
  const accountBalances = calculateAccountBalances(data.accounts, data.transactions)

  for (const status of calculateBudgetStatuses(
    data.budgets,
    data.transactions,
    monthRange,
  )) {
    if (status.usedPercent < settings.budgetWarningPercent) continue
    const exceeded = status.remainingPaise < 0
    alerts.push({
      key: `budget:${status.budget.id}:${monthRange.start}`,
      ruleType: 'budget',
      title: exceeded
        ? `${status.budget.name} budget exceeded`
        : `${status.budget.name} budget is nearly used`,
      detail: exceeded
        ? `${formatMoney(Math.abs(status.remainingPaise))} over the monthly limit.`
        : `${status.usedPercent.toFixed(0)}% of the monthly limit is used.`,
      severity: exceeded ? 'critical' : 'warning',
      dueDate: monthRange.end,
      route: '/plan',
      evidence: `${formatMoney(status.spentPaise)} spent of ${formatMoney(status.budget.monthlyLimitPaise)}.`,
    })
  }

  for (const loan of data.loans.filter((item) => item.active)) {
    const days = daysUntil(loan.nextPaymentDate, now)
    if (days <= settings.notificationLeadDays) {
      alerts.push({
        key: `loan:${loan.id}:${loan.nextPaymentDate}`,
        ruleType: 'loan-due',
        title:
          days < 0 ? `${loan.name} payment is overdue` : `${loan.name} EMI is due soon`,
        detail:
          days < 0
            ? `The scheduled date was ${loan.nextPaymentDate}.`
            : `${formatMoney(loan.emiPaise)} is due in ${days} day${days === 1 ? '' : 's'}.`,
        severity: dueSeverity(days),
        dueDate: loan.nextPaymentDate,
        route: '/loans',
        evidence: `Outstanding balance: ${formatMoney(loan.outstandingPaise)}.`,
      })
    }

    const latestPayment = [...loan.payments].sort((left, right) =>
      right.date.localeCompare(left.date),
    )[0]
    if (latestPayment) {
      const components =
        latestPayment.principalPaise +
        latestPayment.interestPaise +
        latestPayment.prepaymentPaise
      if (components !== latestPayment.amountPaise) {
        alerts.push({
          key: `loan-payment-mismatch:${loan.id}:${latestPayment.id}`,
          ruleType: 'loan-payment-mismatch',
          title: `${loan.name} payment needs reconciliation`,
          detail:
            'The recorded payment does not equal its principal, interest, and prepayment components.',
          severity: 'warning',
          dueDate: latestPayment.date,
          route: '/loans',
          evidence: `${formatMoney(latestPayment.amountPaise)} paid; components total ${formatMoney(components)}.`,
        })
      }
    }
  }

  for (const policy of data.insurancePolicies.filter((item) => item.active)) {
    const days = daysUntil(policy.nextPremiumDate, now)
    if (days <= settings.notificationLeadDays) {
      alerts.push({
        key: `insurance:${policy.id}:${policy.nextPremiumDate}`,
        ruleType: 'insurance-due',
        title:
          days < 0
            ? `${policy.policyName} premium is overdue`
            : `${policy.policyName} premium is due soon`,
        detail:
          days < 0
            ? `The scheduled date was ${policy.nextPremiumDate}.`
            : `${formatMoney(policy.premiumPaise)} is due in ${days} day${days === 1 ? '' : 's'}.`,
        severity: dueSeverity(days),
        dueDate: policy.nextPremiumDate,
        route: '/insurance',
        evidence: `${policy.insurer} · Policy ending ${policy.policyNumber.slice(-4) || 'not set'}.`,
      })
    }

    for (const [kind, date] of [
      ['renewal', policy.renewalDate],
      ['maturity', policy.maturityDate],
    ] as const) {
      if (!date) continue
      const eventDays = daysUntil(date, now)
      if (eventDays > settings.notificationLeadDays) continue
      alerts.push({
        key: `insurance-${kind}:${policy.id}:${date}`,
        ruleType: 'insurance-due',
        title: `${policy.policyName} ${kind} ${eventDays < 0 ? 'date passed' : 'is approaching'}`,
        detail:
          eventDays < 0
            ? `The recorded ${kind} date was ${date}.`
            : `${kind.charAt(0).toUpperCase() + kind.slice(1)} is in ${eventDays} day${eventDays === 1 ? '' : 's'}.`,
        severity: dueSeverity(eventDays),
        dueDate: date,
        route: '/insurance',
        evidence: `${policy.insurer} · ${kind} date ${date}.`,
      })
    }
  }

  for (const rule of data.recurringRules.filter((item) => item.active)) {
    const days = daysUntil(rule.nextDate, now)
    if (days > Math.max(rule.reminderDays, settings.notificationLeadDays)) continue
    alerts.push({
      key: `recurring:${rule.id}:${rule.nextDate}`,
      ruleType: 'recurring-due',
      title: `${rule.name} ${days < 0 ? 'is overdue' : 'is due soon'}`,
      detail:
        days < 0
          ? `The expected date was ${rule.nextDate}.`
          : `${formatMoney(rule.amountPaise)} is expected in ${days} day${days === 1 ? '' : 's'}.`,
      severity: dueSeverity(days),
      dueDate: rule.nextDate,
      route: '/plan',
      evidence: `${rule.frequency.replace('-', ' ')} ${rule.kind} rule.`,
    })
  }

  const forecast = calculateCashFlowForecast({
    accounts: data.accounts,
    transactions: data.transactions,
    recurringRules: data.recurringRules,
    startDate: today,
    endDate: format(addDays(now, 30), 'yyyy-MM-dd'),
  })
  const lowPoint = forecast.events.reduce<(typeof forecast.events)[number] | null>(
    (lowest, event) =>
      !lowest || event.projectedBalancePaise < lowest.projectedBalancePaise
        ? event
        : lowest,
    null,
  )
  if (lowPoint && lowPoint.projectedBalancePaise < settings.cashFlowFloorPaise) {
    alerts.push({
      key: `cash-flow-risk:${lowPoint.id}:${settings.cashFlowFloorPaise}`,
      ruleType: 'cash-flow-risk',
      title: 'Projected liquid balance falls below your floor',
      detail: `${formatMoney(lowPoint.projectedBalancePaise)} is projected after ${lowPoint.name}.`,
      severity: lowPoint.projectedBalancePaise < 0 ? 'critical' : 'warning',
      dueDate: lowPoint.date,
      route: '/plan',
      evidence: `Configured floor: ${formatMoney(settings.cashFlowFloorPaise)}; 30-day recurring forecast.`,
    })
  }

  for (const batch of data.importBatches.filter(
    (item) => item.duplicateCount > 0 && item.rolledBackAt === null,
  )) {
    alerts.push({
      key: `import-duplicates:${batch.id}`,
      ruleType: 'import-duplicates',
      title: 'Imported rows were flagged as possible duplicates',
      detail: `${batch.duplicateCount} row${batch.duplicateCount === 1 ? '' : 's'} in ${batch.filename} matched existing transaction fingerprints.`,
      severity: 'info',
      dueDate: null,
      route: '/transactions',
      evidence: `Imported ${batch.rowCount} rows on ${batch.importedAt.slice(0, 10)}.`,
    })
  }

  for (const holding of data.investments) {
    const staleDays = differenceInCalendarDays(now, parseISO(holding.priceDate))
    if (staleDays <= 30) continue
    alerts.push({
      key: `investment-stale:${holding.id}:${holding.priceDate}`,
      ruleType: 'stale-investment',
      title: `${holding.name} value is stale`,
      detail: `The last manual price is ${staleDays} days old.`,
      severity: staleDays > 90 ? 'warning' : 'info',
      dueDate: null,
      route: '/investments',
      evidence: `Price date: ${holding.priceDate}.`,
    })
  }

  for (const goal of data.goals.filter((item) => !item.archived)) {
    const currentPaise = goal.linkedAccountId
      ? Math.max(0, accountBalances.get(goal.linkedAccountId) ?? 0)
      : goal.currentPaise
    const required = requiredMonthlyForGoal({ ...goal, currentPaise }, now)
    if (required <= goal.plannedMonthlyPaise) continue
    alerts.push({
      key: `goal:${goal.id}:${today.slice(0, 7)}`,
      ruleType: 'goal-contribution',
      title: `${goal.name} needs a higher contribution`,
      detail: `${formatMoney(required)} per month is required at the current balance.`,
      severity: goal.priority === 'high' ? 'warning' : 'info',
      dueDate: goal.targetDate,
      route: '/goals',
      evidence: `Planned: ${formatMoney(goal.plannedMonthlyPaise)} per month; target: ${formatMoney(goal.targetPaise)}.`,
    })
  }

  if (profile) {
    const liquidPaise = data.accounts
      .filter(
        (account) =>
          !account.archived && ['cash', 'savings', 'current'].includes(account.type),
      )
      .reduce(
        (sum, account) => sum + Math.max(0, accountBalances.get(account.id) ?? 0),
        0,
      )
    const requiredFund = profile.essentialMonthlyPaise * profile.emergencyFundMonths
    if (requiredFund > 0 && liquidPaise < requiredFund) {
      alerts.push({
        key: `emergency-fund:${today.slice(0, 7)}`,
        ruleType: 'emergency-fund',
        title: 'Emergency fund is below target',
        detail: `${percentageOf(liquidPaise, requiredFund).toFixed(0)}% of the configured reserve is available.`,
        severity: liquidPaise < profile.essentialMonthlyPaise ? 'warning' : 'info',
        dueDate: null,
        route: '/goals',
        evidence: `${formatMoney(liquidPaise)} available against ${formatMoney(requiredFund)} target.`,
      })
    }

    const afterPayday = now.getDate() > Math.min(28, profile.payDay + 3)
    const hasMonthlyIncome = data.transactions.some(
      (transaction) =>
        transaction.kind === 'income' && isDateInRange(transaction.date, monthRange),
    )
    if (afterPayday && !hasMonthlyIncome && profile.monthlyIncomePaise > 0) {
      alerts.push({
        key: `income-missing:${monthRange.start}`,
        ruleType: 'income-missing',
        title: 'Expected income is not recorded',
        detail: 'No income transaction appears after the configured payday grace period.',
        severity: 'warning',
        dueDate: null,
        route: '/transactions',
        evidence: `Payday is day ${profile.payDay}; expected monthly income is ${formatMoney(profile.monthlyIncomePaise)}.`,
      })
    }
  }

  for (const transaction of data.transactions) {
    if (transaction.kind !== 'expense' || !isDateInRange(transaction.date, monthRange)) {
      continue
    }
    const categoryMedian = recentExpenseMedian(
      data.transactions.filter((item) => item.id !== transaction.id),
      transaction.categoryId,
      now,
    )
    if (
      categoryMedian <= 0 ||
      transaction.amountPaise < categoryMedian * settings.largeExpenseMultiplier
    ) {
      continue
    }
    alerts.push({
      key: `large-expense:${transaction.id}`,
      ruleType: 'large-expense',
      title: 'Expense is above the recent category median',
      detail: `${transaction.description} was ${formatMoney(transaction.amountPaise)}.`,
      severity: 'info',
      dueDate: null,
      route: '/transactions',
      evidence: `Configured threshold: ${settings.largeExpenseMultiplier.toFixed(1)}× the recent median of ${formatMoney(categoryMedian)}.`,
    })
  }

  if (
    settings.lastManualBackupAt === null ||
    differenceInCalendarDays(now, new Date(settings.lastManualBackupAt)) > 30
  ) {
    alerts.push({
      key: `backup:${today.slice(0, 7)}`,
      ruleType: 'backup-due',
      title: 'Complete backup is due',
      detail:
        settings.lastManualBackupAt === null
          ? 'No complete encrypted backup is recorded on this device.'
          : 'The last complete encrypted backup is more than 30 days old.',
      severity: 'warning',
      dueDate: null,
      route: '/settings',
      evidence: 'Android system backup excludes policy documents.',
    })
  }

  const snapshots = [...data.netWorthSnapshots].sort((left, right) =>
    left.date.localeCompare(right.date),
  )
  const previous = snapshots.at(-1)
  if (previous) {
    const current = calculateNetWorth(data)
    const change = current.totalPaise - previous.totalPaise
    const magnitude = Math.abs(percentageOf(change, Math.abs(previous.totalPaise)))
    if (magnitude >= 10) {
      alerts.push({
        key: `net-worth-change:${previous.id}:${today}`,
        ruleType: 'net-worth-change',
        title: 'Net worth changed materially',
        detail: `${magnitude.toFixed(1)}% change since ${previous.date}.`,
        severity: 'info',
        dueDate: null,
        route: '/net-worth',
        evidence: `Change: ${formatMoney(change)}.`,
      })
    }
  }

  const snoozedKeys = new Set(
    settings.snoozedAlerts
      .filter((item) => new Date(item.until).getTime() > now.getTime())
      .map((item) => item.key),
  )
  return alerts
    .filter(
      (alert) =>
        !settings.dismissedAlertKeys.includes(alert.key) &&
        !settings.disabledAlertRules.includes(alert.ruleType) &&
        !snoozedKeys.has(alert.key),
    )
    .sort((left, right) => {
      const order = { critical: 0, warning: 1, info: 2 }
      return order[left.severity] - order[right.severity]
    })
}
