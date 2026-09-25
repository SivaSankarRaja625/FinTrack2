export type EntityId = string
export type ISODate = string
export type ISODateTime = string
export type Paise = number

export interface BaseEntity {
  id: EntityId
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export type ThemePreference = 'system' | 'light' | 'dark'

export type AlertRuleType =
  | 'budget'
  | 'loan-due'
  | 'loan-payment-mismatch'
  | 'insurance-due'
  | 'recurring-due'
  | 'cash-flow-risk'
  | 'import-duplicates'
  | 'stale-investment'
  | 'goal-contribution'
  | 'emergency-fund'
  | 'income-missing'
  | 'large-expense'
  | 'backup-due'
  | 'net-worth-change'

export interface SnoozedAlert {
  key: string
  until: ISODateTime
}

export interface AlertHistoryEntry {
  id: EntityId
  key: string
  ruleType: AlertRuleType
  title: string
  detail: string
  action: 'dismissed' | 'snoozed'
  actionAt: ISODateTime
  snoozedUntil: ISODateTime | null
}

export interface UserProfile extends BaseEntity {
  name: string
  locale: 'en-IN'
  currency: 'INR'
  monthlyIncomePaise: Paise
  essentialMonthlyPaise: Paise
  payDay: number
  emergencyFundMonths: number
}

export interface AppSettings extends BaseEntity {
  theme: ThemePreference
  autoLockMinutes: number
  dateFormat: 'dd/MM/yyyy' | 'dd MMM yyyy'
  notificationLeadDays: number
  notificationsEnabled: boolean
  quietHoursStart: string
  quietHoursEnd: string
  androidBackupEnabled: boolean
  lastSystemSnapshotAt: ISODateTime | null
  lastManualBackupAt: ISODateTime | null
  dismissedAlertKeys: string[]
  snoozedAlerts: SnoozedAlert[]
  alertHistory: AlertHistoryEntry[]
  disabledAlertRules: AlertRuleType[]
  budgetWarningPercent: number
  largeExpenseMultiplier: number
  cashFlowFloorPaise: Paise
}

export type AccountType =
  | 'cash'
  | 'savings'
  | 'current'
  | 'credit-card'
  | 'loan'
  | 'investment'
  | 'retirement'
  | 'other'

export interface Account extends BaseEntity {
  name: string
  institution: string
  type: AccountType
  openingBalancePaise: Paise
  includeInNetWorth: boolean
  archived: boolean
}

export type CategoryKind = 'income' | 'expense'

export interface Category extends BaseEntity {
  name: string
  kind: CategoryKind
  parentId: EntityId | null
  essential: boolean
  color: string
  system: boolean
  archived: boolean
}

export type TransactionKind = 'income' | 'expense' | 'transfer' | 'adjustment'

export interface TransactionSplit {
  id: EntityId
  categoryId: EntityId
  amountPaise: Paise
}

export interface Transaction extends BaseEntity {
  accountId: EntityId
  destinationAccountId: EntityId | null
  categoryId: EntityId | null
  kind: TransactionKind
  amountPaise: Paise
  date: ISODate
  description: string
  note: string
  tags: string[]
  cleared: boolean
  splits: TransactionSplit[]
  recurringRuleId: EntityId | null
  importBatchId: EntityId | null
}

export type RecurrenceFrequency =
  'weekly' | 'monthly' | 'quarterly' | 'half-yearly' | 'yearly'

export interface RecurringRule extends BaseEntity {
  name: string
  kind: 'income' | 'expense' | 'transfer'
  amountPaise: Paise
  accountId: EntityId
  destinationAccountId: EntityId | null
  categoryId: EntityId | null
  frequency: RecurrenceFrequency
  startDate: ISODate
  nextDate: ISODate
  endDate: ISODate | null
  reminderDays: number
  active: boolean
}

export interface Budget extends BaseEntity {
  name: string
  categoryId: EntityId
  monthlyLimitPaise: Paise
  rollover: boolean
  active: boolean
}

export type AssetKind = 'asset' | 'liability'
export type AssetType =
  | 'property'
  | 'vehicle'
  | 'gold'
  | 'fixed-deposit'
  | 'provident-fund'
  | 'receivable'
  | 'other'

export interface Asset extends BaseEntity {
  name: string
  kind: AssetKind
  type: AssetType
  valuePaise: Paise
  valuationDate: ISODate
  includeInNetWorth: boolean
  note: string
}

export type InterestType = 'reducing' | 'flat'

export interface LoanRateChange {
  id: EntityId
  effectiveDate: ISODate
  annualInterestRateBps: number
}

export interface LoanPayment {
  id: EntityId
  date: ISODate
  amountPaise: Paise
  principalPaise: Paise
  interestPaise: Paise
  prepaymentPaise: Paise
  transactionId: EntityId | null
  note: string
}

export interface Loan extends BaseEntity {
  name: string
  lender: string
  accountId: EntityId | null
  principalPaise: Paise
  outstandingPaise: Paise
  annualInterestRateBps: number
  interestType: InterestType
  termMonths: number
  emiPaise: Paise
  startDate: ISODate
  nextPaymentDate: ISODate
  paymentDay: number
  prepaymentPaise: Paise
  rateChanges: LoanRateChange[]
  payments: LoanPayment[]
  active: boolean
}

export type InvestmentType =
  | 'equity'
  | 'mutual-fund'
  | 'etf'
  | 'bond'
  | 'ppf'
  | 'epf'
  | 'nps'
  | 'gold'
  | 'fixed-deposit'
  | 'other'

export interface InvestmentActivity {
  id: EntityId
  date: ISODate
  type: 'buy' | 'sell' | 'contribution' | 'withdrawal' | 'dividend'
  units: string
  amountPaise: Paise
  pricePaise: Paise
  note: string
}

export interface InvestmentPrice {
  id: EntityId
  date: ISODate
  pricePaise: Paise
}

export interface InvestmentHolding extends BaseEntity {
  accountId: EntityId | null
  name: string
  symbol: string
  type: InvestmentType
  units: string
  averageCostPaise: Paise
  currentPricePaise: Paise
  priceDate: ISODate
  investedPaise: Paise
  activities: InvestmentActivity[]
  priceHistory: InvestmentPrice[]
  includeInNetWorth: boolean
}

export type InsuranceType =
  'term-life' | 'health' | 'vehicle' | 'home' | 'personal-accident' | 'other'

export interface InsurancePolicy extends BaseEntity {
  type: InsuranceType
  insurer: string
  policyName: string
  policyNumber: string
  sumAssuredPaise: Paise
  premiumPaise: Paise
  premiumFrequency: RecurrenceFrequency
  startDate: ISODate
  endDate: ISODate | null
  nextPremiumDate: ISODate
  renewalDate: ISODate | null
  maturityDate: ISODate | null
  nomineeName: string
  nomineeRelation: string
  contact: string
  note: string
  attachmentIds: EntityId[]
  active: boolean
}

export interface Goal extends BaseEntity {
  name: string
  targetPaise: Paise
  currentPaise: Paise
  targetDate: ISODate
  priority: 'high' | 'medium' | 'low'
  linkedAccountId: EntityId | null
  plannedMonthlyPaise: Paise
  archived: boolean
}

export interface ImportBatch extends BaseEntity {
  filename: string
  importedAt: ISODateTime
  rowCount: number
  createdTransactionIds: EntityId[]
  duplicateCount: number
  rolledBackAt: ISODateTime | null
}

export interface NetWorthSnapshot extends BaseEntity {
  date: ISODate
  cashPaise: Paise
  investmentPaise: Paise
  assetPaise: Paise
  debtPaise: Paise
  totalPaise: Paise
}

export interface AttachmentMeta {
  id: EntityId
  ownerType: 'insurance'
  ownerId: EntityId
  filename: string
  mimeType: string
  size: number
  contentHash: string
  createdAt: ISODateTime
}

export type AlertSeverity = 'info' | 'warning' | 'critical'

export interface FinanceAlert {
  key: string
  ruleType: AlertRuleType
  title: string
  detail: string
  severity: AlertSeverity
  dueDate: ISODate | null
  route: string
  evidence: string
}

export interface FinanceData {
  profiles: UserProfile[]
  settings: AppSettings[]
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[]
  recurringRules: RecurringRule[]
  budgets: Budget[]
  assets: Asset[]
  loans: Loan[]
  investments: InvestmentHolding[]
  insurancePolicies: InsurancePolicy[]
  goals: Goal[]
  importBatches: ImportBatch[]
  netWorthSnapshots: NetWorthSnapshot[]
}

export type CollectionName = keyof FinanceData
export type FinanceEntity = FinanceData[CollectionName][number]

export interface DateRange {
  start: ISODate
  end: ISODate
}
