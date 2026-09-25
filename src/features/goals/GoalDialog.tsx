import { zodResolver } from '@hookform/resolvers/zod'
import { addYears, format } from 'date-fns'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { useFinance } from '../../app/FinanceContext'
import { entityTimestamps, newId } from '../../domain/id'
import { paiseToRupees, rupeesToPaise } from '../../domain/money'
import type { Goal } from '../../domain/types'
import { Dialog } from '../../ui/Dialog'
import { useToast } from '../../ui/Toast'

const schema = z.object({
  name: z.string().trim().min(1, 'Enter a goal name').max(150),
  target: z.string().min(1, 'Enter the target amount'),
  current: z.string().min(1, 'Enter the amount already saved'),
  targetDate: z.string().min(1, 'Choose a target date'),
  priority: z.enum(['high', 'medium', 'low']),
  linkedAccountId: z.string(),
  plannedMonthly: z.string().min(1, 'Enter a planned monthly contribution'),
  archived: z.boolean(),
})

type Values = z.infer<typeof schema>

export function GoalDialog({
  goal,
  onClose,
}: {
  goal: Goal | null
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
      name: goal?.name ?? '',
      target: goal ? paiseToRupees(goal.targetPaise) : '',
      current: goal ? paiseToRupees(goal.currentPaise) : '0.00',
      targetDate: goal?.targetDate ?? format(addYears(new Date(), 2), 'yyyy-MM-dd'),
      priority: goal?.priority ?? 'medium',
      linkedAccountId: goal?.linkedAccountId ?? '',
      plannedMonthly: goal ? paiseToRupees(goal.plannedMonthlyPaise) : '',
      archived: goal?.archived ?? false,
    },
  })

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true)
    setError(null)
    try {
      const targetPaise = rupeesToPaise(values.target)
      const currentPaise = rupeesToPaise(values.current)
      const plannedMonthlyPaise = rupeesToPaise(values.plannedMonthly)
      if (targetPaise <= 0) throw new Error('Target amount must be greater than zero')
      if (currentPaise < 0 || plannedMonthlyPaise < 0) {
        throw new Error('Saved and monthly amounts cannot be negative')
      }
      const next: Goal = {
        id: goal?.id ?? newId(),
        name: values.name.trim(),
        targetPaise,
        currentPaise,
        targetDate: values.targetDate,
        priority: values.priority,
        linkedAccountId: values.linkedAccountId || null,
        plannedMonthlyPaise,
        archived: values.archived,
        ...entityTimestamps(goal ?? undefined),
      }
      await save('goals', next)
      notify(goal ? 'Goal updated' : 'Goal added')
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The goal could not be saved')
    } finally {
      setSubmitting(false)
    }
  })

  return (
    <Dialog
      open
      title={goal ? 'Edit goal' : 'Add savings goal'}
      description="Link an account to use its current balance, or maintain a manual saved amount."
      onClose={onClose}
      footer={
        <div className="cluster cluster-between" style={{ width: '100%' }}>
          <button type="button" className="button button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="goal-form" className="button" disabled={submitting}>
            {submitting ? 'Saving…' : goal ? 'Save changes' : 'Add goal'}
          </button>
        </div>
      }
    >
      <form id="goal-form" className="form-grid" onSubmit={onSubmit} noValidate>
        <div className="field field-span">
          <label htmlFor="goal-name">Goal name</label>
          <input id="goal-name" className="input" {...register('name')} />
          {errors.name ? <p className="field-error">{errors.name.message}</p> : null}
        </div>
        <div className="field">
          <label htmlFor="goal-target">Target amount</label>
          <div className="currency-field">
            <span>₹</span>
            <input
              id="goal-target"
              className="input"
              inputMode="decimal"
              {...register('target')}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="goal-date">Target date</label>
          <input
            id="goal-date"
            className="input"
            type="date"
            {...register('targetDate')}
          />
        </div>
        <div className="field">
          <label htmlFor="goal-current">Amount already saved</label>
          <div className="currency-field">
            <span>₹</span>
            <input
              id="goal-current"
              className="input"
              inputMode="decimal"
              {...register('current')}
            />
          </div>
          <p className="field-hint">Ignored while an account is linked.</p>
        </div>
        <div className="field">
          <label htmlFor="goal-account">Linked savings account</label>
          <select id="goal-account" className="select" {...register('linkedAccountId')}>
            <option value="">Use manual saved amount</option>
            {data.accounts
              .filter(
                (account) =>
                  !account.archived &&
                  !['credit-card', 'loan', 'investment'].includes(account.type),
              )
              .map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="goal-monthly">Planned monthly contribution</label>
          <div className="currency-field">
            <span>₹</span>
            <input
              id="goal-monthly"
              className="input"
              inputMode="decimal"
              {...register('plannedMonthly')}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="goal-priority">Priority</label>
          <select id="goal-priority" className="select" {...register('priority')}>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <label className="check-row field-span">
          <input type="checkbox" {...register('archived')} />
          <span>Archive this goal</span>
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
