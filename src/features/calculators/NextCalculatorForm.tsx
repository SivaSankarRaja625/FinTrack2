import { useState, type ChangeEvent, type FormEvent } from 'react'

import { withDatedYield } from '../../domain/calculators/compare'
import { calculateFloatingSavingsBond } from '../../domain/calculators/bonds'
import { compareLoanPrepayment } from '../../domain/calculators/debt'
import { calculatePpf, calculateScss } from '../../domain/calculators/government'
import { calculateCoverGap } from '../../domain/calculators/protection'
import type { ScenarioResult } from '../../domain/calculators/types'
import { isIsoDate } from '../../domain/dates'
import { formatMoney, rupeesToPaise } from '../../domain/money'
import type { ISODate, Paise } from '../../domain/types'
import type { CalculatorOutput, NextCalculatorKind } from './types'

interface Props {
  kind: NextCalculatorKind
  onCalculated: (output: CalculatorOutput) => void
  onError: (message: string) => void
  onInputChanged: () => void
}

const atMaturity = (result: ScenarioResult) => withDatedYield(result, result.endDate)

export function NextCalculatorForm({
  kind,
  onCalculated,
  onError,
  onInputChanged,
}: Props) {
  const [values, setValues] = useState<Record<string, string>>({})
  const onChange = (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    setValues((current) => ({ ...current, [event.target.name]: event.target.value }))
    onInputChanged()
  }
  const field = (
    name: string,
    label: string,
    type: 'money' | 'number' | 'date' | 'textarea' = 'number',
    hint?: string,
  ) => (
    <div className="field">
      <label htmlFor={`next-${name}`}>{label}</label>
      {type === 'textarea' ? (
        <textarea
          id={`next-${name}`}
          name={name}
          className="input"
          value={values[name] ?? ''}
          onChange={onChange}
          rows={3}
        />
      ) : (
        <input
          id={`next-${name}`}
          name={name}
          className="input"
          type={type === 'date' ? 'date' : 'text'}
          inputMode={type === 'date' ? undefined : 'decimal'}
          value={values[name] ?? ''}
          onChange={onChange}
        />
      )}
      {hint ? <p className="field-hint">{hint}</p> : null}
    </div>
  )
  const choice = (
    name: string,
    label: string,
    options: readonly { value: string; label: string }[],
  ) => (
    <div className="field">
      <label htmlFor={`next-${name}`}>{label}</label>
      <select
        id={`next-${name}`}
        name={name}
        className="select"
        value={values[name] ?? ''}
        onChange={onChange}
      >
        <option value="">Choose {label.toLowerCase()}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
  const money = (name: string, label: string, positive = false): Paise => {
    const raw = (values[name] ?? '').trim()
    if (!/^\d+(?:\.\d{1,2})?$/u.test(raw)) {
      throw new Error(`Enter ${label.toLowerCase()} in rupees (up to two decimals)`)
    }
    const paise = rupeesToPaise(raw)
    if (positive && paise === 0) {
      throw new Error(`Enter a positive ${label.toLowerCase()}`)
    }
    return paise
  }
  const date = (name: string, label: string): ISODate => {
    const entered = values[name] ?? ''
    if (!isIsoDate(entered)) throw new Error(`Enter a valid ${label.toLowerCase()}`)
    return entered
  }
  const rate = (name: string, label: string): string => {
    const entered = (values[name] ?? '').trim()
    if (!/^-?\d+(?:\.\d+)?$/u.test(entered)) {
      throw new Error(`Enter a finite ${label.toLowerCase()} (0 if assumed)`)
    }
    return entered
  }
  const integer = (name: string, label: string): number => {
    const entered = (values[name] ?? '').trim()
    if (!/^\d+$/u.test(entered) || !Number.isSafeInteger(Number(entered))) {
      throw new Error(`Enter a whole number for ${label.toLowerCase()}`)
    }
    return Number(entered)
  }
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      let output: CalculatorOutput
      switch (kind) {
        case 'ppf': {
          const overrides = (values.overrides ?? '').trim()
          const quarterlyRates = overrides
            ? overrides.split(/\r?\n/u).map((line, index) => {
                const match = /^(\d{4}-(?:01|04|07|10)-01)\s*,\s*(\d+(?:\.\d+)?)$/u.exec(
                  line.trim(),
                )
                if (!match) {
                  throw new Error(
                    `Quarter rate line ${index + 1}: enter YYYY-MM-DD,rate (Jan/Apr/Jul/Oct 1)`,
                  )
                }
                return { quarterStart: match[1]!, annualPercent: match[2]! }
              })
            : []
          if (values.cadence !== 'monthly' && values.cadence !== 'yearly') {
            throw new Error('Choose the PPF deposit frequency')
          }
          output = {
            kind: 'scenario',
            result: atMaturity(
              calculatePpf({
                opened: date('opened', 'PPF opening date'),
                installmentPaise: money('installment', 'Deposit per instalment', true),
                cadence: values.cadence,
                annualRatePercent: rate('annualRate', 'Assumed annual PPF rate'),
                quarterlyRates,
              }),
            ),
          }
          break
        }
        case 'scss':
          output = {
            kind: 'scenario',
            result: atMaturity(
              calculateScss({
                opened: date('opened', 'SCSS deposit date'),
                principalPaise: money('principal', 'Single SCSS deposit', true),
                contractedAnnualPercent: rate(
                  'annualRate',
                  'Opening-date SCSS annual rate',
                ),
              }),
            ),
          }
          break
        case 'frsb': {
          const enteredResets = (values.resets ?? '').trim()
          const resetNscRates = enteredResets
            ? enteredResets.split(/\r?\n/u).map((line, index) => {
                const match = /^(\d{4}-(?:01|07)-01)\s*,\s*(\d+(?:\.\d+)?)$/u.exec(
                  line.trim(),
                )
                if (!match) {
                  throw new Error(
                    `NSC reset line ${index + 1}: enter YYYY-MM-DD,rate (Jan/Jul 1)`,
                  )
                }
                return { resetDate: match[1]!, nscAnnualPercent: match[2]! }
              })
            : []
          output = {
            kind: 'scenario',
            result: atMaturity(
              calculateFloatingSavingsBond({
                subscribed: date('opened', 'Bond subscription date'),
                principalPaise: money('principal', 'Bond principal', true),
                nscAnnualPercent: rate('nscRate', 'Assumed NSC benchmark rate'),
                resetNscRates,
              }),
            ),
          }
          break
        }
        case 'cover-gap': {
          const result = calculateCoverGap({
            annualExpensePaise: money(
              'annualExpense',
              'Annual dependent living costs',
              true,
            ),
            dependencyYears: integer('years', 'Years of support'),
            inflationPercent: rate('inflation', 'Expected inflation rate'),
            investmentReturnPercent: rate(
              'investmentReturn',
              'Post-tax investment return',
            ),
            outstandingDebtPaise: money('debt', 'Outstanding debts'),
            goalCostPaise: money('goals', 'Goals and one-time costs'),
            liquidAssetsPaise: money('assets', 'Available liquid savings'),
            existingLifeCoverPaise: money('cover', 'Existing life cover'),
          })
          output = {
            kind: 'breakdown',
            label: 'Additional cover gap',
            value:
              result.coverGapPaise === 0
                ? 'No gap under these inputs'
                : formatMoney(result.coverGapPaise),
            details: [
              {
                label: 'Present value of dependent living costs',
                value: formatMoney(result.expensePresentValuePaise),
              },
              { label: 'Outstanding debts', value: formatMoney(money('debt', 'Debt')) },
              {
                label: 'Goals and one-time costs',
                value: formatMoney(money('goals', 'Goals')),
              },
              { label: 'Gross family need', value: formatMoney(result.grossNeedPaise) },
              {
                label: 'Available resources (liquid savings and existing cover)',
                value: formatMoney(result.availableResourcesPaise),
              },
            ],
            note: "Today's living costs increase with entered inflation and are paid at each year-end, then discounted at the entered post-tax return. Only resources you entered are subtracted; employer cover may end on changing jobs. This is an illustration, not underwriting, a premium estimate or a recommendation to change existing cover.",
          }
          break
        }
        case 'loan-prepayment': {
          const feePaise = money('fee', 'Prepayment charge (if any)')
          const currentEmi = (values.currentEmi ?? '').trim()
          const monthlyEmiPaise = currentEmi
            ? money('currentEmi', 'Current monthly EMI', true)
            : undefined
          const strategy = values.strategy
          if (strategy !== 'reduce-tenure' && strategy !== 'reduce-emi') {
            throw new Error('Choose a repayment choice')
          }
          output = {
            kind: 'loan',
            feePaise,
            result: compareLoanPrepayment({
              balancePaise: money('balance', 'Outstanding loan balance', true),
              annualRatePercent: rate('loanRate', 'Annual loan rate'),
              remainingMonths: integer('months', 'Remaining EMIs'),
              firstPaymentDate: date('firstPayment', 'Next EMI date'),
              prepaymentPaise: money('prepayment', 'Prepayment amount', true),
              prepaymentMonth: integer('prepayMonth', 'Prepayment after EMI number'),
              feePaise,
              strategy,
              ...(monthlyEmiPaise === undefined ? {} : { monthlyEmiPaise }),
            }),
          }
          break
        }
      }
      onCalculated(output)
    } catch (error) {
      onError(
        error instanceof Error ? error.message : 'The calculation could not be completed',
      )
    }
  }

  return (
    <form className="card card-body calculator-form" noValidate onSubmit={submit}>
      <h2>Edit assumptions</h2>
      <p className="field-hint">
        Enter your own dated deposits, rates and obligations. No live product rates or
        account balances are fetched or assumed.
      </p>
      {kind === 'ppf' ? (
        <fieldset className="calculator-fieldset">
          <legend>PPF deposits and rate path</legend>
          {field('opened', 'PPF opening date', 'date')}
          {field('installment', 'Deposit per instalment', 'money')}
          {choice('cadence', 'Deposit frequency', [
            { value: 'monthly', label: 'Monthly from opening date' },
            { value: 'yearly', label: 'Annually on opening-date anniversary' },
          ])}
          {field(
            'annualRate',
            'Assumed annual PPF rate',
            'number',
            'This rate repeats each future quarter unless overridden; it is not a government forecast.',
          )}
          {field(
            'overrides',
            'Quarterly rate overrides (optional)',
            'textarea',
            'One quarter start and annual percent per line, such as 2027-04-01,7.1.',
          )}
        </fieldset>
      ) : null}
      {kind === 'scss' ? (
        <fieldset className="calculator-fieldset">
          <legend>SCSS contract</legend>
          {field('opened', 'SCSS deposit date', 'date')}
          {field('principal', 'Single SCSS deposit', 'money')}
          {field(
            'annualRate',
            'Opening-date SCSS annual rate',
            'number',
            'Enter the contracted rate; later government rate changes do not change this deposit.',
          )}
        </fieldset>
      ) : null}
      {kind === 'frsb' ? (
        <fieldset className="calculator-fieldset">
          <legend>Floating bond and NSC benchmark</legend>
          {field('opened', 'Bond subscription date', 'date')}
          {field(
            'principal',
            'Bond principal',
            'money',
            'At least ₹1,000, in multiples of ₹1,000.',
          )}
          {field(
            'nscRate',
            'Assumed NSC benchmark rate',
            'number',
            'The coupon equals the entered NSC rate plus 0.35 percentage points after January 2021. The first 2020 bond coupon was fixed at 7.15%; future benchmarks are unknown.',
          )}
          {field(
            'resets',
            'NSC reset overrides (optional)',
            'textarea',
            'One future half-year start and annual NSC percent per line, such as 2027-01-01,7.7.',
          )}
        </fieldset>
      ) : null}
      {kind === 'cover-gap' ? (
        <fieldset className="calculator-fieldset">
          <legend>Dependent needs and available resources</legend>
          {field('annualExpense', 'Annual dependent living costs', 'money')}
          {field('years', 'Years of support')}
          {field('inflation', 'Expected inflation rate')}
          {field('investmentReturn', 'Post-tax investment return')}
          {field('debt', 'Outstanding debts', 'money', 'Enter only unpaid principal.')}
          {field('goals', 'Goals and one-time costs', 'money')}
          {field(
            'assets',
            'Available liquid savings',
            'money',
            'Exclude assets your dependents cannot readily use.',
          )}
          {field(
            'cover',
            'Existing life cover',
            'money',
            'Count only coverage available to your dependents.',
          )}
        </fieldset>
      ) : null}
      {kind === 'loan-prepayment' ? (
        <fieldset className="calculator-fieldset">
          <legend>Reducing-balance loan</legend>
          {field('balance', 'Outstanding loan balance', 'money')}
          {field('loanRate', 'Annual loan rate')}
          {field('months', 'Remaining EMIs')}
          {field('firstPayment', 'Next EMI date', 'date')}
          {field('currentEmi', 'Current monthly EMI (optional)', 'money')}
          {field('prepayment', 'Prepayment amount', 'money')}
          {field('prepayMonth', 'Prepayment after EMI number')}
          {field(
            'fee',
            'Prepayment charge (if any)',
            'money',
            'Enter zero only when your lender confirms no charge applies to this loan.',
          )}
          {choice('strategy', 'Repayment choice', [
            { value: 'reduce-tenure', label: 'Keep EMI, shorten tenure' },
            { value: 'reduce-emi', label: 'Keep tenure, reduce EMI' },
          ])}
        </fieldset>
      ) : null}
      <button type="submit" className="button">
        Calculate
      </button>
    </form>
  )
}
