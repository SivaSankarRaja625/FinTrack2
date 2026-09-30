import { describe, expect, it } from 'vitest'

import { resolveGoalFunding, validateGoalFunding } from './goals'
import type { Goal } from './types'
import { timestamp } from '../test/fixtures'

const goal: Goal = {
  id: 'laptop',
  name: 'Laptop',
  targetPaise: 9_000_000,
  currentPaise: 0,
  targetDate: '2027-03-30',
  priority: 'medium',
  linkedAccountId: 'savings',
  plannedMonthlyPaise: 500_000,
  archived: false,
  createdAt: timestamp,
  updatedAt: timestamp,
}

describe('goal funding', () => {
  it('shares one bank account through explicit allocations and an unallocated-balance goal', () => {
    const allocated = {
      ...goal,
      id: 'holiday',
      fundingMode: 'allocation' as const,
      currentPaise: 2_800_000,
    }
    const resolved = resolveGoalFunding(
      [goal, allocated],
      new Map([['savings', 5_600_000]]),
    )
    expect(resolved.map((item) => item.currentPaise)).toEqual([2_800_000, 2_800_000])
    expect(resolved.every((item) => item.fundingWarning === null)).toBe(true)
    const afterSpending = resolveGoalFunding(
      [goal, allocated],
      new Map([['savings', 2_000_000]]),
    )
    expect(afterSpending.map((item) => item.currentPaise)).toEqual([0, 2_000_000])
  })

  it('marks legacy duplicate links unresolved rather than duplicating cash or inventing allocations', () => {
    const resolved = resolveGoalFunding(
      [goal, { ...goal, id: 'holiday' }],
      new Map([['savings', 5_600_000]]),
    )
    expect(resolved.map((item) => item.currentPaise)).toEqual([0, 0])
    expect(resolved.every((item) => item.fundingWarning)).toBe(true)
  })
  it('retains a sole account-following goal and explicit manual allocations', () => {
    const resolved = resolveGoalFunding(
      [goal, { ...goal, id: 'manual', linkedAccountId: null, currentPaise: 200_000 }],
      new Map([['savings', 5_600_000]]),
    )
    expect(resolved.map((item) => item.currentPaise)).toEqual([5_600_000, 200_000])
    expect(() => validateGoalFunding({ ...goal, id: 'new' }, [goal])).toThrow(
      'already funds',
    )
    expect(() => validateGoalFunding(goal, [goal])).not.toThrow()
    expect(() =>
      validateGoalFunding({ ...goal, id: 'new', archived: true }, [goal]),
    ).not.toThrow()
  })
})
