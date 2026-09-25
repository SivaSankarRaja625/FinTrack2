import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { useFinance } from '../../app/FinanceContext'
import { todayIso } from '../../domain/dates'
import { newId, nowIso } from '../../domain/id'
import { paiseToRupees, rupeesToPaise } from '../../domain/money'
import type { InvestmentHolding } from '../../domain/types'
import { Dialog } from '../../ui/Dialog'
import { useToast } from '../../ui/Toast'

const schema = z.object({
  date: z.string().min(1, 'Choose a price date'),
  price: z.string().min(1, 'Enter a unit price'),
})

export function PriceDialog({
  holding,
  onClose,
}: {
  holding: InvestmentHolding
  onClose: () => void
}) {
  const { save } = useFinance()
  const { notify } = useToast()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      date: todayIso(),
      price: paiseToRupees(holding.currentPricePaise),
    },
  })

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true)
    setError(null)
    try {
      const pricePaise = rupeesToPaise(values.price)
      if (pricePaise < 0) throw new Error('Price cannot be negative')
      const history = holding.priceHistory.filter((price) => price.date !== values.date)
      history.push({ id: newId(), date: values.date, pricePaise })
      history.sort((left, right) => left.date.localeCompare(right.date))
      await save('investments', {
        ...holding,
        currentPricePaise: pricePaise,
        priceDate: values.date,
        priceHistory: history,
        updatedAt: nowIso(),
      })
      notify('Price recorded')
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The price could not be saved')
    } finally {
      setSubmitting(false)
    }
  })

  return (
    <Dialog
      open
      title={`Update ${holding.name}`}
      description="This dated price is used for current portfolio value and valuation history."
      onClose={onClose}
      footer={
        <div className="cluster cluster-between" style={{ width: '100%' }}>
          <button type="button" className="button button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            form="price-form"
            className="button"
            disabled={submitting}
          >
            {submitting ? 'Saving…' : 'Record price'}
          </button>
        </div>
      }
    >
      <form id="price-form" className="form-grid" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="price-date">Price date</label>
          <input id="price-date" className="input" type="date" {...register('date')} />
        </div>
        <div className="field">
          <label htmlFor="unit-price">Unit price</label>
          <div className="currency-field">
            <span>₹</span>
            <input
              id="unit-price"
              className="input"
              inputMode="decimal"
              {...register('price')}
            />
          </div>
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
