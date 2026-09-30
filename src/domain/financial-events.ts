import Decimal from 'decimal.js'
import { differenceInCalendarDays, parseISO } from 'date-fns'

import { addFrequency, isIsoDate } from './dates'
import { coverageFor } from './insurance'
import { nextDepositInterestDate, validateDepositTerms } from './deposit-schedule'
import { assertPaise } from './money'
import { calculateEmiPaise } from './calculations'
import type {
  FinanceData,
  FinancialEvent,
  FinancialSourceState,
  InvestmentActivity,
  LoanPayment,
  Paise,
  Transaction,
  TransactionKind,
} from './types'

export type CashPosting =
  | {
      mode: 'new'
      accountId: string
      categoryId: string | null
      allowDuplicate?: boolean
    }
  | { mode: 'match'; transactionId: string; expected: Transaction | null }
  | { mode: 'history' }

interface CommandBase {
  id: string
  timestamp: string
  date: string
  sourceId: string
  cash: CashPosting
  note: string
}

export type FinancialCommand = CommandBase &
  (
    | {
        kind: 'loan-payment'
        principalPaise: Paise
        interestPaise: Paise
        prepaymentPaise: Paise
      }
    | {
        kind: 'investment-activity'
        activityType: InvestmentActivity['type']
        units: string
        amountPaise: Paise
        pricePaise: Paise
      }
    | { kind: 'premium'; occurrenceDate: string }
    | { kind: 'recurring'; occurrenceDate: string }
    | { kind: 'receivable'; amountPaise: Paise }
    | { kind: 'reimbursement'; amountPaise: Paise }
    | { kind: 'deposit-interest'; occurrenceDate: string; amountPaise: Paise }
    | { kind: 'deposit-maturity'; amountPaise: Paise }
  )

function required<T extends { id: string }>(
  items: readonly T[],
  id: string,
  name: string,
): T {
  if (!id) throw new Error(`Choose ${name.toLowerCase()} before continuing.`)
  const item = items.find((value) => value.id === id)
  if (!item) throw new Error(`${name} no longer exists. Refresh before continuing.`)
  return item
}

function positive(amount: Paise, label: string) {
  assertPaise(amount)
  if (amount <= 0) throw new Error(`${label} must be greater than zero`)
}

export function financialSourceState(
  data: FinanceData,
  kind: FinancialEvent['kind'],
  id: string,
): FinancialSourceState {
  switch (kind) {
    case 'loan-payment': {
      const loan = required(data.loans, id, 'Loan')
      return {
        kind: 'loan',
        outstandingPaise: loan.outstandingPaise,
        nextPaymentDate: loan.nextPaymentDate,
        active: loan.active,
      }
    }
    case 'investment-activity': {
      const holding = required(data.investments, id, 'Holding')
      return {
        kind: 'investment',
        units: holding.units,
        investedPaise: holding.investedPaise,
        averageCostPaise: holding.averageCostPaise,
      }
    }
    case 'premium': {
      const coverage = coverageFor(required(data.insurancePolicies, id, 'Policy'))
      return { kind: 'policy', paidForDate: coverage.premiumPaidForDate }
    }
    case 'recurring': {
      const rule = required(data.recurringRules, id, 'Recurring item')
      return { kind: 'recurring', nextDate: rule.nextDate, active: rule.active }
    }
    case 'receivable':
    case 'deposit-interest':
    case 'deposit-maturity': {
      const asset = required(data.assets, id, 'Asset')
      return {
        kind: 'asset',
        valuePaise: asset.valuePaise,
        valuationDate: asset.valuationDate,
        depositStatus: asset.deposit?.status ?? null,
        paidInterestDates: asset.deposit?.paidInterestDates ?? [],
      }
    }
    case 'reimbursement':
      required(data.transactions, id, 'Original expense')
      return { kind: 'expense' }
  }
}

function cashDirection(transaction: Transaction): number {
  return transaction.kind === 'expense' || transaction.kind === 'transfer'
    ? -transaction.amountPaise
    : transaction.amountPaise
}

function refundableSplits(data: FinanceData, source: Transaction, amount: Paise) {
  const rawAllocations = source.splits.length
    ? source.splits
    : source.categoryId
      ? [
          {
            id: `${source.id}-category`,
            categoryId: source.categoryId,
            amountPaise: source.amountPaise,
          },
        ]
      : []
  const grouped = new Map<string, Transaction['splits'][number]>()
  for (const split of rawAllocations) {
    const old = grouped.get(split.categoryId)
    grouped.set(split.categoryId, {
      ...split,
      amountPaise: split.amountPaise + (old?.amountPaise ?? 0),
    })
  }
  const allocations = [...grouped.values()]
  if (!allocations.length) return []
  const remaining = allocations.map((split) => ({
    ...split,
    amountPaise:
      split.amountPaise -
      data.transactions
        .filter((item) => item.reimbursementOf === source.id)
        .flatMap((item) => item.splits)
        .filter((item) => item.categoryId === split.categoryId)
        .reduce((sum, item) => sum + item.amountPaise, 0),
  }))
  const total = remaining.reduce((sum, item) => sum + item.amountPaise, 0)
  const assigned = remaining.map((item) => {
    const share = new Decimal(amount).mul(item.amountPaise).div(total)
    const paise = share.floor().toNumber()
    return { ...item, amountPaise: paise, fraction: share.minus(paise).toNumber() }
  })
  let extra = amount - assigned.reduce((sum, item) => sum + item.amountPaise, 0)
  for (const item of [...assigned].sort(
    (a, b) => b.fraction - a.fraction || a.id.localeCompare(b.id),
  )) {
    if (extra > 0) {
      item.amountPaise += 1
      extra -= 1
    }
  }
  return assigned.map(({ id, categoryId, amountPaise }) => ({
    id,
    categoryId,
    amountPaise,
  }))
}

export function applyFinancialCommand(
  data: FinanceData,
  command: FinancialCommand,
): FinanceData {
  if (data.financialEvents.some((event) => event.id === command.id))
    throw new Error('This financial action was already recorded')
  if (!isIsoDate(command.date)) throw new Error('Choose a valid payment date')
  const before = financialSourceState(data, command.kind, command.sourceId)
  const next = { ...data }
  let sourceName = ''
  let amount = 0
  let transactionKind: TransactionKind = 'expense'
  let cashSign = -1
  let occurrenceDate: string | null = null
  let destinationAccountId: string | null = null
  let requiredAccountId: string | null = null
  let splits: Transaction['splits'] = []
  let reimbursementOf: string | undefined
  let extraIncome = 0

  switch (command.kind) {
    case 'loan-payment': {
      const loan = required(data.loans, command.sourceId, 'Loan')
      for (const value of [
        command.principalPaise,
        command.interestPaise,
        command.prepaymentPaise,
      ]) {
        assertPaise(value)
        if (value < 0) throw new Error('Payment components cannot be negative')
      }
      const reduction = command.principalPaise + command.prepaymentPaise
      assertPaise(reduction)
      if (reduction > loan.outstandingPaise)
        throw new Error(
          'Principal and prepayment cannot exceed the outstanding loan balance',
        )
      if (!loan.active || loan.outstandingPaise === 0)
        throw new Error('This loan is not active')
      amount = reduction + command.interestPaise
      occurrenceDate =
        command.cash.mode !== 'history' || command.date >= loan.nextPaymentDate
          ? loan.nextPaymentDate
          : null
      const regularPaid = loan.payments
        .filter((item) => item.occurrenceDate === loan.nextPaymentDate)
        .reduce((sum, item) => sum + item.principalPaise + item.interestPaise, 0)
      assertPaise(regularPaid)
      const expectedEmi =
        loan.emiPaise ||
        calculateEmiPaise(
          loan.outstandingPaise,
          loan.annualInterestRateBps,
          loan.termMonths,
        )
      const settlesEmi =
        occurrenceDate !== null &&
        regularPaid + command.principalPaise + command.interestPaise >= expectedEmi
      const payment: LoanPayment = {
        id: command.id,
        date: command.date,
        amountPaise: amount,
        principalPaise: command.principalPaise,
        interestPaise: command.interestPaise,
        prepaymentPaise: command.prepaymentPaise,
        transactionId: null,
        occurrenceDate,
        note: command.note,
      }
      next.loans = data.loans.map((item) =>
        item.id === loan.id
          ? {
              ...item,
              outstandingPaise: item.outstandingPaise - reduction,
              nextPaymentDate: settlesEmi
                ? addFrequency(item.nextPaymentDate, 'monthly')
                : item.nextPaymentDate,
              active: item.outstandingPaise > reduction,
              payments: [...item.payments, payment],
              updatedAt: command.timestamp,
            }
          : item,
      )
      sourceName = loan.name
      break
    }
    case 'investment-activity': {
      const holding = required(data.investments, command.sourceId, 'Holding')
      const units = new Decimal(command.units || '0')
      if (
        !units.isFinite() ||
        units.isNegative() ||
        (command.activityType !== 'dividend' && units.isZero())
      )
        throw new Error('Enter positive units for a trade')
      assertPaise(command.pricePaise)
      if (command.pricePaise < 0) throw new Error('Unit price cannot be negative')
      const current = new Decimal(holding.units)
      let remaining = current
      let cost = holding.investedPaise
      amount = command.amountPaise
      const buying =
        command.activityType === 'buy' || command.activityType === 'contribution'
      if (buying) {
        remaining = current.plus(units)
        cost += amount
      } else if (command.activityType !== 'dividend') {
        if (units.gt(current))
          throw new Error('Units removed cannot exceed the current units')
        remaining = current.minus(units)
        cost -= new Decimal(cost)
          .mul(units)
          .div(current)
          .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
          .toNumber()
      }
      assertPaise(cost)
      const average = remaining.isZero()
        ? 0
        : new Decimal(cost)
            .div(remaining)
            .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
            .toNumber()
      next.investments = data.investments.map((item) =>
        item.id === holding.id
          ? {
              ...item,
              units: remaining.toString(),
              investedPaise: cost,
              averageCostPaise: average,
              activities: [
                ...item.activities,
                {
                  id: command.id,
                  date: command.date,
                  type: command.activityType,
                  units: units.toString(),
                  amountPaise: amount,
                  pricePaise: command.pricePaise,
                  note: command.note,
                },
              ],
              updatedAt: command.timestamp,
            }
          : item,
      )
      transactionKind = command.activityType === 'dividend' ? 'income' : 'adjustment'
      cashSign = buying ? -1 : 1
      sourceName = holding.name
      break
    }
    case 'premium': {
      const policy = required(data.insurancePolicies, command.sourceId, 'Policy')
      const coverage = coverageFor(policy)
      if (!policy.active || command.occurrenceDate !== policy.nextPremiumDate)
        throw new Error('Review the current premium due date')
      if (coverage.premiumPaidForDate === command.occurrenceDate)
        throw new Error('This premium was already confirmed paid')
      amount = policy.premiumPaise
      occurrenceDate = command.occurrenceDate
      sourceName = policy.policyName
      next.insurancePolicies = data.insurancePolicies.map((item) =>
        item.id === policy.id
          ? {
              ...item,
              coverage: {
                ...coverage,
                premiumPaidForDate: occurrenceDate,
                lastConfirmedAt: command.date,
              },
              updatedAt: command.timestamp,
            }
          : item,
      )
      break
    }
    case 'recurring': {
      const rule = required(data.recurringRules, command.sourceId, 'Recurring item')
      if (rule.obligation)
        throw new Error('Record this payment in its linked loan or insurance policy')
      if (!rule.active || command.occurrenceDate !== rule.nextDate)
        throw new Error('This occurrence changed or was already recorded')
      occurrenceDate = rule.nextDate
      transactionKind = rule.kind
      cashSign = rule.kind === 'income' ? 1 : -1
      amount = rule.amountPaise
      requiredAccountId = rule.accountId
      destinationAccountId = rule.destinationAccountId
      sourceName = rule.name
      const nextDate = addFrequency(rule.nextDate, rule.frequency)
      next.recurringRules = data.recurringRules.map((item) =>
        item.id === rule.id
          ? {
              ...item,
              nextDate,
              active: !item.endDate || nextDate <= item.endDate,
              updatedAt: command.timestamp,
            }
          : item,
      )
      break
    }
    case 'receivable': {
      const asset = required(data.assets, command.sourceId, 'Receivable')
      if (asset.kind !== 'asset' || asset.type !== 'receivable')
        throw new Error('Choose a money-receivable asset')
      amount = command.amountPaise
      if (amount > asset.valuePaise)
        throw new Error('The receipt cannot exceed the outstanding receivable')
      next.assets = data.assets.map((item) =>
        item.id === asset.id
          ? {
              ...item,
              valuePaise: item.valuePaise - amount,
              valuationDate: command.date,
              updatedAt: command.timestamp,
            }
          : item,
      )
      sourceName = asset.name
      transactionKind = 'income'
      cashSign = 1
      break
    }
    case 'reimbursement': {
      const expense = required(data.transactions, command.sourceId, 'Original expense')
      if (expense.kind !== 'expense') throw new Error('Choose an expense to reimburse')
      amount = command.amountPaise
      const received = data.transactions
        .filter((item) => item.reimbursementOf === expense.id)
        .reduce((sum, item) => sum + item.amountPaise, 0)
      if (amount + received > expense.amountPaise)
        throw new Error('Reimbursements cannot exceed the original expense')
      splits = refundableSplits(data, expense, amount)
      reimbursementOf = expense.id
      transactionKind = 'adjustment'
      cashSign = 1
      sourceName = expense.description
      break
    }
    case 'deposit-interest':
    case 'deposit-maturity': {
      const asset = required(data.assets, command.sourceId, 'Deposit')
      const terms = asset.deposit
      if (!terms || terms.status !== 'active' || asset.type !== 'fixed-deposit')
        throw new Error('Choose an active deposit with confirmed terms')
      validateDepositTerms(asset)
      amount = command.amountPaise
      sourceName = asset.name
      requiredAccountId = terms.cashAccountId
      cashSign = 1
      if (command.kind === 'deposit-interest') {
        occurrenceDate = command.occurrenceDate
        if (occurrenceDate !== nextDepositInterestDate(asset))
          throw new Error('Choose the next scheduled unpaid interest date')
        if (
          !isIsoDate(occurrenceDate) ||
          terms.paidInterestDates.includes(occurrenceDate)
        )
          throw new Error('This interest date is invalid or already paid')
        if (
          terms.interestFrequency === 'at-maturity' ||
          occurrenceDate > terms.maturityDate
        )
          throw new Error('This date is outside the deposit interest schedule')
        transactionKind = 'income'
        next.assets = data.assets.map((item) =>
          item.id === asset.id
            ? {
                ...item,
                deposit: {
                  ...terms,
                  paidInterestDates: [...terms.paidInterestDates, occurrenceDate!],
                },
                updatedAt: command.timestamp,
              }
            : item,
        )
      } else {
        if (command.cash.mode !== 'new')
          throw new Error(
            'Maturity needs new principal and interest entries; reconcile imported receipts before recording it',
          )
        if (terms.maturityInstruction !== 'payout')
          throw new Error('Confirm payout instructions before recording maturity')
        if (command.date < terms.maturityDate)
          throw new Error('Maturity cannot be recorded before its confirmed date')
        occurrenceDate = terms.maturityDate
        transactionKind = 'adjustment'
        extraIncome = Math.max(0, amount - terms.principalPaise)
        next.assets = data.assets.map((item) =>
          item.id === asset.id
            ? {
                ...item,
                valuePaise: 0,
                valuationDate: command.date,
                deposit: { ...terms, status: 'matured' },
                updatedAt: command.timestamp,
              }
            : item,
        )
      }
      break
    }
  }
  positive(amount, 'Cash amount')
  if (
    data.financialEvents.some(
      (event) =>
        !event.finalized &&
        event.kind === command.kind &&
        event.sourceId === command.sourceId &&
        occurrenceDate !== null &&
        event.occurrenceDate === occurrenceDate &&
        ['premium', 'recurring', 'deposit-interest', 'deposit-maturity'].includes(
          command.kind,
        ),
    )
  ) {
    throw new Error('This occurrence was already recorded')
  }
  const event: FinancialEvent = {
    id: command.id,
    kind: command.kind,
    sourceId: command.sourceId,
    sourceName,
    date: command.date,
    occurrenceDate,
    amountPaise: amount,
    transactionIds: [],
    originalTransactions: [],
    before,
    after: financialSourceState(next, command.kind, command.sourceId),
    sequence: Math.max(0, ...data.financialEvents.map((item) => item.sequence)) + 1,
    finalized: false,
    createdAt: command.timestamp,
    updatedAt: command.timestamp,
  }
  if (command.cash.mode !== 'history') {
    let accountId: string
    let original: Transaction | undefined
    if (command.cash.mode === 'match') {
      original = required(
        data.transactions,
        command.cash.transactionId,
        'Bank transaction',
      )
      if (
        !command.cash.expected ||
        JSON.stringify(original) !== JSON.stringify(command.cash.expected)
      ) {
        throw new Error(
          'The selected bank entry changed. Re-select and review it before matching.',
        )
      }
      if (
        original.financialEventId ||
        original.reimbursementOf ||
        data.transactions.some((item) => item.reimbursementOf === original!.id)
      )
        throw new Error('This transaction already has a financial link')
      if (
        cashDirection(original) !== amount * cashSign ||
        Math.abs(
          differenceInCalendarDays(parseISO(original.date), parseISO(command.date)),
        ) > 7
      ) {
        throw new Error(
          'Choose a bank transaction with the exact amount and direction within seven days of the cash date',
        )
      }
      if (original.kind === 'transfer' || transactionKind === 'transfer') {
        if (
          original.kind !== transactionKind ||
          original.destinationAccountId !== destinationAccountId
        )
          throw new Error('Match a complete transfer with the same destination account')
      }
      accountId = original.accountId
      event.originalTransactions = [original]
    } else accountId = command.cash.accountId
    const account = required(data.accounts, accountId, 'Cash account')
    if (
      account.archived ||
      !['cash', 'savings', 'current', 'credit-card'].includes(account.type)
    )
      throw new Error('Choose an active cash, bank or credit-card account')
    if (requiredAccountId && requiredAccountId !== accountId)
      throw new Error('Use the account recorded on this schedule')
    if (
      command.cash.mode === 'new' &&
      !command.cash.allowDuplicate &&
      data.transactions.some(
        (item) =>
          item.accountId === accountId &&
          cashDirection(item) === amount * cashSign &&
          Math.abs(
            differenceInCalendarDays(parseISO(item.date), parseISO(command.date)),
          ) <= 7,
      )
    )
      throw new Error(
        'A similar cash entry already exists. Match it, or explicitly confirm this is an additional cash movement.',
      )
    const categoryId =
      transactionKind === 'transfer'
        ? null
        : reimbursementOf
          ? required(data.transactions, reimbursementOf, 'Original expense').categoryId
          : command.cash.mode === 'new'
            ? command.cash.categoryId
            : (original?.categoryId ?? null)
    const effectiveCategory =
      categoryId &&
      data.categories.some(
        (item) =>
          item.id === categoryId &&
          (transactionKind === 'income'
            ? item.kind === 'income'
            : item.kind === 'expense'),
      )
        ? categoryId
        : null
    if (
      command.cash.mode === 'new' &&
      transactionKind !== 'adjustment' &&
      categoryId &&
      !effectiveCategory
    ) {
      throw new Error('Choose a category that matches this income or expense')
    }
    const primary: Transaction = {
      id: original?.id ?? `${command.id}-cash`,
      accountId,
      destinationAccountId,
      kind: transactionKind,
      amountPaise:
        transactionKind === 'adjustment' ? (amount - extraIncome) * cashSign : amount,
      date: original?.date ?? command.date,
      categoryId: effectiveCategory,
      description: `${command.kind}: ${sourceName}`.slice(0, 300),
      note: command.note,
      tags: original?.tags ?? [],
      cleared: original?.cleared ?? true,
      splits,
      recurringRuleId:
        command.kind === 'recurring'
          ? command.sourceId
          : (original?.recurringRuleId ?? null),
      importBatchId: original?.importBatchId ?? null,
      financialEventId: command.id,
      financialOriginId: command.id,
      ...(reimbursementOf ? { reimbursementOf } : {}),
      createdAt: original?.createdAt ?? command.timestamp,
      updatedAt: command.timestamp,
    }
    const additions = [primary]
    if (extraIncome > 0)
      additions.push({
        ...primary,
        id: `${command.id}-interest`,
        kind: 'income',
        amountPaise: extraIncome,
        categoryId: null,
        description: `Deposit interest: ${sourceName}`.slice(0, 300),
      })
    event.transactionIds = additions.map((item) => item.id)
    next.transactions = [
      ...data.transactions.filter((item) => item.id !== primary.id),
      ...additions,
    ]
    if (command.kind === 'loan-payment')
      next.loans = next.loans.map((item) =>
        item.id === command.sourceId
          ? {
              ...item,
              payments: item.payments.map((payment) =>
                payment.id === command.id
                  ? { ...payment, transactionId: primary.id }
                  : payment,
              ),
            }
          : item,
      )
  } else if (
    [
      'recurring',
      'receivable',
      'reimbursement',
      'deposit-interest',
      'deposit-maturity',
    ].includes(command.kind)
  ) {
    throw new Error(
      'This action requires an actual cash entry or an explicitly matched transaction',
    )
  }
  return { ...next, financialEvents: [...data.financialEvents, event] }
}

export function undoFinancialEvent(
  data: FinanceData,
  eventId: string,
  timestamp: string,
): FinanceData {
  const event = required(data.financialEvents, eventId, 'Financial event')
  if (event.finalized)
    throw new Error('This historical event was finalized and cannot be undone')
  if (
    data.financialEvents.some(
      (item) =>
        !item.finalized &&
        item.before.kind === event.before.kind &&
        item.sourceId === event.sourceId &&
        item.sequence > event.sequence,
    )
  )
    throw new Error('Undo the later event for this source first')
  if (
    JSON.stringify(financialSourceState(data, event.kind, event.sourceId)) !==
    JSON.stringify(event.after)
  ) {
    throw new Error(
      'The source balance or dates changed after this event. Keep its cash entries and finalize the link before correcting the record.',
    )
  }
  if (
    data.transactions.some(
      (item) =>
        item.reimbursementOf && event.transactionIds.includes(item.reimbursementOf),
    )
  )
    throw new Error('Undo the related reimbursements first')
  const state = event.before
  const next = { ...data }
  switch (state.kind) {
    case 'loan':
      next.loans = data.loans.map((item) =>
        item.id === event.sourceId
          ? {
              ...item,
              outstandingPaise: state.outstandingPaise,
              nextPaymentDate: state.nextPaymentDate,
              active: state.active,
              payments: item.payments.filter((payment) => payment.id !== event.id),
              updatedAt: timestamp,
            }
          : item,
      )
      break
    case 'investment':
      next.investments = data.investments.map((item) =>
        item.id === event.sourceId
          ? {
              ...item,
              units: state.units,
              investedPaise: state.investedPaise,
              averageCostPaise: state.averageCostPaise,
              activities: item.activities.filter((activity) => activity.id !== event.id),
              updatedAt: timestamp,
            }
          : item,
      )
      break
    case 'policy':
      next.insurancePolicies = data.insurancePolicies.map((item) =>
        item.id === event.sourceId
          ? {
              ...item,
              coverage: { ...coverageFor(item), premiumPaidForDate: state.paidForDate },
              updatedAt: timestamp,
            }
          : item,
      )
      break
    case 'recurring':
      next.recurringRules = data.recurringRules.map((item) =>
        item.id === event.sourceId
          ? {
              ...item,
              nextDate: state.nextDate,
              active: state.active,
              updatedAt: timestamp,
            }
          : item,
      )
      break
    case 'asset':
      next.assets = data.assets.map((item) =>
        item.id === event.sourceId
          ? {
              ...item,
              valuePaise: state.valuePaise,
              valuationDate: state.valuationDate,
              ...(item.deposit && state.depositStatus
                ? {
                    deposit: {
                      ...item.deposit,
                      status: state.depositStatus,
                      paidInterestDates: state.paidInterestDates,
                    },
                  }
                : {}),
              updatedAt: timestamp,
            }
          : item,
      )
      break
    case 'expense':
      break
  }
  next.transactions = [
    ...data.transactions.filter((item) => !event.transactionIds.includes(item.id)),
    ...event.originalTransactions,
  ]
  next.financialEvents = data.financialEvents.filter((item) => item.id !== event.id)
  return next
}

export function finalizeFinancialEvents(
  data: FinanceData,
  sourceKind: FinancialSourceState['kind'],
  sourceId: string,
  timestamp: string,
): FinanceData {
  if (sourceKind === 'expense')
    throw new Error(
      'Reimbursement links must be undone before changing the original expense',
    )
  const ids = new Set(
    data.financialEvents
      .filter((item) => item.before.kind === sourceKind && item.sourceId === sourceId)
      .map((item) => item.id),
  )
  return {
    ...data,
    financialEvents: data.financialEvents.map((event) =>
      ids.has(event.id) ? { ...event, finalized: true, updatedAt: timestamp } : event,
    ),
    transactions: data.transactions.map((item) =>
      item.financialEventId && ids.has(item.financialEventId)
        ? {
            ...item,
            financialEventId: undefined,
            recurringRuleId: sourceKind === 'recurring' ? null : item.recurringRuleId,
            updatedAt: timestamp,
          }
        : item,
    ),
    loans:
      sourceKind === 'loan'
        ? data.loans.map((item) =>
            item.id === sourceId
              ? {
                  ...item,
                  payments: item.payments.map((payment) =>
                    ids.has(payment.id) ? { ...payment, transactionId: null } : payment,
                  ),
                }
              : item,
          )
        : data.loans,
  }
}
