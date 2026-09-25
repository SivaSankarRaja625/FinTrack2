import { entityTimestamps, newId } from './id'
import type { AppSettings, Category, FinanceData } from './types'

const colors = {
  income: '#137547',
  housing: '#7f56d9',
  food: '#d97706',
  transport: '#2563eb',
  health: '#dc2626',
  lifestyle: '#db2777',
  finance: '#0f766e',
  other: '#64748b',
}

export function createDefaultCategories(): Category[] {
  const definitions: Array<Pick<Category, 'name' | 'kind' | 'essential' | 'color'>> = [
    { name: 'Salary', kind: 'income', essential: false, color: colors.income },
    { name: 'Other income', kind: 'income', essential: false, color: colors.income },
    { name: 'Housing', kind: 'expense', essential: true, color: colors.housing },
    { name: 'Groceries', kind: 'expense', essential: true, color: colors.food },
    { name: 'Dining', kind: 'expense', essential: false, color: colors.food },
    { name: 'Transport', kind: 'expense', essential: true, color: colors.transport },
    { name: 'Healthcare', kind: 'expense', essential: true, color: colors.health },
    { name: 'Utilities', kind: 'expense', essential: true, color: colors.housing },
    { name: 'Insurance', kind: 'expense', essential: true, color: colors.finance },
    { name: 'Loan payment', kind: 'expense', essential: true, color: colors.finance },
    { name: 'Shopping', kind: 'expense', essential: false, color: colors.lifestyle },
    { name: 'Entertainment', kind: 'expense', essential: false, color: colors.lifestyle },
    { name: 'Other expense', kind: 'expense', essential: false, color: colors.other },
  ]

  return definitions.map((definition) => ({
    id: newId(),
    ...definition,
    parentId: null,
    system: true,
    archived: false,
    ...entityTimestamps(),
  }))
}

export function createDefaultSettings(): AppSettings {
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
    lastManualBackupAt: null,
    dismissedAlertKeys: [],
    snoozedAlerts: [],
    alertHistory: [],
    disabledAlertRules: [],
    budgetWarningPercent: 80,
    largeExpenseMultiplier: 2,
    cashFlowFloorPaise: 0,
    ...entityTimestamps(),
  }
}

export function emptyFinanceData(): FinanceData {
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
  }
}
