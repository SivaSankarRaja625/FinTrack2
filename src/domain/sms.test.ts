import { describe, expect, it } from 'vitest'

import type { Account, Category, Transaction } from './types'
import {
  parseFinancialSms,
  previewSmsTransactions,
  type RawSmsMessage,
} from './sms'

describe('parseFinancialSms', () => {
  it('parses an HDFC card debit SMS correctly', () => {
    const raw: RawSmsMessage = {
      id: '1',
      address: 'VM-HDFCBK',
      body: 'Spent INR 450.00 on CARD xx1234 at SWIGGY on 24-10-2026. Bal: INR 12,340.',
      dateMs: new Date('2026-10-24T12:30:00Z').getTime(),
    }
    const result = parseFinancialSms(raw)
    expect(result).not.toBeNull()
    expect(result?.amountPaise).toBe(45000)
    expect(result?.kind).toBe('expense')
    expect(result?.rawAccountDigits).toBe('1234')
    expect(result?.merchant).toContain('SWIGGY')
    expect(result?.date).toBe('2026-10-24')
  })

  it('parses an SBI UPI debit SMS correctly', () => {
    const raw: RawSmsMessage = {
      id: '2',
      address: 'AX-SBIUPI',
      body: 'Dear SBI UPI User, A/c ..5678 debited by Rs.150.00 on 24-Oct-26 transfer to Zomato Ref 987654.',
      dateMs: new Date('2026-10-24T13:00:00Z').getTime(),
    }
    const result = parseFinancialSms(raw)
    expect(result).not.toBeNull()
    expect(result?.amountPaise).toBe(15000)
    expect(result?.kind).toBe('expense')
    expect(result?.rawAccountDigits).toBe('5678')
    expect(result?.merchant).toContain('Zomato')
    expect(result?.reference).toBe('987654')
  })

  it('parses an ICICI bank debit SMS correctly', () => {
    const raw: RawSmsMessage = {
      id: '3',
      address: 'VK-ICICIB',
      body: 'A/c *4321 debited for Rs 2,500.00 on 24-Oct-26 by UPI/34523/AMAZON. Avail Bal: Rs 15,200.',
      dateMs: new Date('2026-10-24T14:00:00Z').getTime(),
    }
    const result = parseFinancialSms(raw)
    expect(result).not.toBeNull()
    expect(result?.amountPaise).toBe(250000)
    expect(result?.kind).toBe('expense')
    expect(result?.rawAccountDigits).toBe('4321')
    expect(result?.merchant).toContain('AMAZON')
  })

  it('parses a refund / credit SMS as income', () => {
    const raw: RawSmsMessage = {
      id: '4',
      address: 'VM-HDFCBK',
      body: 'Refund of Rs 250.00 credited to Card xx1234 on 24-10-2026 from SWIGGY.',
      dateMs: new Date('2026-10-24T15:00:00Z').getTime(),
    }
    const result = parseFinancialSms(raw)
    expect(result).not.toBeNull()
    expect(result?.amountPaise).toBe(25000)
    expect(result?.kind).toBe('income')
    expect(result?.rawAccountDigits).toBe('1234')
  })

  it('filters out OTP messages even if amount is present', () => {
    const raw: RawSmsMessage = {
      id: '5',
      address: 'VM-HDFCBK',
      body: 'Your OTP for HDFC Bank NetBanking transaction of Rs 5000 is 492019. Do not share OTP with anyone.',
      dateMs: new Date('2026-10-24T15:30:00Z').getTime(),
    }
    expect(parseFinancialSms(raw)).toBeNull()
  })

  it('filters out non-financial promotional spam', () => {
    const raw: RawSmsMessage = {
      id: '6',
      address: 'BP-LOAN',
      body: 'Pre-approved personal loan up to Rs 5 Lakhs! Click https://example.com to claim.',
      dateMs: new Date('2026-10-24T16:00:00Z').getTime(),
    }
    expect(parseFinancialSms(raw)).toBeNull()
  })
})

describe('previewSmsTransactions', () => {
  const accounts: Account[] = [
    {
      id: 'acc-1',
      name: 'HDFC Credit Card',
      institution: 'HDFC Bank',
      type: 'credit-card',
      openingBalancePaise: 0,
      includeInNetWorth: true,
      archived: false,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      creditCardDetails: {
        lastFour: '1234',
        creditLimitPaise: 10000000,
        statementDay: 1,
        paymentDueDay: 20,
      },
    },
    {
      id: 'acc-2',
      name: 'SBI Savings',
      institution: 'State Bank of India',
      type: 'savings',
      openingBalancePaise: 5000000,
      includeInNetWorth: true,
      archived: false,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ]

  const categories: Category[] = [
    {
      id: 'cat-food',
      name: 'Food & Dining',
      kind: 'expense',
      parentId: null,
      essential: true,
      color: '#f97316',
      system: false,
      archived: false,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ]

  const existingTransactions: Transaction[] = [
    {
      id: 'txn-existing',
      accountId: 'acc-1',
      destinationAccountId: null,
      categoryId: 'cat-food',
      kind: 'expense',
      amountPaise: 45000,
      date: '2026-10-24',
      description: 'SWIGGY',
      note: '',
      tags: [],
      cleared: true,
      splits: [],
      recurringRuleId: null,
      importBatchId: null,
      createdAt: '2026-10-24T12:00:00Z',
      updatedAt: '2026-10-24T12:00:00Z',
    },
  ]

  it('matches account, suggests category, and flags duplicates', () => {
    const messages: RawSmsMessage[] = [
      {
        id: 'msg-1',
        address: 'VM-HDFCBK',
        body: 'Spent INR 450.00 on CARD xx1234 at SWIGGY on 24-10-2026.',
        dateMs: new Date('2026-10-24T12:30:00Z').getTime(),
      },
      {
        id: 'msg-2',
        address: 'VM-HDFCBK',
        body: 'Spent INR 1,200.00 on CARD xx1234 at ZOMATO on 24-10-2026.',
        dateMs: new Date('2026-10-24T13:30:00Z').getTime(),
      },
    ]

    const preview = previewSmsTransactions({
      messages,
      accounts,
      categories,
      existingTransactions,
    })

    expect(preview).toHaveLength(2)

    // First one matches existing transaction => duplicate
    expect(preview[0]?.matchedAccountId).toBe('acc-1')
    expect(preview[0]?.duplicate).toBe(true)
    expect(preview[0]?.matchedTransactionId).toBe('txn-existing')

    // Second one is new => not duplicate, category matched to food
    expect(preview[1]?.matchedAccountId).toBe('acc-1')
    expect(preview[1]?.duplicate).toBe(false)
    expect(preview[1]?.suggestedCategoryId).toBe('cat-food')
  })
})
