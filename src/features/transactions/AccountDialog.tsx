import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { useFinance } from '../../app/FinanceContext'
import { entityTimestamps, newId } from '../../domain/id'
import { paiseToRupees, rupeesToPaise } from '../../domain/money'
import type { Account, AccountType } from '../../domain/types'
import { Dialog } from '../../ui/Dialog'
import { useToast } from '../../ui/Toast'

const schema = z.object({
  name: z.string().trim().min(1, 'Enter an account name').max(100),
  institution: z.string().trim().max(100),
  type: z.enum([
    'cash',
    'savings',
    'current',
    'credit-card',
    'loan',
    'investment',
    'retirement',
    'other',
  ]),
  openingBalance: z.string().trim().min(1, 'Enter the current opening balance'),
  includeInNetWorth: z.boolean(),
  archived: z.boolean(),
})

type Values = z.infer<typeof schema>

const accountTypeLabels: Record<AccountType, string> = {
  cash: 'Cash',
  savings: 'Savings account',
  current: 'Current account',
  'credit-card': 'Credit card',
  loan: 'Loan account',
  investment: 'Investment account',
  retirement: 'Retirement account',
  other: 'Other',
}

export function AccountDialog({
  account,
  onClose,
}: {
  account: Account | null
  onClose: () => void
}) {
  const { save } = useFinance()
  const { notify } = useToast()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: account?.name ?? '',
      institution: account?.institution ?? '',
      type: account?.type ?? 'savings',
      openingBalance: account ? paiseToRupees(account.openingBalancePaise) : '0.00',
      includeInNetWorth: account?.includeInNetWorth ?? true,
      archived: account?.archived ?? false,
    },
  })

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true)
    setSubmitError(null)
    try {
      const next: Account = {
        id: account?.id ?? newId(),
        name: values.name.trim(),
        institution: values.institution.trim(),
        type: values.type,
        openingBalancePaise: rupeesToPaise(values.openingBalance),
        includeInNetWorth: values.includeInNetWorth,
        archived: values.archived,
        ...entityTimestamps(account ?? undefined),
      }
      await save('accounts', next)
      notify(account ? 'Account updated' : 'Account added')
      onClose()
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'The account could not be saved',
      )
    } finally {
      setSubmitting(false)
    }
  })

  return (
    <Dialog
      open
      title={account ? 'Edit account' : 'Add account'}
      description="Balances are calculated from this opening value and posted transactions."
      onClose={onClose}
      footer={
        <div className="cluster cluster-between" style={{ width: '100%' }}>
          <button type="button" className="button button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            form="account-form"
            className="button"
            disabled={submitting}
          >
            {submitting ? 'Saving…' : account ? 'Save changes' : 'Add account'}
          </button>
        </div>
      }
    >
      <form id="account-form" className="form-grid" onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="account-name">Account name</label>
          <input
            id="account-name"
            className="input"
            placeholder="Salary account"
            {...register('name')}
          />
          {errors.name ? <p className="field-error">{errors.name.message}</p> : null}
        </div>
        <div className="field">
          <label htmlFor="institution">Institution</label>
          <input
            id="institution"
            className="input"
            placeholder="Bank or provider"
            {...register('institution')}
          />
        </div>
        <div className="field">
          <label htmlFor="account-type">Account type</label>
          <select id="account-type" className="select" {...register('type')}>
            {Object.entries(accountTypeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="opening-balance">Opening balance</label>
          <div className="currency-field">
            <span>₹</span>
            <input
              id="opening-balance"
              className="input"
              inputMode="decimal"
              {...register('openingBalance')}
            />
          </div>
          <p className="field-hint">
            Use a negative value for money owed on a card or loan account.
          </p>
          {errors.openingBalance ? (
            <p className="field-error">{errors.openingBalance.message}</p>
          ) : null}
        </div>
        <label className="check-row field-span">
          <input type="checkbox" {...register('includeInNetWorth')} />
          <span>Include this account in net worth</span>
        </label>
        {account ? (
          <label className="check-row field-span">
            <input type="checkbox" {...register('archived')} />
            <span>Archive this account and hide it from new transaction forms</span>
          </label>
        ) : null}
        {submitError ? (
          <p className="field-error field-span" role="alert">
            {submitError}
          </p>
        ) : null}
      </form>
    </Dialog>
  )
}
