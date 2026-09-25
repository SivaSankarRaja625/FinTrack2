import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { useMemo, useState } from 'react'

import { useFinance } from '../../app/FinanceContext'
import { calculateInvestmentSummary } from '../../domain/calculations'
import { todayIso } from '../../domain/dates'
import { formatMoney, multiplyMoney, percentageOf } from '../../domain/money'
import type { InvestmentHolding } from '../../domain/types'
import { TrendChart } from '../../ui/Chart'
import { ConfirmDialog } from '../../ui/Dialog'
import { Icon } from '../../ui/Icon'
import { EmptyState, Metric, PageHeader } from '../../ui/Page'
import { useToast } from '../../ui/Toast'
import { ActivityDialog } from './ActivityDialog'
import { HoldingDialog } from './HoldingDialog'
import { InvestmentCsvDialog } from './InvestmentCsvDialog'
import { PriceDialog } from './PriceDialog'

function holdingValue(holding: InvestmentHolding) {
  return multiplyMoney(holding.currentPricePaise, holding.units)
}

function typeLabel(type: string) {
  return type
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function InvestmentsPage() {
  const { data, remove } = useFinance()
  const { notify } = useToast()
  const [holdingDialog, setHoldingDialog] = useState<InvestmentHolding | 'new' | null>(
    null,
  )
  const [priceDialog, setPriceDialog] = useState<InvestmentHolding | null>(null)
  const [activityDialog, setActivityDialog] = useState<InvestmentHolding | null>(null)
  const [csvOpen, setCsvOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<InvestmentHolding | null>(null)
  const summary = useMemo(
    () => calculateInvestmentSummary(data.investments),
    [data.investments],
  )
  const selected =
    data.investments.find((holding) => holding.id === selectedId) ??
    data.investments[0] ??
    null
  const staleCount = data.investments.filter(
    (holding) =>
      differenceInCalendarDays(parseISO(todayIso()), parseISO(holding.priceDate)) > 30,
  ).length
  const allocation = useMemo(() => {
    const byType = new Map<string, number>()
    data.investments
      .filter((holding) => holding.includeInNetWorth)
      .forEach((holding) => {
        byType.set(holding.type, (byType.get(holding.type) ?? 0) + holdingValue(holding))
      })
    return [...byType.entries()].sort((left, right) => right[1] - left[1])
  }, [data.investments])
  const selectedPoints =
    selected?.priceHistory
      .slice()
      .sort((left, right) => left.date.localeCompare(right.date))
      .map((price) => ({
        label: format(parseISO(price.date), 'dd MMM yy'),
        value: multiplyMoney(price.pricePaise, selected.units),
      })) ?? []

  const deleteHolding = async () => {
    if (!deleteTarget) return
    try {
      await remove('investments', deleteTarget.id)
      notify('Holding deleted')
      if (selectedId === deleteTarget.id) setSelectedId(null)
      setDeleteTarget(null)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'The holding could not be deleted')
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Investments"
        description="Manual holdings, cost basis, and dated prices. Values are never fetched from the internet."
        action={
          <div className="cluster">
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setCsvOpen(true)}
            >
              <Icon name="upload" size={17} />
              Import CSV
            </button>
            <button
              type="button"
              className="button"
              onClick={() => setHoldingDialog('new')}
            >
              <Icon name="plus" size={17} />
              Add holding
            </button>
          </div>
        }
      />

      <section className="page-grid metric-group">
        <div className="card card-body span-3">
          <Metric
            label="Portfolio value"
            value={formatMoney(summary.currentValuePaise)}
          />
        </div>
        <div className="card card-body span-3">
          <Metric label="Cost basis" value={formatMoney(summary.investedPaise)} />
        </div>
        <div className="card card-body span-3">
          <Metric
            label="Unrealised gain"
            value={formatMoney(summary.gainPaise)}
            detail={`${summary.gainPercent.toFixed(1)}%`}
            tone={summary.gainPaise >= 0 ? 'positive' : 'danger'}
          />
        </div>
        <div className="card card-body span-3">
          <Metric
            label="Stale prices"
            value={String(staleCount)}
            detail="Older than 30 days"
            tone={staleCount > 0 ? 'danger' : 'default'}
          />
        </div>
      </section>

      <section className="card">
        <header className="card-header">
          <div>
            <h2>Holdings</h2>
            <p className="muted">Select a row for price and activity history.</p>
          </div>
        </header>
        {data.investments.length === 0 ? (
          <EmptyState
            title="No holdings yet"
            description="Add a holding manually or import the local CSV template."
            action={
              <button
                type="button"
                className="button"
                onClick={() => setHoldingDialog('new')}
              >
                Add holding
              </button>
            }
          />
        ) : (
          <ul className="record-list" aria-label="Holdings">
            {data.investments.map((holding) => {
              const value = holdingValue(holding)
              const gain = value - holding.investedPaise
              const stale =
                differenceInCalendarDays(
                  parseISO(todayIso()),
                  parseISO(holding.priceDate),
                ) > 30
              return (
                <li
                  key={holding.id}
                  className={`record-item${selected?.id === holding.id ? ' record-item-selected' : ''}`}
                >
                  <button
                    type="button"
                    className="record-select"
                    aria-pressed={selected?.id === holding.id}
                    onClick={() => setSelectedId(holding.id)}
                  >
                    <span className="record-title-line">
                      <strong>{holding.name}</strong>
                      <strong className="tabular">{formatMoney(value)}</strong>
                    </span>
                    <span className="record-meta">
                      {holding.symbol || typeLabel(holding.type)} · {holding.units} units
                      {!holding.includeInNetWorth ? ' · excluded' : ''}
                    </span>
                    <span className="record-meta">
                      Price {formatMoney(holding.currentPricePaise)} on{' '}
                      {format(parseISO(holding.priceDate), 'dd MMM yyyy')}
                      {stale ? ' · Update needed' : ''} · Gain{' '}
                      <span className={gain >= 0 ? 'text-positive' : 'text-danger'}>
                        {formatMoney(gain)}
                      </span>
                    </span>
                  </button>
                  <div className="record-actions">
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Update price for ${holding.name}`}
                      onClick={() => setPriceDialog(holding)}
                    >
                      <Icon name="investment" size={17} />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Edit ${holding.name}`}
                      onClick={() => setHoldingDialog(holding)}
                    >
                      <Icon name="edit" size={17} />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {selected ? (
        <section className="page-grid">
          <div className="card span-8">
            <header className="card-header">
              <div>
                <h2>{selected.name} value history</h2>
                <p className="muted">
                  Historical prices applied to today’s unit quantity for comparison.
                </p>
              </div>
              <div className="cluster">
                <button
                  type="button"
                  className="button button-secondary button-small"
                  onClick={() => setPriceDialog(selected)}
                >
                  Update price
                </button>
                <button
                  type="button"
                  className="button button-small"
                  onClick={() => setActivityDialog(selected)}
                >
                  Record activity
                </button>
              </div>
            </header>
            <div className="card-body">
              {selectedPoints.length > 1 ? (
                <TrendChart
                  label={`${selected.name} valuation history`}
                  points={selectedPoints}
                />
              ) : (
                <EmptyState
                  title="Record another price to see a trend"
                  description="The latest dated price is already included in the portfolio value."
                />
              )}
            </div>
          </div>
          <div className="card span-4">
            <header className="card-header">
              <div>
                <h2>Allocation</h2>
                <p className="muted">Included current value by type.</p>
              </div>
            </header>
            <div className="allocation-list">
              {allocation.map(([type, value]) => (
                <div key={type} className="allocation-row">
                  <div className="cluster cluster-between">
                    <span>{typeLabel(type)}</span>
                    <strong className="tabular">{formatMoney(value)}</strong>
                  </div>
                  <div className="progress-track" aria-hidden="true">
                    <span
                      style={{
                        width: `${percentageOf(value, summary.currentValuePaise)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {selected && selected.activities.length > 0 ? (
        <section className="card">
          <header className="card-header">
            <div>
              <h2>Activity</h2>
              <p className="muted">Recorded changes to units and cost basis.</p>
            </div>
          </header>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Units</th>
                  <th className="amount-cell">Amount</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {[...selected.activities]
                  .sort((left, right) => right.date.localeCompare(left.date))
                  .map((activity) => (
                    <tr key={activity.id}>
                      <td>{format(parseISO(activity.date), 'dd MMM yyyy')}</td>
                      <td>{typeLabel(activity.type)}</td>
                      <td className="tabular">{activity.units}</td>
                      <td className="amount-cell tabular">
                        {formatMoney(activity.amountPaise)}
                      </td>
                      <td>{activity.note || '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {selected ? (
        <section className="danger-zone">
          <div>
            <strong>Remove {selected.name}</strong>
            <span>This permanently removes its local price and activity history.</span>
          </div>
          <button
            type="button"
            className="button button-danger"
            onClick={() => setDeleteTarget(selected)}
          >
            Delete holding
          </button>
        </section>
      ) : null}

      {holdingDialog ? (
        <HoldingDialog
          holding={holdingDialog === 'new' ? null : holdingDialog}
          onClose={() => setHoldingDialog(null)}
        />
      ) : null}
      {priceDialog ? (
        <PriceDialog holding={priceDialog} onClose={() => setPriceDialog(null)} />
      ) : null}
      {activityDialog ? (
        <ActivityDialog
          holding={activityDialog}
          onClose={() => setActivityDialog(null)}
        />
      ) : null}
      {csvOpen ? <InvestmentCsvDialog onClose={() => setCsvOpen(false)} /> : null}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete holding?"
        description={`This removes ${deleteTarget?.name ?? 'the holding'} and all its local history. This cannot be undone.`}
        confirmLabel="Delete holding"
        tone="danger"
        onConfirm={() => void deleteHolding()}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}
