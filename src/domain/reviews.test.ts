import { describe, expect, it } from 'vitest'

import { financeData, loan, profile, settings, timestamp } from '../test/fixtures'
import { evaluateProtectionReviews } from './reviews'

const now = new Date('2026-09-24T12:00:00.000Z')

describe('financial protection reviews', () => {
  it('prompts only for applicable overdue reviews and a recorded job change', () => {
    const data = financeData({
      profiles: [
        profile({
          createdAt: '2024-09-24T12:00:00.000Z',
          jobChangeReviewDate: '2026-09-24',
        }),
      ],
      insurancePolicies: [
        {
          id: 'policy',
          type: 'health',
          insurer: 'Insurer',
          policyName: 'Health plan',
          policyNumber: '',
          sumAssuredPaise: 5_000_000,
          premiumPaise: 1_000,
          premiumFrequency: 'yearly',
          startDate: '2025-01-01',
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
          createdAt: '2024-09-24T12:00:00.000Z',
          updatedAt: timestamp,
        },
      ],
    })

    const alerts = evaluateProtectionReviews(data, settings(), now)
    expect(alerts.map((alert) => alert.key)).toEqual(
      expect.arrayContaining([
        'review:nominees:never',
        'review:documents:never',
        'review:tax:never',
        'job-change:2026-09-24',
      ]),
    )
    expect(alerts.some((alert) => alert.title.includes('nominee'))).toBe(true)
    const current = evaluateProtectionReviews(
      data,
      settings({
        reviewDates: {
          nominees: '2026-09-24',
          retirement: '2026-09-24',
          tax: '2026-09-24',
          documents: '2026-09-24',
        },
      }),
      now,
    )
    expect(current.some((alert) => alert.key.startsWith('review:nominees'))).toBe(false)
  })

  it('does not call annual reviews overdue the day a workspace is created', () => {
    const alerts = evaluateProtectionReviews(
      financeData({ profiles: [profile()] }),
      settings(),
      now,
    )
    expect(alerts.some((alert) => alert.ruleType === 'financial-review')).toBe(false)
  })

  it('uses explicit debt and concentration thresholds without stale fund valuations', () => {
    const data = financeData({
      profiles: [profile({ monthlyIncomePaise: 0 })],
      loans: [loan({ annualInterestRateBps: 1800 })],
      investments: [
        {
          id: 'fund',
          accountId: null,
          name: 'One fund',
          symbol: '',
          type: 'mutual-fund',
          units: '9',
          averageCostPaise: 10_000,
          currentPricePaise: 10_000,
          priceDate: '2026-09-23',
          investedPaise: 90_000,
          activities: [],
          priceHistory: [],
          includeInNetWorth: true,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        {
          id: 'other',
          accountId: null,
          name: 'Other fund',
          symbol: '',
          type: 'mutual-fund',
          units: '1',
          averageCostPaise: 10_000,
          currentPricePaise: 10_000,
          priceDate: '2026-09-23',
          investedPaise: 10_000,
          activities: [],
          priceHistory: [],
          includeInNetWorth: true,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
    })

    const config = settings({
      highCostDebtBps: 1200,
      concentrationWarningPercent: 70,
    })
    const alerts = evaluateProtectionReviews(data, config, now)
    expect(
      alerts.find((alert) => alert.ruleType === 'high-cost-debt')?.evidence,
    ).toContain('18%')
    expect(
      alerts.find((alert) => alert.ruleType === 'investment-concentration')?.detail,
    ).toContain('90%')
    const stale = evaluateProtectionReviews(
      {
        ...data,
        investments: data.investments.map((item) =>
          item.id === 'other' ? { ...item, priceDate: '2026-01-01' } : item,
        ),
      },
      config,
      now,
    )
    expect(stale.some((alert) => alert.ruleType === 'investment-concentration')).toBe(
      false,
    )
  })

  it('uses the effective recorded loan rate rather than an outdated opening rate', () => {
    const debt = loan({
      annualInterestRateBps: 600,
      rateChanges: [
        { id: 'new-rate', effectiveDate: '2026-09-01', annualInterestRateBps: 1800 },
        { id: 'future-rate', effectiveDate: '2027-01-01', annualInterestRateBps: 100 },
      ],
    })
    const result = evaluateProtectionReviews(
      financeData({ loans: [debt] }),
      settings({ highCostDebtBps: 1200 }),
      now,
    )
    expect(
      result.find((alert) => alert.ruleType === 'high-cost-debt')?.evidence,
    ).toContain('18%')
  })
})
