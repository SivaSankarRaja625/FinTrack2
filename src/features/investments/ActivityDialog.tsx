import { zodResolver } from '@hookform/resolvers/zod'
import Decimal from 'decimal.js'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'

import { useFinance } from '../../app/FinanceContext'
import { todayIso } from '../../domain/dates'
import { newId, nowIso } from '../../domain/id'
import { rupeesToPaise } from '../../domain/money'
import type { InvestmentHolding } from '../../domain/types'
import { Dialog } from '../../ui/Dialog'
import { useToast } from '../../ui/Toast'

const schema = z.object({
  date: z.string().min(1, 'Choose a date'),
  type: z.enum(['buy', 'sell', 'contribution', 'withdrawal', 'dividend']),
  units: z.string(),
  amount: z.string().min(1, 'Enter the total amount'),
  price: z.string(),
  note: z.string().max(1_000),
})

type Values = z.infer<typeof schema>

export function ActivityDialog({
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
  const { register, handleSubmit, control } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      date: todayIso(),
      type: 'buy',
      units: '',
      amount: '',
      price: '',
      note: '',
    },
  })
  const type = useWatch({ control, name: 'type' })
  const changesUnits = type !== 'dividend'

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true)
    setError(null)
    try {
      const amountPaise = rupeesToPaise(values.amount)
      const pricePaise = values.price.trim() ? rupeesToPaise(values.price) : 0
      const activityUnits = values.units.trim()
        ? new Decimal(values.units)
        : pricePaise > 0
          ? new Decimal(amountPaise).div(pricePaise)
          : new Decimal(0)
      if (amountPaise < 0 || pricePaise < 0 || activityUnits.isNegative()) {
        throw new Error('Amounts and units cannot be negative')
      }
      if (changesUnits && activityUnits.isZero()) {
        throw new Error('Enter units or a unit price')
      }

      const currentUnits = new Decimal(holding.units)
      let nextUnits = currentUnits
      let nextInvested = holding.investedPaise
      if (values.type === 'buy' || values.type === 'contribution') {
        nextUnits = currentUnits.plus(activityUnits)
        nextInvested += amountPaise
      } else if (values.type === 'sell' || values.type === 'withdrawal') {
        if (activityUnits.greaterThan(currentUnits)) {
          throw new Error('Units removed cannot exceed the current units')
        }
        const basisReduction = currentUnits.isZero()
          ? 0
          : new Decimal(holding.investedPaise)
              .mul(activityUnits)
              .div(currentUnits)
              .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
              .toNumber()
        nextUnits = currentUnits.minus(activityUnits)
        nextInvested = Math.max(0, holding.investedPaise - basisReduction)
      }
      const averageCostPaise = nextUnits.isZero()
        ? 0
        : new Decimal(nextInvested)
            .div(nextUnits)
            .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
            .toNumber()
      await save('investments', {
        ...holding,
        units: nextUnits.toString(),
        investedPaise: nextInvested,
        averageCostPaise,
        activities: [
          ...holding.activities,
          {
            id: newId(),
            date: values.date,
            type: values.type,
            units: activityUnits.toString(),
            amountPaise,
            pricePaise,
            note: values.note.trim(),
          },
        ],
        updatedAt: nowIso(),
      })
      notify('Investment activity recorded')
      onClose()
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'The activity could not be saved',
      )
    } finally {
      setSubmitting(false)
    }
  })

  return (
    <Dialog
      open
      title={`Record activity for ${holding.name}`}
      description="Cost basis is adjusted for buys and proportional units sold. Dividends do not change units."
      onClose={onClose}
      footer={
        <div className="cluster cluster-between" style={{ width: '100%' }}>
          <button type="button" className="button button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            form="activity-form"
            className="button"
            disabled={submitting}
          >
            {submitting ? 'Saving…' : 'Record activity'}
          </button>
        </div>
      }
    >
      <form id="activity-form" className="form-grid" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="activity-type">Activity</label>
          <select id="activity-type" className="select" {...register('type')}>
            <option value="buy">Buy</option>
            <option value="sell">Sell</option>
            <option value="contribution">Contribution</option>
            <option value="withdrawal">Withdrawal</option>
            <option value="dividend">Dividend</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="activity-date">Date</label>
          <input id="activity-date" className="input" type="date" {...register('date')} />
        </div>
        {changesUnits ? (
          <div className="field">
            <label htmlFor="activity-units">Units</label>
            <input
              id="activity-units"
              className="input"
              inputMode="decimal"
              {...register('units')}
            />
          </div>
        ) : null}
        <div className="field">
          <label htmlFor="activity-amount">Total amount</label>
          <div className="currency-field">
            <span>₹</span>
            <input
              id="activity-amount"
              className="input"
              inputMode="decimal"
              {...register('amount')}
            />
          </div>
        </div>
        {changesUnits ? (
          <div className="field field-span">
            <label htmlFor="activity-price">Unit price (optional)</label>
            <div className="currency-field">
              <span>₹</span>
              <input
                id="activity-price"
                className="input"
                inputMode="decimal"
                {...register('price')}
              />
            </div>
          </div>
        ) : null}
        <div className="field field-span">
          <label htmlFor="activity-note">Note</label>
          <textarea id="activity-note" className="textarea" {...register('note')} />
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
