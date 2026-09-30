import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import type { NetWorthBreakdown } from '../../domain/calculations'
import { todayIso } from '../../domain/dates'
import { formatMoney } from '../../domain/money'
import type { Asset, InvestmentHolding } from '../../domain/types'

type ComponentKey = 'cash' | 'investments' | 'assets' | 'debt'

export function NetWorthComposition({
  breakdown,
  holdings,
  assets,
}: {
  breakdown: NetWorthBreakdown
  holdings: readonly InvestmentHolding[]
  assets: readonly Asset[]
}) {
  const [selection, setSelection] = useState<ComponentKey>('cash')
  const components = [
    { key: 'cash', label: 'Cash & accounts', amount: breakdown.cashPaise },
    { key: 'investments', label: 'Investments', amount: breakdown.investmentPaise },
    { key: 'assets', label: 'Manual assets', amount: breakdown.assetPaise },
    { key: 'debt', label: 'Debt', amount: breakdown.debtPaise },
  ] as const
  const selected = components.find((item) => item.key === selection)!
  const positive =
    Math.max(0, breakdown.cashPaise) + breakdown.investmentPaise + breakdown.assetPaise
  const negativeCash = Math.max(0, -breakdown.cashPaise)
  const deductions = negativeCash + breakdown.debtPaise
  const scale = Math.max(positive, deductions, 1)
  const today = parseISO(todayIso())
  const isStale = (date: string, days: number) =>
    differenceInCalendarDays(today, parseISO(date)) > days
  const includedAssets = assets.filter((asset) => asset.includeInNetWorth)
  const staleByComponent = {
    cash: [],
    investments: holdings
      .filter((holding) => holding.includeInNetWorth && isStale(holding.priceDate, 30))
      .map((holding) => ({ name: holding.name, date: holding.priceDate })),
    assets: includedAssets
      .filter((asset) => asset.kind === 'asset' && isStale(asset.valuationDate, 90))
      .map((asset) => ({ name: asset.name, date: asset.valuationDate })),
    debt: includedAssets
      .filter((asset) => asset.kind === 'liability' && isStale(asset.valuationDate, 90))
      .map((asset) => ({ name: asset.name, date: asset.valuationDate })),
  }
  const stale = staleByComponent[selection]

  return (
    <div
      className="net-worth-composition"
      role="group"
      aria-label="Net worth composition"
    >
      <div
        className="composition-diagram"
        role="img"
        aria-label={`Positive components ${formatMoney(positive)}; deductions ${formatMoney(deductions)}, including debt ${formatMoney(breakdown.debtPaise)} and negative cash ${formatMoney(negativeCash)}; net worth ${formatMoney(breakdown.totalPaise)}`}
      >
        <div className="composition-track-label">
          <span>Positive components</span>
          <strong>{formatMoney(positive)}</strong>
        </div>
        <div className="composition-track" aria-hidden="true">
          {breakdown.cashPaise > 0 ? (
            <span
              className="composition-cash-segment"
              style={{ width: `${(breakdown.cashPaise / scale) * 100}%` }}
            />
          ) : null}
          {breakdown.investmentPaise > 0 ? (
            <span
              className="composition-investments-segment"
              style={{ width: `${(breakdown.investmentPaise / scale) * 100}%` }}
            />
          ) : null}
          {breakdown.assetPaise > 0 ? (
            <span
              className="composition-assets-segment"
              style={{ width: `${(breakdown.assetPaise / scale) * 100}%` }}
            />
          ) : null}
        </div>
        <div className="composition-track-label">
          <span>Deductions (debt and negative cash)</span>
          <strong>{formatMoney(deductions)}</strong>
        </div>
        <div className="composition-track" aria-hidden="true">
          {negativeCash > 0 ? (
            <span
              className="composition-negative-cash-segment"
              style={{ width: `${(negativeCash / scale) * 100}%` }}
            />
          ) : null}
          {breakdown.debtPaise > 0 ? (
            <span
              className="composition-debt-segment"
              style={{ width: `${(breakdown.debtPaise / scale) * 100}%` }}
            />
          ) : null}
        </div>
      </div>
      <p className="field-hint">
        Both bars use the same scale. Positive components minus deductions ={' '}
        <strong>{formatMoney(breakdown.totalPaise)}</strong>. Cash &amp; accounts is shown
        net of any negative account balances.
      </p>
      <div className="composition-pickers">
        {components.map((item) => (
          <button
            key={item.key}
            type="button"
            className="composition-picker"
            aria-pressed={selection === item.key}
            onClick={() => setSelection(item.key)}
          >
            <span
              className={`composition-dot composition-${item.key}`}
              aria-hidden="true"
            />
            <span className="composition-picker-label">
              <span>{item.label}</span>
              {staleByComponent[item.key].length > 0 ? (
                <small>{staleByComponent[item.key].length} stale</small>
              ) : null}
            </span>
            <strong className="tabular">{formatMoney(item.amount)}</strong>
          </button>
        ))}
      </div>
      <section
        className="composition-detail"
        aria-label="Selected net worth component"
        aria-live="polite"
      >
        <h3>{selected.label}</h3>
        <strong className="tabular">{formatMoney(selected.amount)}</strong>
        {selection === 'cash' ? (
          <>
            <p>
              {breakdown.cashPaise < 0
                ? 'Negative account balances reduce net worth and appear with deductions above.'
                : 'Included account balances are net of any overdrafts.'}
            </p>
            <a href="#net-worth-accounts">Review account contribution</a>
          </>
        ) : selection === 'investments' ? (
          <>
            <p>Included holdings use their last manually recorded prices.</p>
            <Link to="/investments">Review holdings and prices</Link>
          </>
        ) : selection === 'assets' ? (
          <>
            <p>Included manual assets are valued on their recorded dates.</p>
            <a href="#net-worth-valuations">Review manual valuations</a>
          </>
        ) : (
          <>
            <p>
              Debt is subtracted, not included in the asset bar. Loan and account balances
              have no valuation date.
            </p>
            <a href="#net-worth-valuations">Review manual liabilities</a>
          </>
        )}
        {stale.length > 0 ? (
          <p className="composition-stale">
            Stale valuations:{' '}
            {stale
              .map(
                ({ name, date }) => `${name} (${format(parseISO(date), 'dd MMM yyyy')})`,
              )
              .join(', ')}
            .
          </p>
        ) : selection === 'investments' || selection === 'assets' ? (
          <p>
            No included{' '}
            {selection === 'investments'
              ? 'holding prices older than 30 days'
              : 'manual asset values older than 90 days'}
            .
          </p>
        ) : null}
      </section>
    </div>
  )
}
