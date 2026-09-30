import { format, parseISO } from 'date-fns'
import { Fragment, useMemo, useState } from 'react'

import { useFinance } from '../../app/FinanceContext'
import {
  calculateAccountBalances,
  calculateMonthlySummary,
} from '../../domain/calculations'
import { formatMoney } from '../../domain/money'
import { currentMonthRange, isDateInRange, isIsoDate } from '../../domain/dates'
import type { Account, DateRange, ImportBatch, Transaction } from '../../domain/types'
import { ConfirmDialog } from '../../ui/Dialog'
import { Icon } from '../../ui/Icon'
import { EmptyState, Metric, PageHeader } from '../../ui/Page'
import { useToast } from '../../ui/Toast'
import { AccountDialog } from './AccountDialog'
import { CsvImportDialog } from './CsvImportDialog'
import { TransactionDialog } from './TransactionDialog'
import { ScrollableTable } from '../../ui/ScrollableTable'
import { FinancialActionDialog } from '../../ui/FinancialActionDialog'
import { FinancialEventHistory } from '../../ui/FinancialEventHistory'

type DeleteTarget =
  | { type: 'transaction'; transaction: Transaction }
  | { type: 'import'; batch: ImportBatch }

export function TransactionsPage() {
  const { data, remove, rollbackImport } = useFinance()
  const { notify } = useToast()
  const [accountDialog, setAccountDialog] = useState<Account | 'new' | null>(null)
  const [transactionDialog, setTransactionDialog] = useState<Transaction | 'new' | null>(
    null,
  )
  const [importOpen, setImportOpen] = useState(false)
  const [reimbursementId, setReimbursementId] = useState<string | null>(null)
  const [activityExpenseId, setActivityExpenseId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [query, setQuery] = useState('')
  const [accountFilter, setAccountFilter] = useState('all')
  const [period, setPeriod] = useState<'all' | 'month' | 'custom'>('all')
  const [dateInput, setDateInput] = useState<DateRange>(currentMonthRange)
  const [appliedRange, setAppliedRange] = useState<DateRange | null>(null)
  const [accountsOpen, setAccountsOpen] = useState(data.accounts.length === 0)
  const hasActiveAccount = data.accounts.some((account) => !account.archived)
  const rangeError =
    period !== 'custom'
      ? ''
      : !isIsoDate(dateInput.start) || !isIsoDate(dateInput.end)
        ? 'Choose valid start and end dates.'
        : dateInput.end < dateInput.start
          ? 'End date must be on or after the start date.'
          : ''
  const changeRange = (range: DateRange) => {
    setDateInput(range)
    if (isIsoDate(range.start) && isIsoDate(range.end) && range.end >= range.start)
      setAppliedRange(range)
  }
  const balances = useMemo(
    () => calculateAccountBalances(data.accounts, data.transactions),
    [data.accounts, data.transactions],
  )
  const summary = useMemo(
    () => calculateMonthlySummary(data.transactions, data.categories),
    [data.categories, data.transactions],
  )
  const accountNames = useMemo(
    () => new Map(data.accounts.map((account) => [account.id, account.name])),
    [data.accounts],
  )
  const categoryNames = useMemo(
    () => new Map(data.categories.map((category) => [category.id, category.name])),
    [data.categories],
  )

  const filteredTransactions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return [...data.transactions]
      .filter(
        (transaction) => !appliedRange || isDateInRange(transaction.date, appliedRange),
      )
      .filter(
        (transaction) =>
          accountFilter === 'all' ||
          transaction.accountId === accountFilter ||
          transaction.destinationAccountId === accountFilter,
      )
      .filter(
        (transaction) =>
          !normalizedQuery ||
          transaction.description.toLowerCase().includes(normalizedQuery) ||
          transaction.note.toLowerCase().includes(normalizedQuery) ||
          transaction.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery)),
      )
      .sort(
        (left, right) =>
          right.date.localeCompare(left.date) ||
          right.createdAt.localeCompare(left.createdAt),
      )
  }, [accountFilter, appliedRange, data.transactions, query])

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      if (deleteTarget.type === 'transaction') {
        await remove('transactions', deleteTarget.transaction.id)
        notify('Transaction deleted')
      } else {
        await rollbackImport(deleteTarget.batch)
        notify('Imported transactions rolled back')
      }
      setDeleteTarget(null)
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'The action could not be completed',
        'error',
      )
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="page activity-page">
      <PageHeader
        title="Transactions"
        description="Your income, expenses and transfers."
        action={
          <div className="cluster">
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setImportOpen(true)}
              disabled={data.accounts.length === 0}
            >
              <Icon name="upload" size={17} />
              Import CSV
            </button>
            <button
              type="button"
              className="button"
              onClick={() =>
                !hasActiveAccount ? setAccountDialog('new') : setTransactionDialog('new')
              }
            >
              <Icon name="plus" size={17} />
              {!hasActiveAccount ? 'Add account' : 'Add transaction'}
            </button>
          </div>
        }
      />

      <section className="card activity-ledger">
        <header className="card-header transaction-toolbar">
          <div>
            <h2>Recent activity</h2>
            <p className="muted">
              {filteredTransactions.length} of {data.transactions.length} records
            </p>
          </div>
          <div className="cluster transaction-filters">
            <div className="search-field">
              <Icon name="search" size={17} />
              <label className="sr-only" htmlFor="transaction-search">
                Search transactions
              </label>
              <input
                id="transaction-search"
                className="input"
                type="search"
                placeholder="Search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <label className="sr-only" htmlFor="account-filter">
              Filter by account
            </label>
            <select
              id="account-filter"
              className="select filter-select"
              value={accountFilter}
              onChange={(event) => setAccountFilter(event.target.value)}
            >
              <option value="all">All accounts</option>
              {data.accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>
          <div className="ledger-date-filter">
            <label className="field">
              <span>Date filter</span>
              <select
                className="select"
                value={period}
                onChange={(event) => {
                  const next = event.target.value
                  if (next !== 'all' && next !== 'month' && next !== 'custom') return
                  setPeriod(next)
                  if (next === 'all') setAppliedRange(null)
                  else if (next === 'month') setAppliedRange(currentMonthRange())
                  else changeRange(dateInput)
                }}
              >
                <option value="all">All dates</option>
                <option value="month">This month</option>
                <option value="custom">Custom range</option>
              </select>
            </label>
            {period === 'custom' ? (
              <div className="form-grid">
                <label className="field">
                  <span>From date</span>
                  <input
                    className="input"
                    type="date"
                    value={dateInput.start}
                    aria-invalid={Boolean(rangeError)}
                    aria-describedby={rangeError ? 'ledger-date-error' : undefined}
                    onChange={(event) =>
                      changeRange({ ...dateInput, start: event.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span>To date</span>
                  <input
                    className="input"
                    type="date"
                    value={dateInput.end}
                    aria-invalid={Boolean(rangeError)}
                    aria-describedby={rangeError ? 'ledger-date-error' : undefined}
                    onChange={(event) =>
                      changeRange({ ...dateInput, end: event.target.value })
                    }
                  />
                </label>
              </div>
            ) : null}
            {rangeError ? (
              <p id="ledger-date-error" className="field-error" role="alert">
                {rangeError} Showing the last valid selection.
              </p>
            ) : null}
            {period !== 'all' || accountFilter !== 'all' || query ? (
              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  setPeriod('all')
                  setAppliedRange(null)
                  setQuery('')
                  setAccountFilter('all')
                }}
              >
                Clear filters
              </button>
            ) : null}
          </div>
        </header>
        {data.transactions.length === 0 ? (
          <EmptyState
            title="No transactions yet"
            description="Record income and expenses manually or import a CSV statement."
            action={
              hasActiveAccount ? (
                <button
                  type="button"
                  className="button"
                  onClick={() => setTransactionDialog('new')}
                >
                  Add transaction
                </button>
              ) : undefined
            }
          />
        ) : filteredTransactions.length === 0 ? (
          <EmptyState
            title="No matching transactions"
            description="Change the dates, account filter or search text."
          />
        ) : (
          <ul className="record-list" aria-label="Transactions">
            {filteredTransactions.map((transaction, index) => {
              const isIncome = transaction.kind === 'income'
              const sign = isIncome || transaction.kind === 'adjustment' ? 1 : -1
              const category =
                transaction.splits.length > 0
                  ? `${transaction.splits.length} categories`
                  : transaction.categoryId
                    ? (categoryNames.get(transaction.categoryId) ?? 'Missing category')
                    : transaction.kind === 'transfer'
                      ? 'Transfer'
                      : 'Uncategorised'
              return (
                <Fragment key={transaction.id}>
                  {filteredTransactions[index - 1]?.date !== transaction.date ? (
                    <li className="record-date">
                      <h3>
                        <time dateTime={transaction.date}>
                          {format(parseISO(transaction.date), 'dd MMM yyyy')}
                        </time>
                      </h3>
                    </li>
                  ) : null}
                  <li className="record-item">
                    <button
                      type="button"
                      className="record-select"
                      aria-label={`Edit ${transaction.description}`}
                      onClick={() => setTransactionDialog(transaction)}
                    >
                      <span className="record-title-line">
                        <strong>{transaction.description}</strong>
                        <strong
                          className={`tabular${isIncome ? ' text-positive' : transaction.kind === 'expense' ? ' text-danger' : ''}`}
                        >
                          {transaction.kind === 'transfer' || transaction.amountPaise < 0
                            ? ''
                            : sign > 0
                              ? '+'
                              : '−'}
                          {formatMoney(transaction.amountPaise)}
                        </strong>
                      </span>
                      <span className="record-meta">
                        {accountNames.get(transaction.accountId) ?? 'Missing account'} ·{' '}
                        {category}
                      </span>
                      {transaction.kind === 'transfer' ? (
                        <span className="record-meta">
                          To{' '}
                          {accountNames.get(transaction.destinationAccountId ?? '') ??
                            'account'}
                        </span>
                      ) : transaction.note ? (
                        <span className="record-meta">{transaction.note}</span>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Delete ${transaction.description}`}
                      onClick={() =>
                        setDeleteTarget({ type: 'transaction', transaction })
                      }
                    >
                      <Icon name="trash" size={17} />
                    </button>
                  </li>
                </Fragment>
              )
            })}
          </ul>
        )}
      </section>

      <details className="activity-monthly card">
        <summary>Monthly summary</summary>
        <section
          className="page-grid metric-group"
          aria-label="Monthly transaction summary"
        >
          <div className="card card-body span-4">
            <Metric
              label="Income this month"
              value={formatMoney(summary.incomePaise)}
              tone="positive"
            />
          </div>
          <div className="card card-body span-4">
            <Metric
              label="Expenses this month"
              value={formatMoney(summary.expensePaise)}
              tone={summary.expensePaise > summary.incomePaise ? 'danger' : 'default'}
            />
          </div>
          <div className="card card-body span-4">
            <Metric
              label="Net cash flow"
              value={formatMoney(summary.netPaise)}
              tone={summary.netPaise >= 0 ? 'positive' : 'danger'}
            />
          </div>
        </section>
      </details>

      <details
        className="card activity-accounts"
        open={accountsOpen}
        onToggle={(event) => setAccountsOpen(event.currentTarget.open)}
      >
        <summary>Manage accounts ({data.accounts.length})</summary>
        <header className="card-header">
          <div>
            <h2>Accounts</h2>
            <p className="muted">Opening balance plus posted transactions.</p>
          </div>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setAccountDialog('new')}
          >
            <Icon name="plus" size={16} />
            Add account
          </button>
        </header>
        {data.accounts.length === 0 ? (
          <EmptyState
            title="Add your first account"
            description="Create a bank, cash, card, loan, or investment account before recording transactions."
            action={
              <button
                type="button"
                className="button"
                onClick={() => setAccountDialog('new')}
              >
                Add account
              </button>
            }
          />
        ) : (
          <div className="account-strip">
            {data.accounts.map((account) => (
              <button
                type="button"
                key={account.id}
                className={`account-tile${account.archived ? ' account-archived' : ''}`}
                onClick={() => setAccountDialog(account)}
              >
                <span>
                  <strong>{account.name}</strong>
                  <small>{account.institution || account.type.replace('-', ' ')}</small>
                </span>
                <strong className="tabular">
                  {formatMoney(balances.get(account.id) ?? 0)}
                </strong>
              </button>
            ))}
          </div>
        )}
      </details>

      {data.importBatches.length > 0 ? (
        <section className="card">
          <header className="card-header">
            <div>
              <h2>Import history</h2>
              <p className="muted">CSV batches can be rolled back as one operation.</p>
            </div>
          </header>
          <ScrollableTable label="Import history">
            <table className="data-table">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Imported</th>
                  <th>Rows</th>
                  <th>Status</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...data.importBatches]
                  .sort((left, right) => right.importedAt.localeCompare(left.importedAt))
                  .map((batch) => (
                    <tr key={batch.id}>
                      <td>{batch.filename}</td>
                      <td>{format(new Date(batch.importedAt), 'dd MMM yyyy, HH:mm')}</td>
                      <td>
                        {batch.createdTransactionIds.length} imported
                        {batch.removedTransactionIds?.length
                          ? ` remaining · ${batch.removedTransactionIds.length} individually removed`
                          : ''}
                        {batch.duplicateCount > 0
                          ? ` · ${batch.duplicateCount} skipped`
                          : ''}
                      </td>
                      <td>
                        <span
                          className={`badge${batch.rolledBackAt ? '' : ' badge-positive'}`}
                        >
                          {batch.rolledBackAt ? 'Rolled back' : 'Active'}
                        </span>
                      </td>
                      <td className="row-actions">
                        {!batch.rolledBackAt ? (
                          <button
                            type="button"
                            className="button button-secondary"
                            onClick={() => setDeleteTarget({ type: 'import', batch })}
                          >
                            Roll back
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </ScrollableTable>
        </section>
      ) : null}

      {accountDialog ? (
        <AccountDialog
          account={accountDialog === 'new' ? null : accountDialog}
          onClose={() => setAccountDialog(null)}
        />
      ) : null}
      {activityExpenseId ? (
        <FinancialEventHistory sourceId={activityExpenseId} sourceKind="expense" />
      ) : null}
      {reimbursementId ? (
        <FinancialActionDialog
          kind="reimbursement"
          sourceId={reimbursementId}
          onClose={() => setReimbursementId(null)}
        />
      ) : null}
      {transactionDialog ? (
        <TransactionDialog
          transaction={transactionDialog === 'new' ? null : transactionDialog}
          onClose={() => setTransactionDialog(null)}
          onReimburse={
            transactionDialog !== 'new' && transactionDialog.kind === 'expense'
              ? () => {
                  setReimbursementId(transactionDialog.id)
                  setActivityExpenseId(transactionDialog.id)
                  setTransactionDialog(null)
                }
              : undefined
          }
        />
      ) : null}
      {importOpen ? <CsvImportDialog onClose={() => setImportOpen(false)} /> : null}
      <ConfirmDialog
        open={deleteTarget !== null}
        title={
          deleteTarget?.type === 'import'
            ? 'Roll back this CSV import?'
            : deleteTarget?.transaction.financialEventId
              ? 'Undo this linked financial event?'
              : 'Delete this transaction?'
        }
        description={
          deleteTarget?.type === 'import'
            ? `${deleteTarget.batch.createdTransactionIds.length} imported transactions will be removed.`
            : deleteTarget?.transaction.financialEventId
              ? 'The source and its linked cash changes will be reversed together. A previously matched bank entry is restored, not deleted.'
              : `“${deleteTarget?.transaction.description ?? ''}” will be removed from the account balance and reports.`
        }
        confirmLabel={
          deleteTarget?.type === 'import'
            ? 'Roll back import'
            : deleteTarget?.transaction.financialEventId
              ? 'Undo event'
              : 'Delete'
        }
        busy={deleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  )
}
