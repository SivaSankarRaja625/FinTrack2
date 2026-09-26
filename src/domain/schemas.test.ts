import { describe, expect, it } from 'vitest'

import { account, settings, transaction } from '../test/fixtures'
import {
  accountSchema,
  appSettingsSchema,
  insurancePolicySchema,
  investmentSchema,
  transactionSchema,
} from './schemas'

describe('transaction schema', () => {
  it('rejects an unbalanced split', () => {
    const result = transactionSchema.safeParse(
      transaction({
        amountPaise: 10_000,
        splits: [{ id: 'split', categoryId: 'food', amountPaise: 9_000 }],
      }),
    )
    expect(result.success).toBe(false)
  })

  it('requires a destination for transfers', () => {
    const result = transactionSchema.safeParse(
      transaction({ kind: 'transfer', destinationAccountId: null }),
    )
    expect(result.success).toBe(false)
  })
})

describe('credit card account schema', () => {
  const details = {
    lastFour: '0042',
    creditLimitPaise: 10_000_000,
    statementDay: 20,
    paymentDueDay: 9,
  }
  const card = account({
    type: 'credit-card',
    openingBalancePaise: -2_500_000,
    creditCardDetails: details,
  })

  it('keeps old accounts valid and preserves the new card details', () => {
    expect(accountSchema.parse(account())).toEqual(account())
    expect(accountSchema.parse(card).creditCardDetails).toEqual(details)
  })

  it('rejects invalid card digits, limits and cycle days', () => {
    for (const lastFour of ['123', '12345', 'abcd']) {
      expect(
        accountSchema.safeParse({
          ...card,
          creditCardDetails: { ...details, lastFour },
        }).success,
      ).toBe(false)
    }
    for (const creditLimitPaise of [0, -1]) {
      expect(
        accountSchema.safeParse({
          ...card,
          creditCardDetails: { ...details, creditLimitPaise },
        }).success,
      ).toBe(false)
    }
    for (const paymentDueDay of [0, 32, 1.5]) {
      expect(
        accountSchema.safeParse({
          ...card,
          creditCardDetails: { ...details, paymentDueDay },
        }).success,
      ).toBe(false)
    }
    for (const statementDay of [0, 32, 1.5]) {
      expect(
        accountSchema.safeParse({
          ...card,
          creditCardDetails: { ...details, statementDay },
        }).success,
      ).toBe(false)
    }
    expect(accountSchema.safeParse({ ...card, type: 'savings' }).success).toBe(false)
  })
})

describe('protection and reserve record compatibility', () => {
  it('retains encrypted reminder deduplication keys without requiring them on old settings', () => {
    expect(appSettingsSchema.parse(settings())).toEqual(settings())
    const updated = settings({
      notificationCatchUps: ['insurance:policy:2026-09-25'],
    })
    expect(appSettingsSchema.parse(updated).notificationCatchUps).toEqual(
      updated.notificationCatchUps,
    )
  })

  it('keeps an old account valid but rejects a malformed current card statement', () => {
    const old = account()
    expect(accountSchema.parse(old)).toEqual(old)
    const withStatement = {
      ...old,
      type: 'credit-card',
      creditCardDetails: {
        lastFour: null,
        creditLimitPaise: null,
        statementDay: null,
        paymentDueDay: null,
        statement: {
          date: '2026-09-01',
          dueDate: '2026-09-25',
          totalPaise: 10_000,
          minimumPaise: 1_000,
          paidPaise: 2_000,
        },
      },
    }
    expect(accountSchema.parse(withStatement).creditCardDetails?.statement).toEqual(
      withStatement.creditCardDetails.statement,
    )
    expect(
      accountSchema.safeParse({
        ...withStatement,
        creditCardDetails: {
          ...withStatement.creditCardDetails,
          statement: { ...withStatement.creditCardDetails.statement, paidPaise: -1 },
        },
      }).success,
    ).toBe(false)
  })

  it('accepts old policies and validates optional insured-person details', () => {
    const old = {
      id: 'policy',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      type: 'health',
      insurer: 'Example',
      policyName: 'Health',
      policyNumber: '',
      sumAssuredPaise: 100_000,
      premiumPaise: 1_000,
      premiumFrequency: 'yearly',
      startDate: '2026-01-01',
      endDate: null,
      nextPremiumDate: '2027-01-01',
      renewalDate: null,
      maturityDate: null,
      nomineeName: '',
      nomineeRelation: '',
      contact: '',
      note: '',
      attachmentIds: [],
      active: true,
    }
    expect(insurancePolicySchema.parse(old)).toEqual(old)
    const coverage = {
      source: 'personal',
      insuredPeople: ['Ananya'],
      layer: 'base',
      deductiblePaise: 0,
      coPayPercent: null,
      restrictions: '',
      claimContact: '',
      premiumPaidForDate: null,
      renewalConfirmedForDate: null,
      reminderDays: [30, 7, 1, 0],
    }
    expect(insurancePolicySchema.parse({ ...old, coverage }).coverage).toEqual(coverage)
    expect(
      insurancePolicySchema.safeParse({
        ...old,
        coverage: { ...coverage, coPayPercent: 150 },
      }).success,
    ).toBe(false)
  })

  it('requires explicit eligible instruments for an emergency holding', () => {
    const holding = {
      id: 'holding',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      accountId: null,
      name: 'Liquid fund',
      symbol: '',
      type: 'mutual-fund',
      units: '1',
      averageCostPaise: 100,
      currentPricePaise: 100,
      priceDate: '2026-09-01',
      investedPaise: 100,
      activities: [],
      priceHistory: [],
      includeInNetWorth: true,
      reserveAccess: {
        instrument: 'liquid-fund',
        accessDays: 2,
        lockedUntil: null,
      },
    }
    expect(investmentSchema.parse(holding).reserveAccess).toEqual(holding.reserveAccess)
    expect(investmentSchema.safeParse({ ...holding, type: 'equity' }).success).toBe(false)
  })
})
