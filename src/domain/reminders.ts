import { differenceInCalendarDays, parseISO, subDays } from 'date-fns'

import { formatMoney } from './money'
import type { AlertRuleType, AppSettings, FinanceData, InsurancePolicy } from './types'

export interface DatedReminder {
  key: string
  ruleType: AlertRuleType
  title: string
  date: string
  route: string
  leadDays: number[]
  detail: string
  evidence: string
  snoozedUntil?: string
}

export function policyReminders(
  policy: InsurancePolicy,
  settings: AppSettings,
): DatedReminder[] {
  if (!policy.active) return []
  const reminders: DatedReminder[] = []
  const premiumDue = policy.coverage?.premiumPaidForDate !== policy.nextPremiumDate
  const renewalDue =
    policy.renewalDate !== null &&
    policy.coverage?.renewalConfirmedForDate !== policy.renewalDate
  const renewalLead = policy.coverage?.reminderDays ?? [30, 7, 1, 0]
  const premiumLead = [settings.notificationLeadDays, 0]
  const combined =
    premiumDue && renewalDue && policy.nextPremiumDate === policy.renewalDate

  if (premiumDue || combined) {
    reminders.push({
      key: `insurance:${policy.id}:${policy.nextPremiumDate}`,
      ruleType: 'insurance-due',
      title: combined
        ? `${policy.policyName} premium and renewal need review`
        : `${policy.policyName} premium needs review`,
      date: policy.nextPremiumDate,
      route: '/insurance',
      leadDays: combined ? renewalLead : premiumLead,
      detail: combined
        ? 'Confirm the premium payment and policy renewal separately.'
        : 'Confirm the premium payment against the recorded due date.',
      evidence: `${policy.insurer} · recorded premium ${formatMoney(policy.premiumPaise)}.`,
    })
  }
  if (renewalDue && !combined && policy.renewalDate) {
    reminders.push({
      key: `insurance-renewal:${policy.id}:${policy.renewalDate}`,
      ruleType: 'insurance-due',
      title: `${policy.policyName} renewal needs confirmation`,
      date: policy.renewalDate,
      route: '/insurance',
      leadDays: renewalLead,
      detail:
        'Check the insurer record; paying a premium alone does not confirm renewal.',
      evidence: `${policy.insurer} · recorded renewal date ${policy.renewalDate}.`,
    })
  }
  if (policy.maturityDate) {
    reminders.push({
      key: `insurance-maturity:${policy.id}:${policy.maturityDate}`,
      ruleType: 'insurance-due',
      title: `${policy.policyName} maturity needs review`,
      date: policy.maturityDate,
      route: '/insurance',
      leadDays: renewalLead,
      detail: 'Review the recorded maturity date with the insurer.',
      evidence: `${policy.insurer} · recorded maturity date ${policy.maturityDate}.`,
    })
  }
  return reminders
}

export function cardReminders(data: FinanceData, settings: AppSettings): DatedReminder[] {
  return data.accounts.flatMap((account) => {
    if (account.archived || account.type !== 'credit-card') return []
    const statement = account.creditCardDetails?.statement
    if (!statement || statement.paidPaise >= statement.totalPaise) return []
    const remaining = statement.totalPaise - statement.paidPaise
    return [
      {
        key: `card-statement:${account.id}:${statement.dueDate}`,
        ruleType: 'card-statement-due' as const,
        title: `${account.name} statement needs review`,
        date: statement.dueDate,
        route: '/loans',
        leadDays: [settings.notificationLeadDays, 0],
        detail:
          statement.paidPaise >= statement.minimumPaise
            ? `${formatMoney(remaining)} remains after the recorded payment; interest may apply.`
            : `${formatMoney(remaining)} of the manually entered statement is unpaid.`,
        evidence: `Statement ${statement.date}; recorded paid ${formatMoney(statement.paidPaise)} of ${formatMoney(statement.totalPaise)}.`,
      },
    ]
  })
}

export function collectDatedReminders(
  data: FinanceData,
  settings: AppSettings,
): DatedReminder[] {
  const snoozed = new Map(settings.snoozedAlerts.map(({ key, until }) => [key, until]))
  return [
    ...data.loans
      .filter((loan) => loan.active)
      .map((loan) => ({
        key: `loan:${loan.id}:${loan.nextPaymentDate}`,
        ruleType: 'loan-due' as const,
        title: `${loan.name} EMI due`,
        date: loan.nextPaymentDate,
        route: '/loans',
        leadDays: [settings.notificationLeadDays, 0],
        detail: 'Review the scheduled payment.',
        evidence: `Recorded EMI date ${loan.nextPaymentDate}.`,
      })),
    ...data.insurancePolicies.flatMap((policy) => policyReminders(policy, settings)),
    ...data.recurringRules
      .filter((rule) => rule.active)
      .map((rule) => ({
        key: `recurring:${rule.id}:${rule.nextDate}`,
        ruleType: 'recurring-due' as const,
        title: `${rule.name} due`,
        date: rule.nextDate,
        route: '/plan',
        leadDays: [Math.max(rule.reminderDays, settings.notificationLeadDays), 0],
        detail: `Recorded ${rule.kind} due date.`,
        evidence: `Recorded ${rule.frequency} ${rule.kind}.`,
      })),
    ...cardReminders(data, settings),
  ]
    .filter(
      (item) =>
        !settings.disabledAlertRules.includes(item.ruleType) &&
        !settings.dismissedAlertKeys.includes(item.key),
    )
    .map((item) => {
      const until = snoozed.get(item.key)
      return until ? { ...item, snoozedUntil: until } : item
    })
}

export interface ScheduledReminder extends DatedReminder {
  stage: string
  at: Date
}

export function planScheduledReminders(
  reminders: readonly DatedReminder[],
  now: Date,
  quietHoursStart: string,
  quietHoursEnd: string,
): ScheduledReminder[] {
  const [hour = 8, minute = 0] = quietHoursEnd.split(':').map(Number)
  const [startHour = 21, startMinute = 0] = quietHoursStart.split(':').map(Number)
  const startMinutes = startHour * 60 + startMinute
  const endMinutes = hour * 60 + minute
  const result: ScheduledReminder[] = []
  for (const reminder of reminders) {
    const snoozedUntil = reminder.snoozedUntil ? new Date(reminder.snoozedUntil) : now
    const effectiveNow = snoozedUntil > now ? snoozedUntil : now
    if (
      differenceInCalendarDays(parseISO(reminder.date), now) < 0 &&
      effectiveNow <= now
    ) {
      continue
    }
    let missed = false
    for (const days of new Set(reminder.leadDays)) {
      const at = subDays(parseISO(reminder.date), days)
      at.setHours(hour, minute, 0, 0)
      if (at.getTime() <= effectiveNow.getTime()) {
        missed = true
      } else {
        result.push({ ...reminder, stage: `lead-${days}`, at })
      }
    }
    if (missed) {
      const catchUp = new Date(effectiveNow.getTime() + 60_000)
      const catchUpMinutes = catchUp.getHours() * 60 + catchUp.getMinutes()
      const quiet =
        startMinutes < endMinutes
          ? catchUpMinutes >= startMinutes && catchUpMinutes < endMinutes
          : startMinutes > endMinutes &&
            (catchUpMinutes >= startMinutes || catchUpMinutes < endMinutes)
      if (quiet) {
        catchUp.setHours(hour, minute, 0, 0)
        if (catchUp <= effectiveNow) catchUp.setDate(catchUp.getDate() + 1)
      }
      if (
        !result.some(
          (item) => item.key === reminder.key && item.at.getTime() <= catchUp.getTime(),
        )
      ) {
        result.push({
          ...reminder,
          stage: snoozedUntil > now ? 'snoozed' : 'catch-up',
          at: catchUp,
        })
      }
    }
  }
  return result.sort((left, right) => left.at.getTime() - right.at.getTime())
}
