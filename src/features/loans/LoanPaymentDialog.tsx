import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'

import { useFinance } from '../../app/FinanceContext'
import { todayIso } from '../../domain/dates'
import { newId, nowIso } from '../../domain/id'
import { rupeesToPaise } from '../../domain/money'
import type { Loan } from '../../domain/types'
import { CashPostingFields, useCashPosting } from '../../ui/CashPostingFields'
import { Dialog } from '../../ui/Dialog'
import { useToast } from '../../ui/Toast'

const schema = z.object({
  date: z.string().min(1),
  principal: z.string().min(1),
  interest: z.string().min(1),
  prepayment: z.string(),
  note: z.string().max(1_000),
})

type Values = z.infer<typeof schema>

export function LoanPaymentDialog({
  loan,
  onClose,
}: {
  loan: Loan
  onClose: () => void
}) {
  const { recordFinancialEvent } = useFinance()
  const { notify } = useToast()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [eventId] = useState(newId)
  const [cash, setCash] = useCashPosting('Loan payment')
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      date: todayIso(),
      principal: '',
      interest: '',
      prepayment: '0.00',
      note: '',
    },
  })
  const date = useWatch({ control, name: 'date' })

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true)
    setError(null)
    try {
      const principalPaise = rupeesToPaise(values.principal)
      const interestPaise = rupeesToPaise(values.interest)
      const prepaymentPaise = values.prepayment ? rupeesToPaise(values.prepayment) : 0
      if (principalPaise < 0 || interestPaise < 0 || prepaymentPaise < 0) {
        throw new Error('Payment components cannot be negative')
      }
      if (principalPaise + prepaymentPaise > loan.outstandingPaise) {
        throw new Error(
          'Principal and prepayment cannot exceed the outstanding loan balance',
        )
      }
      await recordFinancialEvent({
        id: eventId,
        kind: 'loan-payment',
        sourceId: loan.id,
        timestamp: nowIso(),
        date: values.date,
        principalPaise,
        interestPaise,
        prepaymentPaise,
        cash,
        note: values.note.trim(),
      })
      notify('Loan payment recorded')
      onClose()
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'The payment could not be recorded',
      )
    } finally {
      setSubmitting(false)
    }
  })

  return (
    <Dialog
      open
      title={`Record payment · ${loan.name}`}
      description="Regular principal and interest apply to the next EMI; partial payments keep the remaining amount due. Put extra principal in Additional prepayment."
      onClose={() => {
        if (!submitting) onClose()
      }}
      footer={
        <div className="cluster cluster-between" style={{ width: '100%' }}>
          <button
            type="button"
            className="button button-secondary"
            disabled={submitting}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="loan-payment-form"
            className="button"
            disabled={submitting}
          >
            {submitting ? 'Recording…' : 'Record payment'}
          </button>
        </div>
      }
    >
      <form id="loan-payment-form" className="form-grid" onSubmit={onSubmit} noValidate>
        <div className="field field-span">
          <label htmlFor="loan-payment-date">Payment date</label>
          <input
            id="loan-payment-date"
            className="input"
            type="date"
            {...register('date')}
          />
        </div>
        {[
          ['principal', 'Principal paid'],
          ['interest', 'Interest paid'],
          ['prepayment', 'Additional prepayment'],
        ].map(([field, label]) => (
          <div key={field} className="field">
            <label htmlFor={`loan-payment-${field}`}>{label}</label>
            <div className="currency-field">
              <span>₹</span>
              <input
                id={`loan-payment-${field}`}
                className="input"
                inputMode="decimal"
                {...register(field as 'principal' | 'interest' | 'prepayment')}
              />
            </div>
            {errors[field as 'principal' | 'interest' | 'prepayment'] ? (
              <p className="field-error">
                {errors[field as 'principal' | 'interest' | 'prepayment']?.message}
              </p>
            ) : null}
          </div>
        ))}
        <div className="field-span">
          <CashPostingFields
            value={cash}
            onChange={setCash}
            date={date}
            direction="out"
            categoryKind="expense"
          />
        </div>
        <div className="field field-span">
          <label htmlFor="loan-payment-note">Note</label>
          <textarea id="loan-payment-note" className="textarea" {...register('note')} />
        </div>
        {error ? (
          <p className="field-error field-span" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </Dialog>
  )
}
