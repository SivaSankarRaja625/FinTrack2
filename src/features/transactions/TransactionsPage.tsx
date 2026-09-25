import { format, parseISO } from 'date-fns'
import { useMemo, useState } from 'react'

import { useFinance } from '../../app/FinanceContext'
import {
  calculateAccountBalances,
  calculateMonthlySummary,
} from '../../domain/calculations'
import { formatMoney } from '../../domain/money'
import type { Account, ImportBatch, Transaction } from '../../domain/types'
import { ConfirmDialog } from '../../ui/Dialog'
import { Icon } from '../../ui/Icon'
import { EmptyState, Metric, PageHeader } from '../../ui/Page'
import { useToast } from '../../ui/Toast'
import { AccountDialog } from './AccountDialog'
import { CsvImportDialog } from './CsvImportDialog'
import { TransactionDialog } from './TransactionDialog'

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
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [query, setQuery] = useState('')
  const [accountFilter, setAccountFilter] = useState('all')
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
  }, [accountFilter, data.transactions, query])

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
    <div className="page">
      <PageHeader
        title="Transactions"
        description="Track account balances, income, expenses, transfers, and statement imports."
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
                data.accounts.length === 0
                  ? setAccountDialog('new')
                  : setTransactionDialog('new')
              }
            >
              <Icon name="plus" size={17} />
              {data.accounts.length === 0 ? 'Add account' : 'Add transaction'}
            </button>
          </div>
        }
      />

      <section className="page-grid" aria-label="Monthly transaction summary">
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

      <section className="card">
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
      </section>

      <section className="card">
        <header className="card-header transaction-toolbar">
          <div>
            <h2>Ledger</h2>
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
        </header>
        {data.transactions.length === 0 ? (
          <EmptyState
            title="No transactions yet"
            description="Record income and expenses manually or import a CSV statement."
            action={
              data.accounts.length > 0 ? (
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
            description="Change the account filter or search text."
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table transaction-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Account</th>
                  <th>Category</th>
                  <th className="amount-cell">Amount</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((transaction) => {
                  const isIncome = transaction.kind === 'income'
                  const sign = isIncome || transaction.kind === 'adjustment' ? 1 : -1
                  return (
                    <tr key={transaction.id}>
                      <td className="date-cell">
                        {format(parseISO(transaction.date), 'dd MMM yyyy')}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="table-primary-action"
                          onClick={() => setTransactionDialog(transaction)}
                        >
                          {transaction.description}
                        </button>
                        {transaction.kind === 'transfer' ? (
                          <small>
                            Transfer to{' '}
                            {accountNames.get(transaction.destinationAccountId ?? '') ??
                              'account'}
                          </small>
                        ) : transaction.note ? (
                          <small>{transaction.note}</small>
                        ) : null}
                      </td>
                      <td>
                        {accountNames.get(transaction.accountId) ?? 'Missing account'}
                      </td>
                      <td>
                        {transaction.splits.length > 0
                          ? `${transaction.splits.length} categories`
                          : transaction.categoryId
                            ? (categoryNames.get(transaction.categoryId) ??
                              'Missing category')
                            : transaction.kind === 'transfer'
                              ? 'Transfer'
                              : 'Uncategorised'}
                      </td>
                      <td
                        className={`amount-cell tabular${isIncome ? ' text-positive' : transaction.kind === 'expense' ? ' text-danger' : ''}`}
                      >
                        {transaction.kind === 'transfer' ? '' : sign > 0 ? '+' : '−'}
                        {formatMoney(transaction.amountPaise)}
                      </td>
                      <td className="row-actions">
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`Edit ${transaction.description}`}
                          onClick={() => setTransactionDialog(transaction)}
                        >
                          <Icon name="edit" size={16} />
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`Delete ${transaction.description}`}
                          onClick={() =>
                            setDeleteTarget({ type: 'transaction', transaction })
                          }
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

      {data.importBatches.length > 0 ? (
        <section className="card">
          <header className="card-header">
            <div>
              <h2>Import history</h2>
              <p className="muted">CSV batches can be rolled back as one operation.</p>
            </div>
          </header>
          <div className="table-wrap">
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
          </div>
        </section>
      ) : null}

      {accountDialog ? (
        <AccountDialog
          account={accountDialog === 'new' ? null : accountDialog}
          onClose={() => setAccountDialog(null)}
        />
      ) : null}
      {transactionDialog ? (
        <TransactionDialog
          transaction={transactionDialog === 'new' ? null : transactionDialog}
          onClose={() => setTransactionDialog(null)}
        />
      ) : null}
      {importOpen ? <CsvImportDialog onClose={() => setImportOpen(false)} /> : null}
      <ConfirmDialog
        open={deleteTarget !== null}
        title={
          deleteTarget?.type === 'import'
            ? 'Roll back this CSV import?'
            : 'Delete this transaction?'
        }
        description={
          deleteTarget?.type === 'import'
            ? `${deleteTarget.batch.createdTransactionIds.length} imported transactions will be removed.`
            : `“${deleteTarget?.transaction.description ?? ''}” will be removed from the account balance and reports.`
        }
        confirmLabel={deleteTarget?.type === 'import' ? 'Roll back import' : 'Delete'}
        busy={deleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  )
}
