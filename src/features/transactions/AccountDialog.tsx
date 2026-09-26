import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'

import { useFinance } from '../../app/FinanceContext'
import { entityTimestamps, newId } from '../../domain/id'
import { paiseToRupees, rupeesToPaise } from '../../domain/money'
import { accountSchema } from '../../domain/schemas'
import type { Account, AccountType } from '../../domain/types'
import { Dialog } from '../../ui/Dialog'
import { useToast } from '../../ui/Toast'

const schema = z
  .object({
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
    lastFour: z.string().trim(),
    creditLimit: z.string().trim(),
    statementDay: z.string().trim(),
    paymentDueDay: z.string().trim(),
    statementDate: z.string().trim(),
    actualDueDate: z.string().trim(),
    statementTotal: z.string().trim(),
    statementMinimum: z.string().trim(),
    statementPaid: z.string().trim(),
    emergencyReserve: z.boolean(),
  })
  .superRefine((values, context) => {
    if (values.type !== 'credit-card') return
    if (values.lastFour && !/^\d{4}$/u.test(values.lastFour)) {
      context.addIssue({
        code: 'custom',
        path: ['lastFour'],
        message: 'Enter exactly four card digits',
      })
    }
    if (values.creditLimit) {
      try {
        if (rupeesToPaise(values.creditLimit) <= 0) {
          context.addIssue({
            code: 'custom',
            path: ['creditLimit'],
            message: 'Enter a credit limit greater than zero',
          })
        }
      } catch {
        context.addIssue({
          code: 'custom',
          path: ['creditLimit'],
          message: 'Enter a valid credit limit',
        })
      }
    }
    for (const field of ['statementDay', 'paymentDueDay'] as const) {
      const value = values[field]
      if (
        value &&
        (!/^\d{1,2}$/u.test(value) || Number(value) < 1 || Number(value) > 31)
      ) {
        context.addIssue({
          code: 'custom',
          path: [field],
          message: 'Enter a day from 1 to 31',
        })
      }
    }
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
  initialType = 'savings',
  onClose,
}: {
  account: Account | null
  initialType?: AccountType
  onClose: () => void
}) {
  const { data, save } = useFinance()
  const { notify } = useToast()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: account?.name ?? '',
      institution: account?.institution ?? '',
      type: account?.type ?? initialType,
      openingBalance: account ? paiseToRupees(account.openingBalancePaise) : '0.00',
      includeInNetWorth: account?.includeInNetWorth ?? true,
      archived: account?.archived ?? false,
      lastFour: account?.creditCardDetails?.lastFour ?? '',
      creditLimit: account?.creditCardDetails?.creditLimitPaise
        ? paiseToRupees(account.creditCardDetails.creditLimitPaise)
        : '',
      statementDay: account?.creditCardDetails?.statementDay?.toString() ?? '',
      paymentDueDay: account?.creditCardDetails?.paymentDueDay?.toString() ?? '',
      statementDate: account?.creditCardDetails?.statement?.date ?? '',
      actualDueDate: account?.creditCardDetails?.statement?.dueDate ?? '',
      statementTotal: account?.creditCardDetails?.statement
        ? paiseToRupees(account.creditCardDetails.statement.totalPaise)
        : '',
      statementMinimum: account?.creditCardDetails?.statement
        ? paiseToRupees(account.creditCardDetails.statement.minimumPaise)
        : '',
      statementPaid: account?.creditCardDetails?.statement
        ? paiseToRupees(account.creditCardDetails.statement.paidPaise)
        : '',
      emergencyReserve: account?.emergencyReserve ?? false,
    },
  })
  const selectedType = useWatch({ control, name: 'type' })
  const isCard = selectedType === 'credit-card'
  const isLiquid = ['cash', 'savings', 'current'].includes(selectedType)
  const cardDialog = initialType === 'credit-card'

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true)
    setSubmitError(null)
    try {
      const hasStatement =
        values.type === 'credit-card' &&
        [
          values.statementDate,
          values.actualDueDate,
          values.statementTotal,
          values.statementMinimum,
          values.statementPaid,
        ].some(Boolean)
      if (
        hasStatement &&
        (!values.statementDate ||
          !values.actualDueDate ||
          !values.statementTotal ||
          !values.statementMinimum)
      ) {
        throw new Error('Enter both statement dates, total, and minimum due')
      }
      const statement = hasStatement
        ? {
            date: values.statementDate,
            dueDate: values.actualDueDate,
            totalPaise: rupeesToPaise(values.statementTotal),
            minimumPaise: rupeesToPaise(values.statementMinimum),
            paidPaise: rupeesToPaise(values.statementPaid),
          }
        : undefined
      const creditCardDetails =
        values.type === 'credit-card'
          ? {
              lastFour: values.lastFour || null,
              creditLimitPaise: values.creditLimit
                ? rupeesToPaise(values.creditLimit)
                : null,
              statementDay: values.statementDay ? Number(values.statementDay) : null,
              paymentDueDay: values.paymentDueDay ? Number(values.paymentDueDay) : null,
              ...(statement ? { statement } : {}),
            }
          : undefined
      const next: Account = {
        ...account,
        id: account?.id ?? newId(),
        name: values.name.trim(),
        institution: values.institution.trim(),
        type: values.type,
        openingBalancePaise: rupeesToPaise(values.openingBalance),
        includeInNetWorth: values.includeInNetWorth,
        archived: values.archived,
        creditCardDetails,
        emergencyReserve: isLiquid && values.emergencyReserve,
        ...entityTimestamps(account ?? undefined),
      }
      const validated = accountSchema.safeParse(next)
      if (!validated.success) {
        setSubmitError(validated.error.issues[0]?.message ?? 'Check the account details')
        return
      }
      if (
        validated.data.emergencyReserve &&
        data.goals.some(
          (goal) => !goal.archived && goal.linkedAccountId === validated.data.id,
        )
      ) {
        throw new Error(
          'Unlink goals from this account before counting it as emergency money',
        )
      }
      await save('accounts', validated.data)
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
      title={
        cardDialog
          ? account
            ? 'Edit credit card'
            : 'Add credit card'
          : account
            ? 'Edit account'
            : 'Add account'
      }
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
            {submitting
              ? 'Saving…'
              : account
                ? 'Save changes'
                : cardDialog
                  ? 'Add credit card'
                  : 'Add account'}
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
          {cardDialog ? (
            <>
              <span>Account type</span>
              <strong>Credit card</strong>
              <input type="hidden" {...register('type')} />
            </>
          ) : (
            <>
              <label htmlFor="account-type">Account type</label>
              <select id="account-type" className="select" {...register('type')}>
                {Object.entries(accountTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </>
          )}
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
            {isCard
              ? 'Enter what you owe as a negative amount, for example -25000. A positive balance means the issuer owes you.'
              : 'Use a negative value for money owed on a card or loan account.'}
          </p>
          {errors.openingBalance ? (
            <p className="field-error">{errors.openingBalance.message}</p>
          ) : null}
        </div>
        {isLiquid ? (
          <label className="check-row field-span">
            <input type="checkbox" {...register('emergencyReserve')} />
            <span>Count as immediate emergency reserve</span>
          </label>
        ) : null}
        {isCard ? (
          <>
            <div className="field">
              <label htmlFor="card-last-four">Card last four digits</label>
              <input
                id="card-last-four"
                className="input"
                inputMode="numeric"
                autoComplete="off"
                placeholder="0042"
                {...register('lastFour')}
              />
              {errors.lastFour ? (
                <p className="field-error">{errors.lastFour.message}</p>
              ) : null}
            </div>
            <div className="field">
              <label htmlFor="card-credit-limit">Credit limit</label>
              <div className="currency-field">
                <span>₹</span>
                <input
                  id="card-credit-limit"
                  className="input"
                  inputMode="decimal"
                  placeholder="100000"
                  {...register('creditLimit')}
                />
              </div>
              {errors.creditLimit ? (
                <p className="field-error">{errors.creditLimit.message}</p>
              ) : null}
            </div>
            <div className="field">
              <label htmlFor="card-statement-day">Statement day</label>
              <input
                id="card-statement-day"
                className="input"
                inputMode="numeric"
                placeholder="20"
                {...register('statementDay')}
              />
              {errors.statementDay ? (
                <p className="field-error">{errors.statementDay.message}</p>
              ) : null}
            </div>
            <div className="field">
              <label htmlFor="card-payment-due-day">Payment due day</label>
              <input
                id="card-payment-due-day"
                className="input"
                inputMode="numeric"
                placeholder="9"
                {...register('paymentDueDay')}
              />
              {errors.paymentDueDay ? (
                <p className="field-error">{errors.paymentDueDay.message}</p>
              ) : null}
            </div>
            <p className="field-hint field-span">
              Cycle days are informational. Enter the actual statement below for a
              reminder; record payments as transfers and update the paid amount after
              checking your statement.
            </p>
            <div className="field">
              <label htmlFor="card-statement-date">Statement date</label>
              <input
                id="card-statement-date"
                className="input"
                type="date"
                {...register('statementDate')}
              />
            </div>
            <div className="field">
              <label htmlFor="card-actual-due-date">Actual statement due date</label>
              <input
                id="card-actual-due-date"
                className="input"
                type="date"
                {...register('actualDueDate')}
              />
            </div>
            <div className="field">
              <label htmlFor="card-statement-total">Statement total</label>
              <input
                id="card-statement-total"
                className="input"
                inputMode="decimal"
                {...register('statementTotal')}
              />
            </div>
            <div className="field">
              <label htmlFor="card-statement-minimum">Statement minimum</label>
              <input
                id="card-statement-minimum"
                className="input"
                inputMode="decimal"
                {...register('statementMinimum')}
              />
            </div>
            <div className="field field-span">
              <label htmlFor="card-statement-paid">Amount paid on statement</label>
              <input
                id="card-statement-paid"
                className="input"
                inputMode="decimal"
                {...register('statementPaid')}
              />
              <p className="field-hint">
                This is a manual confirmation, not linked automatically to transfers.
              </p>
            </div>
          </>
        ) : null}
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
