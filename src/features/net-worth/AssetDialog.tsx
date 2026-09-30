import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'

import { useFinance } from '../../app/FinanceContext'
import { todayIso } from '../../domain/dates'
import { entityTimestamps, newId } from '../../domain/id'
import { paiseToRupees, rupeesToPaise } from '../../domain/money'
import { validateDepositTerms } from '../../domain/deposit-schedule'
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
  depositEnabled: z.boolean(),
  principal: z.string(),
  maturityDate: z.string(),
  maturityAmount: z.string(),
  maturityInstruction: z.enum(['payout', 'renew', 'unknown']),
  cashAccountId: z.string(),
  interestFrequency: z.enum([
    'at-maturity',
    'weekly',
    'monthly',
    'quarterly',
    'half-yearly',
    'yearly',
  ]),
  interestAmount: z.string(),
  nextInterestDate: z.string(),
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
  const { data, save } = useFinance()
  const { notify } = useToast()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    control,
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
      depositEnabled: Boolean(asset?.deposit),
      principal: asset?.deposit ? paiseToRupees(asset.deposit.principalPaise) : '',
      maturityDate: asset?.deposit?.maturityDate ?? '',
      maturityAmount: asset?.deposit
        ? paiseToRupees(asset.deposit.maturityAmountPaise)
        : '',
      maturityInstruction: asset?.deposit?.maturityInstruction ?? 'unknown',
      cashAccountId: asset?.deposit?.cashAccountId ?? '',
      interestFrequency: asset?.deposit?.interestFrequency ?? 'at-maturity',
      interestAmount: asset?.deposit ? paiseToRupees(asset.deposit.interestPaise) : '',
      nextInterestDate: asset?.deposit?.nextInterestDate ?? '',
    },
  })
  const type = useWatch({ control, name: 'type' })
  const kind = useWatch({ control, name: 'kind' })
  const depositEnabled = useWatch({ control, name: 'depositEnabled' })
  const interestFrequency = useWatch({ control, name: 'interestFrequency' })

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
        deposit:
          values.type === 'fixed-deposit' &&
          values.kind === 'asset' &&
          values.depositEnabled
            ? {
                principalPaise: rupeesToPaise(values.principal),
                maturityDate: values.maturityDate,
                maturityAmountPaise: rupeesToPaise(values.maturityAmount),
                maturityInstruction: values.maturityInstruction,
                cashAccountId: values.cashAccountId,
                interestFrequency: values.interestFrequency,
                interestPaise:
                  values.interestFrequency === 'at-maturity'
                    ? 0
                    : rupeesToPaise(values.interestAmount),
                nextInterestDate:
                  values.interestFrequency === 'at-maturity'
                    ? null
                    : values.nextInterestDate || null,
                paidInterestDates: asset?.deposit?.paidInterestDates ?? [],
                status: asset?.deposit?.status ?? 'active',
              }
            : undefined,
        ...entityTimestamps(asset ?? undefined),
      }
      validateDepositTerms(next)
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
        {type === 'fixed-deposit' && kind === 'asset' ? (
          <section className="field-span stack">
            <label className="check-row">
              <input type="checkbox" {...register('depositEnabled')} />
              <span>Track maturity and confirmed interest payouts</span>
            </label>
            <p className="field-hint">
              Use either this asset or an investment holding for the same deposit, not
              both. Enter confirmed contract amounts; no rate is assumed.
            </p>
            <div hidden={!depositEnabled}>
              <div className="form-grid">
                <label className="field">
                  <span>Deposit principal</span>
                  <input
                    className="input"
                    inputMode="decimal"
                    {...register('principal')}
                  />
                </label>
                <label className="field">
                  <span>Maturity date</span>
                  <input className="input" type="date" {...register('maturityDate')} />
                </label>
                <label className="field">
                  <span>Confirmed maturity proceeds</span>
                  <input
                    className="input"
                    inputMode="decimal"
                    {...register('maturityAmount')}
                  />
                </label>
                <label className="field">
                  <span>Maturity instruction</span>
                  <select className="select" {...register('maturityInstruction')}>
                    <option value="unknown">Not yet confirmed</option>
                    <option value="payout">Pay out to my account</option>
                    <option value="renew">Renew; no principal cash payout</option>
                  </select>
                </label>
                <label className="field">
                  <span>Deposit cash account</span>
                  <select className="select" {...register('cashAccountId')}>
                    <option value="">Choose receiving account</option>
                    {data.accounts
                      .filter(
                        (account) =>
                          !account.archived &&
                          ['cash', 'savings', 'current'].includes(account.type),
                      )
                      .map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="field">
                  <span>Interest payout frequency</span>
                  <select className="select" {...register('interestFrequency')}>
                    <option value="at-maturity">At maturity, included in proceeds</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="half-yearly">Half-yearly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </label>
                {interestFrequency !== 'at-maturity' ? (
                  <>
                    <label className="field">
                      <span>Confirmed interest per payout</span>
                      <input
                        className="input"
                        inputMode="decimal"
                        {...register('interestAmount')}
                      />
                    </label>
                    <label className="field">
                      <span>First interest payout date</span>
                      <input
                        className="input"
                        type="date"
                        {...register('nextInterestDate')}
                      />
                    </label>
                    <p className="field-hint">
                      For periodic payouts, maturity proceeds are principal only. Record
                      actual receipts separately; taxes are not calculated.
                    </p>
                  </>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}
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
