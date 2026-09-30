import Decimal from 'decimal.js'
import { addMonths, format, parseISO, subMonths } from 'date-fns'

import { addFrequency, currentMonthRange, isDateInRange, monthsUntil } from './dates'
import { multiplyMoney, percentageOf, sumPaise } from './money'
import { expenseAllocations, expenseImpact } from './expense-impact'
import { forecastReviews } from './forecast-review'
import type {
  Account,
  Asset,
  Budget,
  Category,
  DateRange,
  Goal,
  InvestmentHolding,
  InsurancePolicy,
  Loan,
  NetWorthSnapshot,
  Paise,
  RecurringRule,
  Transaction,
} from './types'

export interface MonthlySummary {
  incomePaise: Paise
  expensePaise: Paise
  netPaise: Paise
  essentialExpensePaise: Paise
  discretionaryExpensePaise: Paise
}

export interface BudgetStatus {
  budget: Budget
  spentPaise: Paise
  effectiveLimitPaise: Paise
  rolloverPaise: Paise
  remainingPaise: Paise
  usedPercent: number
}

export interface NetWorthBreakdown {
  cashPaise: Paise
  investmentPaise: Paise
  assetPaise: Paise
  debtPaise: Paise
  totalPaise: Paise
}

export interface LoanScheduleRow {
  month: number
  date: string
  openingPaise: Paise
  paymentPaise: Paise
  principalPaise: Paise
  interestPaise: Paise
  closingPaise: Paise
}

export interface InvestmentSummary {
  currentValuePaise: Paise
  investedPaise: Paise
  gainPaise: Paise
  gainPercent: number
}

export interface CashFlowForecastEvent {
  id: string
  date: string
  name: string
  amountPaise: Paise
  projectedBalancePaise: Paise
  sourceRuleId: string
  overdueDate?: string | undefined
}

export function calculateAccountBalances(
  accounts: readonly Account[],
  transactions: readonly Transaction[],
): Map<string, Paise> {
  const balances = new Map(
    accounts.map((account) => [account.id, account.openingBalancePaise]),
  )

  for (const transaction of transactions) {
    const current = balances.get(transaction.accountId)
    if (current === undefined) continue

    if (transaction.kind === 'income') {
      balances.set(transaction.accountId, current + transaction.amountPaise)
    } else if (transaction.kind === 'expense') {
      balances.set(transaction.accountId, current - transaction.amountPaise)
    } else if (transaction.kind === 'adjustment') {
      balances.set(transaction.accountId, current + transaction.amountPaise)
    } else {
      balances.set(transaction.accountId, current - transaction.amountPaise)
      if (transaction.destinationAccountId) {
        const destination = balances.get(transaction.destinationAccountId)
        if (destination !== undefined) {
          balances.set(
            transaction.destinationAccountId,
            destination + transaction.amountPaise,
          )
        }
      }
    }
  }

  return balances
}

export function calculateMonthlySummary(
  transactions: readonly Transaction[],
  categories: readonly Category[],
  range: DateRange = currentMonthRange(),
): MonthlySummary {
  const categoryMap = new Map(categories.map((category) => [category.id, category]))
  let incomePaise = 0
  let expensePaise = 0
  let essentialExpensePaise = 0

  for (const transaction of transactions) {
    if (!isDateInRange(transaction.date, range)) continue
    if (transaction.kind === 'income') {
      incomePaise += transaction.amountPaise
      continue
    }
    expensePaise += expenseImpact(transaction)
    essentialExpensePaise += expenseAllocations(transaction).reduce(
      (sum, split) =>
        split.categoryId && categoryMap.get(split.categoryId)?.essential
          ? sum + split.amountPaise
          : sum,
      0,
    )
  }

  return {
    incomePaise,
    expensePaise,
    netPaise: incomePaise - expensePaise,
    essentialExpensePaise,
    discretionaryExpensePaise: expensePaise - essentialExpensePaise,
  }
}

export function calculateBudgetStatuses(
  budgets: readonly Budget[],
  transactions: readonly Transaction[],
  range: DateRange = currentMonthRange(),
): BudgetStatus[] {
  return budgets
    .filter((budget) => budget.active)
    .map((budget) => {
      const spendInRange = (targetRange: DateRange) =>
        transactions.reduce((sum, transaction) => {
          if (!isDateInRange(transaction.date, targetRange)) {
            return sum
          }
          return (
            sum +
            expenseAllocations(transaction)
              .filter((split) => split.categoryId === budget.categoryId)
              .reduce((splitSum, split) => splitSum + split.amountPaise, 0)
          )
        }, 0)
      const spentPaise = spendInRange(range)
      const previousStart = subMonths(parseISO(range.start), 1)
      const previousRange = {
        start: format(previousStart, 'yyyy-MM-dd'),
        end: format(
          new Date(previousStart.getFullYear(), previousStart.getMonth() + 1, 0),
          'yyyy-MM-dd',
        ),
      }
      const rolloverPaise = budget.rollover
        ? Math.max(0, budget.monthlyLimitPaise - spendInRange(previousRange))
        : 0
      const effectiveLimitPaise = budget.monthlyLimitPaise + rolloverPaise

      return {
        budget,
        spentPaise,
        effectiveLimitPaise,
        rolloverPaise,
        remainingPaise: effectiveLimitPaise - spentPaise,
        usedPercent: percentageOf(spentPaise, effectiveLimitPaise),
      }
    })
}

export function calculateInvestmentSummary(
  holdings: readonly InvestmentHolding[],
): InvestmentSummary {
  const included = holdings.filter((holding) => holding.includeInNetWorth)
  const currentValuePaise = included.reduce((sum, holding) => {
    return sum + multiplyMoney(holding.currentPricePaise, holding.units)
  }, 0)
  const investedPaise = sumPaise(included.map((holding) => holding.investedPaise))
  const gainPaise = currentValuePaise - investedPaise
  return {
    currentValuePaise,
    investedPaise,
    gainPaise,
    gainPercent:
      investedPaise > 0
        ? new Decimal(gainPaise).div(investedPaise).mul(100).toDecimalPlaces(1).toNumber()
        : 0,
  }
}

export function calculateNetWorth(input: {
  accounts: readonly Account[]
  transactions: readonly Transaction[]
  assets: readonly Asset[]
  loans: readonly Loan[]
  investments: readonly InvestmentHolding[]
}): NetWorthBreakdown {
  const balances = calculateAccountBalances(input.accounts, input.transactions)
  const holdingsByAccount = new Set(
    input.investments
      .map((holding) => holding.accountId)
      .filter((id): id is string => id !== null),
  )
  const linkedLoanAccounts = new Set(
    input.loans.map((loan) => loan.accountId).filter((id): id is string => id !== null),
  )
  let cashPaise = 0
  let accountDebtPaise = 0

  for (const account of input.accounts) {
    if (!account.includeInNetWorth || account.archived) continue
    const balance = balances.get(account.id) ?? 0

    if (account.type === 'loan' && linkedLoanAccounts.has(account.id)) continue
    if (
      (account.type === 'investment' || account.type === 'retirement') &&
      holdingsByAccount.has(account.id)
    ) {
      continue
    }
    if (account.type === 'credit-card' || account.type === 'loan') {
      if (balance < 0) accountDebtPaise += Math.abs(balance)
      else cashPaise += balance
    } else {
      cashPaise += balance
    }
  }

  const investmentPaise = calculateInvestmentSummary(input.investments).currentValuePaise
  const assetPaise = input.assets
    .filter((asset) => asset.kind === 'asset' && asset.includeInNetWorth)
    .reduce((sum, asset) => sum + asset.valuePaise, 0)
  const manualDebtPaise = input.assets
    .filter((asset) => asset.kind === 'liability' && asset.includeInNetWorth)
    .reduce((sum, asset) => sum + asset.valuePaise, 0)
  const loanDebtPaise = input.loans
    .filter((loan) => loan.active)
    .reduce((sum, loan) => sum + loan.outstandingPaise, 0)
  const debtPaise = accountDebtPaise + manualDebtPaise + loanDebtPaise

  return {
    cashPaise,
    investmentPaise,
    assetPaise,
    debtPaise,
    totalPaise: cashPaise + investmentPaise + assetPaise - debtPaise,
  }
}

export function calculateLoanSchedule(loan: Loan): LoanScheduleRow[] {
  let balance = Math.max(0, loan.outstandingPaise - loan.prepaymentPaise)
  if (balance === 0 || loan.termMonths <= 0) return []

  const scheduledPayment =
    loan.emiPaise > 0
      ? loan.emiPaise
      : calculateEmiPaise(balance, loan.annualInterestRateBps, loan.termMonths)
  const rows: LoanScheduleRow[] = []
  let date = parseISO(loan.nextPaymentDate)
  const currentParts = loan.payments.filter(
    (payment) => payment.occurrenceDate === loan.nextPaymentDate,
  )
  const principalAlreadyPaid = sumPaise(
    currentParts.map((payment) => payment.principalPaise + payment.prepaymentPaise),
  )
  const interestAlreadyPaid = sumPaise(
    currentParts.map((payment) => payment.interestPaise),
  )
  const regularAlreadyPaid = sumPaise(
    currentParts.map((payment) => payment.principalPaise + payment.interestPaise),
  )

  for (let month = 1; month <= loan.termMonths && balance > 0; month += 1) {
    const openingPaise = balance
    const applicableRate = [...loan.rateChanges]
      .filter((change) => change.effectiveDate <= format(date, 'yyyy-MM-dd'))
      .sort((left, right) => left.effectiveDate.localeCompare(right.effectiveDate))
      .at(-1)?.annualInterestRateBps
    const rowMonthlyRate = new Decimal(applicableRate ?? loan.annualInterestRateBps)
      .div(10_000)
      .div(12)
    const grossInterest =
      loan.interestType === 'flat'
        ? new Decimal(loan.principalPaise)
            .mul(rowMonthlyRate)
            .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
            .toNumber()
        : new Decimal(balance + (month === 1 ? principalAlreadyPaid : 0))
            .mul(rowMonthlyRate)
            .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
            .toNumber()
    const interestPaise = Math.max(
      0,
      grossInterest - (month === 1 ? interestAlreadyPaid : 0),
    )
    const paymentPaise = Math.min(
      balance + interestPaise,
      Math.max(0, scheduledPayment - (month === 1 ? regularAlreadyPaid : 0)),
    )
    const principalPaise = Math.max(0, paymentPaise - interestPaise)
    balance = Math.max(0, balance - principalPaise)

    rows.push({
      month,
      date: format(date, 'yyyy-MM-dd'),
      openingPaise,
      paymentPaise,
      principalPaise,
      interestPaise,
      closingPaise: balance,
    })
    date = addMonths(date, 1)
  }

  return rows
}

export function calculateEmiPaise(
  principalPaise: Paise,
  annualInterestRateBps: number,
  termMonths: number,
): Paise {
  if (termMonths <= 0) return 0
  if (annualInterestRateBps === 0) {
    return new Decimal(principalPaise)
      .div(termMonths)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
      .toNumber()
  }

  const monthlyRate = new Decimal(annualInterestRateBps).div(10_000).div(12)
  const factor = monthlyRate.plus(1).pow(termMonths)
  return new Decimal(principalPaise)
    .mul(monthlyRate)
    .mul(factor)
    .div(factor.minus(1))
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber()
}

export function requiredMonthlyForGoal(goal: Goal, from = new Date()): Paise {
  const remaining = Math.max(0, goal.targetPaise - goal.currentPaise)
  const months = Math.max(1, monthsUntil(goal.targetDate, from))
  return new Decimal(remaining)
    .div(months)
    .toDecimalPlaces(0, Decimal.ROUND_CEIL)
    .toNumber()
}

export function calculateCashFlowForecast(input: {
  accounts: readonly Account[]
  transactions: readonly Transaction[]
  recurringRules: readonly RecurringRule[]
  loans?: readonly Loan[]
  insurancePolicies?: readonly InsurancePolicy[]
  assets?: readonly Asset[]
  startDate: string
  endDate: string
}): {
  openingBalancePaise: Paise
  endingBalancePaise: Paise
  events: CashFlowForecastEvent[]
  reviews: ReturnType<typeof forecastReviews>
} {
  const balances = calculateAccountBalances(input.accounts, input.transactions)
  const liquidAccountIds = new Set(
    input.accounts
      .filter(
        (account) =>
          !account.archived && ['cash', 'savings', 'current'].includes(account.type),
      )
      .map((account) => account.id),
  )
  const openingBalancePaise = [...liquidAccountIds].reduce(
    (sum, id) => sum + (balances.get(id) ?? 0),
    0,
  )
  const occurrences: Array<{
    id: string
    date: string
    name: string
    amountPaise: Paise
    sourceRuleId: string
    overdueDate?: string | undefined
  }> = []
  const addOccurrence = (
    id: string,
    due: string,
    name: string,
    amountPaise: Paise,
    sourceRuleId: string,
  ) => {
    if (due > input.endDate) return
    occurrences.push({
      id,
      date: due < input.startDate ? input.startDate : due,
      name,
      amountPaise,
      sourceRuleId,
      ...(due < input.startDate ? { overdueDate: due } : {}),
    })
  }

  for (const rule of input.recurringRules.filter(
    (item) => item.active && !item.obligation,
  )) {
    let date = rule.nextDate
    let shownOverdue = false
    while (date <= input.endDate && (!rule.endDate || date <= rule.endDate)) {
      let amountPaise = 0
      if (rule.kind === 'income' && liquidAccountIds.has(rule.accountId)) {
        amountPaise = rule.amountPaise
      } else if (rule.kind === 'expense' && liquidAccountIds.has(rule.accountId)) {
        amountPaise = -rule.amountPaise
      } else if (rule.kind === 'transfer') {
        const fromLiquid = liquidAccountIds.has(rule.accountId)
        const toLiquid =
          rule.destinationAccountId !== null &&
          liquidAccountIds.has(rule.destinationAccountId)
        if (fromLiquid && !toLiquid) amountPaise = -rule.amountPaise
        if (!fromLiquid && toLiquid) amountPaise = rule.amountPaise
      }
      if (amountPaise !== 0 && (date >= input.startDate || !shownOverdue)) {
        addOccurrence(`${rule.id}:${date}`, date, rule.name, amountPaise, rule.id)
        if (date < input.startDate) shownOverdue = true
      }
      date = addFrequency(date, rule.frequency)
    }
  }
  for (const loan of input.loans ?? []) {
    if (!loan.active) continue
    let shownOverdue = false
    for (const payment of calculateLoanSchedule({ ...loan, prepaymentPaise: 0 })) {
      if (payment.date > input.endDate) break
      if (payment.date < input.startDate && shownOverdue) continue
      addOccurrence(
        `loan:${loan.id}:${payment.date}`,
        payment.date,
        `${loan.name} EMI`,
        -payment.paymentPaise,
        `loan:${loan.id}`,
      )
      if (payment.date < input.startDate) shownOverdue = true
    }
  }
  for (const policy of input.insurancePolicies ?? []) {
    if (!policy.active || policy.premiumPaise === 0) continue
    let date = policy.nextPremiumDate
    let shownOverdue = false
    while (date <= input.endDate && (!policy.endDate || date <= policy.endDate)) {
      if (
        policy.coverage?.premiumPaidForDate !== date &&
        (date >= input.startDate || !shownOverdue)
      ) {
        addOccurrence(
          `policy:${policy.id}:${date}`,
          date,
          `${policy.policyName} premium`,
          -policy.premiumPaise,
          `policy:${policy.id}`,
        )
        if (date < input.startDate) shownOverdue = true
      }
      date = addFrequency(date, policy.premiumFrequency)
    }
  }
  for (const asset of input.assets ?? []) {
    const terms = asset.deposit
    if (!terms || terms.status !== 'active' || !liquidAccountIds.has(terms.cashAccountId))
      continue
    if (terms.maturityInstruction === 'payout') {
      addOccurrence(
        `deposit:${asset.id}:maturity`,
        terms.maturityDate,
        `${asset.name} maturity`,
        terms.maturityAmountPaise,
        `deposit:${asset.id}`,
      )
    }
    if (terms.interestFrequency !== 'at-maturity' && terms.nextInterestDate) {
      let date = terms.nextInterestDate
      let shownOverdue = false
      while (date <= input.endDate && date <= terms.maturityDate) {
        if (
          !terms.paidInterestDates.includes(date) &&
          (date >= input.startDate || !shownOverdue)
        ) {
          addOccurrence(
            `deposit:${asset.id}:${date}`,
            date,
            `${asset.name} interest`,
            terms.interestPaise,
            `deposit:${asset.id}`,
          )
          if (date < input.startDate) shownOverdue = true
        }
        date = addFrequency(date, terms.interestFrequency)
      }
    }
  }

  occurrences.sort(
    (left, right) =>
      left.date.localeCompare(right.date) ||
      left.amountPaise - right.amountPaise ||
      left.name.localeCompare(right.name),
  )
  let running = openingBalancePaise
  const events = occurrences.map((event) => {
    running += event.amountPaise
    return { ...event, projectedBalancePaise: running }
  })
  return {
    openingBalancePaise,
    endingBalancePaise: running,
    events,
    reviews: forecastReviews(
      input.recurringRules,
      input.transactions,
      input.loans,
      input.insurancePolicies,
    ),
  }
}

export function createNetWorthSnapshot(
  breakdown: NetWorthBreakdown,
  date: string,
  id: string,
  createdAt: string,
  updatedAt = createdAt,
): NetWorthSnapshot {
  return {
    id,
    date,
    ...breakdown,
    createdAt,
    updatedAt,
  }
}
