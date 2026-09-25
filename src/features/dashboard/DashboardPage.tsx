import { addDays, format, parseISO } from 'date-fns'
import { Link } from 'react-router-dom'

import { useFinance } from '../../app/FinanceContext'
import {
  calculateBudgetStatuses,
  calculateAccountBalances,
  calculateMonthlySummary,
  calculateNetWorth,
} from '../../domain/calculations'
import { currentMonthRange, todayIso } from '../../domain/dates'
import { formatMoney, percentageOf } from '../../domain/money'
import { EmptyState, Metric, PageHeader } from '../../ui/Page'

interface UpcomingItem {
  id: string
  date: string
  name: string
  detail: string
  route: string
}

export function DashboardPage() {
  const { data, alerts } = useFinance()
  const monthRange = currentMonthRange()
  const summary = calculateMonthlySummary(data.transactions, data.categories, monthRange)
  const netWorth = calculateNetWorth(data)
  const budgetStatuses = calculateBudgetStatuses(
    data.budgets,
    data.transactions,
    monthRange,
  ).sort((left, right) => right.usedPercent - left.usedPercent)
  const today = todayIso()
  const horizon = format(addDays(new Date(), 30), 'yyyy-MM-dd')
  const upcoming: UpcomingItem[] = [
    ...data.recurringRules
      .filter((rule) => rule.active && rule.nextDate >= today && rule.nextDate <= horizon)
      .map((rule) => ({
        id: `rule-${rule.id}`,
        date: rule.nextDate,
        name: rule.name,
        detail: `${formatMoney(rule.amountPaise)} · ${rule.kind}`,
        route: '/plan',
      })),
    ...data.loans
      .filter(
        (loan) =>
          loan.active && loan.nextPaymentDate >= today && loan.nextPaymentDate <= horizon,
      )
      .map((loan) => ({
        id: `loan-${loan.id}`,
        date: loan.nextPaymentDate,
        name: `${loan.name} EMI`,
        detail: formatMoney(loan.emiPaise),
        route: '/loans',
      })),
    ...data.insurancePolicies
      .filter(
        (policy) =>
          policy.active &&
          policy.nextPremiumDate >= today &&
          policy.nextPremiumDate <= horizon,
      )
      .map((policy) => ({
        id: `policy-${policy.id}`,
        date: policy.nextPremiumDate,
        name: `${policy.policyName} premium`,
        detail: formatMoney(policy.premiumPaise),
        route: '/insurance',
      })),
  ].sort((left, right) => left.date.localeCompare(right.date))
  const recentTransactions = [...data.transactions]
    .sort(
      (left, right) =>
        right.date.localeCompare(left.date) ||
        right.createdAt.localeCompare(left.createdAt),
    )
    .slice(0, 6)
  const categoryById = new Map(data.categories.map((item) => [item.id, item.name]))
  const accountBalances = calculateAccountBalances(data.accounts, data.transactions)
  const activeGoals = data.goals.filter((goal) => !goal.archived).slice(0, 4)

  return (
    <div className="page">
      <PageHeader
        title="Financial overview"
        description={`${format(new Date(), 'MMMM yyyy')} position from records stored on this device.`}
      />

      <section className="dashboard-summary card">
        <div className="dashboard-primary">
          <Metric
            label="Current net worth"
            value={formatMoney(netWorth.totalPaise)}
            tone={netWorth.totalPaise >= 0 ? 'positive' : 'danger'}
            detail={`${formatMoney(netWorth.debtPaise)} total debt`}
          />
          <Link className="button button-secondary button-small" to="/net-worth">
            View composition
          </Link>
        </div>
        <div className="dashboard-secondary">
          <Metric label="Income this month" value={formatMoney(summary.incomePaise)} />
          <Metric label="Expenses this month" value={formatMoney(summary.expensePaise)} />
          <Metric
            label="Monthly cash flow"
            value={formatMoney(summary.netPaise)}
            tone={summary.netPaise >= 0 ? 'positive' : 'danger'}
          />
        </div>
      </section>

      <section className="page-grid">
        <div className="card span-7">
          <header className="card-header">
            <div>
              <h2>Next 30 days</h2>
              <p className="muted">Recorded recurring items, EMIs, and premiums.</p>
            </div>
            <Link className="button-link" to="/plan">
              View plan
            </Link>
          </header>
          {upcoming.length === 0 ? (
            <EmptyState
              title="No upcoming obligations"
              description="Add recurring rules, loans, or policy premium dates to build the schedule."
            />
          ) : (
            <div className="simple-list">
              {upcoming.slice(0, 7).map((item) => (
                <Link key={item.id} className="dashboard-list-row" to={item.route}>
                  <time dateTime={item.date}>
                    <strong>{format(parseISO(item.date), 'dd')}</strong>
                    <span>{format(parseISO(item.date), 'MMM')}</span>
                  </time>
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.detail}</small>
                  </span>
                  <span>{format(parseISO(item.date), 'EEE')}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="card span-5">
          <header className="card-header">
            <div>
              <h2>Needs attention</h2>
              <p className="muted">Highest-priority active alerts.</p>
            </div>
            <Link className="button-link" to="/alerts">
              View all
            </Link>
          </header>
          {alerts.length === 0 ? (
            <EmptyState
              title="Nothing needs attention"
              description="Enabled alert rules are within their thresholds."
            />
          ) : (
            <div className="dashboard-alerts">
              {alerts.slice(0, 5).map((alert) => (
                <Link key={alert.key} to={alert.route} className="dashboard-alert-row">
                  <span className={`status-dot status-${alert.severity}`} />
                  <span>
                    <strong>{alert.title}</strong>
                    <small>{alert.detail}</small>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="page-grid">
        <div className="card span-7">
          <header className="card-header">
            <div>
              <h2>Budget status</h2>
              <p className="muted">Current-month category allocations.</p>
            </div>
            <Link className="button-link" to="/plan">
              Manage budgets
            </Link>
          </header>
          {budgetStatuses.length === 0 ? (
            <EmptyState
              title="No budgets for this month"
              description="Set category limits in Plan to compare spending with allocations."
            />
          ) : (
            <div className="budget-overview">
              {budgetStatuses.slice(0, 5).map((status) => (
                <div key={status.budget.id} className="allocation-row">
                  <div className="cluster cluster-between">
                    <span>{status.budget.name}</span>
                    <span className="tabular">
                      {formatMoney(status.spentPaise)} of{' '}
                      {formatMoney(status.effectiveLimitPaise)}
                    </span>
                  </div>
                  <div className="progress-track">
                    <span
                      className={status.remainingPaise < 0 ? 'progress-danger' : ''}
                      style={{ width: `${Math.min(100, status.usedPercent)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card span-5">
          <header className="card-header">
            <div>
              <h2>Goal progress</h2>
              <p className="muted">Manual or linked-account saved amounts.</p>
            </div>
            <Link className="button-link" to="/goals">
              View goals
            </Link>
          </header>
          {activeGoals.length === 0 ? (
            <EmptyState
              title="No active goals"
              description="Add a goal to track a target and contribution plan."
            />
          ) : (
            <div className="budget-overview">
              {activeGoals.map((goal) => {
                const currentPaise = goal.linkedAccountId
                  ? Math.max(0, accountBalances.get(goal.linkedAccountId) ?? 0)
                  : goal.currentPaise
                return (
                  <div key={goal.id} className="allocation-row">
                    <div className="cluster cluster-between">
                      <span>{goal.name}</span>
                      <strong>
                        {percentageOf(currentPaise, goal.targetPaise).toFixed(0)}%
                      </strong>
                    </div>
                    <div className="progress-track">
                      <span
                        style={{
                          width: `${Math.min(
                            100,
                            percentageOf(currentPaise, goal.targetPaise),
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>

      <section className="card">
        <header className="card-header">
          <div>
            <h2>Recent transactions</h2>
            <p className="muted">Most recently dated entries.</p>
          </div>
          <Link className="button-link" to="/transactions">
            View ledger
          </Link>
        </header>
        {recentTransactions.length === 0 ? (
          <EmptyState
            title="No transactions yet"
            description="Add an income or expense to start the ledger."
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th className="amount-cell">Amount</th>
                </tr>
              </thead>
              <tbody>
                {recentTransactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td>{format(parseISO(transaction.date), 'dd MMM')}</td>
                    <td>{transaction.description}</td>
                    <td>
                      {transaction.kind === 'transfer'
                        ? 'Transfer'
                        : (categoryById.get(transaction.categoryId ?? '') ??
                          'Uncategorised')}
                    </td>
                    <td
                      className={`amount-cell tabular ${
                        transaction.kind === 'income'
                          ? 'text-positive'
                          : transaction.kind === 'expense'
                            ? 'text-danger'
                            : ''
                      }`}
                    >
                      {transaction.kind === 'expense' ? '−' : ''}
                      {formatMoney(transaction.amountPaise)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
