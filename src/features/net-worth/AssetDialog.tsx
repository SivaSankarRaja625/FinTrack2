import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { useFinance } from '../../app/FinanceContext'
import { todayIso } from '../../domain/dates'
import { entityTimestamps, newId } from '../../domain/id'
import { paiseToRupees, rupeesToPaise } from '../../domain/money'
import type { Asset } from '../../domain/types'
import { Dialog } from '../../ui/Dialog'
import { useToast } from '../../ui/Toast'

const schema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(120),
  kind: z.enum(['asset', 'liability']),
  type: z.enum([
    'property',
    'vehicle',
    'gold',
    'fixed-deposit',
    'provident-fund',
    'receivable',
    'other',
  ]),
  value: z.string().min(1, 'Enter a value'),
  valuationDate: z.string().min(1, 'Choose a valuation date'),
  includeInNetWorth: z.boolean(),
  note: z.string().max(2_000),
})

type Values = z.infer<typeof schema>

export function AssetDialog({
  asset,
  defaultKind,
  onClose,
}: {
  asset: Asset | null
  defaultKind?: Asset['kind'] | undefined
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
      name: asset?.name ?? '',
      kind: asset?.kind ?? defaultKind ?? 'asset',
      type: asset?.type ?? 'other',
      value: asset ? paiseToRupees(asset.valuePaise) : '',
      valuationDate: asset?.valuationDate ?? todayIso(),
      includeInNetWorth: asset?.includeInNetWorth ?? true,
      note: asset?.note ?? '',
    },
  })

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true)
    setError(null)
    try {
      const value = rupeesToPaise(values.value)
      if (value < 0) throw new Error('Value cannot be negative')
      const next: Asset = {
        id: asset?.id ?? newId(),
        name: values.name.trim(),
        kind: values.kind,
        type: values.type,
        valuePaise: value,
        valuationDate: values.valuationDate,
        includeInNetWorth: values.includeInNetWorth,
        note: values.note.trim(),
        ...entityTimestamps(asset ?? undefined),
      }
      await save('assets', next)
      notify(
        asset
          ? 'Valuation updated'
          : `${values.kind === 'asset' ? 'Asset' : 'Liability'} added`,
      )
      onClose()
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'The valuation could not be saved',
      )
    } finally {
      setSubmitting(false)
    }
  })

  return (
    <Dialog
      open
      title={asset ? 'Edit valuation' : 'Add asset or liability'}
      description="Use a current estimate and record the date so stale values remain visible."
      onClose={onClose}
      footer={
        <div className="cluster cluster-between" style={{ width: '100%' }}>
          <button type="button" className="button button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            form="asset-form"
            className="button"
            disabled={submitting}
          >
            {submitting ? 'Saving…' : asset ? 'Save changes' : 'Add valuation'}
          </button>
        </div>
      }
    >
      <form id="asset-form" className="form-grid" onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="asset-kind">Record type</label>
          <select id="asset-kind" className="select" {...register('kind')}>
            <option value="asset">Asset</option>
            <option value="liability">Liability</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="asset-type">Category</label>
          <select id="asset-type" className="select" {...register('type')}>
            <option value="property">Property</option>
            <option value="vehicle">Vehicle</option>
            <option value="gold">Gold</option>
            <option value="fixed-deposit">Fixed deposit</option>
            <option value="provident-fund">Provident fund</option>
            <option value="receivable">Money receivable</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="field field-span">
          <label htmlFor="asset-name">Name</label>
          <input
            id="asset-name"
            className="input"
            placeholder="Home, car, fixed deposit…"
            {...register('name')}
          />
          {errors.name ? <p className="field-error">{errors.name.message}</p> : null}
        </div>
        <div className="field">
          <label htmlFor="asset-value">Current value</label>
          <div className="currency-field">
            <span>₹</span>
            <input
              id="asset-value"
              className="input"
              inputMode="decimal"
              {...register('value')}
            />
          </div>
          {errors.value ? <p className="field-error">{errors.value.message}</p> : null}
        </div>
        <div className="field">
          <label htmlFor="valuation-date">Valuation date</label>
          <input
            id="valuation-date"
            className="input"
            type="date"
            {...register('valuationDate')}
          />
        </div>
        <div className="field field-span">
          <label htmlFor="asset-note">Note</label>
          <textarea id="asset-note" className="textarea" {...register('note')} />
        </div>
        <label className="check-row field-span">
          <input type="checkbox" {...register('includeInNetWorth')} />
          <span>Include this current value in net worth</span>
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
