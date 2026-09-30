import { differenceInCalendarDays, parseISO } from 'date-fns'
import { useState } from 'react'

import { useFinance } from '../app/FinanceContext'
import type { CashPosting } from '../domain/financial-events'
import { formatMoney } from '../domain/money'

export function useCashPosting(
  categoryName?: string,
  requiredAccountId?: string,
  initialMode: 'new' | 'match' = 'new',
) {
  const { data } = useFinance()
  return useState<CashPosting>(() =>
    initialMode === 'match'
      ? { mode: 'match', transactionId: '', expected: null }
      : {
          mode: 'new',
          accountId:
            requiredAccountId ??
            data.accounts.find(
              (account) =>
                !account.archived &&
                ['cash', 'savings', 'current', 'credit-card'].includes(account.type),
            )?.id ??
            '',
          categoryId:
            data.categories.find(
              (category) => !category.archived && category.name === categoryName,
            )?.id ?? null,
        },
  )
}

export function CashPostingFields({
  value,
  onChange,
  date,
  direction,
  categoryKind,
  allowHistory = true,
  allowMatch = true,
  requiredAccountId,
}: {
  value: CashPosting
  onChange: (value: CashPosting) => void
  date: string
  direction: 'in' | 'out'
  categoryKind: 'income' | 'expense' | null
  allowHistory?: boolean
  allowMatch?: boolean
  requiredAccountId?: string | undefined
}) {
  const { data } = useFinance()
  const accounts = data.accounts.filter(
    (account) =>
      !account.archived &&
      ['cash', 'savings', 'current', 'credit-card'].includes(account.type) &&
      (!requiredAccountId || requiredAccountId === account.id),
  )
  const nearbyEntries = data.transactions.filter((transaction) => {
    const sign =
      transaction.kind === 'expense' || transaction.kind === 'transfer'
        ? -transaction.amountPaise
        : transaction.amountPaise
    return (
      accounts.some((account) => account.id === transaction.accountId) &&
      (direction === 'in' ? sign > 0 : sign < 0) &&
      Math.abs(differenceInCalendarDays(parseISO(transaction.date), parseISO(date))) <= 7
    )
  })
  const candidates = nearbyEntries.filter(
    (transaction) => !transaction.financialEventId && !transaction.reimbursementOf,
  )
  return (
    <fieldset className="cash-posting stack">
      <legend>Bank / cash entry</legend>
      <label className="field">
        <span>Cash entry</span>
        <select
          className="select"
          value={value.mode}
          onChange={(event) => {
            const mode = event.target.value
            if (mode === 'history') onChange({ mode })
            else if (mode === 'match')
              onChange({ mode, transactionId: '', expected: null })
            else
              onChange({
                mode: 'new',
                accountId: requiredAccountId ?? accounts[0]?.id ?? '',
                categoryId: null,
              })
          }}
        >
          <option value="new">Create a linked cash transaction</option>
          {allowMatch ? (
            <option value="match">Match an existing bank entry</option>
          ) : null}
          {allowHistory ? (
            <option value="history">
              Historical record only — cash already reconciled
            </option>
          ) : null}
        </select>
      </label>
      {value.mode === 'new' ? (
        <>
          <label className="field">
            <span>Cash account</span>
            <select
              className="select"
              value={value.accountId}
              onChange={(event) => onChange({ ...value, accountId: event.target.value })}
            >
              <option value="">Choose account</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
          {accounts.length === 0 ? (
            <p className="notice notice-warning">
              Add an active cash or bank account in Activity before posting money.
            </p>
          ) : null}
          {categoryKind ? (
            <label className="field">
              <span>Cash category</span>
              <select
                className="select"
                value={value.categoryId ?? ''}
                onChange={(event) =>
                  onChange({ ...value, categoryId: event.target.value || null })
                }
              >
                <option value="">Uncategorised</option>
                {data.categories
                  .filter(
                    (category) => !category.archived && category.kind === categoryKind,
                  )
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
              </select>
            </label>
          ) : null}
          <p className="field-hint">
            The source record and cash transaction are saved together. Do not also enter a
            second payment in Activity.
          </p>
          {nearbyEntries.length > 0 ? (
            <label className="check-row">
              <input
                type="checkbox"
                checked={value.allowDuplicate ?? false}
                onChange={(event) =>
                  onChange({ ...value, allowDuplicate: event.target.checked })
                }
              />
              <span>
                This is an additional cash movement, not one of the existing entries. Use
                Match instead if it is already recorded.
              </span>
            </label>
          ) : null}
        </>
      ) : value.mode === 'match' ? (
        <>
          <label className="field">
            <span>Existing bank transaction</span>
            <select
              className="select"
              value={value.transactionId}
              onChange={(event) =>
                onChange({
                  ...value,
                  transactionId: event.target.value,
                  expected:
                    data.transactions.find((item) => item.id === event.target.value) ??
                    null,
                })
              }
            >
              <option value="">Choose the actual bank entry</option>
              {candidates.map((transaction) => (
                <option key={transaction.id} value={transaction.id}>
                  {
                    data.accounts.find((account) => account.id === transaction.accountId)
                      ?.name
                  }{' '}
                  · {transaction.date} · {transaction.description} ·{' '}
                  {formatMoney(Math.abs(transaction.amountPaise))}
                </option>
              ))}
            </select>
          </label>
          <p className="field-hint">
            Only entries within seven days of the cash date are listed. The amount must
            match exactly. Classification may change; the bank balance is not posted
            again.
          </p>
        </>
      ) : (
        <p className="notice notice-warning">
          No cash entry will be created. Use this only for history already included in
          your account balances. Current payments should create or match a cash
          transaction.
        </p>
      )}
    </fieldset>
  )
}
