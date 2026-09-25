import { differenceInCalendarDays, parseISO } from 'date-fns'
import { useMemo, useState, type FormEvent } from 'react'
import { z } from 'zod'

import { useFinance } from '../../app/FinanceContext'
import {
  calculateAccountBalances,
  requiredMonthlyForGoal,
} from '../../domain/calculations'
import {
  calculateFixedDeposit,
  calculateRecurringDeposit,
  type BankTerms,
} from '../../domain/calculators/deposits'
import {
  calculateSip,
  calculateStp,
  calculateSwp,
  requiredGoalSip,
  type SipInput,
} from '../../domain/calculators/market'
import { withDatedYield } from '../../domain/calculators/compare'
import type { ReturnPath, ScenarioResult } from '../../domain/calculators/types'
import {
  costOfDelay,
  futureCost,
  projectLumpSum,
  retirementProjection,
  wealthMultiple,
} from '../../domain/calculators/wealth'
import { isIsoDate } from '../../domain/dates'
import { assertPaise, formatMoney, rupeesToPaise } from '../../domain/money'
import type { CalculatorKind, CalculatorOutput } from './types'

type Values = Record<string, string>
type FieldKind = 'money' | 'number' | 'date' | 'select' | 'textarea' | 'text'
type FieldOptions = {
  kind?: FieldKind
  hint?: string
  options?: readonly { value: string; label: string }[]
  placeholder?: string
}

const required = (label: string) => z.string().trim().min(1, `${label} is required`)
const numeric = (label: string, min = -100) =>
  required(label).refine(
    (text) =>
      /^-?\d+(?:\.\d+)?$/u.test(text) &&
      Number(text) >= min &&
      Number.isFinite(Number(text)),
    `${label} must be a finite number of at least ${min}`,
  )
const money = (label: string, positive = true) =>
  required(label).refine(
    (text) => {
      if (!/^\d+(?:\.\d{1,2})?$/u.test(text)) return false
      try {
        const value = rupeesToPaise(text)
        return positive ? value > 0 : value >= 0
      } catch {
        return false
      }
    },
    `${label} must be a ${positive ? 'positive' : 'non-negative'} amount in rupees`,
  )
const date = (label: string) =>
  required(label).refine(isIsoDate, `${label} must be a valid date`)
const integer = (label: string, min: number, max: number) =>
  required(label).refine(
    (text) =>
      /^\d+$/u.test(text) &&
      Number.isSafeInteger(Number(text)) &&
      Number(text) >= min &&
      Number(text) <= max,
    `${label} must be a whole number from ${min} to ${max}`,
  )

const dates = { opened: date('Start date'), matures: date('End date') }
const bank = {
  ...dates,
  bankRate: numeric('Bank annual nominal rate', 0),
  rest: required('Bank interest rest'),
  dayCount: required('Bank day count'),
}
const market = {
  ...dates,
  cadence: required('Contribution frequency'),
}
const schemas = {
  fd: z.object({
    ...bank,
    principal: money('Initial deposit'),
    payout: required('Interest payout'),
  }),
  rd: z.object({
    ...bank,
    installment: money('Monthly instalment'),
    count: integer('Number of instalments', 1, 720),
    actualDates: required('Actual instalment dates'),
  }),
  sip: z.object({
    ...market,
    installment: money('Contribution per payment'),
  }),
  'step-up-sip': z.object({
    ...market,
    installment: money('Contribution per payment'),
    stepFrequency: required('Increase every'),
    stepMode: required('Increase type'),
  }),
  'goal-sip': z.object({
    ...market,
    target: money('Target amount'),
    goalInflation: numeric('Goal inflation rate'),
  }),
  stp: z.object({
    ...dates,
    cadence: required('Transfer frequency'),
    sourceCapital: money('Source initial amount'),
    sourceHouse: required('Source fund house'),
    targetHouse: required('Target fund house'),
    transferMode: required('Transfer type'),
    insufficient: required('When source is insufficient'),
  }),
  swp: z.object({
    ...dates,
    cadence: required('Withdrawal frequency'),
    capital: money('Starting capital'),
    withdrawalMode: required('Withdrawal type'),
    escalation: numeric('Annual withdrawal increase', 0),
  }),
  'lump-sum': z.object({ ...dates, principal: money('Initial amount') }),
  multiple: z.object({
    principal: money('Initial amount'),
    annualReturn: numeric('Assumed annual return'),
    targetMultiple: required('2x or 3x'),
    horizonYears: integer('Horizon (years)', 1, 60),
  }),
  inflation: z.object({
    principal: money('Current cost'),
    goalInflation: numeric('Inflation rate'),
    horizonYears: numeric('Years', 0),
  }),
  delay: z.object({
    ...market,
    installment: money('Contribution per payment'),
    delayMonths: integer('Delay (months)', 1, 720),
  }),
  retirement: z.object({
    ...market,
    installment: money('Contribution per payment'),
    withdrawal: money('Monthly withdrawal'),
    withdrawalMonths: integer('Withdrawal months', 1, 720),
  }),
} satisfies Record<CalculatorKind, z.ZodType>

const cadenceOptions = [
  { value: '', label: 'Choose timing' },
  { value: '1', label: 'Monthly (start of period)' },
  { value: '3', label: 'Quarterly (start of period)' },
] as const
const restOptions = [
  { value: '', label: 'Choose bank rest' },
  { value: 'monthly-anniversary', label: 'Monthly anniversary' },
  { value: 'quarterly-anniversary', label: 'Quarterly anniversary' },
  { value: 'calendar-quarter', label: 'Calendar-quarter rest' },
] as const
const returnOptions = [
  { value: 'constant', label: 'Entered effective annual rate' },
  { value: 'monthly', label: 'Entered monthly return path' },
] as const

function datedReturnPath(values: Values, prefix: string, label: string): ReturnPath {
  const mode = values[`${prefix}Mode`] ?? 'constant'
  if (mode === 'constant') {
    return { kind: 'constant', annualPercent: values[`${prefix}Annual`]!.trim() }
  }
  const lines = values[`${prefix}Monthly`]!.trim().split(/\r?\n/u)
  const months = lines.map((line, index) => {
    const match = /^(\d{4}-(?:0[1-9]|1[0-2]))\s*,\s*(-?\d+(?:\.\d+)?)$/u.exec(line.trim())
    if (!match) {
      throw new Error(`${label}: line ${index + 1} must be YYYY-MM,rate (percent)`)
    }
    return { month: match[1]!, percent: match[2]! }
  })
  if (new Set(months.map((item) => item.month)).size !== months.length) {
    throw new Error(`${label}: enter each month only once`)
  }
  return { kind: 'monthly', months }
}

function safeYield(result: ScenarioResult): ScenarioResult {
  return result.xirrPercent === null ? withDatedYield(result, result.endDate) : result
}

export function CalculatorForm({
  kind,
  onCalculated,
  onError,
  onInputChanged,
}: {
  kind: CalculatorKind
  onCalculated: (output: CalculatorOutput) => void
  onError: (message: string | null) => void
  onInputChanged: () => void
}) {
  const { data } = useFinance()
  const balances = useMemo(
    () => calculateAccountBalances(data.accounts, data.transactions),
    [data.accounts, data.transactions],
  )
  const [values, setValues] = useState<Values>({})
  const [errors, setErrors] = useState<Values>({})
  const [goalId, setGoalId] = useState('')
  const [early, setEarly] = useState(false)
  const [poorEarly, setPoorEarly] = useState(false)

  const update = (name: string, value: string) => {
    setValues((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: '' }))
    onError(null)
    onInputChanged()
  }
  const field = (name: string, label: string, options: FieldOptions = {}) => {
    const { kind: fieldKind = 'text', hint, placeholder } = options
    const id = `calculator-${name}`
    const error = errors[name]
    return (
      <div className="field" key={name}>
        <label htmlFor={id}>{label}</label>
        {fieldKind === 'select' ? (
          <select
            id={id}
            className="select"
            value={values[name] ?? ''}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
            onChange={(event) => update(name, event.target.value)}
          >
            {options.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : fieldKind === 'textarea' ? (
          <textarea
            id={id}
            className="textarea"
            value={values[name] ?? ''}
            placeholder={placeholder}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
            onChange={(event) => update(name, event.target.value)}
          />
        ) : (
          <input
            id={id}
            className="input"
            type={fieldKind === 'date' ? 'date' : 'text'}
            inputMode={
              fieldKind === 'money' || fieldKind === 'number' ? 'decimal' : undefined
            }
            value={values[name] ?? ''}
            placeholder={placeholder}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
            onChange={(event) => update(name, event.target.value)}
          />
        )}
        {error ? (
          <p id={`${id}-error`} className="field-error">
            {error}
          </p>
        ) : null}
        {hint ? (
          <p id={`${id}-hint`} className="field-hint">
            {hint}
          </p>
        ) : null}
      </div>
    )
  }
  const validateExtra = (name: string, schema: z.ZodType<string>) => {
    const checked = schema.safeParse(values[name] ?? '')
    if (checked.success) return true
    setErrors((current) => ({
      ...current,
      [name]: checked.error.issues[0]?.message ?? 'Enter a valid value',
    }))
    return false
  }
  const returnFields = (prefix = 'return', label = 'Assumed annual return') => (
    <fieldset className="calculator-fieldset">
      <legend>
        {prefix === 'return' ? 'Illustrative return path' : `${label} path`}
      </legend>
      {field(
        `${prefix}Mode`,
        prefix === 'return'
          ? 'Return path format'
          : `${prefix === 'source' ? 'Source' : 'Target'} return path format`,
        {
          kind: 'select',
          options: returnOptions,
        },
      )}
      {(values[`${prefix}Mode`] ?? 'constant') === 'monthly' ? (
        <>
          {field(`${prefix}Monthly`, `${label} by month`, {
            kind: 'textarea',
            hint: 'One YYYY-MM,percent per line. Enter every covered calendar month; no period is filled automatically.',
            placeholder: '2026-01,-5\n2026-02,2',
          })}
          {values[`${prefix}Monthly`]?.trim() ? (
            <p className="field-hint" role="status">
              {values[`${prefix}Monthly`]?.trim().split(/\r?\n/u).length} monthly rates
              entered.
            </p>
          ) : null}
        </>
      ) : (
        field(`${prefix}Annual`, label, {
          kind: 'number',
          hint: 'Effective annual percentage, entered by you (0 is valid). Not a forecast.',
        })
      )}
    </fieldset>
  )
  const validateReturn = (prefix: string, label: string): boolean =>
    (values[`${prefix}Mode`] ?? 'constant') === 'monthly'
      ? validateExtra(`${prefix}Monthly`, required(`${label} by month`))
      : validateExtra(`${prefix}Annual`, numeric(label))

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onError(null)
    const parsed = schemas[kind].safeParse({
      ...Object.fromEntries(Object.keys(schemas[kind].shape).map((name) => [name, ''])),
      ...values,
    })
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message]),
        ),
      )
      return
    }
    const isBank = kind === 'fd' || kind === 'rd'
    const hasMarketReturn = !isBank && kind !== 'inflation' && kind !== 'multiple'
    const validReturn =
      hasMarketReturn && kind === 'stp'
        ? validateReturn('source', 'Source assumed annual return') &&
          validateReturn('target', 'Target assumed annual return')
        : !hasMarketReturn || validateReturn('return', 'Assumed annual return')
    if (!validReturn) return
    if (
      kind === 'fd' &&
      early &&
      ![
        validateExtra('closure', date('Early withdrawal date')),
        validateExtra('actualRate', numeric('Holding-period bank rate', 0)),
        validateExtra('penalty', numeric('Penalty in percentage points', 0)),
      ].every(Boolean)
    )
      return
    if (kind === 'step-up-sip') {
      const schema =
        values.stepMode === 'percent'
          ? numeric('Increase percentage', 0)
          : money('Increase amount', false)
      if (!validateExtra('stepValue', schema)) return
    }
    if (kind === 'stp') {
      const extra =
        values.transferMode === 'units'
          ? ([
              ['sourceUnits', numeric('Starting source units', 0)],
              ['transferUnits', numeric('Transfer units', 0)],
              ['sourceNav', money('Source starting NAV')],
              ['targetNav', money('Target starting NAV')],
            ] as const)
          : ([['transferAmount', money('Transfer amount')]] as const)
      if (!extra.map(([name, schema]) => validateExtra(name, schema)).every(Boolean))
        return
    }
    if (kind === 'swp') {
      const extra =
        values.withdrawalMode === 'units'
          ? ([
              ['initialUnits', numeric('Starting units', 0)],
              ['withdrawalUnits', numeric('Withdrawal units', 0)],
              ['initialNav', money('Starting NAV')],
            ] as const)
          : ([['withdrawal', money('Withdrawal amount')]] as const)
      if (!extra.map(([name, schema]) => validateExtra(name, schema)).every(Boolean))
        return
      if (
        poorEarly &&
        !validateExtra('poorMonthly', required('Poor-early monthly returns'))
      )
        return
    }
    if (
      kind === 'goal-sip' &&
      values.opening?.trim() &&
      !validateExtra('opening', money('Already saved', false))
    )
      return
    if (
      (kind === 'sip' ||
        kind === 'step-up-sip' ||
        kind === 'delay' ||
        kind === 'retirement') &&
      values.budget?.trim() &&
      !validateExtra('budget', money('Monthly affordability budget'))
    )
      return

    try {
      const amount = (name: string) => rupeesToPaise(values[name]!)
      const opened = values.opened!
      const matures = values.matures!
      const cadenceMonths = Number(values.cadence) as 1 | 3
      const path = () => datedReturnPath(values, 'return', 'Assumed return path')
      const sip = (): SipInput => ({
        opened,
        matures,
        cadenceMonths,
        instalmentPaise: amount('installment'),
        returnPath: path(),
      })
      const budgetDetails = (result: ScenarioResult) => {
        if (!values.budget?.trim()) return []
        const budget = amount('budget')
        const comparable = budget * cadenceMonths
        assertPaise(comparable)
        const excess = result.events.find(
          (event) =>
            event.kind === 'contribution' &&
            event.label.toLowerCase().includes('instalment') &&
            event.deltaPaise > comparable,
        )
        return [
          { label: 'Entered monthly affordability budget', value: formatMoney(budget) },
          ...(cadenceMonths === 3
            ? [
                {
                  label: 'Comparable three-month budget',
                  value: formatMoney(comparable),
                },
              ]
            : []),
          {
            label: excess
              ? `Contribution exceeds entered budget on ${excess.date}`
              : 'Contributions against entered budget',
            value: excess
              ? `${formatMoney(excess.deltaPaise)} requested against ${formatMoney(comparable)} over ${cadenceMonths} month(s)`
              : 'No displayed instalment exceeds the entered amount; this is not an affordability assessment.',
          },
        ]
      }
      let output: CalculatorOutput
      switch (kind) {
        case 'fd':
          output = {
            kind: 'scenario',
            result: safeYield(
              calculateFixedDeposit({
                opened,
                matures,
                principalPaise: amount('principal'),
                annualNominalPercent: values.bankRate!,
                rest: values.rest as BankTerms['rest'],
                dayCount: values.dayCount as 'actual-365' | 'actual-actual',
                payout: values.payout as 'cumulative' | 'monthly' | 'quarterly',
                ...(early
                  ? {
                      withdrawal: {
                        date: values.closure!,
                        applicableAnnualPercent: values.actualRate!,
                        disclosedPenaltyPercent: values.penalty!,
                      },
                    }
                  : {}),
              }),
            ),
          }
          break
        case 'rd': {
          const actualDates = values
            .actualDates!.trim()
            .split(/\r?\n/u)
            .map((line) => (/^(missed|-)$/iu.test(line.trim()) ? null : line.trim()))
          if (
            actualDates.length !== Number(values.count) ||
            actualDates.some((entry) => entry !== null && !isIsoDate(entry))
          ) {
            setErrors({ actualDates: 'Enter one YYYY-MM-DD or "missed" per instalment' })
            return
          }
          output = {
            kind: 'scenario',
            result: safeYield(
              calculateRecurringDeposit({
                opened,
                matures,
                installmentPaise: amount('installment'),
                installmentCount: Number(values.count),
                actualDates,
                annualNominalPercent: values.bankRate!,
                rest: values.rest as BankTerms['rest'],
                dayCount: values.dayCount as 'actual-365' | 'actual-actual',
              }),
            ),
          }
          break
        }
        case 'sip':
        case 'step-up-sip': {
          const input = sip()
          if (kind === 'step-up-sip') {
            input.stepUp = {
              everyMonths: Number(values.stepFrequency) as 6 | 12,
              ...(values.stepMode === 'percent'
                ? { percent: values.stepValue! }
                : { paise: amount('stepValue') }),
            }
          }
          const result = safeYield(calculateSip(input))
          const details = budgetDetails(result)
          output = {
            kind: 'scenario',
            result,
            ...(details.length > 0 ? { details } : {}),
          }
          break
        }
        case 'goal-sip': {
          const years =
            differenceInCalendarDays(parseISO(matures), parseISO(opened)) / 365.2425
          const goal = futureCost(amount('target'), values.goalInflation!, years)
          const openingPaise = values.opening?.trim() ? amount('opening') : 0
          const input = {
            opened,
            matures,
            cadenceMonths,
            returnPath: path(),
            openingPaise,
            targetPaise: goal,
          }
          const requiredPaise = requiredGoalSip(input)
          const result = safeYield(
            calculateSip({ ...input, instalmentPaise: requiredPaise }),
          )
          const importedGoal = data.goals.find((item) => item.id === goalId)
          const baseline = importedGoal
            ? requiredMonthlyForGoal(
                {
                  ...importedGoal,
                  currentPaise: openingPaise,
                  targetPaise: amount('target'),
                  targetDate: matures,
                },
                parseISO(opened),
              )
            : null
          output = {
            kind: 'scenario',
            result,
            details: [
              {
                label: "Goal target in today's rupees",
                value: formatMoney(amount('target')),
              },
              { label: 'Entered goal inflation rate', value: `${values.goalInflation}%` },
              { label: 'Inflation-adjusted target', value: formatMoney(goal) },
              {
                label: 'Required contribution per payment',
                value:
                  requiredPaise === 0
                    ? 'No additional contribution needed'
                    : formatMoney(requiredPaise),
              },
              ...(baseline === null
                ? []
                : [
                    {
                      label: 'Existing goal no-return monthly baseline',
                      value: formatMoney(baseline),
                    },
                  ]),
            ],
          }
          break
        }
        case 'stp':
          output = {
            kind: 'scenario',
            result: safeYield(
              calculateStp({
                opened,
                matures,
                cadenceMonths,
                sourcePaise: amount('sourceCapital'),
                sourceFundHouse: values.sourceHouse!.trim(),
                targetFundHouse: values.targetHouse!.trim(),
                sourceReturn: datedReturnPath(values, 'source', 'Source return path'),
                targetReturn: datedReturnPath(values, 'target', 'Target return path'),
                insufficient: values.insufficient as 'stop' | 'cap',
                ...(values.transferMode === 'units'
                  ? {
                      sourceUnits: values.sourceUnits!,
                      transfer: {
                        kind: 'units' as const,
                        units: values.transferUnits!,
                        sourceNavPaise: amount('sourceNav'),
                        targetNavPaise: amount('targetNav'),
                      },
                    }
                  : {
                      transfer: {
                        kind: 'amount' as const,
                        paise: amount('transferAmount'),
                      },
                    }),
              }),
            ),
          }
          break
        case 'swp': {
          const basic = {
            opened,
            matures,
            cadenceMonths,
            capitalPaise: amount('capital'),
            annualIncreasePercent: values.escalation!,
            ...(values.withdrawalMode === 'units'
              ? {
                  initialUnits: values.initialUnits!,
                  withdrawal: {
                    kind: 'units' as const,
                    units: values.withdrawalUnits!,
                    initialNavPaise: amount('initialNav'),
                  },
                }
              : {
                  withdrawal: { kind: 'amount' as const, paise: amount('withdrawal') },
                }),
          }
          const normal = safeYield(calculateSwp({ ...basic, returnPath: path() }))
          output = poorEarly
            ? {
                kind: 'paired',
                label:
                  'Compare your base case with the entered poor-early-returns path; neither is a forecast.',
                resultLabels: ['Base return path', 'Poor-early return path'],
                results: [
                  normal,
                  safeYield(
                    calculateSwp({
                      ...basic,
                      returnPath: datedReturnPath(
                        {
                          poorMode: 'monthly',
                          poorMonthly: values.poorMonthly!,
                        },
                        'poor',
                        'Poor-early return path',
                      ),
                    }),
                  ),
                ],
              }
            : { kind: 'scenario', result: normal }
          break
        }
        case 'lump-sum': {
          const enteredPath = path()
          output = {
            kind: 'scenario',
            result: safeYield(
              projectLumpSum({
                principalPaise: amount('principal'),
                opened,
                matures,
                returnPath: enteredPath,
              }),
            ),
            details: [
              {
                label:
                  enteredPath.kind === 'constant'
                    ? 'Illustrative effective annual return: '
                    : 'Illustrative monthly return path: ',
                value:
                  enteredPath.kind === 'constant'
                    ? `${enteredPath.annualPercent}%`
                    : enteredPath.months
                        .map(({ month, percent }) => `${month}: ${percent}%`)
                        .join(', '),
              },
            ],
          }
          break
        }
        case 'multiple': {
          const years = wealthMultiple(
            amount('principal'),
            values.annualReturn!,
            Number(values.targetMultiple) as 2 | 3,
            Number(values.horizonYears),
          )
          output = {
            kind: 'metric',
            label: `Time to ${values.targetMultiple}x`,
            value: years === null ? 'Not reached' : `${years.toFixed(2)} years`,
            note: `Starting amount ${formatMoney(amount('principal'))}; entered effective annual return ${values.annualReturn}% over ${values.horizonYears} years. A money multiple is not an annualized return.`,
          }
          break
        }
        case 'inflation': {
          if (Number(values.horizonYears) > 60) {
            setErrors({ horizonYears: 'Years must be within 60' })
            return
          }
          output = {
            kind: 'metric',
            label: 'Inflation-adjusted future cost',
            value: formatMoney(
              futureCost(
                amount('principal'),
                values.goalInflation!,
                Number(values.horizonYears),
              ),
            ),
            note: `Current cost ${formatMoney(amount('principal'))}; entered annual inflation ${values.goalInflation}% for ${values.horizonYears} years.`,
          }
          break
        }
        case 'delay': {
          const paired = costOfDelay(sip(), Number(values.delayMonths))
          output = {
            kind: 'paired',
            label:
              'The same payment and end date with a later start; different total contributions are not directly comparable as a return.',
            resultLabels: ['Starting now', 'After delay'],
            results: [safeYield(paired.now), safeYield(paired.delayed)],
            ...(values.budget?.trim() ? { details: budgetDetails(paired.now) } : {}),
          }
          break
        }
        case 'retirement': {
          const result = safeYield(
            retirementProjection({
              ...sip(),
              monthlyWithdrawalPaise: amount('withdrawal'),
              withdrawalMonths: Number(values.withdrawalMonths),
            }),
          )
          output = {
            kind: 'scenario',
            result,
            ...(values.budget?.trim() ? { details: budgetDetails(result) } : {}),
          }
          break
        }
      }
      setErrors({})
      onCalculated(output)
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : 'The illustration could not be calculated',
      )
    }
  }

  const isBank = kind === 'fd' || kind === 'rd'
  const isMarket = !isBank && kind !== 'inflation' && kind !== 'multiple'
  const hasDates = kind !== 'inflation' && kind !== 'multiple'
  const hasCadence = [
    'sip',
    'step-up-sip',
    'goal-sip',
    'stp',
    'swp',
    'delay',
    'retirement',
  ].includes(kind)
  const goalOptions = data.goals.filter((goal) => !goal.archived)

  return (
    <form className="card card-body calculator-form" noValidate onSubmit={onSubmit}>
      <h2>Edit assumptions</h2>
      <p className="field-hint">
        Enter your own amounts, dates and rates; none are supplied or fetched by the app.
        Percentages are entered as 7 for 7%, including 0 for no return.
      </p>
      {kind === 'goal-sip' && goalOptions.length > 0 ? (
        <div className="field">
          <label htmlFor="calculator-goal">Copy an existing goal (optional)</label>
          <select
            id="calculator-goal"
            className="select"
            value={goalId}
            onChange={(event) => {
              const selected = data.goals.find((item) => item.id === event.target.value)
              setGoalId(event.target.value)
              if (selected) {
                setValues((current) => ({
                  ...current,
                  target: String(selected.targetPaise / 100),
                  opening: String(
                    (selected.linkedAccountId
                      ? Math.max(0, balances.get(selected.linkedAccountId) ?? 0)
                      : selected.currentPaise) / 100,
                  ),
                  matures: selected.targetDate,
                }))
                setErrors({})
              }
              onInputChanged()
            }}
          >
            <option value="">Enter a new goal instead</option>
            {goalOptions.map((goal) => (
              <option key={goal.id} value={goal.id}>
                {goal.name}
              </option>
            ))}
          </select>
          <p className="field-hint">
            Only editable copies are used; your saved goal is unchanged.
          </p>
        </div>
      ) : null}
      {hasDates ? (
        <fieldset className="calculator-fieldset">
          <legend>Dates and payment timing</legend>
          {field('opened', 'Start date', { kind: 'date' })}
          {field('matures', 'End date', { kind: 'date' })}
          {hasCadence
            ? field(
                'cadence',
                kind === 'stp'
                  ? 'Transfer frequency'
                  : kind === 'swp'
                    ? 'Withdrawal frequency'
                    : 'Contribution frequency',
                {
                  kind: 'select',
                  options: cadenceOptions,
                },
              )
            : null}
        </fieldset>
      ) : null}
      {isBank ? (
        <>
          <fieldset className="calculator-fieldset">
            <legend>Entered bank contract</legend>
            {kind === 'fd' ? (
              field('principal', 'Initial deposit', { kind: 'money' })
            ) : (
              <>
                {field('installment', 'Monthly instalment', { kind: 'money' })}
                {field('count', 'Number of instalments', { kind: 'number' })}
                {field('actualDates', 'Actual instalment dates', {
                  kind: 'textarea',
                  hint: 'One actual YYYY-MM-DD per instalment, or "missed". Never assumes a missed payment was made.',
                  placeholder: '2026-01-01\n2026-02-01\nmissed',
                })}
              </>
            )}
            {field('bankRate', 'Bank annual nominal rate', { kind: 'number' })}
            {field('rest', 'Bank interest rest', {
              kind: 'select',
              options: restOptions,
            })}
            {field('dayCount', 'Bank day count', {
              kind: 'select',
              options: [
                { value: '', label: 'Choose bank day count' },
                { value: 'actual-365', label: 'Actual days / 365' },
                { value: 'actual-actual', label: 'Actual days / actual year' },
              ],
            })}
            {kind === 'fd'
              ? field('payout', 'Interest payout', {
                  kind: 'select',
                  options: [
                    { value: '', label: 'Choose contract payout' },
                    { value: 'cumulative', label: 'Cumulative, capitalized' },
                    { value: 'monthly', label: 'Paid monthly, not reinvested' },
                    { value: 'quarterly', label: 'Paid quarterly, not reinvested' },
                  ],
                })
              : null}
          </fieldset>
          {kind === 'fd' ? (
            <fieldset className="calculator-fieldset">
              <legend>Early withdrawal (optional)</legend>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={early}
                  onChange={(event) => {
                    setEarly(event.target.checked)
                    onInputChanged()
                  }}
                />
                Illustrate early closure with the bank&apos;s actual holding-period rate
                and disclosed penalty
              </label>
              {early ? (
                <>
                  {field('closure', 'Early withdrawal date', { kind: 'date' })}
                  {field('actualRate', 'Holding-period bank rate', { kind: 'number' })}
                  {field(
                    'penalty',
                    'Penalty (percentage points deducted from holding-period bank rate)',
                    {
                      kind: 'number',
                      hint: 'Use only a bank-disclosed percentage-point deduction from the actual holding-period annual rate. A flat charge or a separate interest-recovery rule cannot be reproduced here.',
                    },
                  )}
                </>
              ) : null}
            </fieldset>
          ) : null}
        </>
      ) : null}
      {['sip', 'step-up-sip', 'delay', 'retirement'].includes(kind) ? (
        <fieldset className="calculator-fieldset">
          <legend>Contributions</legend>
          {field(
            'installment',
            values.cadence === '3' ? 'Quarterly contribution' : 'Monthly contribution',
            { kind: 'money' },
          )}
          {kind === 'step-up-sip' ? (
            <>
              {field('stepFrequency', 'Increase every', {
                kind: 'select',
                options: [
                  { value: '', label: 'Choose step-up interval' },
                  { value: '6', label: 'Six months' },
                  { value: '12', label: 'Twelve months' },
                ],
              })}
              {field('stepMode', 'Increase type', {
                kind: 'select',
                options: [
                  { value: '', label: 'Choose amount or percentage' },
                  { value: 'percent', label: 'Percentage' },
                  { value: 'amount', label: 'Fixed rupee amount' },
                ],
              })}
              {values.stepMode
                ? field(
                    'stepValue',
                    values.stepMode === 'percent'
                      ? 'Increase percentage'
                      : 'Increase amount',
                    {
                      kind: 'number',
                    },
                  )
                : null}
            </>
          ) : null}
          {field('budget', 'Monthly affordability budget (optional)', {
            kind: 'money',
            hint: 'Your own optional budget for context, not an affordability approval.',
          })}
          {kind === 'delay'
            ? field('delayMonths', 'Delay (months)', { kind: 'number' })
            : null}
          {kind === 'retirement' ? (
            <>
              {field('withdrawal', 'Monthly withdrawal', { kind: 'money' })}
              {field('withdrawalMonths', 'Withdrawal months', { kind: 'number' })}
            </>
          ) : null}
        </fieldset>
      ) : null}
      {kind === 'goal-sip' ? (
        <fieldset className="calculator-fieldset">
          <legend>Editable goal</legend>
          {field('target', 'Target amount', {
            kind: 'money',
            hint: "Today's rupees before inflation.",
          })}
          {field('opening', 'Already saved (optional)', { kind: 'money' })}
          {field('goalInflation', 'Goal inflation rate', { kind: 'number' })}
        </fieldset>
      ) : null}
      {kind === 'stp' ? (
        <fieldset className="calculator-fieldset">
          <legend>Transfer between funds</legend>
          {field('sourceHouse', 'Source fund house')}
          {field('targetHouse', 'Target fund house', {
            hint: 'STP requires source and target in the same fund house (AMC).',
          })}
          {field('sourceCapital', 'Source initial amount', { kind: 'money' })}
          {field('transferMode', 'Transfer type', {
            kind: 'select',
            options: [
              { value: '', label: 'Choose transfer unit' },
              { value: 'amount', label: 'Rupee amount' },
              { value: 'units', label: 'Source units at simulated NAV' },
            ],
          })}
          {values.transferMode === 'amount' ? (
            field('transferAmount', 'Transfer amount', { kind: 'money' })
          ) : values.transferMode === 'units' ? (
            <>
              {field('sourceUnits', 'Starting source units', { kind: 'number' })}
              {field('transferUnits', 'Transfer units', { kind: 'number' })}
              {field('sourceNav', 'Source starting NAV', { kind: 'money' })}
              {field('targetNav', 'Target starting NAV', { kind: 'money' })}
            </>
          ) : null}
          {field('insufficient', 'When source is insufficient', {
            kind: 'select',
            options: [
              { value: '', label: 'Choose stop or cap' },
              { value: 'stop', label: 'Stop future transfers' },
              { value: 'cap', label: 'Cap transfer at available balance' },
            ],
          })}
        </fieldset>
      ) : null}
      {kind === 'swp' ? (
        <fieldset className="calculator-fieldset">
          <legend>Withdrawal and corpus</legend>
          {field('capital', 'Starting capital', { kind: 'money' })}
          {field('withdrawalMode', 'Withdrawal type', {
            kind: 'select',
            options: [
              { value: '', label: 'Choose cash or units' },
              { value: 'amount', label: 'Cash amount' },
              { value: 'units', label: 'Units at simulated NAV' },
            ],
          })}
          {values.withdrawalMode === 'amount' || !values.withdrawalMode ? (
            field('withdrawal', 'Withdrawal amount', { kind: 'money' })
          ) : (
            <>
              {field('initialUnits', 'Starting units', { kind: 'number' })}
              {field('initialNav', 'Starting NAV', { kind: 'money' })}
              {field('withdrawalUnits', 'Withdrawal units', { kind: 'number' })}
            </>
          )}
          {field('escalation', 'Annual withdrawal increase', { kind: 'number' })}
          <label className="check-row">
            <input
              type="checkbox"
              checked={poorEarly}
              onChange={(event) => {
                setPoorEarly(event.target.checked)
                onInputChanged()
              }}
            />
            Compare a poor-early-returns path entered by me
          </label>
          {poorEarly
            ? field('poorMonthly', 'Poor-early monthly returns', {
                kind: 'textarea',
                hint: 'Enter every month as YYYY-MM,percent; a bad first year can deplete the corpus sooner.',
              })
            : null}
        </fieldset>
      ) : null}
      {kind === 'lump-sum'
        ? field('principal', 'Initial amount', { kind: 'money' })
        : null}
      {kind === 'multiple' ? (
        <fieldset className="calculator-fieldset">
          <legend>Wealth multiple</legend>
          {field('principal', 'Initial amount', { kind: 'money' })}
          {field('annualReturn', 'Assumed annual return', { kind: 'number' })}
          {field('targetMultiple', '2x or 3x', {
            kind: 'select',
            options: [
              { value: '', label: 'Choose a multiple' },
              { value: '2', label: '2x' },
              { value: '3', label: '3x' },
            ],
          })}
          {field('horizonYears', 'Horizon (years)', { kind: 'number' })}
        </fieldset>
      ) : null}
      {kind === 'inflation' ? (
        <fieldset className="calculator-fieldset">
          <legend>Future cost</legend>
          {field('principal', 'Current cost', { kind: 'money' })}
          {field('goalInflation', 'Inflation rate', { kind: 'number' })}
          {field('horizonYears', 'Years', { kind: 'number' })}
        </fieldset>
      ) : null}
      {isMarket ? (
        kind === 'stp' ? (
          <>
            {returnFields('source', 'Source assumed annual return')}
            {returnFields('target', 'Target assumed annual return')}
          </>
        ) : (
          returnFields()
        )
      ) : null}
      <button type="submit" className="button">
        Calculate
      </button>
    </form>
  )
}
