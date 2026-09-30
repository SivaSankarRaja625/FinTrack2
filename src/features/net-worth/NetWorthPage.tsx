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
import { NetWorthComposition } from './NetWorthComposition'
import { nextDepositInterestDate } from '../../domain/deposit-schedule'
import {
  FinancialActionDialog,
  type SimpleFinancialAction,
} from '../../ui/FinancialActionDialog'
import { FinancialEventHistory } from '../../ui/FinancialEventHistory'

export function NetWorthPage() {
  const { data, save, remove } = useFinance()
  const { notify } = useToast()
  const [assetDialog, setAssetDialog] = useState<Asset | 'asset' | 'liability' | null>(
    null,
  )
  const [deleteTarget, setDeleteTarget] = useState<Asset | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [cashAction, setCashAction] = useState<{
    kind: SimpleFinancialAction
    id: string
  } | null>(null)
  const [activityAssetId, setActivityAssetId] = useState<string | null>(null)
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
      date: snapshot.date,
      label: format(parseISO(snapshot.date), 'MMM yy'),
      value: snapshot.totalPaise,
    })),
    ...(snapshots.at(-1)?.date === todayIso()
      ? []
      : [{ date: todayIso(), label: 'Today', value: breakdown.totalPaise }]),
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
    <div className="page worth-page">
      <PageHeader
        title="Net worth"
        description="What you own, less what you owe."
        action={
          <div className="cluster">
            <button
              type="button"
              className="button button-secondary"
              onClick={() => void recordSnapshot()}
            >
              <Icon name="calendar" size={17} />
              Save today&apos;s net worth
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
          <Metric
            label="Debt"
            value={formatMoney(breakdown.debtPaise)}
            tone={breakdown.debtPaise > 0 ? 'danger' : 'default'}
            detail={`${debtRatio.toFixed(1)}% of gross assets`}
          />
        </div>
      </section>

      <section className="page-grid">
        <div className="card span-4">
          <header className="card-header">
            <div>
              <h2>Composition</h2>
            </div>
          </header>
          <NetWorthComposition
            breakdown={breakdown}
            holdings={data.investments}
            assets={data.assets}
          />
        </div>
      </section>

      <section className="card" id="net-worth-accounts">
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
          <ul className="record-list" aria-label="Account balances">
            {data.accounts.map((account) => (
              <li key={account.id} className="finance-record">
                <div className="finance-record-title">
                  <strong>{account.name}</strong>
                  <strong className="tabular">
                    {formatMoney(balances.get(account.id) ?? 0)}
                  </strong>
                </div>
                <p className="record-meta">
                  {account.institution || account.type.replace('-', ' ')}
                  {account.archived ? ' · Archived' : ''}
                </p>
                <p className="record-meta">
                  Net-worth setting:{' '}
                  {account.includeInNetWorth
                    ? 'include, subject to linked-record exclusions above'
                    : 'exclude'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card" id="net-worth-valuations">
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
          <ul className="record-list" aria-label="Manual valuations">
            {[...data.assets]
              .sort((left, right) => left.kind.localeCompare(right.kind))
              .map((asset) => {
                const staleDays = differenceInCalendarDays(
                  new Date(),
                  parseISO(asset.valuationDate),
                )
                return (
                  <li key={asset.id} className="finance-record">
                    <div className="finance-record-title">
                      <button
                        type="button"
                        className="table-primary-action"
                        aria-label={`Edit ${asset.name}`}
                        onClick={() => setAssetDialog(asset)}
                      >
                        {asset.name}
                      </button>
                      <strong
                        className={`tabular${asset.kind === 'liability' ? ' text-danger' : ''}`}
                      >
                        {asset.kind === 'liability' ? '−' : ''}
                        {formatMoney(asset.valuePaise)}
                      </strong>
                    </div>
                    <p className="record-meta">
                      {asset.kind} · {asset.type.replace('-', ' ')} · Valued{' '}
                      {format(parseISO(asset.valuationDate), 'dd MMM yyyy')}
                    </p>
                    <div className="cluster cluster-between">
                      <span
                        className={`badge${staleDays > 90 ? ' badge-warning' : asset.includeInNetWorth ? ' badge-positive' : ''}`}
                      >
                        {!asset.includeInNetWorth
                          ? 'Excluded'
                          : staleDays > 90
                            ? 'Stale value'
                            : 'Current'}
                      </span>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Delete ${asset.name}`}
                        onClick={() => setDeleteTarget(asset)}
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                    <div className="cluster">
                      {asset.kind === 'asset' &&
                      asset.type === 'receivable' &&
                      asset.valuePaise > 0 ? (
                        <button
                          type="button"
                          className="button button-secondary"
                          onClick={() => {
                            setCashAction({ kind: 'receivable', id: asset.id })
                            setActivityAssetId(asset.id)
                          }}
                        >
                          Settle {asset.name}
                        </button>
                      ) : null}
                      {asset.deposit ? (
                        <p className="record-meta">
                          Maturity {asset.deposit.maturityDate} ·{' '}
                          {asset.deposit.maturityInstruction} · {asset.deposit.status}
                        </p>
                      ) : null}
                      {asset.deposit?.status === 'active' &&
                      nextDepositInterestDate(asset) ? (
                        <button
                          type="button"
                          className="button button-secondary"
                          onClick={() => {
                            setCashAction({ kind: 'deposit-interest', id: asset.id })
                            setActivityAssetId(asset.id)
                          }}
                        >
                          Record interest for {asset.name}
                        </button>
                      ) : null}
                      {asset.deposit?.status === 'active' &&
                      asset.deposit.maturityInstruction === 'payout' ? (
                        <button
                          type="button"
                          className="button button-secondary"
                          onClick={() => {
                            setCashAction({ kind: 'deposit-maturity', id: asset.id })
                            setActivityAssetId(asset.id)
                          }}
                        >
                          Record maturity of {asset.name}
                        </button>
                      ) : null}
                      {data.financialEvents.some(
                        (event) =>
                          event.before.kind === 'asset' && event.sourceId === asset.id,
                      ) ? (
                        <button
                          type="button"
                          className="button button-secondary"
                          onClick={() => setActivityAssetId(asset.id)}
                        >
                          Financial activity
                        </button>
                      ) : null}
                    </div>
                  </li>
                )
              })}
          </ul>
        )}
      </section>

      <section className="card card-body">
        <h2>History</h2>
        {chartPoints.length > 1 ? (
          <TrendChart label="Net worth history" points={chartPoints} />
        ) : (
          <p className="muted">
            Save your net worth on different dates to see a trend. Saved snapshots do not
            change when you edit current values.
          </p>
        )}
      </section>

      {activityAssetId ? (
        <FinancialEventHistory sourceId={activityAssetId} sourceKind="asset" />
      ) : null}
      {cashAction ? (
        <FinancialActionDialog
          kind={cashAction.kind}
          sourceId={cashAction.id}
          onClose={() => setCashAction(null)}
        />
      ) : null}
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
