import { endOfMonth, format, isValid, parse, parseISO, startOfMonth } from 'date-fns'
import { useState } from 'react'

import { useFinance } from '../../app/FinanceContext'
import {
  calculateInvestmentSummary,
  calculateMonthlySummary,
  calculateNetWorth,
} from '../../domain/calculations'
import { indianFinancialYearRange, isDateInRange } from '../../domain/dates'
import { formatMoney, multiplyMoney } from '../../domain/money'
import type { DateRange, Transaction } from '../../domain/types'
import { downloadText } from '../../platform/files'
import { TrendChart } from '../../ui/Chart'
import { ConfirmDialog } from '../../ui/Dialog'
import { Icon } from '../../ui/Icon'
import { EmptyState, Metric, PageHeader } from '../../ui/Page'
import { useToast } from '../../ui/Toast'

function csvCell(value: string | number): string {
  let text = String(value)
  if (/^[=+\-@]/u.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}

function periodRange(mode: 'month' | 'financial-year', month: string): DateRange {
  const parsed = parse(`${month}-01`, 'yyyy-MM-dd', new Date())
  if (mode === 'financial-year') return indianFinancialYearRange(parsed)
  return {
    start: format(startOfMonth(parsed), 'yyyy-MM-dd'),
    end: format(endOfMonth(parsed), 'yyyy-MM-dd'),
  }
}

function isValidMonth(value: string): boolean {
  return (
    /^\d{4}-(0[1-9]|1[0-2])$/u.test(value) &&
    isValid(parse(`${value}-01`, 'yyyy-MM-dd', new Date()))
  )
}

function monthlyCashFlow(
  transactions: readonly Transaction[],
  range: DateRange,
  mode: 'month' | 'financial-year',
) {
  const buckets = new Map<string, { income: number; expense: number }>()
  for (const transaction of transactions) {
    if (
      !isDateInRange(transaction.date, range) ||
      !['income', 'expense'].includes(transaction.kind)
    ) {
      continue
    }
    const key = mode === 'month' ? transaction.date : transaction.date.slice(0, 7)
    const bucket = buckets.get(key) ?? { income: 0, expense: 0 }
    if (transaction.kind === 'income') bucket.income += transaction.amountPaise
    if (transaction.kind === 'expense') bucket.expense += transaction.amountPaise
    buckets.set(key, bucket)
  }
  return [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => ({
      key,
      label:
        mode === 'month'
          ? format(parseISO(key), 'dd MMM')
          : format(parse(`${key}-01`, 'yyyy-MM-dd', new Date()), 'MMM yy'),
      ...value,
      net: value.income - value.expense,
    }))
}

export function ReportsPage() {
  const { data } = useFinance()
  const { notify } = useToast()
  const [mode, setMode] = useState<'month' | 'financial-year'>('month')
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [monthInput, setMonthInput] = useState(month)
  const invalidMonth = !isValidMonth(monthInput)
  const [exportOpen, setExportOpen] = useState(false)
  const range = periodRange(mode, month)
  const filteredTransactions = data.transactions.filter((transaction) =>
    isDateInRange(transaction.date, range),
  )
  const summary = calculateMonthlySummary(filteredTransactions, data.categories, range)
  const netWorth = calculateNetWorth(data)
  const investments = calculateInvestmentSummary(data.investments)
  const flow = monthlyCashFlow(data.transactions, range, mode)
  const categorySpend = (() => {
    const totals = new Map<string, number>()
    for (const transaction of filteredTransactions.filter(
      (item) => item.kind === 'expense',
    )) {
      if (transaction.splits.length > 0) {
        for (const split of transaction.splits) {
          totals.set(
            split.categoryId,
            (totals.get(split.categoryId) ?? 0) + split.amountPaise,
          )
        }
      } else {
        const key = transaction.categoryId ?? 'uncategorised'
        totals.set(key, (totals.get(key) ?? 0) + transaction.amountPaise)
      }
    }
    const categoryNames = new Map(
      data.categories.map((category) => [category.id, category.name]),
    )
    return [...totals.entries()]
      .map(([id, amountPaise]) => ({
        id,
        name: categoryNames.get(id) ?? 'Uncategorised',
        amountPaise,
      }))
      .sort((left, right) => right.amountPaise - left.amountPaise)
  })()
  const investmentAllocation = (() => {
    const totals = new Map<string, number>()
    for (const holding of data.investments.filter((item) => item.includeInNetWorth)) {
      const value = multiplyMoney(holding.currentPricePaise, holding.units)
      totals.set(holding.type, (totals.get(holding.type) ?? 0) + value)
    }
    return [...totals.entries()].sort((left, right) => right[1] - left[1])
  })()

  const exportCsv = async () => {
    try {
      const accountNames = new Map(
        data.accounts.map((account) => [account.id, account.name]),
      )
      const categoryNames = new Map(
        data.categories.map((category) => [category.id, category.name]),
      )
      const rows = [
        ['Date', 'Type', 'Account', 'Category', 'Description', 'Amount INR', 'Note'],
        ...filteredTransactions.map((transaction) => [
          transaction.date,
          transaction.kind,
          accountNames.get(transaction.accountId) ?? '',
          categoryNames.get(transaction.categoryId ?? '') ?? '',
          transaction.description,
          (transaction.amountPaise / 100).toFixed(2),
          transaction.note,
        ]),
      ]
      await downloadText(
        rows.map((row) => row.map(csvCell).join(',')).join('\n'),
        `fintrack-report-${range.start}-to-${range.end}.csv`,
        'text/csv;charset=utf-8',
      )
      notify('Unencrypted CSV report ready to save or share')
      setExportOpen(false)
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'The CSV report could not be exported',
        'error',
      )
    }
  }

  return (
    <div className="page reports-page">
      <PageHeader
        title="Reports"
        description="Cash flow, categories, debt, investments, and policy schedules from local records."
        action={
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setExportOpen(true)}
            disabled={filteredTransactions.length === 0}
          >
            <Icon name="download" size={17} />
            Export CSV
          </button>
        }
      />

      <section className="report-controls card">
        <label className="field">
          <span>Report period</span>
          <select
            className="select"
            value={mode}
            onChange={(event) =>
              setMode(event.target.value as 'month' | 'financial-year')
            }
          >
            <option value="month">Calendar month</option>
            <option value="financial-year">Indian financial year</option>
          </select>
        </label>
        <div className="report-month-field">
          <label className="field">
            <span>{mode === 'month' ? 'Month' : 'Financial year containing'}</span>
            <input
              className="input"
              type="month"
              value={monthInput}
              aria-invalid={invalidMonth}
              aria-describedby={invalidMonth ? 'report-month-error' : undefined}
              onChange={(event) => {
                const nextMonth = event.target.value
                setMonthInput(nextMonth)
                if (isValidMonth(nextMonth)) setMonth(nextMonth)
              }}
            />
          </label>
          {invalidMonth ? (
            <p id="report-month-error" className="report-month-error" role="alert">
              Choose a month to view the report.
            </p>
          ) : null}
        </div>
        <div className="report-range">
          <span>Included dates</span>
          <strong>
            {format(parseISO(range.start), 'dd MMM yyyy')} –{' '}
            {format(parseISO(range.end), 'dd MMM yyyy')}
          </strong>
        </div>
      </section>

      <section className="page-grid metric-group">
        <div className="card card-body span-3">
          <Metric label="Income" value={formatMoney(summary.incomePaise)} />
        </div>
        <div className="card card-body span-3">
          <Metric label="Expenses" value={formatMoney(summary.expensePaise)} />
        </div>
        <div className="card card-body span-3">
          <Metric
            label="Net cash flow"
            value={formatMoney(summary.netPaise)}
            tone={summary.netPaise >= 0 ? 'positive' : 'danger'}
          />
        </div>
        <div className="card card-body span-3">
          <Metric label="Transactions" value={String(filteredTransactions.length)} />
        </div>
      </section>

      <section className="page-grid">
        <div className="card span-8">
          <header className="card-header">
            <div>
              <h2>Net cash flow</h2>
              <p className="muted">Income less expenses; transfers are excluded.</p>
            </div>
          </header>
          <div className="card-body">
            {flow.length > 1 ? (
              <TrendChart
                label="Net cash flow by report interval"
                points={flow.map((item) => ({ label: item.label, value: item.net }))}
              />
            ) : (
              <EmptyState
                title="Not enough dated activity for a trend"
                description="The exact period totals remain available above."
              />
            )}
          </div>
          {flow.length > 0 ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Interval</th>
                    <th className="amount-cell">Income</th>
                    <th className="amount-cell">Expenses</th>
                    <th className="amount-cell">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {flow.map((item) => (
                    <tr key={item.key}>
                      <td>{item.label}</td>
                      <td className="amount-cell tabular">{formatMoney(item.income)}</td>
                      <td className="amount-cell tabular">{formatMoney(item.expense)}</td>
                      <td className="amount-cell tabular">{formatMoney(item.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
        <div className="card span-4">
          <header className="card-header">
            <div>
              <h2>Expense categories</h2>
              <p className="muted">Split allocations are counted directly.</p>
            </div>
          </header>
          {categorySpend.length === 0 ? (
            <EmptyState
              title="No expenses in this period"
              description="Category totals will appear after expenses are recorded."
            />
          ) : (
            <div className="composition-list">
              {categorySpend.slice(0, 10).map((category) => (
                <div key={category.id} className="composition-row">
                  <span>{category.name}</span>
                  <strong className="tabular">{formatMoney(category.amountPaise)}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="page-grid">
        <div className="card span-4">
          <header className="card-header">
            <div>
              <h2>Current position</h2>
              <p className="muted">Current values, independent of report period.</p>
            </div>
          </header>
          <div className="composition-list">
            <div className="composition-row">
              <span>Net worth</span>
              <strong>{formatMoney(netWorth.totalPaise)}</strong>
            </div>
            <div className="composition-row">
              <span>Total debt</span>
              <strong>{formatMoney(netWorth.debtPaise)}</strong>
            </div>
            <div className="composition-row">
              <span>Investment value</span>
              <strong>{formatMoney(investments.currentValuePaise)}</strong>
            </div>
            <div className="composition-row">
              <span>Investment gain</span>
              <strong>{formatMoney(investments.gainPaise)}</strong>
            </div>
          </div>
        </div>
        <div className="card span-4">
          <header className="card-header">
            <div>
              <h2>Investment allocation</h2>
              <p className="muted">Included holdings by current manual value.</p>
            </div>
          </header>
          {investmentAllocation.length === 0 ? (
            <EmptyState
              title="No included holdings"
              description="Investment allocation appears after holdings are added."
            />
          ) : (
            <div className="composition-list">
              {investmentAllocation.map(([type, value]) => (
                <div key={type} className="composition-row">
                  <span>{type.replaceAll('-', ' ')}</span>
                  <strong>{formatMoney(value)}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="card span-4">
          <header className="card-header">
            <div>
              <h2>Insurance schedule</h2>
              <p className="muted">Next active policy premiums.</p>
            </div>
          </header>
          {data.insurancePolicies.filter((policy) => policy.active).length === 0 ? (
            <EmptyState
              title="No active policies"
              description="Policy premium dates appear after policies are added."
            />
          ) : (
            <div className="composition-list">
              {data.insurancePolicies
                .filter((policy) => policy.active)
                .sort((left, right) =>
                  left.nextPremiumDate.localeCompare(right.nextPremiumDate),
                )
                .slice(0, 8)
                .map((policy) => (
                  <div key={policy.id} className="composition-row">
                    <span>
                      {policy.policyName}
                      <small>
                        {format(parseISO(policy.nextPremiumDate), 'dd MMM yyyy')}
                      </small>
                    </span>
                    <strong>{formatMoney(policy.premiumPaise)}</strong>
                  </div>
                ))}
            </div>
          )}
        </div>
      </section>

      <ConfirmDialog
        open={exportOpen}
        title="Export an unencrypted CSV?"
        description="CSV reports are readable by any app with access to the exported file. Use an encrypted .finapp backup for full-fidelity transfer or recovery."
        confirmLabel="Export CSV"
        onConfirm={() => void exportCsv()}
        onClose={() => setExportOpen(false)}
      />
    </div>
  )
}
