import type {
  Account,
  AppSettings,
  FinanceData,
  Loan,
  Transaction,
  UserProfile,
} from '../domain/types'

export const timestamp = '2026-09-24T12:00:00.000Z'

export function account(overrides: Partial<Account> = {}): Account {
  return {
    id: 'account-1',
    name: 'Salary account',
    institution: 'Bank',
    type: 'savings',
    openingBalancePaise: 100_000,
    includeInNetWorth: true,
    archived: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  }
}

export function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'transaction-1',
    accountId: 'account-1',
    destinationAccountId: null,
    categoryId: 'category-1',
    kind: 'expense',
    amountPaise: 10_000,
    date: '2026-09-10',
    description: 'Groceries',
    note: '',
    tags: [],
    cleared: true,
    splits: [],
    recurringRuleId: null,
    importBatchId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  }
}

export function loan(overrides: Partial<Loan> = {}): Loan {
  return {
    id: 'loan-1',
    name: 'Home loan',
    lender: 'Bank',
    accountId: null,
    principalPaise: 10_000_000,
    outstandingPaise: 10_000_000,
    annualInterestRateBps: 800,
    interestType: 'reducing',
    termMonths: 120,
    emiPaise: 121_328,
    startDate: '2026-01-01',
    nextPaymentDate: '2026-10-05',
    paymentDay: 5,
    prepaymentPaise: 0,
    rateChanges: [],
    payments: [],
    active: true,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  }
}

export function settings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    id: 'settings',
    theme: 'system',
    autoLockMinutes: 5,
    dateFormat: 'dd MMM yyyy',
    notificationLeadDays: 3,
    notificationsEnabled: false,
    quietHoursStart: '21:00',
    quietHoursEnd: '08:00',
    androidBackupEnabled: false,
    lastSystemSnapshotAt: null,
    lastManualBackupAt: timestamp,
    dismissedAlertKeys: [],
    snoozedAlerts: [],
    alertHistory: [],
    disabledAlertRules: [],
    budgetWarningPercent: 80,
    largeExpenseMultiplier: 2,
    cashFlowFloorPaise: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  }
}

export function profile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'profile',
    name: 'Asha',
    locale: 'en-IN',
    currency: 'INR',
    monthlyIncomePaise: 100_000_00,
    essentialMonthlyPaise: 30_000_00,
    payDay: 1,
    emergencyFundMonths: 6,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  }
}

export function financeData(overrides: Partial<FinanceData> = {}): FinanceData {
  return {
    profiles: [],
    settings: [],
    accounts: [],
    categories: [],
    transactions: [],
    recurringRules: [],
    budgets: [],
    assets: [],
    loans: [],
    investments: [],
    insurancePolicies: [],
    goals: [],
    importBatches: [],
    netWorthSnapshots: [],
    ...overrides,
  }
}
