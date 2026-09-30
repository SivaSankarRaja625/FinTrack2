import { describe, expect, it } from 'vitest'

import {
  calculateAccountBalances,
  calculateNetWorth,
  calculateMonthlySummary,
  calculateBudgetStatuses,
  calculateCashFlowForecast,
} from './calculations'
import { applyFinancialCommand, undoFinancialEvent } from './financial-events'
import { account, financeData, loan, timestamp, transaction } from '../test/fixtures'
import type { Asset, InvestmentHolding } from './types'

const baseCommand = { id: 'event-1', timestamp, date: '2026-09-24', note: '' }
const cash = { mode: 'new' as const, accountId: 'account-1', categoryId: null }

describe('linked financial events', () => {
  it('posts a recurring transfer without an income category or a change in net worth', () => {
    const data = financeData({
      accounts: [
        account({ openingBalancePaise: 500_000 }),
        account({ id: 'reserve', openingBalancePaise: 0 }),
      ],
      categories: [
        {
          id: 'income',
          name: 'Other income',
          kind: 'income',
          parentId: null,
          essential: false,
          color: '#000000',
          system: true,
          archived: false,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      recurringRules: [
        {
          id: 'sweep',
          name: 'Reserve transfer',
          kind: 'transfer',
          amountPaise: 150_000,
          accountId: 'account-1',
          destinationAccountId: 'reserve',
          categoryId: null,
          frequency: 'monthly',
          startDate: '2026-09-01',
          nextDate: '2026-09-24',
          endDate: null,
          reminderDays: 3,
          active: true,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
    })
    const next = applyFinancialCommand(data, {
      ...baseCommand,
      kind: 'recurring',
      sourceId: 'sweep',
      occurrenceDate: '2026-09-24',
      cash: { ...cash, categoryId: 'income' },
    })
    expect(next.transactions[0]).toMatchObject({
      kind: 'transfer',
      categoryId: null,
      destinationAccountId: 'reserve',
    })
    expect(
      calculateAccountBalances(next.accounts, next.transactions).get('account-1'),
    ).toBe(350_000)
    expect(
      calculateAccountBalances(next.accounts, next.transactions).get('reserve'),
    ).toBe(150_000)
    expect(calculateNetWorth(next).totalPaise).toBe(500_000)
  })
  it('keeps a partially paid EMI due and advances it only when the regular portions add up', () => {
    const data = financeData({
      accounts: [account({ openingBalancePaise: 1_000_000 })],
      loans: [
        loan({
          principalPaise: 1_000_000,
          outstandingPaise: 1_000_000,
          emiPaise: 100_000,
          annualInterestRateBps: 1200,
          termMonths: 12,
          nextPaymentDate: '2026-10-05',
        }),
      ],
    })
    const first = applyFinancialCommand(data, {
      ...baseCommand,
      kind: 'loan-payment',
      sourceId: 'loan-1',
      principalPaise: 40_000,
      interestPaise: 10_000,
      prepaymentPaise: 0,
      cash,
    })
    expect(first.loans[0]?.nextPaymentDate).toBe('2026-10-05')
    expect(
      calculateCashFlowForecast({
        ...first,
        startDate: '2026-09-24',
        endDate: '2026-10-10',
      }).events[0]?.amountPaise,
    ).toBe(-50_000)
    const second = applyFinancialCommand(first, {
      ...baseCommand,
      id: 'second-part',
      kind: 'loan-payment',
      sourceId: 'loan-1',
      principalPaise: 50_000,
      interestPaise: 0,
      prepaymentPaise: 0,
      cash: { ...cash, allowDuplicate: true },
    })
    expect(second.loans[0]?.nextPaymentDate).toBe('2026-11-05')
    expect(second.loans[0]?.outstandingPaise).toBe(910_000)
    expect(
      calculateAccountBalances(second.accounts, second.transactions).get('account-1'),
    ).toBe(900_000)
  })

  it('clears deposit carrying value and separates maturity capital from actual cash interest', () => {
    const deposit: Asset = {
      id: 'deposit',
      name: 'Bank deposit',
      kind: 'asset',
      type: 'fixed-deposit',
      valuePaise: 11_000_000,
      valuationDate: '2026-09-01',
      includeInNetWorth: true,
      note: '',
      createdAt: timestamp,
      updatedAt: timestamp,
      deposit: {
        principalPaise: 10_000_000,
        maturityDate: '2026-09-24',
        maturityAmountPaise: 11_200_000,
        maturityInstruction: 'payout',
        cashAccountId: 'account-1',
        interestFrequency: 'at-maturity',
        interestPaise: 0,
        nextInterestDate: null,
        paidInterestDates: [],
        status: 'active',
      },
    }
    const data = financeData({
      accounts: [account({ openingBalancePaise: 2_000_000 })],
      assets: [deposit],
    })
    const next = applyFinancialCommand(data, {
      ...baseCommand,
      kind: 'deposit-maturity',
      sourceId: deposit.id,
      amountPaise: 11_200_000,
      cash,
    })
    expect(next.assets[0]?.valuePaise).toBe(0)
    expect(next.assets[0]?.deposit?.status).toBe('matured')
    expect(calculateNetWorth(next).totalPaise).toBe(13_200_000)
    expect(next.transactions.map((item) => [item.kind, item.amountPaise])).toEqual([
      ['adjustment', 10_000_000],
      ['income', 1_200_000],
    ])
    expect(undoFinancialEvent(next, 'event-1', timestamp).assets[0]?.valuePaise).toBe(
      11_000_000,
    )
    const forecast = { ...data, startDate: '2026-09-01', endDate: '2026-09-30' }
    expect(calculateCashFlowForecast(forecast).endingBalancePaise).toBe(13_200_000)
    expect(
      calculateCashFlowForecast({
        ...forecast,
        assets: [
          { ...deposit, deposit: { ...deposit.deposit!, maturityInstruction: 'renew' } },
        ],
      }).endingBalancePaise,
    ).toBe(2_000_000)
  })

  it('only posts the next unpaid deposit interest date and rejects an invented date', () => {
    const deposit: Asset = {
      id: 'deposit',
      name: 'Bank deposit',
      kind: 'asset',
      type: 'fixed-deposit',
      valuePaise: 100_000,
      valuationDate: '2026-09-01',
      includeInNetWorth: true,
      note: '',
      createdAt: timestamp,
      updatedAt: timestamp,
      deposit: {
        principalPaise: 100_000,
        maturityDate: '2027-09-24',
        maturityAmountPaise: 100_000,
        maturityInstruction: 'unknown',
        cashAccountId: 'account-1',
        interestFrequency: 'monthly',
        interestPaise: 1_000,
        nextInterestDate: '2026-09-24',
        paidInterestDates: [],
        status: 'active',
      },
    }
    const data = financeData({ accounts: [account()], assets: [deposit] })
    const command = {
      ...baseCommand,
      kind: 'deposit-interest' as const,
      sourceId: 'deposit',
      amountPaise: 1_000,
      occurrenceDate: '2026-09-24',
      cash,
    }
    expect(() =>
      applyFinancialCommand(data, { ...command, occurrenceDate: '2026-09-25' }),
    ).toThrow('scheduled')
    const next = applyFinancialCommand(data, command)
    expect(
      calculateAccountBalances(next.accounts, next.transactions).get('account-1'),
    ).toBe(101_000)
    expect(next.assets[0]?.valuePaise).toBe(100_000)
    expect(() => applyFinancialCommand(next, { ...command, id: 'duplicate' })).toThrow()
  })
  it('offsets reimbursed split expenses in the receipt period and caps total reimbursement', () => {
    const original = transaction({
      amountPaise: 25_000,
      date: '2026-08-31',
      splits: [
        { id: 'a', categoryId: 'food', amountPaise: 10_000 },
        { id: 'b', categoryId: 'food', amountPaise: 5_000 },
        { id: 'c', categoryId: 'travel', amountPaise: 10_000 },
      ],
    })
    const data = financeData({ accounts: [account()], transactions: [original] })
    const next = applyFinancialCommand(data, {
      ...baseCommand,
      kind: 'reimbursement',
      sourceId: original.id,
      amountPaise: 10_000,
      cash,
    })
    const refund = next.transactions.find((item) => item.reimbursementOf === original.id)!
    expect(refund.splits.map((item) => [item.categoryId, item.amountPaise])).toEqual([
      ['food', 6_000],
      ['travel', 4_000],
    ])
    expect(
      calculateMonthlySummary(next.transactions, [], {
        start: '2026-09-01',
        end: '2026-09-30',
      }),
    ).toMatchObject({ incomePaise: 0, expensePaise: -10_000, netPaise: 10_000 })
    expect(
      calculateMonthlySummary(next.transactions, [], {
        start: '2026-08-01',
        end: '2026-08-31',
      }).expensePaise,
    ).toBe(25_000)
    const budget = {
      id: 'budget',
      name: 'Food',
      categoryId: 'food',
      monthlyLimitPaise: 10_000,
      rollover: false,
      active: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    expect(
      calculateBudgetStatuses([budget], next.transactions, {
        start: '2026-09-01',
        end: '2026-09-30',
      })[0]?.spentPaise,
    ).toBe(-6_000)
    const fullyRefunded = applyFinancialCommand(next, {
      ...baseCommand,
      id: 'remaining',
      kind: 'reimbursement',
      sourceId: original.id,
      amountPaise: 15_000,
      cash,
    })
    expect(() =>
      applyFinancialCommand(fullyRefunded, {
        ...baseCommand,
        id: 'excess',
        kind: 'reimbursement',
        sourceId: original.id,
        amountPaise: 1,
        cash,
      }),
    ).toThrow('exceed')
    expect(
      calculateAccountBalances(fullyRefunded.accounts, fullyRefunded.transactions).get(
        'account-1',
      ),
    ).toBe(100_000)
  })

  it('posts loan cash and principal together, rejects excess principal and undoes the whole event', () => {
    const data = financeData({
      accounts: [account({ openingBalancePaise: 9_000_000 })],
      loans: [loan({ outstandingPaise: 10_000_000 })],
    })
    const command = {
      ...baseCommand,
      kind: 'loan-payment' as const,
      sourceId: 'loan-1',
      principalPaise: 400_000,
      interestPaise: 100_000,
      prepaymentPaise: 500_000,
      cash,
    }
    const next = applyFinancialCommand(data, command)
    expect(next.loans[0]?.outstandingPaise).toBe(9_100_000)
    expect(
      calculateAccountBalances(next.accounts, next.transactions).get('account-1'),
    ).toBe(8_000_000)
    expect(calculateNetWorth(next).totalPaise).toBe(-1_100_000)
    expect(() => applyFinancialCommand(next, command)).toThrow('already')
    expect(() =>
      applyFinancialCommand(next, { ...command, id: 'another-click' }),
    ).toThrow('similar cash entry')
    expect(() =>
      applyFinancialCommand(next, {
        ...command,
        id: 'excess',
        principalPaise: 9_200_000,
      }),
    ).toThrow('exceed')
    const restored = undoFinancialEvent(next, 'event-1', timestamp)
    expect(restored.loans[0]?.outstandingPaise).toBe(10_000_000)
    expect(restored.transactions).toHaveLength(0)
  })

  it('matches a bank-posted payment without posting cash twice and restores the original on undo', () => {
    const existing = transaction({
      id: 'bank-payment',
      amountPaise: 1_000_000,
      date: '2026-09-25',
    })
    const data = financeData({
      accounts: [account({ openingBalancePaise: 9_000_000 })],
      transactions: [existing],
      loans: [loan()],
    })
    expect(() =>
      applyFinancialCommand(
        { ...data, transactions: [{ ...existing, description: 'A different payment' }] },
        {
          ...baseCommand,
          kind: 'loan-payment',
          sourceId: 'loan-1',
          principalPaise: 900_000,
          interestPaise: 100_000,
          prepaymentPaise: 0,
          cash: { mode: 'match', transactionId: existing.id, expected: existing },
        },
      ),
    ).toThrow('changed')
    expect(() =>
      applyFinancialCommand(data, {
        ...baseCommand,
        kind: 'loan-payment',
        sourceId: 'loan-1',
        principalPaise: 900_000,
        interestPaise: 100_000,
        prepaymentPaise: 0,
        cash,
      }),
    ).toThrow('similar cash entry')
    const next = applyFinancialCommand(data, {
      ...baseCommand,
      kind: 'loan-payment',
      sourceId: 'loan-1',
      principalPaise: 900_000,
      interestPaise: 100_000,
      prepaymentPaise: 0,
      cash: { mode: 'match', transactionId: 'bank-payment', expected: existing },
    })
    expect(next.transactions).toHaveLength(1)
    expect(
      calculateAccountBalances(next.accounts, next.transactions).get('account-1'),
    ).toBe(8_000_000)
    expect(undoFinancialEvent(next, 'event-1', timestamp).transactions).toEqual([
      existing,
    ])
  })

  it('keeps net worth unchanged when buying at the recorded price and never erases a later price edit on undo', () => {
    const holding: InvestmentHolding = {
      id: 'holding',
      accountId: null,
      name: 'Index fund',
      symbol: '',
      type: 'mutual-fund',
      units: '1000',
      averageCostPaise: 10_000,
      currentPricePaise: 10_000,
      priceDate: '2026-09-24',
      investedPaise: 10_000_000,
      activities: [],
      priceHistory: [],
      includeInNetWorth: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    const data = financeData({
      accounts: [account({ openingBalancePaise: 25_000_000 })],
      investments: [holding],
    })
    const next = applyFinancialCommand(data, {
      ...baseCommand,
      kind: 'investment-activity',
      sourceId: 'holding',
      activityType: 'buy',
      units: '200',
      amountPaise: 2_000_000,
      pricePaise: 10_000,
      cash,
    })
    expect(calculateNetWorth(next).totalPaise).toBe(35_000_000)
    expect(next.investments[0]?.units).toBe('1200')
    const repriced = {
      ...next,
      investments: [{ ...next.investments[0]!, currentPricePaise: 12_000 }],
    }
    const undone = undoFinancialEvent(repriced, 'event-1', timestamp)
    expect(undone.investments[0]?.units).toBe('1000')
    expect(undone.investments[0]?.currentPricePaise).toBe(12_000)
    expect(
      calculateAccountBalances(undone.accounts, undone.transactions).get('account-1'),
    ).toBe(25_000_000)
  })

  it('reduces a receivable by the cash collected and rejects excess settlement', () => {
    const data = financeData({
      accounts: [account()],
      assets: [
        {
          id: 'invoice',
          name: 'Invoice',
          kind: 'asset',
          type: 'receivable',
          valuePaise: 4_500_000,
          valuationDate: '2026-09-01',
          includeInNetWorth: true,
          note: '',
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
    })
    const command = {
      ...baseCommand,
      kind: 'receivable' as const,
      sourceId: 'invoice',
      amountPaise: 1_500_000,
      cash,
    }
    const next = applyFinancialCommand(data, command)
    expect(next.assets[0]?.valuePaise).toBe(3_000_000)
    expect(calculateNetWorth(next).totalPaise).toBe(4_600_000)
    expect(() =>
      applyFinancialCommand(next, { ...command, id: 'too-much', amountPaise: 3_000_001 }),
    ).toThrow('exceed')
  })

  it('refuses to undo a source state modified after the posting', () => {
    const data = financeData({ accounts: [account()], loans: [loan()] })
    const next = applyFinancialCommand(data, {
      ...baseCommand,
      kind: 'loan-payment',
      sourceId: 'loan-1',
      principalPaise: 100,
      interestPaise: 1,
      prepaymentPaise: 0,
      cash,
    })
    next.loans[0]!.outstandingPaise -= 1
    expect(() => undoFinancialEvent(next, 'event-1', timestamp)).toThrow('changed')
  })
})
