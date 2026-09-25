import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { useFinance } from '../../app/FinanceContext'
import { addFrequency, todayIso } from '../../domain/dates'
import { entityTimestamps, newId } from '../../domain/id'
import { rupeesToPaise } from '../../domain/money'
import type { Loan, LoanPayment } from '../../domain/types'
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
  const { save } = useFinance()
  const { notify } = useToast()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const {
    register,
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
      const payment: LoanPayment = {
        id: newId(),
        date: values.date,
        amountPaise: principalPaise + interestPaise + prepaymentPaise,
        principalPaise,
        interestPaise,
        prepaymentPaise,
        transactionId: null,
        note: values.note.trim(),
      }
      if (payment.amountPaise <= 0) throw new Error('Payment must be greater than zero')
      const next: Loan = {
        ...loan,
        outstandingPaise: Math.max(
          0,
          loan.outstandingPaise - principalPaise - prepaymentPaise,
        ),
        nextPaymentDate:
          values.date >= loan.nextPaymentDate
            ? addFrequency(loan.nextPaymentDate, 'monthly')
            : loan.nextPaymentDate,
        payments: [...loan.payments, payment],
        active:
          loan.outstandingPaise - principalPaise - prepaymentPaise > 0 && loan.active,
        ...entityTimestamps(loan),
      }
      await save('loans', next)
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
      description="Separate principal, interest, and any additional prepayment so payoff tracking remains explainable."
      onClose={onClose}
      footer={
        <div className="cluster cluster-between" style={{ width: '100%' }}>
          <button type="button" className="button button-secondary" onClick={onClose}>
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
