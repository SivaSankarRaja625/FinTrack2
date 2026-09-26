import { zodResolver } from '@hookform/resolvers/zod'
import Decimal from 'decimal.js'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { useFinance } from '../../app/FinanceContext'
import { todayIso } from '../../domain/dates'
import { entityTimestamps, newId } from '../../domain/id'
import { paiseToRupees, rupeesToPaise } from '../../domain/money'
import type { InvestmentHolding } from '../../domain/types'
import { Dialog } from '../../ui/Dialog'
import { useToast } from '../../ui/Toast'

const schema = z.object({
  name: z.string().trim().min(1, 'Enter a holding name').max(160),
  symbol: z.string().trim().max(30),
  type: z.enum([
    'equity',
    'mutual-fund',
    'etf',
    'fixed-deposit',
    'ppf',
    'epf',
    'nps',
    'bond',
    'gold',
    'other',
  ]),
  accountId: z.string(),
  units: z.string().trim().min(1, 'Enter the number of units'),
  averageCost: z.string().trim().min(1, 'Enter the average unit cost'),
  currentPrice: z.string().trim().min(1, 'Enter the current unit price'),
  priceDate: z.string().min(1, 'Choose a price date'),
  invested: z.string(),
  includeInNetWorth: z.boolean(),
  reserveInstrument: z.enum(['none', 'overnight-fund', 'liquid-fund', 'bank-deposit']),
  accessDays: z.string(),
  lockedUntil: z.string(),
})

type Values = z.infer<typeof schema>

export function HoldingDialog({
  holding,
  onClose,
}: {
  holding: InvestmentHolding | null
  onClose: () => void
}) {
  const { data, save } = useFinance()
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
      name: holding?.name ?? '',
      symbol: holding?.symbol ?? '',
      type: holding?.type ?? 'mutual-fund',
      accountId: holding?.accountId ?? '',
      units: holding?.units ?? '',
      averageCost: holding ? paiseToRupees(holding.averageCostPaise) : '',
      currentPrice: holding ? paiseToRupees(holding.currentPricePaise) : '',
      priceDate: holding?.priceDate ?? todayIso(),
      invested: holding ? paiseToRupees(holding.investedPaise) : '',
      includeInNetWorth: holding?.includeInNetWorth ?? true,
      reserveInstrument: holding?.reserveAccess?.instrument ?? 'none',
      accessDays: holding?.reserveAccess?.accessDays.toString() ?? '2',
      lockedUntil: holding?.reserveAccess?.lockedUntil ?? '',
    },
  })

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true)
    setError(null)
    try {
      const units = new Decimal(values.units)
      if (!units.isFinite() || units.isNegative()) {
        throw new Error('Units must be zero or greater')
      }
      const averageCostPaise = rupeesToPaise(values.averageCost)
      const currentPricePaise = rupeesToPaise(values.currentPrice)
      if (averageCostPaise < 0 || currentPricePaise < 0) {
        throw new Error('Unit prices cannot be negative')
      }
      const calculatedInvested = units
        .mul(averageCostPaise)
        .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
        .toNumber()
      const investedPaise = values.invested.trim()
        ? rupeesToPaise(values.invested)
        : calculatedInvested
      if (investedPaise < 0) throw new Error('Invested amount cannot be negative')
      const reserveAccess =
        values.reserveInstrument === 'none'
          ? undefined
          : {
              instrument: values.reserveInstrument,
              accessDays: Number(values.accessDays),
              lockedUntil: values.lockedUntil || null,
            }
      if (
        reserveAccess &&
        (!Number.isInteger(reserveAccess.accessDays) ||
          reserveAccess.accessDays < 0 ||
          reserveAccess.accessDays > 365 ||
          (reserveAccess.instrument === 'bank-deposit'
            ? values.type !== 'fixed-deposit'
            : values.type !== 'mutual-fund'))
      ) {
        throw new Error(
          'Choose a matching fund or deposit and an access time from 0 to 365 days',
        )
      }

      const next: InvestmentHolding = {
        ...holding,
        id: holding?.id ?? newId(),
        name: values.name.trim(),
        symbol: values.symbol.trim().toUpperCase(),
        type: values.type,
        accountId: values.accountId || null,
        units: units.toString(),
        averageCostPaise,
        currentPricePaise,
        priceDate: values.priceDate,
        investedPaise,
        activities: holding?.activities ?? [],
        priceHistory: [...(holding?.priceHistory ?? [])],
        includeInNetWorth: values.includeInNetWorth,
        ...(reserveAccess ? { reserveAccess } : { reserveAccess: undefined }),
        ...entityTimestamps(holding ?? undefined),
      }
      if (
        !next.priceHistory.some(
          (price) =>
            price.date === next.priceDate && price.pricePaise === next.currentPricePaise,
        )
      ) {
        next.priceHistory.push({
          id: newId(),
          date: next.priceDate,
          pricePaise: next.currentPricePaise,
        })
      }
      await save('investments', next)
      notify(holding ? 'Holding updated' : 'Holding added')
      onClose()
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'The holding could not be saved',
      )
    } finally {
      setSubmitting(false)
    }
  })

  return (
    <Dialog
      open
      title={holding ? 'Edit holding' : 'Add holding'}
      description="Enter a manual price. FinTrack never contacts a broker or market-data service."
      onClose={onClose}
      footer={
        <div className="cluster cluster-between" style={{ width: '100%' }}>
          <button type="button" className="button button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            form="holding-form"
            className="button"
            disabled={submitting}
          >
            {submitting ? 'Saving…' : holding ? 'Save changes' : 'Add holding'}
          </button>
        </div>
      }
    >
      <form id="holding-form" className="form-grid" onSubmit={onSubmit} noValidate>
        <div className="field field-span">
          <label htmlFor="holding-name">Holding name</label>
          <input id="holding-name" className="input" {...register('name')} />
          {errors.name ? <p className="field-error">{errors.name.message}</p> : null}
        </div>
        <div className="field">
          <label htmlFor="holding-symbol">Symbol or folio</label>
          <input id="holding-symbol" className="input" {...register('symbol')} />
        </div>
        <div className="field">
          <label htmlFor="holding-type">Investment type</label>
          <select id="holding-type" className="select" {...register('type')}>
            <option value="equity">Equity</option>
            <option value="mutual-fund">Mutual fund</option>
            <option value="etf">ETF</option>
            <option value="fixed-deposit">Fixed deposit</option>
            <option value="ppf">Public provident fund (PPF)</option>
            <option value="epf">Employees’ provident fund (EPF)</option>
            <option value="nps">National Pension System (NPS)</option>
            <option value="bond">Bond</option>
            <option value="gold">Gold</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="holding-account">Linked account</label>
          <select id="holding-account" className="select" {...register('accountId')}>
            <option value="">No linked account</option>
            {data.accounts
              .filter(
                (account) =>
                  account.type === 'investment' || account.type === 'retirement',
              )
              .map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="holding-units">Units</label>
          <input
            id="holding-units"
            className="input"
            inputMode="decimal"
            {...register('units')}
          />
          {errors.units ? <p className="field-error">{errors.units.message}</p> : null}
        </div>
        <div className="field">
          <label htmlFor="holding-average-cost">Average unit cost</label>
          <div className="currency-field">
            <span>₹</span>
            <input
              id="holding-average-cost"
              className="input"
              inputMode="decimal"
              {...register('averageCost')}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="holding-current-price">Current unit price</label>
          <div className="currency-field">
            <span>₹</span>
            <input
              id="holding-current-price"
              className="input"
              inputMode="decimal"
              {...register('currentPrice')}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="holding-price-date">Price date</label>
          <input
            id="holding-price-date"
            className="input"
            type="date"
            {...register('priceDate')}
          />
        </div>
        <div className="field field-span">
          <label htmlFor="holding-invested">Total cost basis</label>
          <div className="currency-field">
            <span>₹</span>
            <input
              id="holding-invested"
              className="input"
              inputMode="decimal"
              placeholder="Calculated from units and average cost when blank"
              {...register('invested')}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="holding-reserve-instrument">Reserve instrument</label>
          <select
            id="holding-reserve-instrument"
            className="select"
            {...register('reserveInstrument')}
          >
            <option value="none">Not an emergency reserve</option>
            <option value="overnight-fund">User-verified overnight fund</option>
            <option value="liquid-fund">User-verified liquid fund</option>
            <option value="bank-deposit">Accessible fixed deposit</option>
          </select>
          <p className="field-hint">
            Optional second-line money, not spendable cash or a product recommendation.
          </p>
        </div>
        <div className="field">
          <label htmlFor="holding-access-days">Expected access days</label>
          <input
            id="holding-access-days"
            className="input"
            inputMode="numeric"
            {...register('accessDays')}
          />
        </div>
        <div className="field field-span">
          <label htmlFor="holding-locked-until">Locked until (if restricted)</label>
          <input
            id="holding-locked-until"
            className="input"
            type="date"
            {...register('lockedUntil')}
          />
        </div>
        <label className="check-row field-span">
          <input type="checkbox" {...register('includeInNetWorth')} />
          <span>Include this holding in net worth</span>
        </label>
        {error ? (
          <p className="field-error field-span" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </Dialog>
  )
}
