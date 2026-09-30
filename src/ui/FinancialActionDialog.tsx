import { useState, type FormEvent } from 'react'

import { useFinance } from '../app/FinanceContext'
import { nextDepositInterestDate } from '../domain/deposit-schedule'
import { todayIso } from '../domain/dates'
import { newId, nowIso } from '../domain/id'
import { formatMoney, paiseToRupees, rupeesToPaise } from '../domain/money'
import { CashPostingFields, useCashPosting } from './CashPostingFields'
import { Dialog } from './Dialog'
import { useToast } from './Toast'

export type SimpleFinancialAction =
  'recurring' | 'receivable' | 'reimbursement' | 'deposit-interest' | 'deposit-maturity'
const titles: Record<SimpleFinancialAction, string> = {
  recurring: 'Post or match occurrence',
  receivable: 'Settle receivable',
  reimbursement: 'Record reimbursement',
  'deposit-interest': 'Record deposit interest',
  'deposit-maturity': 'Record maturity payout',
}

export function FinancialActionDialog({
  kind,
  sourceId,
  onClose,
  initialMode = 'new',
}: {
  kind: SimpleFinancialAction
  sourceId: string
  onClose: () => void
  initialMode?: 'new' | 'match'
}) {
  const { data, recordFinancialEvent } = useFinance()
  const { notify } = useToast()
  const rule =
    kind === 'recurring'
      ? data.recurringRules.find((item) => item.id === sourceId)
      : undefined
  const expense =
    kind === 'reimbursement'
      ? data.transactions.find((item) => item.id === sourceId)
      : undefined
  const asset = data.assets.find((item) => item.id === sourceId)
  const name = rule?.name ?? expense?.description ?? asset?.name ?? 'Missing record'
  const expected =
    rule?.amountPaise ??
    (expense
      ? expense.amountPaise -
        data.transactions
          .filter((item) => item.reimbursementOf === expense.id)
          .reduce((sum, item) => sum + item.amountPaise, 0)
      : kind === 'deposit-interest'
        ? asset?.deposit?.interestPaise
        : kind === 'deposit-maturity'
          ? asset?.deposit?.maturityAmountPaise
          : asset?.valuePaise) ??
    0
  const requiredAccountId =
    rule?.accountId ??
    (kind.startsWith('deposit-') ? asset?.deposit?.cashAccountId : undefined)
  const [id] = useState(newId)
  const [date, setDate] = useState(todayIso)
  const [amount, setAmount] = useState(() => paiseToRupees(expected))
  const [cash, setCash] = useCashPosting(
    rule?.kind === 'transfer'
      ? undefined
      : (data.categories.find((category) => category.id === rule?.categoryId)?.name ??
          (rule?.kind === 'expense' ? 'Other expense' : 'Other income')),
    requiredAccountId,
    initialMode,
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const occurrenceDate = rule?.nextDate ?? (asset ? nextDepositInterestDate(asset) : null)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const base = { id, timestamp: nowIso(), sourceId, date, cash, note: '' }
      if (kind === 'recurring') {
        if (!rule) throw new Error('This recurring item no longer exists')
        await recordFinancialEvent({ ...base, kind, occurrenceDate: rule.nextDate })
      } else if (kind === 'deposit-interest') {
        if (!occurrenceDate) throw new Error('There is no unpaid interest occurrence')
        await recordFinancialEvent({
          ...base,
          kind,
          occurrenceDate,
          amountPaise: rupeesToPaise(amount),
        })
      } else {
        await recordFinancialEvent({ ...base, kind, amountPaise: rupeesToPaise(amount) })
      }
      notify(`${titles[kind]} completed with linked cash`)
      onClose()
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'This financial action could not be recorded',
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open
      title={`${titles[kind]} · ${name}`}
      onClose={() => {
        if (!busy) onClose()
      }}
      footer={
        <div className="cluster cluster-between">
          <button
            type="button"
            className="button button-secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="financial-action"
            className="button"
            disabled={busy}
          >
            {busy ? 'Recording…' : titles[kind]}
          </button>
        </div>
      }
    >
      <form
        id="financial-action"
        className="stack"
        onSubmit={(event) => void submit(event)}
      >
        {kind === 'recurring' ? (
          <p>
            Occurrence due {rule?.nextDate}: <strong>{formatMoney(expected)}</strong>.
            Post once or match the bank entry already in Activity.
          </p>
        ) : (
          <label className="field">
            <span>Amount received</span>
            <input
              className="input"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              required
            />
          </label>
        )}
        {kind === 'deposit-interest' ? (
          <p className="field-hint">
            Interest occurrence: {occurrenceDate ?? 'None'}. Enter actual net cash
            received; tax withholding is not calculated.
          </p>
        ) : null}
        {kind === 'deposit-maturity' ? (
          <p className="field-hint">
            Maturity clears the recorded carrying value. Principal is a capital movement;
            any receipt above the original principal is cash interest.
          </p>
        ) : null}
        {kind === 'reimbursement' ? (
          <p className="field-hint">
            Offsets the saved expense in the month received, not earned income. Previous
            reports are not rewritten. Maximum remaining: {formatMoney(expected)}.
          </p>
        ) : null}
        {kind === 'receivable' ? (
          <p className="field-hint">
            Reduces the outstanding asset and records the receipt as cash income, not a
            new increase in net worth. Maximum: {formatMoney(expected)}.
          </p>
        ) : null}
        <label className="field">
          <span>Cash date</span>
          <input
            className="input"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            required
          />
        </label>
        <CashPostingFields
          value={cash}
          onChange={setCash}
          date={date}
          direction={rule && rule.kind !== 'income' ? 'out' : 'in'}
          categoryKind={
            kind === 'reimbursement' ||
            kind === 'deposit-maturity' ||
            rule?.kind === 'transfer'
              ? null
              : rule?.kind === 'expense'
                ? 'expense'
                : 'income'
          }
          allowHistory={false}
          allowMatch={kind !== 'deposit-maturity'}
          requiredAccountId={requiredAccountId}
        />
        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </Dialog>
  )
}
