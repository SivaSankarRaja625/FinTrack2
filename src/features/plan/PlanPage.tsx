import { format, parseISO } from 'date-fns'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { useFinance } from '../../app/FinanceContext'
import {
  calculateBudgetStatuses,
  calculateCashFlowForecast,
} from '../../domain/calculations'
import { addIsoDays, todayIso } from '../../domain/dates'
import { formatMoney } from '../../domain/money'
import type { Budget, RecurringRule } from '../../domain/types'
import { TrendChart } from '../../ui/Chart'
import { ConfirmDialog } from '../../ui/Dialog'
import { Icon } from '../../ui/Icon'
import { EmptyState, Metric, PageHeader } from '../../ui/Page'
import { useToast } from '../../ui/Toast'
import { BudgetDialog } from './BudgetDialog'
import { RecurringDialog } from './RecurringDialog'

type DeleteTarget =
  { type: 'budget'; item: Budget } | { type: 'recurring'; item: RecurringRule }

export function PlanPage() {
  const { data, remove } = useFinance()
  const { notify } = useToast()
  const [budgetDialog, setBudgetDialog] = useState<Budget | 'new' | null>(null)
  const [recurringDialog, setRecurringDialog] = useState<RecurringRule | 'new' | null>(
    null,
  )
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [deleting, setDeleting] = useState(false)
  const today = todayIso()
  const forecastEnd = addIsoDays(today, 90)
  const budgetStatuses = useMemo(
    () => calculateBudgetStatuses(data.budgets, data.transactions),
    [data.budgets, data.transactions],
  )
  const forecast = useMemo(
    () =>
      calculateCashFlowForecast({
        accounts: data.accounts,
        transactions: data.transactions,
        recurringRules: data.recurringRules,
        startDate: today,
        endDate: forecastEnd,
      }),
    [data.accounts, data.recurringRules, data.transactions, forecastEnd, today],
  )
  const categoryNames = new Map(
    data.categories.map((category) => [category.id, category.name]),
  )
  const accountNames = new Map(data.accounts.map((account) => [account.id, account.name]))
  const chartPoints = [
    {
      label: format(parseISO(today), 'dd MMM'),
      value: forecast.openingBalancePaise,
    },
    ...forecast.events.map((event) => ({
      label: format(parseISO(event.date), 'dd MMM'),
      value: event.projectedBalancePaise,
    })),
  ]
  const lowestBalance = Math.min(
    forecast.openingBalancePaise,
    ...forecast.events.map((event) => event.projectedBalancePaise),
  )
  const overBudgetCount = budgetStatuses.filter(
    (status) => status.remainingPaise < 0,
  ).length

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      if (deleteTarget.type === 'budget') {
        await remove('budgets', deleteTarget.item.id)
        notify('Budget deleted')
      } else {
        await remove('recurringRules', deleteTarget.item.id)
        notify('Recurring item deleted')
      }
      setDeleteTarget(null)
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'The item could not be deleted',
        'error',
      )
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Plan & cash flow"
        description="Set monthly category limits and project liquid balances from explicit recurring items."
        action={
          <div className="cluster">
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setRecurringDialog('new')}
              disabled={data.accounts.length === 0}
            >
              <Icon name="calendar" size={17} />
              Add recurring item
            </button>
            <button
              type="button"
              className="button"
              onClick={() => setBudgetDialog('new')}
            >
              <Icon name="plus" size={17} />
              Add budget
            </button>
          </div>
        }
      />

      {data.accounts.length === 0 ? (
        <div className="notice notice-warning">
          <Icon name="alerts" size={18} />
          <span>
            Add an account before creating recurring cash-flow items.{' '}
            <Link to="/transactions">Go to accounts</Link>
          </span>
        </div>
      ) : null}

      <section className="page-grid metric-group">
        <div className="card card-body span-4">
          <Metric
            label="Liquid balance today"
            value={formatMoney(forecast.openingBalancePaise)}
          />
        </div>
        <div className="card card-body span-4">
          <Metric
            label="Projected in 90 days"
            value={formatMoney(forecast.endingBalancePaise)}
            tone={forecast.endingBalancePaise >= 0 ? 'positive' : 'danger'}
          />
        </div>
        <div className="card card-body span-4">
          <Metric
            label="Lowest projected balance"
            value={formatMoney(lowestBalance)}
            tone={lowestBalance >= 0 ? 'default' : 'danger'}
            detail={
              overBudgetCount > 0
                ? `${overBudgetCount} budget${overBudgetCount === 1 ? '' : 's'} exceeded`
                : 'No category budget exceeded'
            }
          />
        </div>
      </section>

      <section className="page-grid">
        <div className="card span-7">
          <header className="card-header">
            <div>
              <h2>90-day balance forecast</h2>
              <p className="muted">
                Liquid accounts only; transfers between liquid accounts have no net
                effect.
              </p>
            </div>
          </header>
          <div className="card-body">
            {forecast.events.length > 0 ? (
              <TrendChart label="Projected liquid balance" points={chartPoints} />
            ) : (
              <EmptyState
                title="No forecast events"
                description="Add recurring income and obligations to build a projection."
                action={
                  data.accounts.length > 0 ? (
                    <button
                      type="button"
                      className="button"
                      onClick={() => setRecurringDialog('new')}
                    >
                      Add recurring item
                    </button>
                  ) : undefined
                }
              />
            )}
          </div>
        </div>
        <div className="card span-5">
          <header className="card-header">
            <div>
              <h2>Upcoming</h2>
              <p className="muted">Next expected cash movements.</p>
            </div>
          </header>
          {forecast.events.length > 0 ? (
            <div className="upcoming-list">
              {forecast.events.slice(0, 8).map((event) => (
                <div key={event.id} className="upcoming-row">
                  <span
                    className={`movement-icon${event.amountPaise >= 0 ? ' movement-in' : ' movement-out'}`}
                  >
                    <Icon
                      name={event.amountPaise >= 0 ? 'arrow-down' : 'arrow-up'}
                      size={16}
                    />
                  </span>
                  <span>
                    <strong>{event.name}</strong>
                    <small>{format(parseISO(event.date), 'dd MMM yyyy')}</small>
                  </span>
                  <strong
                    className={`tabular${event.amountPaise >= 0 ? ' text-positive' : ' text-danger'}`}
                  >
                    {event.amountPaise >= 0 ? '+' : '−'}
                    {formatMoney(Math.abs(event.amountPaise))}
                  </strong>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Nothing scheduled"
              description="Expected salary, bills, and transfers will appear here."
            />
          )}
        </div>
      </section>

      <section className="card">
        <header className="card-header">
          <div>
            <h2>Monthly budgets</h2>
            <p className="muted">
              Actual posted expense against effective category limit.
            </p>
          </div>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setBudgetDialog('new')}
          >
            <Icon name="plus" size={16} />
            Add budget
          </button>
        </header>
        {budgetStatuses.length === 0 ? (
          <EmptyState
            title="No active budgets"
            description="Set a monthly limit for categories you want to control."
          />
        ) : (
          <div className="budget-list">
            {budgetStatuses.map((status) => (
              <article key={status.budget.id} className="budget-row">
                <button
                  type="button"
                  className="budget-main"
                  onClick={() => setBudgetDialog(status.budget)}
                >
                  <span className="cluster cluster-between">
                    <span>
                      <strong>{status.budget.name}</strong>
                      <small>
                        {categoryNames.get(status.budget.categoryId) ??
                          'Missing category'}
                        {status.rolloverPaise > 0
                          ? ` · ${formatMoney(status.rolloverPaise)} rolled over`
                          : ''}
                      </small>
                    </span>
                    <span className="budget-values">
                      <strong>{formatMoney(status.spentPaise)}</strong>
                      <small>of {formatMoney(status.effectiveLimitPaise)}</small>
                    </span>
                  </span>
                  <span className="progress">
                    <span
                      className={status.usedPercent >= 100 ? 'progress-danger' : ''}
                      style={{ width: `${Math.min(100, status.usedPercent)}%` }}
                    />
                  </span>
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Delete ${status.budget.name}`}
                  onClick={() => setDeleteTarget({ type: 'budget', item: status.budget })}
                >
                  <Icon name="trash" size={16} />
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <header className="card-header">
          <div>
            <h2>Recurring items</h2>
            <p className="muted">
              Expectations only; confirm actual activity with transactions.
            </p>
          </div>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setRecurringDialog('new')}
            disabled={data.accounts.length === 0}
          >
            <Icon name="plus" size={16} />
            Add item
          </button>
        </header>
        {data.recurringRules.length === 0 ? (
          <EmptyState
            title="No recurring items"
            description="Add expected salary, bills, subscriptions, or regular transfers."
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Account</th>
                  <th>Frequency</th>
                  <th>Next date</th>
                  <th className="amount-cell">Amount</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...data.recurringRules]
                  .sort((left, right) => left.nextDate.localeCompare(right.nextDate))
                  .map((rule) => (
                    <tr key={rule.id}>
                      <td>
                        <button
                          type="button"
                          className="table-primary-action"
                          onClick={() => setRecurringDialog(rule)}
                        >
                          {rule.name}
                        </button>
                        {!rule.active ? <small>Paused</small> : null}
                      </td>
                      <td>{accountNames.get(rule.accountId) ?? 'Missing account'}</td>
                      <td>{rule.frequency.replace('-', ' ')}</td>
                      <td>{format(parseISO(rule.nextDate), 'dd MMM yyyy')}</td>
                      <td
                        className={`amount-cell tabular${rule.kind === 'income' ? ' text-positive' : rule.kind === 'expense' ? ' text-danger' : ''}`}
                      >
                        {formatMoney(rule.amountPaise)}
                      </td>
                      <td className="row-actions">
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`Edit ${rule.name}`}
                          onClick={() => setRecurringDialog(rule)}
                        >
                          <Icon name="edit" size={16} />
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`Delete ${rule.name}`}
                          onClick={() =>
                            setDeleteTarget({ type: 'recurring', item: rule })
                          }
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {budgetDialog ? (
        <BudgetDialog
          budget={budgetDialog === 'new' ? null : budgetDialog}
          onClose={() => setBudgetDialog(null)}
        />
      ) : null}
      {recurringDialog ? (
        <RecurringDialog
          rule={recurringDialog === 'new' ? null : recurringDialog}
          onClose={() => setRecurringDialog(null)}
        />
      ) : null}
      <ConfirmDialog
        open={deleteTarget !== null}
        title={
          deleteTarget?.type === 'budget'
            ? 'Delete this budget?'
            : 'Delete this recurring item?'
        }
        description={
          deleteTarget?.type === 'budget'
            ? `“${deleteTarget.item.name}” will no longer track monthly use.`
            : `“${deleteTarget?.item.name ?? ''}” will be removed from cash-flow projections.`
        }
        confirmLabel="Delete"
        busy={deleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  )
}
