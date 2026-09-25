import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { useFinance } from '../../app/FinanceContext'
import { entityTimestamps, newId } from '../../domain/id'
import { paiseToRupees, rupeesToPaise } from '../../domain/money'
import type { Budget } from '../../domain/types'
import { Dialog } from '../../ui/Dialog'
import { useToast } from '../../ui/Toast'

const schema = z.object({
  name: z.string().trim().min(1, 'Enter a budget name').max(100),
  categoryId: z.string().min(1, 'Choose an expense category'),
  monthlyLimit: z.string().min(1, 'Enter a monthly limit'),
  rollover: z.boolean(),
  active: z.boolean(),
})

type Values = z.infer<typeof schema>

export function BudgetDialog({
  budget,
  onClose,
}: {
  budget: Budget | null
  onClose: () => void
}) {
  const { data, save } = useFinance()
  const { notify } = useToast()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const categories = data.categories.filter(
    (category) => category.kind === 'expense' && !category.archived,
  )
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: budget?.name ?? '',
      categoryId: budget?.categoryId ?? categories[0]?.id ?? '',
      monthlyLimit: budget ? paiseToRupees(budget.monthlyLimitPaise) : '',
      rollover: budget?.rollover ?? false,
      active: budget?.active ?? true,
    },
  })

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true)
    setError(null)
    try {
      const limit = rupeesToPaise(values.monthlyLimit)
      if (limit <= 0) throw new Error('Monthly limit must be greater than zero')
      const duplicate = data.budgets.find(
        (item) => item.categoryId === values.categoryId && item.id !== budget?.id,
      )
      if (duplicate) {
        throw new Error('This category already has a budget; edit it instead')
      }
      const next: Budget = {
        id: budget?.id ?? newId(),
        name: values.name.trim(),
        categoryId: values.categoryId,
        monthlyLimitPaise: limit,
        rollover: values.rollover,
        active: values.active,
        ...entityTimestamps(budget ?? undefined),
      }
      await save('budgets', next)
      notify(budget ? 'Budget updated' : 'Budget added')
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The budget could not be saved')
    } finally {
      setSubmitting(false)
    }
  })

  return (
    <Dialog
      open
      title={budget ? 'Edit budget' : 'Add monthly budget'}
      description="Budget use is calculated from posted expenses in this category."
      onClose={onClose}
      footer={
        <div className="cluster cluster-between" style={{ width: '100%' }}>
          <button type="button" className="button button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            form="budget-form"
            className="button"
            disabled={submitting}
          >
            {submitting ? 'Saving…' : budget ? 'Save changes' : 'Add budget'}
          </button>
        </div>
      }
    >
      <form id="budget-form" className="stack" onSubmit={onSubmit} noValidate>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="budget-name">Name</label>
            <input
              id="budget-name"
              className="input"
              placeholder="Monthly groceries"
              {...register('name')}
            />
            {errors.name ? <p className="field-error">{errors.name.message}</p> : null}
          </div>
          <div className="field">
            <label htmlFor="budget-category">Expense category</label>
            <select id="budget-category" className="select" {...register('categoryId')}>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            {errors.categoryId ? (
              <p className="field-error">{errors.categoryId.message}</p>
            ) : null}
          </div>
          <div className="field field-span">
            <label htmlFor="budget-limit">Monthly limit</label>
            <div className="currency-field">
              <span>₹</span>
              <input
                id="budget-limit"
                className="input"
                inputMode="decimal"
                {...register('monthlyLimit')}
              />
            </div>
            {errors.monthlyLimit ? (
              <p className="field-error">{errors.monthlyLimit.message}</p>
            ) : null}
          </div>
        </div>
        <label className="check-row">
          <input type="checkbox" {...register('rollover')} />
          <span>Carry unused allowance from the previous month into this month</span>
        </label>
        {budget ? (
          <label className="check-row">
            <input type="checkbox" {...register('active')} />
            <span>Keep this budget active</span>
          </label>
        ) : null}
        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </Dialog>
  )
}
