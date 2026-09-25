import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'

import { useFinance } from '../../app/FinanceContext'
import { todayIso } from '../../domain/dates'
import { entityTimestamps, newId } from '../../domain/id'
import { paiseToRupees, rupeesToPaise } from '../../domain/money'
import type { Transaction } from '../../domain/types'
import { Dialog } from '../../ui/Dialog'
import { Icon } from '../../ui/Icon'
import { useToast } from '../../ui/Toast'

const schema = z
  .object({
    kind: z.enum(['income', 'expense', 'transfer', 'adjustment']),
    accountId: z.string().min(1, 'Choose an account'),
    destinationAccountId: z.string(),
    categoryId: z.string(),
    amount: z.string().trim().min(1, 'Enter an amount'),
    date: z.string().min(1, 'Choose a date'),
    description: z.string().trim().min(1, 'Enter a description').max(300),
    note: z.string().max(2_000),
    cleared: z.boolean(),
    splits: z.array(
      z.object({
        id: z.string(),
        categoryId: z.string().min(1, 'Choose a category'),
        amount: z.string().min(1, 'Enter an amount'),
      }),
    ),
  })
  .superRefine((values, context) => {
    let amount = 0
    try {
      amount = rupeesToPaise(values.amount)
      if (values.kind !== 'adjustment' && amount <= 0) throw new Error('invalid')
    } catch {
      context.addIssue({
        code: 'custom',
        path: ['amount'],
        message: 'Enter a valid positive INR amount',
      })
    }
    if (values.kind === 'transfer') {
      if (!values.destinationAccountId) {
        context.addIssue({
          code: 'custom',
          path: ['destinationAccountId'],
          message: 'Choose a destination account',
        })
      } else if (values.destinationAccountId === values.accountId) {
        context.addIssue({
          code: 'custom',
          path: ['destinationAccountId'],
          message: 'Choose a different account',
        })
      }
    }
    if (values.splits.length > 0) {
      const splitTotal = values.splits.reduce((sum, split, index) => {
        try {
          return sum + rupeesToPaise(split.amount)
        } catch {
          context.addIssue({
            code: 'custom',
            path: ['splits', index, 'amount'],
            message: 'Enter a valid amount',
          })
          return sum
        }
      }, 0)
      if (splitTotal !== amount) {
        context.addIssue({
          code: 'custom',
          path: ['splits'],
          message: 'Split amounts must add up to the transaction amount',
        })
      }
    }
  })

type Values = z.infer<typeof schema>

export function TransactionDialog({
  transaction,
  onClose,
}: {
  transaction: Transaction | null
  onClose: () => void
}) {
  const { data, save } = useFinance()
  const { notify } = useToast()
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      kind: transaction?.kind ?? 'expense',
      accountId:
        transaction?.accountId ??
        data.accounts.find((account) => !account.archived)?.id ??
        '',
      destinationAccountId: transaction?.destinationAccountId ?? '',
      categoryId: transaction?.categoryId ?? '',
      amount: transaction ? paiseToRupees(transaction.amountPaise) : '',
      date: transaction?.date ?? todayIso(),
      description: transaction?.description ?? '',
      note: transaction?.note ?? '',
      cleared: transaction?.cleared ?? true,
      splits:
        transaction?.splits.map((split) => ({
          id: split.id,
          categoryId: split.categoryId,
          amount: paiseToRupees(split.amountPaise),
        })) ?? [],
    },
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'splits' })
  const kind = useWatch({ control, name: 'kind' })
  const accountId = useWatch({ control, name: 'accountId' })
  const amount = useWatch({ control, name: 'amount' })
  const expenseCategories = data.categories.filter(
    (category) => category.kind === 'expense' && !category.archived,
  )
  const categories = data.categories.filter(
    (category) =>
      !category.archived && category.kind === (kind === 'income' ? 'income' : 'expense'),
  )

  const addSplit = () => {
    append({
      id: newId(),
      categoryId: expenseCategories[0]?.id ?? '',
      amount: fields.length === 0 ? amount : '',
    })
  }

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true)
    setSubmitError(null)
    try {
      const next: Transaction = {
        id: transaction?.id ?? newId(),
        kind: values.kind,
        accountId: values.accountId,
        destinationAccountId:
          values.kind === 'transfer' ? values.destinationAccountId : null,
        categoryId:
          values.kind === 'transfer' || values.splits.length > 0
            ? null
            : values.categoryId || null,
        amountPaise: rupeesToPaise(values.amount),
        date: values.date,
        description: values.description.trim(),
        note: values.note.trim(),
        tags: transaction?.tags ?? [],
        cleared: values.cleared,
        splits: values.splits.map((split) => ({
          id: split.id,
          categoryId: split.categoryId,
          amountPaise: rupeesToPaise(split.amount),
        })),
        recurringRuleId: transaction?.recurringRuleId ?? null,
        importBatchId: transaction?.importBatchId ?? null,
        ...entityTimestamps(transaction ?? undefined),
      }
      await save('transactions', next)
      notify(transaction ? 'Transaction updated' : 'Transaction added')
      onClose()
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'The transaction could not be saved',
      )
    } finally {
      setSubmitting(false)
    }
  })

  return (
    <Dialog
      open
      title={transaction ? 'Edit transaction' : 'Add transaction'}
      description="Transfers move money between accounts and do not count as income or expense."
      onClose={onClose}
      size="large"
      footer={
        <div className="cluster cluster-between" style={{ width: '100%' }}>
          <button type="button" className="button button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            form="transaction-form"
            className="button"
            disabled={submitting}
          >
            {submitting ? 'Saving…' : transaction ? 'Save changes' : 'Add transaction'}
          </button>
        </div>
      }
    >
      <form id="transaction-form" className="stack" onSubmit={onSubmit} noValidate>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="transaction-kind">Type</label>
            <select id="transaction-kind" className="select" {...register('kind')}>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
              <option value="transfer">Transfer</option>
              <option value="adjustment">Balance adjustment</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="transaction-date">Date</label>
            <input
              id="transaction-date"
              className="input"
              type="date"
              {...register('date')}
            />
            {errors.date ? <p className="field-error">{errors.date.message}</p> : null}
          </div>
          <div className="field">
            <label htmlFor="source-account">
              {kind === 'transfer' ? 'From account' : 'Account'}
            </label>
            <select id="source-account" className="select" {...register('accountId')}>
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
              <label htmlFor="destination-account">To account</label>
              <select
                id="destination-account"
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
              <label htmlFor="category">Category</label>
              <select
                id="category"
                className="select"
                disabled={fields.length > 0}
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
            <label htmlFor="transaction-amount">Amount</label>
            <div className="currency-field">
              <span>₹</span>
              <input
                id="transaction-amount"
                className="input"
                inputMode="decimal"
                placeholder="0.00"
                {...register('amount')}
              />
            </div>
            {errors.amount ? (
              <p className="field-error">{errors.amount.message}</p>
            ) : null}
          </div>
          <div className="field">
            <label htmlFor="description">Description</label>
            <input
              id="description"
              className="input"
              placeholder="Rent, salary, groceries…"
              {...register('description')}
            />
            {errors.description ? (
              <p className="field-error">{errors.description.message}</p>
            ) : null}
          </div>
          <div className="field field-span">
            <label htmlFor="transaction-note">Note</label>
            <textarea id="transaction-note" className="textarea" {...register('note')} />
          </div>
        </div>

        {kind === 'expense' ? (
          <section className="subsection">
            <div className="cluster cluster-between">
              <div>
                <h3>Category split</h3>
                <p className="field-hint">
                  Optional. Split one payment across multiple expense categories.
                </p>
              </div>
              <button
                type="button"
                className="button button-secondary"
                onClick={addSplit}
              >
                <Icon name="plus" size={16} />
                Add split
              </button>
            </div>
            {fields.length > 0 ? (
              <div className="split-list">
                {fields.map((field, index) => (
                  <div key={field.id} className="split-row">
                    <select
                      className="select"
                      aria-label={`Split ${index + 1} category`}
                      {...register(`splits.${index}.categoryId`)}
                    >
                      <option value="">Choose category</option>
                      {expenseCategories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                    <div className="currency-field">
                      <span>₹</span>
                      <input
                        className="input"
                        inputMode="decimal"
                        aria-label={`Split ${index + 1} amount`}
                        {...register(`splits.${index}.amount`)}
                      />
                    </div>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Remove split ${index + 1}`}
                      onClick={() => remove(index)}
                    >
                      <Icon name="trash" size={17} />
                    </button>
                  </div>
                ))}
                {errors.splits?.message ? (
                  <p className="field-error">{errors.splits.message}</p>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}

        <label className="check-row">
          <input type="checkbox" {...register('cleared')} />
          <span>This transaction has cleared the account</span>
        </label>
        {submitError ? (
          <p className="field-error" role="alert">
            {submitError}
          </p>
        ) : null}
      </form>
    </Dialog>
  )
}
