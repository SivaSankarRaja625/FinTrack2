import { useState, type FormEvent } from 'react'

import { useFinance } from '../../app/FinanceContext'
import { todayIso } from '../../domain/dates'
import { newId, nowIso } from '../../domain/id'
import { formatMoney } from '../../domain/money'
import type { InsurancePolicy } from '../../domain/types'
import { CashPostingFields, useCashPosting } from '../../ui/CashPostingFields'
import { Dialog } from '../../ui/Dialog'
import { useToast } from '../../ui/Toast'

export function PremiumPaymentDialog({
  policy,
  onClose,
}: {
  policy: InsurancePolicy
  onClose: () => void
}) {
  const { recordFinancialEvent } = useFinance()
  const { notify } = useToast()
  const [id] = useState(newId)
  const [date, setDate] = useState(todayIso)
  const [cash, setCash] = useCashPosting('Insurance')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await recordFinancialEvent({
        id,
        kind: 'premium',
        sourceId: policy.id,
        timestamp: nowIso(),
        date,
        occurrenceDate: policy.nextPremiumDate,
        cash,
        note: '',
      })
      notify(
        'Premium payment and cash entry recorded; renewal needs separate confirmation',
      )
      onClose()
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'The premium could not be recorded',
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open
      title={`Pay premium · ${policy.policyName}`}
      onClose={() => {
        if (!busy) onClose()
      }}
      description={`Confirm ${formatMoney(policy.premiumPaise)} for the premium due ${policy.nextPremiumDate}. This does not confirm renewal.`}
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
          <button type="submit" form="premium-payment" className="button" disabled={busy}>
            {busy ? 'Recording…' : 'Record premium payment'}
          </button>
        </div>
      }
    >
      <form
        id="premium-payment"
        className="stack"
        onSubmit={(event) => void submit(event)}
      >
        <label className="field">
          <span>Payment date</span>
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
          direction="out"
          categoryKind="expense"
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
