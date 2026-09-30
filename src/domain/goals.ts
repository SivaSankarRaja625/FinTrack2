import type { Goal, Paise } from './types'
import { sumPaise } from './money'

interface FundedGoal extends Goal {
  fundingWarning: string | null
  allocationShortfallPaise: Paise
}

export function resolveGoalFunding(
  goals: readonly Goal[],
  balances: ReadonlyMap<string, Paise>,
) {
  const active = goals.filter((goal) => !goal.archived)
  const result = new Map<string, FundedGoal>(
    active.map((goal) => [
      goal.id,
      {
        ...goal,
        currentPaise: goal.linkedAccountId ? 0 : goal.currentPaise,
        fundingWarning: null,
        allocationShortfallPaise: 0,
      },
    ]),
  )
  const priority = { high: 0, medium: 1, low: 2 }
  for (const accountId of new Set(
    active.map((goal) => goal.linkedAccountId).filter((id): id is string => id !== null),
  )) {
    const group = active.filter((goal) => goal.linkedAccountId === accountId)
    let available = Math.max(0, balances.get(accountId) ?? 0)
    const allocations = group
      .filter((goal) => goal.fundingMode === 'allocation')
      .sort(
        (a, b) =>
          priority[a.priority] - priority[b.priority] ||
          a.createdAt.localeCompare(b.createdAt) ||
          a.id.localeCompare(b.id),
      )
    for (const goal of allocations) {
      const funded = Math.min(available, goal.currentPaise)
      available -= funded
      result.set(goal.id, {
        ...goal,
        currentPaise: funded,
        fundingWarning: null,
        allocationShortfallPaise: goal.currentPaise - funded,
      })
    }
    const followers = group.filter((goal) => goal.fundingMode !== 'allocation')
    for (const goal of followers)
      result.set(goal.id, {
        ...goal,
        currentPaise: followers.length === 1 ? available : 0,
        fundingWarning:
          followers.length > 1
            ? 'Multiple goals follow this account balance. Set fixed allocations or keep only one goal following the unallocated balance.'
            : null,
        allocationShortfallPaise: 0,
      })
  }
  return active.map((goal) => result.get(goal.id)!)
}

export function validateGoalFunding(
  goal: Goal,
  goals: readonly Goal[],
  balances?: ReadonlyMap<string, Paise>,
) {
  if (
    !goal.archived &&
    goal.linkedAccountId &&
    goal.fundingMode !== 'allocation' &&
    goals.some(
      (other) =>
        other.id !== goal.id &&
        !other.archived &&
        other.fundingMode !== 'allocation' &&
        other.linkedAccountId === goal.linkedAccountId,
    )
  ) {
    throw new Error(
      'This account already funds another balance-following goal. Choose a fixed allocation to share it without counting the same cash twice.',
    )
  }
  const previous = goals.find((item) => item.id === goal.id)
  if (
    !goal.archived &&
    goal.linkedAccountId &&
    goal.fundingMode === 'allocation' &&
    balances &&
    !(
      previous &&
      !previous.archived &&
      previous.linkedAccountId === goal.linkedAccountId &&
      previous.fundingMode === 'allocation' &&
      goal.currentPaise <= previous.currentPaise
    )
  ) {
    const total = sumPaise([
      goal.currentPaise,
      ...goals
        .filter(
          (item) =>
            item.id !== goal.id &&
            !item.archived &&
            item.linkedAccountId === goal.linkedAccountId &&
            item.fundingMode === 'allocation',
        )
        .map((item) => item.currentPaise),
    ])
    if (total > Math.max(0, balances.get(goal.linkedAccountId) ?? 0))
      throw new Error(
        'Fixed goal allocations exceed the available account balance. Reduce the allocation or choose another account.',
      )
  }
}
