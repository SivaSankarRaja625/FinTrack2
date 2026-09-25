import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'

import { useFinance } from '../../app/FinanceContext'
import { todayIso } from '../../domain/dates'
import { entityTimestamps, newId } from '../../domain/id'
import { paiseToRupees, rupeesToPaise } from '../../domain/money'
import type { RecurringRule } from '../../domain/types'
import { Dialog } from '../../ui/Dialog'
import { useToast } from '../../ui/Toast'

const schema = z
  .object({
    name: z.string().trim().min(1, 'Enter a name').max(100),
    kind: z.enum(['income', 'expense', 'transfer']),
    amount: z.string().min(1, 'Enter an amount'),
    accountId: z.string().min(1, 'Choose an account'),
    destinationAccountId: z.string(),
    categoryId: z.string(),
    frequency: z.enum(['weekly', 'monthly', 'quarterly', 'half-yearly', 'yearly']),
    startDate: z.string().min(1),
    nextDate: z.string().min(1),
    endDate: z.string(),
    reminderDays: z.coerce.number().int().min(0).max(90),
    active: z.boolean(),
  })
  .superRefine((values, context) => {
    try {
      if (rupeesToPaise(values.amount) <= 0) throw new Error('invalid')
    } catch {
      context.addIssue({
        code: 'custom',
        path: ['amount'],
        message: 'Enter a valid positive INR amount',
      })
    }
    if (
      values.kind === 'transfer' &&
      (!values.destinationAccountId || values.destinationAccountId === values.accountId)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['destinationAccountId'],
        message: 'Choose a different destination account',
      })
    }
  })

type Input = z.input<typeof schema>
type Values = z.output<typeof schema>

export function RecurringDialog({
  rule,
  onClose,
}: {
  rule: RecurringRule | null
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
  } = useForm<Input, unknown, Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: rule?.name ?? '',
      kind: rule?.kind ?? 'expense',
      amount: rule ? paiseToRupees(rule.amountPaise) : '',
      accountId:
        rule?.accountId ?? data.accounts.find((account) => !account.archived)?.id ?? '',
      destinationAccountId: rule?.destinationAccountId ?? '',
      categoryId: rule?.categoryId ?? '',
      frequency: rule?.frequency ?? 'monthly',
      startDate: rule?.startDate ?? todayIso(),
      nextDate: rule?.nextDate ?? todayIso(),
      endDate: rule?.endDate ?? '',
      reminderDays: rule?.reminderDays ?? 3,
      active: rule?.active ?? true,
    },
  })
  const kind = useWatch({ control, name: 'kind' })
  const accountId = useWatch({ control, name: 'accountId' })
  const categories = data.categories.filter(
    (category) =>
      !category.archived && category.kind === (kind === 'income' ? 'income' : 'expense'),
  )

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true)
    setError(null)
    try {
      const next: RecurringRule = {
        id: rule?.id ?? newId(),
        name: values.name.trim(),
        kind: values.kind,
        amountPaise: rupeesToPaise(values.amount),
        accountId: values.accountId,
        destinationAccountId:
          values.kind === 'transfer' ? values.destinationAccountId : null,
        categoryId: values.kind === 'transfer' ? null : values.categoryId || null,
        frequency: values.frequency,
        startDate: values.startDate,
        nextDate: values.nextDate,
        endDate: values.endDate || null,
        reminderDays: values.reminderDays,
        active: values.active,
        ...entityTimestamps(rule ?? undefined),
      }
      await save('recurringRules', next)
      notify(rule ? 'Recurring item updated' : 'Recurring item added')
      onClose()
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'The recurring item could not be saved',
      )
    } finally {
      setSubmitting(false)
    }
  })

  return (
    <Dialog
      open
      title={rule ? 'Edit recurring item' : 'Add recurring item'}
      description="Recurring rules drive upcoming obligations and cash-flow projections; they do not create transactions automatically."
      size="large"
      onClose={onClose}
      footer={
        <div className="cluster cluster-between" style={{ width: '100%' }}>
          <button type="button" className="button button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            form="recurring-form"
            className="button"
            disabled={submitting}
          >
            {submitting ? 'Saving…' : rule ? 'Save changes' : 'Add recurring item'}
          </button>
        </div>
      }
    >
      <form id="recurring-form" className="form-grid" onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="recurring-name">Name</label>
          <input
            id="recurring-name"
            className="input"
            placeholder="Salary, rent, subscription…"
            {...register('name')}
          />
          {errors.name ? <p className="field-error">{errors.name.message}</p> : null}
        </div>
        <div className="field">
          <label htmlFor="recurring-kind">Type</label>
          <select id="recurring-kind" className="select" {...register('kind')}>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
            <option value="transfer">Transfer</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="recurring-amount">Amount</label>
          <div className="currency-field">
            <span>₹</span>
            <input
              id="recurring-amount"
              className="input"
              inputMode="decimal"
              {...register('amount')}
            />
          </div>
          {errors.amount ? <p className="field-error">{errors.amount.message}</p> : null}
        </div>
        <div className="field">
          <label htmlFor="recurring-frequency">Frequency</label>
          <select id="recurring-frequency" className="select" {...register('frequency')}>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="half-yearly">Every six months</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="recurring-account">
            {kind === 'transfer' ? 'From account' : 'Account'}
          </label>
          <select id="recurring-account" className="select" {...register('accountId')}>
            <option value="">Choose account</option>
            {data.accounts
              .filter((account) => !account.archived)
              .map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
          </select>
          {errors.accountId ? (
            <p className="field-error">{errors.accountId.message}</p>
          ) : null}
        </div>
        {kind === 'transfer' ? (
          <div className="field">
            <label htmlFor="recurring-destination">To account</label>
            <select
              id="recurring-destination"
              className="select"
              {...register('destinationAccountId')}
            >
              <option value="">Choose account</option>
              {data.accounts
                .filter((account) => !account.archived && account.id !== accountId)
                .map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
            </select>
            {errors.destinationAccountId ? (
              <p className="field-error">{errors.destinationAccountId.message}</p>
            ) : null}
          </div>
        ) : (
          <div className="field">
            <label htmlFor="recurring-category">Category</label>
            <select
              id="recurring-category"
              className="select"
              {...register('categoryId')}
            >
              <option value="">Uncategorised</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="recurring-start">Starts</label>
          <input
            id="recurring-start"
            className="input"
            type="date"
            {...register('startDate')}
          />
        </div>
        <div className="field">
          <label htmlFor="recurring-next">Next expected date</label>
          <input
            id="recurring-next"
            className="input"
            type="date"
            {...register('nextDate')}
          />
        </div>
        <div className="field">
          <label htmlFor="recurring-end">Ends (optional)</label>
          <input
            id="recurring-end"
            className="input"
            type="date"
            {...register('endDate')}
          />
        </div>
        <div className="field">
          <label htmlFor="recurring-reminder">Reminder lead days</label>
          <input
            id="recurring-reminder"
            className="input"
            type="number"
            min="0"
            max="90"
            {...register('reminderDays')}
          />
        </div>
        {rule ? (
          <label className="check-row field-span">
            <input type="checkbox" {...register('active')} />
            <span>Keep this recurring item active</span>
          </label>
        ) : null}
        {error ? (
          <p className="field-error field-span" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </Dialog>
  )
}
