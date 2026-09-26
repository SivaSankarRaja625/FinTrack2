import { z } from 'zod'

import type { FinanceData } from './types'

const id = z.string().min(1).max(200)
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u)
const isoDateTime = z.string().datetime()
const paise = z.number().int().safe()
const base = {
  id,
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
}

export const userProfileSchema = z.object({
  ...base,
  name: z.string().trim().min(1).max(100),
  locale: z.literal('en-IN'),
  currency: z.literal('INR'),
  monthlyIncomePaise: paise.nonnegative(),
  essentialMonthlyPaise: paise.nonnegative(),
  payDay: z.number().int().min(1).max(31),
  emergencyFundMonths: z.number().min(0).max(36),
  financialDependents: z.number().int().min(0).max(30).optional(),
  jobChangeReviewDate: isoDate.nullable().optional(),
})

export const appSettingsSchema = z.object({
  ...base,
  theme: z.enum(['system', 'light', 'dark']),
  autoLockMinutes: z.number().int().min(1).max(120),
  dateFormat: z.enum(['dd/MM/yyyy', 'dd MMM yyyy']),
  notificationLeadDays: z.number().int().min(0).max(90),
  notificationsEnabled: z.boolean(),
  notificationCatchUps: z.array(z.string().min(1)).max(500).optional(),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/u),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/u),
  androidBackupEnabled: z.boolean(),
  lastSystemSnapshotAt: isoDateTime.nullable(),
  lastManualBackupAt: isoDateTime.nullable(),
  verifiedBackup: z
    .object({
      verifiedAt: isoDateTime,
      createdAt: isoDateTime.nullable(),
      recordCount: z.number().int().nonnegative(),
      attachmentCount: z.number().int().nonnegative(),
    })
    .nullable()
    .optional(),
  reviewDates: z
    .object({
      nominees: isoDate.nullable(),
      retirement: isoDate.nullable(),
      tax: isoDate.nullable(),
      documents: isoDate.nullable(),
    })
    .optional(),
  highCostDebtBps: z.number().int().min(0).max(100_000).nullable().optional(),
  concentrationWarningPercent: z.number().min(1).max(100).nullable().optional(),
  dismissedAlertKeys: z.array(z.string()),
  snoozedAlerts: z.array(
    z.object({
      key: z.string(),
      until: isoDateTime,
    }),
  ),
  alertHistory: z.array(
    z.object({
      id,
      key: z.string(),
      ruleType: z.enum([
        'budget',
        'loan-due',
        'loan-payment-mismatch',
        'insurance-due',
        'card-statement-due',
        'recurring-due',
        'cash-flow-risk',
        'import-duplicates',
        'stale-investment',
        'goal-contribution',
        'emergency-fund',
        'income-missing',
        'large-expense',
        'backup-due',
        'financial-review',
        'high-cost-debt',
        'investment-concentration',
        'net-worth-change',
      ]),
      title: z.string(),
      detail: z.string(),
      action: z.enum(['dismissed', 'snoozed']),
      actionAt: isoDateTime,
      snoozedUntil: isoDateTime.nullable(),
    }),
  ),
  disabledAlertRules: z.array(
    z.enum([
      'budget',
      'loan-due',
      'loan-payment-mismatch',
      'insurance-due',
      'card-statement-due',
      'recurring-due',
      'cash-flow-risk',
      'import-duplicates',
      'stale-investment',
      'goal-contribution',
      'emergency-fund',
      'income-missing',
      'large-expense',
      'backup-due',
      'financial-review',
      'high-cost-debt',
      'investment-concentration',
      'net-worth-change',
    ]),
  ),
  budgetWarningPercent: z.number().min(1).max(100),
  largeExpenseMultiplier: z.number().min(1).max(20),
  cashFlowFloorPaise: paise.nonnegative(),
})

export const accountSchema = z
  .object({
    ...base,
    name: z.string().trim().min(1).max(100),
    institution: z.string().trim().max(100),
    type: z.enum([
      'cash',
      'savings',
      'current',
      'credit-card',
      'loan',
      'investment',
      'retirement',
      'other',
    ]),
    openingBalancePaise: paise,
    includeInNetWorth: z.boolean(),
    archived: z.boolean(),
    creditCardDetails: z
      .object({
        lastFour: z
          .string()
          .regex(/^\d{4}$/u)
          .nullable(),
        creditLimitPaise: paise.positive().nullable(),
        statementDay: z.number().int().min(1).max(31).nullable(),
        paymentDueDay: z.number().int().min(1).max(31).nullable(),
        statement: z
          .object({
            date: isoDate,
            dueDate: isoDate,
            totalPaise: paise.nonnegative(),
            minimumPaise: paise.nonnegative(),
            paidPaise: paise.nonnegative(),
          })
          .refine((statement) => statement.dueDate >= statement.date, {
            message: 'Statement due date must follow the statement date',
          })
          .refine((statement) => statement.minimumPaise <= statement.totalPaise, {
            message: 'Minimum due cannot exceed the statement total',
          })
          .optional(),
      })
      .optional(),
    emergencyReserve: z.boolean().optional(),
  })
  .superRefine((account, context) => {
    if (account.type !== 'credit-card' && account.creditCardDetails != null) {
      context.addIssue({
        code: 'custom',
        path: ['creditCardDetails'],
        message: 'Only credit card accounts can have card details',
      })
    }
    if (
      account.emergencyReserve &&
      !['cash', 'savings', 'current'].includes(account.type)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['emergencyReserve'],
        message: 'Only cash and accessible bank accounts can be immediate reserves',
      })
    }
  })

export const categorySchema = z.object({
  ...base,
  name: z.string().trim().min(1).max(100),
  kind: z.enum(['income', 'expense']),
  parentId: id.nullable(),
  essential: z.boolean(),
  color: z.string().regex(/^#[0-9a-f]{6}$/iu),
  system: z.boolean(),
  archived: z.boolean(),
})

const transactionSplitSchema = z.object({
  id,
  categoryId: id,
  amountPaise: paise.nonnegative(),
})

export const transactionSchema = z
  .object({
    ...base,
    accountId: id,
    destinationAccountId: id.nullable(),
    categoryId: id.nullable(),
    kind: z.enum(['income', 'expense', 'transfer', 'adjustment']),
    amountPaise: paise,
    date: isoDate,
    description: z.string().trim().min(1).max(300),
    note: z.string().max(2_000),
    tags: z.array(z.string().trim().min(1).max(50)).max(20),
    cleared: z.boolean(),
    splits: z.array(transactionSplitSchema),
    recurringRuleId: id.nullable(),
    importBatchId: id.nullable(),
  })
  .superRefine((transaction, context) => {
    if (transaction.kind !== 'adjustment' && transaction.amountPaise <= 0) {
      context.addIssue({
        code: 'custom',
        path: ['amountPaise'],
        message: 'Amount must be greater than zero',
      })
    }
    if (transaction.kind === 'transfer' && !transaction.destinationAccountId) {
      context.addIssue({
        code: 'custom',
        path: ['destinationAccountId'],
        message: 'A transfer needs a destination account',
      })
    }
    const splitTotal = transaction.splits.reduce(
      (sum, split) => sum + split.amountPaise,
      0,
    )
    if (transaction.splits.length > 0 && splitTotal !== transaction.amountPaise) {
      context.addIssue({
        code: 'custom',
        path: ['splits'],
        message: 'Split amounts must equal the transaction amount',
      })
    }
  })

export const recurringRuleSchema = z.object({
  ...base,
  name: z.string().trim().min(1).max(100),
  kind: z.enum(['income', 'expense', 'transfer']),
  amountPaise: paise.positive(),
  accountId: id,
  destinationAccountId: id.nullable(),
  categoryId: id.nullable(),
  frequency: z.enum(['weekly', 'monthly', 'quarterly', 'half-yearly', 'yearly']),
  startDate: isoDate,
  nextDate: isoDate,
  endDate: isoDate.nullable(),
  reminderDays: z.number().int().min(0).max(90),
  active: z.boolean(),
})

export const budgetSchema = z.object({
  ...base,
  name: z.string().trim().min(1).max(100),
  categoryId: id,
  monthlyLimitPaise: paise.positive(),
  rollover: z.boolean(),
  active: z.boolean(),
})

export const assetSchema = z.object({
  ...base,
  name: z.string().trim().min(1).max(120),
  kind: z.enum(['asset', 'liability']),
  type: z.enum([
    'property',
    'vehicle',
    'gold',
    'fixed-deposit',
    'provident-fund',
    'receivable',
    'other',
  ]),
  valuePaise: paise.nonnegative(),
  valuationDate: isoDate,
  includeInNetWorth: z.boolean(),
  note: z.string().max(2_000),
})

export const loanSchema = z.object({
  ...base,
  name: z.string().trim().min(1).max(120),
  lender: z.string().trim().max(120),
  accountId: id.nullable(),
  principalPaise: paise.positive(),
  outstandingPaise: paise.nonnegative(),
  annualInterestRateBps: z.number().int().min(0).max(100_000),
  interestType: z.enum(['reducing', 'flat']),
  termMonths: z.number().int().positive().max(600),
  emiPaise: paise.nonnegative(),
  startDate: isoDate,
  nextPaymentDate: isoDate,
  paymentDay: z.number().int().min(1).max(31),
  prepaymentPaise: paise.nonnegative(),
  rateChanges: z.array(
    z.object({
      id,
      effectiveDate: isoDate,
      annualInterestRateBps: z.number().int().min(0).max(100_000),
    }),
  ),
  payments: z.array(
    z
      .object({
        id,
        date: isoDate,
        amountPaise: paise.nonnegative(),
        principalPaise: paise.nonnegative(),
        interestPaise: paise.nonnegative(),
        prepaymentPaise: paise.nonnegative(),
        transactionId: id.nullable(),
        note: z.string().max(1_000),
      })
      .superRefine((payment, context) => {
        if (
          payment.amountPaise !==
          payment.principalPaise + payment.interestPaise + payment.prepaymentPaise
        ) {
          context.addIssue({
            code: 'custom',
            path: ['amountPaise'],
            message: 'Payment components must equal the total amount',
          })
        }
      }),
  ),
  active: z.boolean(),
})

export const investmentSchema = z
  .object({
    ...base,
    accountId: id.nullable(),
    name: z.string().trim().min(1).max(150),
    symbol: z.string().trim().max(50),
    type: z.enum([
      'equity',
      'mutual-fund',
      'etf',
      'bond',
      'ppf',
      'epf',
      'nps',
      'gold',
      'fixed-deposit',
      'other',
    ]),
    units: z.string().regex(/^\d+(\.\d+)?$/u),
    averageCostPaise: paise.nonnegative(),
    currentPricePaise: paise.nonnegative(),
    priceDate: isoDate,
    investedPaise: paise.nonnegative(),
    activities: z.array(
      z.object({
        id,
        date: isoDate,
        type: z.enum(['buy', 'sell', 'contribution', 'withdrawal', 'dividend']),
        units: z.string().regex(/^\d+(\.\d+)?$/u),
        amountPaise: paise.nonnegative(),
        pricePaise: paise.nonnegative(),
        note: z.string().max(1_000),
      }),
    ),
    priceHistory: z.array(
      z.object({
        id,
        date: isoDate,
        pricePaise: paise.nonnegative(),
      }),
    ),
    includeInNetWorth: z.boolean(),
    reserveAccess: z
      .object({
        instrument: z.enum(['overnight-fund', 'liquid-fund', 'bank-deposit']),
        accessDays: z.number().int().min(0).max(365),
        lockedUntil: isoDate.nullable(),
      })
      .optional(),
  })
  .superRefine((holding, context) => {
    if (!holding.reserveAccess) return
    const eligible =
      holding.reserveAccess.instrument === 'bank-deposit'
        ? holding.type === 'fixed-deposit'
        : holding.type === 'mutual-fund'
    if (!eligible) {
      context.addIssue({
        code: 'custom',
        path: ['reserveAccess'],
        message: 'The selected reserve instrument does not match this holding type',
      })
    }
  })

export const insurancePolicySchema = z.object({
  ...base,
  type: z.enum(['term-life', 'health', 'vehicle', 'home', 'personal-accident', 'other']),
  insurer: z.string().trim().min(1).max(150),
  policyName: z.string().trim().min(1).max(150),
  policyNumber: z.string().trim().max(100),
  sumAssuredPaise: paise.nonnegative(),
  premiumPaise: paise.nonnegative(),
  premiumFrequency: z.enum(['weekly', 'monthly', 'quarterly', 'half-yearly', 'yearly']),
  startDate: isoDate,
  endDate: isoDate.nullable(),
  nextPremiumDate: isoDate,
  renewalDate: isoDate.nullable(),
  maturityDate: isoDate.nullable(),
  nomineeName: z.string().trim().max(120),
  nomineeRelation: z.string().trim().max(100),
  contact: z.string().trim().max(200),
  note: z.string().max(2_000),
  attachmentIds: z.array(id),
  active: z.boolean(),
  coverage: z
    .object({
      source: z.enum(['personal', 'employer', 'other']),
      insuredPeople: z.array(z.string().trim().min(1).max(100)).max(20),
      layer: z.enum(['base', 'top-up', 'other']),
      deductiblePaise: paise.nonnegative(),
      coPayPercent: z.number().min(0).max(100).nullable(),
      restrictions: z.string().max(1_000),
      claimContact: z.string().max(200),
      premiumPaidForDate: isoDate.nullable(),
      renewalConfirmedForDate: isoDate.nullable(),
      reminderDays: z.array(z.number().int().min(0).max(90)).min(1).max(6),
      lastConfirmedAt: isoDate.nullable().optional(),
    })
    .optional(),
})

export const goalSchema = z.object({
  ...base,
  name: z.string().trim().min(1).max(120),
  targetPaise: paise.positive(),
  currentPaise: paise.nonnegative(),
  targetDate: isoDate,
  priority: z.enum(['high', 'medium', 'low']),
  linkedAccountId: id.nullable(),
  plannedMonthlyPaise: paise.nonnegative(),
  archived: z.boolean(),
})

export const importBatchSchema = z.object({
  ...base,
  filename: z.string().trim().min(1).max(255),
  importedAt: isoDateTime,
  rowCount: z.number().int().nonnegative(),
  createdTransactionIds: z.array(id),
  duplicateCount: z.number().int().nonnegative(),
  rolledBackAt: isoDateTime.nullable(),
})

export const netWorthSnapshotSchema = z.object({
  ...base,
  date: isoDate,
  cashPaise: paise,
  investmentPaise: paise,
  assetPaise: paise,
  debtPaise: paise.nonnegative(),
  totalPaise: paise,
})

export const financeDataSchema: z.ZodType<FinanceData> = z.object({
  profiles: z.array(userProfileSchema),
  settings: z.array(appSettingsSchema),
  accounts: z.array(accountSchema),
  categories: z.array(categorySchema),
  transactions: z.array(transactionSchema),
  recurringRules: z.array(recurringRuleSchema),
  budgets: z.array(budgetSchema),
  assets: z.array(assetSchema),
  loans: z.array(loanSchema),
  investments: z.array(investmentSchema),
  insurancePolicies: z.array(insurancePolicySchema),
  goals: z.array(goalSchema),
  importBatches: z.array(importBatchSchema),
  netWorthSnapshots: z.array(netWorthSnapshotSchema),
})

export function validateFinanceData(value: unknown): FinanceData {
  return financeDataSchema.parse(value)
}
