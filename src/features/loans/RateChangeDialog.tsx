import { zodResolver } from '@hookform/resolvers/zod'
import Decimal from 'decimal.js'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { useFinance } from '../../app/FinanceContext'
import { todayIso } from '../../domain/dates'
import { entityTimestamps, newId } from '../../domain/id'
import type { Loan } from '../../domain/types'
import { Dialog } from '../../ui/Dialog'
import { useToast } from '../../ui/Toast'

const schema = z.object({
  effectiveDate: z.string().min(1),
  annualRate: z.string().min(1),
})

type Values = z.infer<typeof schema>

export function RateChangeDialog({ loan, onClose }: { loan: Loan; onClose: () => void }) {
  const { save } = useFinance()
  const { notify } = useToast()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { effectiveDate: todayIso(), annualRate: '' },
  })

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true)
    setError(null)
    try {
      const rate = new Decimal(values.annualRate)
        .mul(100)
        .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
        .toNumber()
      if (rate < 0 || rate > 100_000) throw new Error('Enter a valid annual rate')
      const next: Loan = {
        ...loan,
        rateChanges: [
          ...loan.rateChanges.filter(
            (change) => change.effectiveDate !== values.effectiveDate,
          ),
          {
            id: newId(),
            effectiveDate: values.effectiveDate,
            annualInterestRateBps: rate,
          },
        ].sort((left, right) => left.effectiveDate.localeCompare(right.effectiveDate)),
        ...entityTimestamps(loan),
      }
      await save('loans', next)
      notify('Interest-rate change recorded')
      onClose()
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'The rate change could not be saved',
      )
    } finally {
      setSubmitting(false)
    }
  })

  return (
    <Dialog
      open
      title={`Record rate change · ${loan.name}`}
      description="The schedule applies this rate from its effective date onward."
      size="small"
      onClose={onClose}
      footer={
        <div className="cluster cluster-between" style={{ width: '100%' }}>
          <button type="button" className="button button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            form="rate-change-form"
            className="button"
            disabled={submitting}
          >
            {submitting ? 'Saving…' : 'Record rate'}
          </button>
        </div>
      }
    >
      <form id="rate-change-form" className="stack" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="rate-effective-date">Effective date</label>
          <input
            id="rate-effective-date"
            className="input"
            type="date"
            {...register('effectiveDate')}
          />
        </div>
        <div className="field">
          <label htmlFor="changed-rate">Annual interest rate (%)</label>
          <input
            id="changed-rate"
            className="input"
            inputMode="decimal"
            placeholder="8.75"
            {...register('annualRate')}
          />
        </div>
        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </Dialog>
  )
}
