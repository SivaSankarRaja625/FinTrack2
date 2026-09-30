// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Asset, InvestmentHolding } from '../../domain/types'
import { NetWorthComposition } from './NetWorthComposition'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('NetWorthComposition', () => {
  it('shows negative cash as a deduction on the same scale as debt and assets', () => {
    render(
      <NetWorthComposition
        breakdown={{
          cashPaise: -200_000,
          investmentPaise: 1_000_000,
          assetPaise: 0,
          debtPaise: 300_000,
          totalPaise: 500_000,
        }}
        holdings={[]}
        assets={[]}
      />,
    )

    const diagram = screen.getByRole('img', {
      name: /Positive components ₹10,000.*deductions ₹5,000.*net worth ₹5,000/i,
    })
    expect(diagram.querySelector('.composition-investments-segment')).toHaveStyle({
      width: '100%',
    })
    expect(diagram.querySelector('.composition-negative-cash-segment')).toHaveStyle({
      width: '20%',
    })
    expect(diagram.querySelector('.composition-debt-segment')).toHaveStyle({
      width: '30%',
    })

    fireEvent.click(screen.getByRole('button', { name: /Cash & accounts.*-₹2,000/ }))
    expect(
      screen.getByRole('region', { name: 'Selected net worth component' }),
    ).toHaveTextContent('Negative account balances reduce net worth')
  })

  it('marks only dated, included stale holdings and manual liabilities on their pickers', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-14T10:00:00+05:30'))
    const holding: InvestmentHolding = {
      id: 'holding-1',
      createdAt: '2026-02-14T10:00:00+05:30',
      updatedAt: '2026-02-14T10:00:00+05:30',
      accountId: null,
      name: 'Older fund',
      symbol: 'FUND',
      type: 'mutual-fund',
      units: '1',
      averageCostPaise: 100,
      currentPricePaise: 100,
      priceDate: '2026-01-14',
      investedPaise: 100,
      activities: [],
      priceHistory: [],
      includeInNetWorth: true,
    }
    const liability: Asset = {
      id: 'liability-1',
      createdAt: holding.createdAt,
      updatedAt: holding.updatedAt,
      name: 'Older payable',
      kind: 'liability',
      type: 'other',
      valuePaise: 100,
      valuationDate: '2025-10-01',
      includeInNetWorth: true,
      note: '',
    }
    render(
      <NetWorthComposition
        breakdown={{
          cashPaise: 1_000,
          investmentPaise: 200,
          assetPaise: 100,
          debtPaise: 100,
          totalPaise: 1_200,
        }}
        holdings={[
          holding,
          { ...holding, id: 'holding-2', priceDate: '2026-01-15' },
          { ...holding, id: 'holding-3', includeInNetWorth: false },
        ]}
        assets={[
          liability,
          { ...liability, id: 'liability-2', includeInNetWorth: false },
          { ...liability, id: 'asset-1', kind: 'asset', valuationDate: '2025-11-16' },
        ]}
      />,
    )

    expect(screen.getByRole('button', { name: /Investments.*1 stale/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /Debt.*1 stale/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /Manual assets/ })).not.toHaveTextContent(
      'stale',
    )
    expect(screen.getByRole('button', { name: /Cash & accounts/ })).not.toHaveTextContent(
      'stale',
    )
    fireEvent.click(screen.getByRole('button', { name: /Debt.*1 stale/ }))
    expect(
      screen.getByRole('region', { name: 'Selected net worth component' }),
    ).toHaveTextContent('Older payable (01 Oct 2025)')
  })
})
