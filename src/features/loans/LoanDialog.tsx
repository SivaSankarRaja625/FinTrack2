import { zodResolver } from '@hookform/resolvers/zod'
import Decimal from 'decimal.js'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { useFinance } from '../../app/FinanceContext'
import { calculateEmiPaise } from '../../domain/calculations'
import { todayIso } from '../../domain/dates'
import { entityTimestamps, newId } from '../../domain/id'
import { paiseToRupees, rupeesToPaise } from '../../domain/money'
import type { Loan } from '../../domain/types'
import { Dialog } from '../../ui/Dialog'
import { useToast } from '../../ui/Toast'

const schema = z.object({
  name: z.string().trim().min(1, 'Enter a loan name').max(120),
  lender: z.string().trim().max(120),
  accountId: z.string(),
  principal: z.string().min(1, 'Enter the original principal'),
  outstanding: z.string().min(1, 'Enter the current outstanding balance'),
  annualRate: z.string().min(1, 'Enter the annual interest rate'),
  interestType: z.enum(['reducing', 'flat']),
  termMonths: z.coerce.number().int().positive().max(600),
  emi: z.string(),
  startDate: z.string().min(1),
  nextPaymentDate: z.string().min(1),
  paymentDay: z.coerce.number().int().min(1).max(31),
  prepayment: z.string(),
  active: z.boolean(),
})

type Input = z.input<typeof schema>
type Values = z.output<typeof schema>

function percentToBasisPoints(value: string): number {
  return new Decimal(value).mul(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber()
}

export function LoanDialog({
  loan,
  onClose,
}: {
  loan: Loan | null
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
  } = useForm<Input, unknown, Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: loan?.name ?? '',
      lender: loan?.lender ?? '',
      accountId: loan?.accountId ?? '',
      principal: loan ? paiseToRupees(loan.principalPaise) : '',
      outstanding: loan ? paiseToRupees(loan.outstandingPaise) : '',
      annualRate: loan ? new Decimal(loan.annualInterestRateBps).div(100).toString() : '',
      interestType: loan?.interestType ?? 'reducing',
      termMonths: loan?.termMonths ?? 60,
      emi: loan?.emiPaise ? paiseToRupees(loan.emiPaise) : '',
      startDate: loan?.startDate ?? todayIso(),
      nextPaymentDate: loan?.nextPaymentDate ?? todayIso(),
      paymentDay: loan?.paymentDay ?? 5,
      prepayment: loan?.prepaymentPaise ? paiseToRupees(loan.prepaymentPaise) : '0.00',
      active: loan?.active ?? true,
    },
  })

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true)
    setError(null)
    try {
      const principalPaise = rupeesToPaise(values.principal)
      const outstandingPaise = rupeesToPaise(values.outstanding)
      const annualInterestRateBps = percentToBasisPoints(values.annualRate)
      if (principalPaise <= 0) throw new Error('Principal must be greater than zero')
      if (outstandingPaise < 0) throw new Error('Outstanding balance cannot be negative')
      if (annualInterestRateBps < 0) {
        throw new Error('Interest rate cannot be negative')
      }
      const emiPaise = values.emi
        ? rupeesToPaise(values.emi)
        : calculateEmiPaise(outstandingPaise, annualInterestRateBps, values.termMonths)
      const next: Loan = {
        id: loan?.id ?? newId(),
        name: values.name.trim(),
        lender: values.lender.trim(),
        accountId: values.accountId || null,
        principalPaise,
        outstandingPaise,
        annualInterestRateBps,
        interestType: values.interestType,
        termMonths: values.termMonths,
        emiPaise,
        startDate: values.startDate,
        nextPaymentDate: values.nextPaymentDate,
        paymentDay: values.paymentDay,
        prepaymentPaise: values.prepayment ? rupeesToPaise(values.prepayment) : 0,
        rateChanges: loan?.rateChanges ?? [],
        payments: loan?.payments ?? [],
        active: values.active,
        ...entityTimestamps(loan ?? undefined),
      }
      await save('loans', next)
      notify(loan ? 'Loan updated' : 'Loan added')
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The loan could not be saved')
    } finally {
      setSubmitting(false)
    }
  })

  return (
    <Dialog
      open
      title={loan ? 'Edit loan' : 'Add loan'}
      description="Use the current outstanding balance and remaining term for forward projections."
      size="large"
      onClose={onClose}
      footer={
        <div className="cluster cluster-between" style={{ width: '100%' }}>
          <button type="button" className="button button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="loan-form" className="button" disabled={submitting}>
            {submitting ? 'Saving…' : loan ? 'Save changes' : 'Add loan'}
          </button>
        </div>
      }
    >
      <form id="loan-form" className="form-grid" onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="loan-name">Loan name</label>
          <input
            id="loan-name"
            className="input"
            placeholder="Home loan"
            {...register('name')}
          />
          {errors.name ? <p className="field-error">{errors.name.message}</p> : null}
        </div>
        <div className="field">
          <label htmlFor="loan-lender">Lender</label>
          <input id="loan-lender" className="input" {...register('lender')} />
        </div>
        <div className="field">
          <label htmlFor="loan-principal">Original principal</label>
          <div className="currency-field">
            <span>₹</span>
            <input
              id="loan-principal"
              className="input"
              inputMode="decimal"
              {...register('principal')}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="loan-outstanding">Current outstanding</label>
          <div className="currency-field">
            <span>₹</span>
            <input
              id="loan-outstanding"
              className="input"
              inputMode="decimal"
              {...register('outstanding')}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="loan-rate">Base annual interest rate (%)</label>
          <input
            id="loan-rate"
            className="input"
            inputMode="decimal"
            placeholder="8.50"
            {...register('annualRate')}
          />
        </div>
        <div className="field">
          <label htmlFor="interest-type">Interest method</label>
          <select id="interest-type" className="select" {...register('interestType')}>
            <option value="reducing">Reducing balance</option>
            <option value="flat">Flat interest</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="loan-term">Remaining term (months)</label>
          <input
            id="loan-term"
            className="input"
            type="number"
            min="1"
            max="600"
            {...register('termMonths')}
          />
        </div>
        <div className="field">
          <label htmlFor="loan-emi">EMI (leave blank to calculate)</label>
          <div className="currency-field">
            <span>₹</span>
            <input
              id="loan-emi"
              className="input"
              inputMode="decimal"
              {...register('emi')}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="loan-start">Original start date</label>
          <input
            id="loan-start"
            className="input"
            type="date"
            {...register('startDate')}
          />
        </div>
        <div className="field">
          <label htmlFor="loan-next">Next EMI date</label>
          <input
            id="loan-next"
            className="input"
            type="date"
            {...register('nextPaymentDate')}
          />
        </div>
        <div className="field">
          <label htmlFor="payment-day">Usual payment day</label>
          <input
            id="payment-day"
            className="input"
            type="number"
            min="1"
            max="31"
            {...register('paymentDay')}
          />
        </div>
        <div className="field">
          <label htmlFor="loan-account">Linked loan account (optional)</label>
          <select id="loan-account" className="select" {...register('accountId')}>
            <option value="">No linked account</option>
            {data.accounts
              .filter((account) => account.type === 'loan' && !account.archived)
              .map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
          </select>
        </div>
        <div className="field field-span">
          <label htmlFor="prepayment-scenario">Prepayment scenario</label>
          <div className="currency-field">
            <span>₹</span>
            <input
              id="prepayment-scenario"
              className="input"
              inputMode="decimal"
              {...register('prepayment')}
            />
          </div>
          <p className="field-hint">
            Used only for the displayed payoff scenario; recording an actual payment
            updates the outstanding balance.
          </p>
        </div>
        {loan ? (
          <label className="check-row field-span">
            <input type="checkbox" {...register('active')} />
            <span>Keep this loan active and included as debt</span>
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
