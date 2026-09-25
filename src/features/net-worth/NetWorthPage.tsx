import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { useMemo, useState } from 'react'

import { useFinance } from '../../app/FinanceContext'
import {
  calculateAccountBalances,
  calculateNetWorth,
  createNetWorthSnapshot,
} from '../../domain/calculations'
import { todayIso } from '../../domain/dates'
import { newId, nowIso } from '../../domain/id'
import { formatMoney, percentageOf } from '../../domain/money'
import type { Asset } from '../../domain/types'
import { TrendChart } from '../../ui/Chart'
import { ConfirmDialog } from '../../ui/Dialog'
import { Icon } from '../../ui/Icon'
import { EmptyState, Metric, PageHeader } from '../../ui/Page'
import { useToast } from '../../ui/Toast'
import { AssetDialog } from './AssetDialog'

export function NetWorthPage() {
  const { data, save, remove } = useFinance()
  const { notify } = useToast()
  const [assetDialog, setAssetDialog] = useState<Asset | 'asset' | 'liability' | null>(
    null,
  )
  const [deleteTarget, setDeleteTarget] = useState<Asset | null>(null)
  const [deleting, setDeleting] = useState(false)
  const breakdown = useMemo(
    () =>
      calculateNetWorth({
        accounts: data.accounts,
        transactions: data.transactions,
        assets: data.assets,
        loans: data.loans,
        investments: data.investments,
      }),
    [data.accounts, data.assets, data.investments, data.loans, data.transactions],
  )
  const balances = useMemo(
    () => calculateAccountBalances(data.accounts, data.transactions),
    [data.accounts, data.transactions],
  )
  const snapshots = [...data.netWorthSnapshots].sort((left, right) =>
    left.date.localeCompare(right.date),
  )
  const chartPoints = [
    ...snapshots.map((snapshot) => ({
      label: format(parseISO(snapshot.date), 'MMM yy'),
      value: snapshot.totalPaise,
    })),
    ...(snapshots.at(-1)?.date === todayIso()
      ? []
      : [{ label: 'Today', value: breakdown.totalPaise }]),
  ]
  const grossPaise =
    breakdown.cashPaise + breakdown.investmentPaise + breakdown.assetPaise
  const debtRatio = percentageOf(breakdown.debtPaise, grossPaise)

  const recordSnapshot = async () => {
    try {
      const date = todayIso()
      const existing = data.netWorthSnapshots.find((item) => item.date === date)
      const timestamp = nowIso()
      await save(
        'netWorthSnapshots',
        createNetWorthSnapshot(
          breakdown,
          date,
          existing?.id ?? newId(),
          existing?.createdAt ?? timestamp,
          timestamp,
        ),
      )
      notify(existing ? 'Today’s snapshot updated' : 'Net worth snapshot recorded')
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'The snapshot could not be recorded',
        'error',
      )
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await remove('assets', deleteTarget.id)
      notify('Valuation deleted')
      setDeleteTarget(null)
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'The valuation could not be deleted',
        'error',
      )
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Net worth"
        description="Included accounts, holdings, manual assets, and debts as of their stated valuation dates."
        action={
          <div className="cluster">
            <button
              type="button"
              className="button button-secondary"
              onClick={() => void recordSnapshot()}
            >
              <Icon name="calendar" size={17} />
              Record snapshot
            </button>
            <button
              type="button"
              className="button"
              onClick={() => setAssetDialog('asset')}
            >
              <Icon name="plus" size={17} />
              Add valuation
            </button>
          </div>
        }
      />

      <section className="page-grid metric-group">
        <div className="card card-body span-3">
          <Metric
            label="Net worth"
            value={formatMoney(breakdown.totalPaise)}
            tone={breakdown.totalPaise >= 0 ? 'positive' : 'danger'}
          />
        </div>
        <div className="card card-body span-3">
          <Metric label="Cash & accounts" value={formatMoney(breakdown.cashPaise)} />
        </div>
        <div className="card card-body span-3">
          <Metric label="Investments" value={formatMoney(breakdown.investmentPaise)} />
        </div>
        <div className="card card-body span-3">
          <Metric
            label="Debt"
            value={formatMoney(breakdown.debtPaise)}
            tone={breakdown.debtPaise > 0 ? 'danger' : 'default'}
            detail={`${debtRatio.toFixed(1)}% of gross assets`}
          />
        </div>
      </section>

      <section className="page-grid">
        <div className="card span-8">
          <header className="card-header">
            <div>
              <h2>History</h2>
              <p className="muted">
                Snapshots preserve the composition at the time recorded.
              </p>
            </div>
          </header>
          <div className="card-body">
            {chartPoints.length > 1 ? (
              <TrendChart label="Net worth history" points={chartPoints} />
            ) : (
              <EmptyState
                title="Record a second snapshot to see a trend"
                description="The current total is shown above; snapshots make historical changes explicit."
              />
            )}
          </div>
        </div>
        <div className="card span-4">
          <header className="card-header">
            <div>
              <h2>Composition</h2>
              <p className="muted">Current included values.</p>
            </div>
          </header>
          <div className="composition-list">
            {[
              ['Cash & accounts', breakdown.cashPaise, 'composition-cash'],
              ['Investments', breakdown.investmentPaise, 'composition-investments'],
              ['Manual assets', breakdown.assetPaise, 'composition-assets'],
              ['Debt', -breakdown.debtPaise, 'composition-debt'],
            ].map(([label, value, className]) => (
              <div key={String(label)} className="composition-row">
                <span className={`composition-dot ${className}`} />
                <span>{label}</span>
                <strong className="tabular">{formatMoney(Number(value))}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="card">
        <header className="card-header">
          <div>
            <h2>Account contribution</h2>
            <p className="muted">
              Investment accounts with holdings and linked loan accounts are excluded here
              to prevent double counting.
            </p>
          </div>
        </header>
        {data.accounts.length === 0 ? (
          <EmptyState
            title="No accounts"
            description="Accounts added in Transactions will appear here."
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Type</th>
                  <th>Included</th>
                  <th className="amount-cell">Current balance</th>
                </tr>
              </thead>
              <tbody>
                {data.accounts.map((account) => (
                  <tr key={account.id}>
                    <td>
                      <strong>{account.name}</strong>
                      {account.institution ? <small>{account.institution}</small> : null}
                    </td>
                    <td>{account.type.replace('-', ' ')}</td>
                    <td>
                      <span
                        className={`badge${account.includeInNetWorth ? ' badge-positive' : ''}`}
                      >
                        {account.includeInNetWorth ? 'Included' : 'Excluded'}
                      </span>
                    </td>
                    <td className="amount-cell tabular">
                      {formatMoney(balances.get(account.id) ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <header className="card-header">
          <div>
            <h2>Manual assets & liabilities</h2>
            <p className="muted">
              Insurance cover is never counted as an asset. Loans entered in the loan
              module are counted separately.
            </p>
          </div>
          <div className="cluster">
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setAssetDialog('liability')}
            >
              Add liability
            </button>
            <button
              type="button"
              className="button"
              onClick={() => setAssetDialog('asset')}
            >
              Add asset
            </button>
          </div>
        </header>
        {data.assets.length === 0 ? (
          <EmptyState
            title="No manual valuations"
            description="Add property, vehicles, gold, deposits, provident funds, receivables, or liabilities not tracked elsewhere."
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Kind</th>
                  <th>Valued on</th>
                  <th>Status</th>
                  <th className="amount-cell">Value</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...data.assets]
                  .sort((left, right) => left.kind.localeCompare(right.kind))
                  .map((asset) => {
                    const staleDays = differenceInCalendarDays(
                      new Date(),
                      parseISO(asset.valuationDate),
                    )
                    return (
                      <tr key={asset.id}>
                        <td>
                          <button
                            type="button"
                            className="table-primary-action"
                            onClick={() => setAssetDialog(asset)}
                          >
                            {asset.name}
                          </button>
                          <small>{asset.type.replace('-', ' ')}</small>
                        </td>
                        <td>{asset.kind}</td>
                        <td>{format(parseISO(asset.valuationDate), 'dd MMM yyyy')}</td>
                        <td>
                          <span
                            className={`badge${staleDays > 90 ? ' badge-warning' : asset.includeInNetWorth ? ' badge-positive' : ''}`}
                          >
                            {!asset.includeInNetWorth
                              ? 'Excluded'
                              : staleDays > 90
                                ? 'Stale value'
                                : 'Current'}
                          </span>
                        </td>
                        <td
                          className={`amount-cell tabular${asset.kind === 'liability' ? ' text-danger' : ''}`}
                        >
                          {asset.kind === 'liability' ? '−' : ''}
                          {formatMoney(asset.valuePaise)}
                        </td>
                        <td className="row-actions">
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={`Edit ${asset.name}`}
                            onClick={() => setAssetDialog(asset)}
                          >
                            <Icon name="edit" size={16} />
                          </button>
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={`Delete ${asset.name}`}
                            onClick={() => setDeleteTarget(asset)}
                          >
                            <Icon name="trash" size={16} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {assetDialog ? (
        <AssetDialog
          asset={
            assetDialog === 'asset' || assetDialog === 'liability' ? null : assetDialog
          }
          defaultKind={
            assetDialog === 'asset' || assetDialog === 'liability'
              ? assetDialog
              : undefined
          }
          onClose={() => setAssetDialog(null)}
        />
      ) : null}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete this valuation?"
        description={`“${deleteTarget?.name ?? ''}” will be removed from current net worth. Existing snapshots are unchanged.`}
        confirmLabel="Delete"
        busy={deleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  )
}
