import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { useFinance } from '../../app/FinanceContext'
import { todayIso } from '../../domain/dates'
import { entityTimestamps, newId } from '../../domain/id'
import { paiseToRupees, rupeesToPaise } from '../../domain/money'
import type { InsurancePolicy } from '../../domain/types'
import { Dialog } from '../../ui/Dialog'
import { useToast } from '../../ui/Toast'
import { coverageFor } from './coverage'

const schema = z.object({
  type: z.enum(['term-life', 'health', 'vehicle', 'home', 'personal-accident', 'other']),
  insurer: z.string().trim().min(1, 'Enter the insurer').max(150),
  policyName: z.string().trim().min(1, 'Enter the policy name').max(150),
  policyNumber: z.string().trim().max(100),
  sumAssured: z.string().min(1, 'Enter the cover amount'),
  premium: z.string().min(1, 'Enter the premium'),
  premiumFrequency: z.enum(['weekly', 'monthly', 'quarterly', 'half-yearly', 'yearly']),
  startDate: z.string().min(1),
  endDate: z.string(),
  nextPremiumDate: z.string().min(1, 'Choose the next premium date'),
  renewalDate: z.string(),
  maturityDate: z.string(),
  nomineeName: z.string().max(120),
  nomineeRelation: z.string().max(100),
  contact: z.string().max(200),
  note: z.string().max(2_000),
  active: z.boolean(),
  coverSource: z.enum(['personal', 'employer', 'other']),
  insuredPeople: z.string().max(500),
  coverLayer: z.enum(['base', 'top-up', 'other']),
  deductible: z.string(),
  coPayPercent: z.string(),
  restrictions: z.string().max(1_000),
  claimContact: z.string().max(200),
  reminderDays: z.string().max(30),
})

type Values = z.infer<typeof schema>

export function PolicyDialog({
  policy,
  onClose,
}: {
  policy: InsurancePolicy | null
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
      type: policy?.type ?? 'health',
      insurer: policy?.insurer ?? '',
      policyName: policy?.policyName ?? '',
      policyNumber: policy?.policyNumber ?? '',
      sumAssured: policy ? paiseToRupees(policy.sumAssuredPaise) : '',
      premium: policy ? paiseToRupees(policy.premiumPaise) : '',
      premiumFrequency: policy?.premiumFrequency ?? 'yearly',
      startDate: policy?.startDate ?? todayIso(),
      endDate: policy?.endDate ?? '',
      nextPremiumDate: policy?.nextPremiumDate ?? todayIso(),
      renewalDate: policy?.renewalDate ?? '',
      maturityDate: policy?.maturityDate ?? '',
      nomineeName: policy?.nomineeName ?? '',
      nomineeRelation: policy?.nomineeRelation ?? '',
      contact: policy?.contact ?? '',
      note: policy?.note ?? '',
      active: policy?.active ?? true,
      coverSource: coverageFor(policy).source,
      insuredPeople: coverageFor(policy).insuredPeople.join(', '),
      coverLayer: coverageFor(policy).layer,
      deductible: paiseToRupees(coverageFor(policy).deductiblePaise),
      coPayPercent: coverageFor(policy).coPayPercent?.toString() ?? '',
      restrictions: coverageFor(policy).restrictions,
      claimContact: coverageFor(policy).claimContact,
      reminderDays: coverageFor(policy).reminderDays.join(','),
    },
  })

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true)
    setError(null)
    try {
      const sumAssuredPaise = rupeesToPaise(values.sumAssured)
      const premiumPaise = rupeesToPaise(values.premium)
      if (sumAssuredPaise < 0 || premiumPaise < 0) {
        throw new Error('Cover and premium cannot be negative')
      }
      const deductiblePaise = rupeesToPaise(values.deductible)
      if (deductiblePaise < 0) throw new Error('Deductible cannot be negative')
      const coPayPercent = values.coPayPercent.trim() ? Number(values.coPayPercent) : null
      if (
        coPayPercent !== null &&
        (!Number.isFinite(coPayPercent) || coPayPercent < 0 || coPayPercent > 100)
      ) {
        throw new Error('Co-pay must be between 0 and 100 percent')
      }
      const reminderDays = values.reminderDays
        .split(',')
        .map((entry) => Number(entry.trim()))
      if (
        reminderDays.length < 1 ||
        reminderDays.length > 6 ||
        reminderDays.some((days) => !Number.isInteger(days) || days < 0 || days > 90)
      ) {
        throw new Error('Enter up to six reminder days between 0 and 90')
      }
      const next: InsurancePolicy = {
        ...policy,
        id: policy?.id ?? newId(),
        type: values.type,
        insurer: values.insurer.trim(),
        policyName: values.policyName.trim(),
        policyNumber: values.policyNumber.trim(),
        sumAssuredPaise,
        premiumPaise,
        premiumFrequency: values.premiumFrequency,
        startDate: values.startDate,
        endDate: values.endDate || null,
        nextPremiumDate: values.nextPremiumDate,
        renewalDate: values.renewalDate || null,
        maturityDate: values.maturityDate || null,
        nomineeName: values.nomineeName.trim(),
        nomineeRelation: values.nomineeRelation.trim(),
        contact: values.contact.trim(),
        note: values.note.trim(),
        attachmentIds: policy?.attachmentIds ?? [],
        active: values.active,
        coverage: {
          ...coverageFor(policy),
          source: values.coverSource,
          insuredPeople: values.insuredPeople
            .split(',')
            .map((person) => person.trim())
            .filter(Boolean),
          layer: values.coverLayer,
          deductiblePaise,
          coPayPercent,
          restrictions: values.restrictions.trim(),
          claimContact: values.claimContact.trim(),
          reminderDays: [...new Set(reminderDays)],
        },
        ...entityTimestamps(policy ?? undefined),
      }
      await save('insurancePolicies', next)
      notify(policy ? 'Policy updated' : 'Policy added')
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The policy could not be saved')
    } finally {
      setSubmitting(false)
    }
  })

  return (
    <Dialog
      open
      title={policy ? 'Edit insurance policy' : 'Add insurance policy'}
      description="Policy cover is shown separately and is never counted as net worth."
      onClose={onClose}
      footer={
        <div className="cluster cluster-between" style={{ width: '100%' }}>
          <button type="button" className="button button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            form="policy-form"
            className="button"
            disabled={submitting}
          >
            {submitting ? 'Saving…' : policy ? 'Save changes' : 'Add policy'}
          </button>
        </div>
      }
    >
      <form id="policy-form" className="form-grid" onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="policy-type">Policy type</label>
          <select id="policy-type" className="select" {...register('type')}>
            <option value="term-life">Term life</option>
            <option value="health">Health</option>
            <option value="vehicle">Vehicle</option>
            <option value="home">Home</option>
            <option value="personal-accident">Personal accident</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="policy-insurer">Insurer</label>
          <input id="policy-insurer" className="input" {...register('insurer')} />
          {errors.insurer ? (
            <p className="field-error">{errors.insurer.message}</p>
          ) : null}
        </div>
        <div className="field field-span">
          <label htmlFor="policy-name">Policy name</label>
          <input id="policy-name" className="input" {...register('policyName')} />
          {errors.policyName ? (
            <p className="field-error">{errors.policyName.message}</p>
          ) : null}
        </div>
        <div className="field field-span">
          <label htmlFor="policy-number">Policy number</label>
          <input
            id="policy-number"
            className="input"
            autoComplete="off"
            {...register('policyNumber')}
          />
        </div>
        <div className="field">
          <label htmlFor="policy-cover">Cover amount</label>
          <div className="currency-field">
            <span>₹</span>
            <input
              id="policy-cover"
              className="input"
              inputMode="decimal"
              {...register('sumAssured')}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="policy-premium">Premium</label>
          <div className="currency-field">
            <span>₹</span>
            <input
              id="policy-premium"
              className="input"
              inputMode="decimal"
              {...register('premium')}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="premium-frequency">Premium frequency</label>
          <select
            id="premium-frequency"
            className="select"
            {...register('premiumFrequency')}
          >
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="half-yearly">Half-yearly</option>
            <option value="yearly">Yearly</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="next-premium">Next premium due</label>
          <input
            id="next-premium"
            className="input"
            type="date"
            {...register('nextPremiumDate')}
          />
        </div>
        <div className="field">
          <label htmlFor="policy-start">Start date</label>
          <input
            id="policy-start"
            className="input"
            type="date"
            {...register('startDate')}
          />
        </div>
        <div className="field">
          <label htmlFor="policy-end">End date (optional)</label>
          <input id="policy-end" className="input" type="date" {...register('endDate')} />
        </div>
        <div className="field">
          <label htmlFor="policy-renewal">Renewal date (optional)</label>
          <input
            id="policy-renewal"
            className="input"
            type="date"
            {...register('renewalDate')}
          />
        </div>
        <div className="field">
          <label htmlFor="policy-maturity">Maturity date (optional)</label>
          <input
            id="policy-maturity"
            className="input"
            type="date"
            {...register('maturityDate')}
          />
        </div>
        <div className="field">
          <label htmlFor="policy-cover-source">Cover source</label>
          <select
            id="policy-cover-source"
            className="select"
            {...register('coverSource')}
          >
            <option value="personal">Personal</option>
            <option value="employer">Employer</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="policy-cover-layer">Cover layer</label>
          <select id="policy-cover-layer" className="select" {...register('coverLayer')}>
            <option value="base">Base</option>
            <option value="top-up">Top-up / floater layer</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="field field-span">
          <label htmlFor="policy-insured">Insured people</label>
          <input
            id="policy-insured"
            className="input"
            placeholder="Separate names with commas"
            {...register('insuredPeople')}
          />
        </div>
        <div className="field">
          <label htmlFor="policy-deductible">Deductible (if applicable)</label>
          <input
            id="policy-deductible"
            className="input"
            inputMode="decimal"
            {...register('deductible')}
          />
        </div>
        <div className="field">
          <label htmlFor="policy-copay">Co-pay percentage (if applicable)</label>
          <input
            id="policy-copay"
            className="input"
            inputMode="decimal"
            {...register('coPayPercent')}
          />
        </div>
        <div className="field field-span">
          <label htmlFor="policy-restrictions">
            Restrictions or exclusions to review
          </label>
          <textarea
            id="policy-restrictions"
            className="textarea"
            {...register('restrictions')}
          />
        </div>
        <div className="field field-span">
          <label htmlFor="policy-claim-contact">Claim contact</label>
          <input
            id="policy-claim-contact"
            className="input"
            {...register('claimContact')}
          />
        </div>
        <div className="field field-span">
          <label htmlFor="policy-reminder-days">Renewal reminder days before due</label>
          <input
            id="policy-reminder-days"
            className="input"
            {...register('reminderDays')}
          />
          <p className="field-hint">Comma-separated days; 0 means on the date.</p>
        </div>
        <div className="field">
          <label htmlFor="nominee-name">Nominee</label>
          <input id="nominee-name" className="input" {...register('nomineeName')} />
        </div>
        <div className="field">
          <label htmlFor="nominee-relation">Nominee relation</label>
          <input
            id="nominee-relation"
            className="input"
            {...register('nomineeRelation')}
          />
        </div>
        <div className="field field-span">
          <label htmlFor="policy-contact">Insurer contact or claim details</label>
          <input id="policy-contact" className="input" {...register('contact')} />
        </div>
        <div className="field field-span">
          <label htmlFor="policy-note">Notes</label>
          <textarea id="policy-note" className="textarea" {...register('note')} />
        </div>
        <label className="check-row field-span">
          <input type="checkbox" {...register('active')} />
          <span>Policy is active</span>
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
