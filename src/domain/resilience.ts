import Decimal from 'decimal.js'
import { differenceInCalendarDays, format, startOfMonth, subMonths } from 'date-fns'

import { calculateAccountBalances } from './calculations'
import { assertPaise, multiplyMoney } from './money'
import type { FinanceData, UserProfile } from './types'

export function calculateEmergencyReserve(
  data: FinanceData,
  profile: UserProfile,
  now: Date,
): {
  immediatePaise: number
  secondaryPaise: number
  targetPaise: number
  designated: boolean
  exclusions: string[]
} {
  const balances = calculateAccountBalances(data.accounts, data.transactions)
  const linkedGoals = new Map(
    data.goals
      .filter((goal) => !goal.archived && goal.linkedAccountId)
      .map((goal) => [goal.linkedAccountId, goal.name]),
  )
  const liquidAccounts = data.accounts.filter(
    (account) =>
      !account.archived && ['cash', 'savings', 'current'].includes(account.type),
  )
  const exclusions: string[] = []
  const selected = liquidAccounts.filter((account) => account.emergencyReserve)
  const taggedCash = selected.reduce((sum, account) => {
    const goal = linkedGoals.get(account.id)
    if (goal) {
      exclusions.push(`${goal}: linked goal`)
      return sum
    }
    return sum + Math.max(0, balances.get(account.id) ?? 0)
  }, 0)
  const overdrafts = liquidAccounts.reduce(
    (sum, account) => sum + Math.min(0, balances.get(account.id) ?? 0),
    0,
  )
  const immediatePaise = Math.max(0, taggedCash + overdrafts)
  let secondaryPaise = 0
  for (const holding of data.investments) {
    const access = holding.reserveAccess
    if (!access) continue
    const validInstrument =
      access.instrument === 'bank-deposit'
        ? holding.type === 'fixed-deposit'
        : holding.type === 'mutual-fund'
    if (!validInstrument || access.accessDays > 7) {
      exclusions.push(`${holding.name}: access or instrument is not eligible`)
      continue
    }
    if (access.lockedUntil && access.lockedUntil >= format(now, 'yyyy-MM-dd')) {
      exclusions.push(`${holding.name}: funds are locked`)
      continue
    }
    if (holding.priceDate > format(now, 'yyyy-MM-dd')) {
      exclusions.push(`${holding.name}: price date is in the future`)
      continue
    }
    if (differenceInCalendarDays(now, new Date(`${holding.priceDate}T12:00:00`)) > 30) {
      exclusions.push(`${holding.name}: price is stale`)
      continue
    }
    if (holding.accountId && linkedGoals.has(holding.accountId)) {
      exclusions.push(`${holding.name}: linked goal`)
      continue
    }
    if (
      holding.accountId &&
      selected.some((account) => account.id === holding.accountId)
    ) {
      exclusions.push(`${holding.name}: already linked to a designated account`)
      continue
    }
    secondaryPaise += multiplyMoney(holding.currentPricePaise, holding.units)
  }
  assertPaise(immediatePaise)
  assertPaise(secondaryPaise)
  return {
    immediatePaise,
    secondaryPaise,
    targetPaise: multiplyMoney(
      profile.essentialMonthlyPaise,
      profile.emergencyFundMonths,
    ),
    designated:
      selected.length > 0 || data.investments.some((item) => item.reserveAccess),
    exclusions,
  }
}

export function calculateShockScenario(input: {
  availablePaise: number
  monthlyEssentialsPaise: number
  additionalMonthlyPaise: number
  medicalPaise: number
  monthsWithoutIncome: number
}): {
  requiredPaise: number
  shortfallPaise: number
  monthsCovered: number
} {
  const {
    availablePaise,
    monthlyEssentialsPaise,
    additionalMonthlyPaise,
    medicalPaise,
    monthsWithoutIncome,
  } = input
  for (const amount of [
    availablePaise,
    monthlyEssentialsPaise,
    additionalMonthlyPaise,
    medicalPaise,
  ]) {
    assertPaise(amount)
    if (amount < 0) throw new Error('Shock scenario amounts cannot be negative')
  }
  if (
    !Number.isInteger(monthsWithoutIncome) ||
    monthsWithoutIncome < 1 ||
    monthsWithoutIncome > 12
  ) {
    throw new Error('Choose between 1 and 12 months without income')
  }
  const monthlyNeed = monthlyEssentialsPaise + additionalMonthlyPaise
  const requiredPaise = monthlyNeed * monthsWithoutIncome + medicalPaise
  assertPaise(requiredPaise)
  return {
    requiredPaise,
    shortfallPaise: Math.max(0, requiredPaise - availablePaise),
    monthsCovered:
      monthlyNeed === 0
        ? availablePaise >= medicalPaise
          ? monthsWithoutIncome
          : 0
        : new Decimal(Math.max(0, availablePaise - medicalPaise))
            .div(monthlyNeed)
            .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
            .toNumber(),
  }
}

export function estimateEssentialMonthlySpend(data: FinanceData, now: Date): number {
  const periodEnd = format(startOfMonth(now), 'yyyy-MM-dd')
  const periodStart = format(subMonths(startOfMonth(now), 3), 'yyyy-MM-dd')
  const essentialCategories = new Set(
    data.categories
      .filter((category) => category.essential)
      .map((category) => category.id),
  )
  const total = data.transactions
    .filter(
      (transaction) =>
        transaction.kind === 'expense' &&
        transaction.date >= periodStart &&
        transaction.date < periodEnd,
    )
    .reduce(
      (sum, transaction) =>
        sum +
        (transaction.splits.length
          ? transaction.splits
              .filter((split) => essentialCategories.has(split.categoryId))
              .reduce((splitSum, split) => splitSum + split.amountPaise, 0)
          : essentialCategories.has(transaction.categoryId ?? '')
            ? transaction.amountPaise
            : 0),
      0,
    )
  const average = new Decimal(total)
    .div(3)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber()
  assertPaise(average)
  return average
}
