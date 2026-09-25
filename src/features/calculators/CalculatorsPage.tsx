import { useState } from 'react'

import { compareScenarios } from '../../domain/calculators/compare'
import type { ScenarioResult } from '../../domain/calculators/types'
import { formatMoney } from '../../domain/money'
import { PageHeader } from '../../ui/Page'
import { CalculatorForm } from './CalculatorForm'
import { CalculatorResult } from './CalculatorResult'
import { NextCalculatorForm } from './NextCalculatorForm'
import {
  calculatorNames,
  isNextCalculatorKind,
  type CalculatorKind,
  type CalculatorOutput,
} from './types'

type SavedScenario = { id: number; label: string; result: ScenarioResult }
type Comparison = ReturnType<typeof compareScenarios>

const groups: readonly {
  label: string
  kinds: readonly CalculatorKind[]
}[] = [
  { label: 'Bank deposits', kinds: ['fd', 'rd'] },
  {
    label: 'Contribution and withdrawal plans',
    kinds: ['sip', 'step-up-sip', 'goal-sip', 'stp', 'swp'],
  },
  {
    label: 'Goals and purchasing power',
    kinds: ['lump-sum', 'multiple', 'inflation', 'delay', 'retirement'],
  },
  { label: 'Government savings', kinds: ['ppf', 'scss'] },
  { label: 'Bonds', kinds: ['frsb'] },
  { label: 'Protection', kinds: ['cover-gap'] },
  { label: 'Debt', kinds: ['loan-prepayment'] },
]

const liquidityNote = (kind: ScenarioResult['kind']) =>
  kind === 'fd' || kind === 'rd'
    ? 'Early access depends on the bank contract and its actual penalty.'
    : kind === 'ppf'
      ? 'PPF maturity is after 15 full financial years; partial withdrawals and extension are not modelled.'
      : kind === 'scss'
        ? 'SCSS interest is paid out quarterly; premature closure and extension are not modelled.'
        : kind === 'frsb'
          ? 'Bond coupons are paid out half-yearly; senior-only premature redemption is not modelled.'
          : kind === 'swp' || kind === 'retirement'
            ? 'Planned withdrawals can exhaust the corpus; see depletion warnings.'
            : kind === 'stp'
              ? 'Transfers are redemptions and subscriptions; loads and taxes are not included.'
              : 'Actual redemption timing, NAV, charges and taxes are not included.'

export function CalculatorsPage() {
  const [category, setCategory] = useState<string | null>(null)
  const [kind, setKind] = useState<CalculatorKind | null>(null)
  const [output, setOutput] = useState<CalculatorOutput | null>(null)
  const [outdated, setOutdated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scenarioName, setScenarioName] = useState('')
  const [scenarios, setScenarios] = useState<SavedScenario[]>([])
  const [nextId, setNextId] = useState(1)
  const [inflation, setInflation] = useState('')
  const [compared, setCompared] = useState<Comparison | null>(null)
  const [compareError, setCompareError] = useState<string | null>(null)
  const selectedGroup = groups.find((group) => group.label === category)
  const formProps = {
    onCalculated: (next: CalculatorOutput) => {
      setOutput(next)
      setOutdated(false)
      setError(null)
      setCompared(null)
      setCompareError(null)
    },
    onError: setError,
    onInputChanged: () => {
      if (output) setOutdated(true)
      setCompared(null)
    },
  }

  const changeKind = (selected: CalculatorKind | null) => {
    if (selected === kind) return
    setKind(selected)
    setOutput(null)
    setOutdated(false)
    setError(null)
    setCompared(null)
    setCompareError(null)
    setScenarioName('')
  }
  const changeCategory = (selected: string) => {
    if (selected === category) return
    setCategory(selected)
    changeKind(null)
  }
  const addScenario = () => {
    if (
      !kind ||
      !output ||
      outdated ||
      (output.kind !== 'scenario' && output.kind !== 'paired')
    )
      return
    const results = output.kind === 'paired' ? output.results : [output.result]
    const available = 3 - scenarios.length
    if (available < results.length) return
    setScenarios((current) => [
      ...current,
      ...results.map((result, index) => ({
        id: nextId + index,
        label:
          (scenarioName.trim() || calculatorNames[kind]) +
          (results.length > 1
            ? ` — ${output.kind === 'paired' ? (output.resultLabels?.[index] ?? 'Alternative') : 'Alternative'}`
            : ` ${nextId + index}`),
        result,
      })),
    ])
    setNextId(nextId + results.length)
    setCompared(null)
    setCompareError(null)
  }
  const compare = () => {
    setCompared(null)
    setCompareError(null)
    if (!/^-?\d+(?:\.\d+)?$/u.test(inflation.trim()) || Number(inflation) <= -100) {
      setCompareError(
        'Enter an inflation rate greater than -100%, including 0 if assumed.',
      )
      return
    }
    const evaluationDates = scenarios.map((scenario) => scenario.result.endDate)
    if (new Set(evaluationDates).size !== 1) {
      setCompareError(
        'Scenarios have different evaluation dates. Use the same end date and recalculate; no interim valuation is invented.',
      )
      return
    }
    try {
      setCompared(
        compareScenarios(
          scenarios.map((scenario) => scenario.result),
          evaluationDates[0]!,
          inflation.trim(),
        ),
      )
    } catch (caught) {
      setCompareError(
        caught instanceof Error ? caught.message : 'These scenarios cannot be compared',
      )
    }
  }

  return (
    <div className="page calculator-page">
      <PageHeader
        title="Calculators"
        description="Private, offline what-if illustrations using entered terms, scheme rates and market assumptions."
      />
      <section className="card card-body calculator-picker">
        <h2>Choose a category</h2>
        <div
          role="group"
          aria-label="Calculator categories"
          className="calculator-choices calculator-categories"
        >
          {groups.map((group) => (
            <button
              key={group.label}
              type="button"
              className="button button-secondary"
              aria-pressed={category === group.label}
              onClick={() => changeCategory(group.label)}
            >
              {group.label}
            </button>
          ))}
        </div>
      </section>
      {selectedGroup ? (
        <section className="card card-body calculator-picker">
          <h2>Choose a calculator</h2>
          <div
            role="group"
            aria-label="Available calculators"
            className="calculator-choices"
          >
            {selectedGroup.kinds.map((item) => (
              <button
                key={item}
                type="button"
                className="button button-secondary"
                aria-pressed={kind === item}
                onClick={() => changeKind(item)}
              >
                {calculatorNames[item]}
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {kind ? (
        isNextCalculatorKind(kind) ? (
          <NextCalculatorForm key={kind} kind={kind} {...formProps} />
        ) : (
          <CalculatorForm key={kind} kind={kind} {...formProps} />
        )
      ) : null}
      {error ? (
        <div className="notice notice-error" role="alert">
          {error}
        </div>
      ) : null}
      {output ? (
        <>
          {outdated ? (
            <p className="notice notice-warning" role="status">
              <strong>Outdated</strong> — these results use earlier assumptions.
              Recalculate before comparing or saving a scenario.
            </p>
          ) : null}
          <div aria-label={outdated ? 'Outdated illustration' : 'Current illustration'}>
            <CalculatorResult output={output} />
          </div>
        </>
      ) : null}
      {kind ? (
        <section
          className="card card-body calculator-compare"
          aria-label="Scenario comparison"
        >
          <h2>Compare scenarios</h2>
          <p className="field-hint">
            Keep two or three calculated scenarios in memory only. All are discarded when
            you leave this page or lock the app. Comparisons never rank products.
          </p>
          {(output?.kind === 'scenario' || output?.kind === 'paired') && output ? (
            <div className="field">
              <label htmlFor="calculator-scenario-name">Scenario name (optional)</label>
              <input
                id="calculator-scenario-name"
                className="input"
                value={scenarioName}
                onChange={(event) => setScenarioName(event.target.value)}
                maxLength={60}
              />
            </div>
          ) : null}
          <button
            type="button"
            className="button button-secondary"
            disabled={
              !output ||
              (output.kind !== 'scenario' && output.kind !== 'paired') ||
              outdated ||
              scenarios.length + (output?.kind === 'paired' ? output.results.length : 1) >
                3
            }
            onClick={addScenario}
          >
            Add scenario
          </button>
          {scenarios.length ? (
            <ul className="calculator-saved">
              {scenarios.map((scenario) => (
                <li key={scenario.id}>
                  <span>
                    {scenario.label} — {scenario.result.endDate}
                  </span>
                  <button
                    type="button"
                    className="button-link"
                    aria-label={`Remove ${scenario.label}`}
                    onClick={() => {
                      setScenarios((current) =>
                        current.filter((item) => item.id !== scenario.id),
                      )
                      setCompared(null)
                      setCompareError(null)
                    }}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="field">
            <label htmlFor="calculator-inflation">Comparison inflation rate</label>
            <input
              id="calculator-inflation"
              className="input"
              inputMode="decimal"
              value={inflation}
              onChange={(event) => {
                setInflation(event.target.value)
                setCompared(null)
                setCompareError(null)
              }}
            />
            <p className="field-hint">Enter an annual percentage, even if it is 0.</p>
          </div>
          <button
            type="button"
            className="button"
            disabled={outdated || scenarios.length < 2}
            onClick={compare}
          >
            Compare scenarios
          </button>
          {compareError ? (
            <p className="notice notice-error" role="alert">
              {compareError}
            </p>
          ) : null}
          {compared ? (
            <div className="calculator-comparison" aria-label="Compared scenarios">
              <h3>At the common evaluation date {scenarios[0]?.result.endDate}</h3>
              <p className="field-hint">
                Inflation-adjusted values are expressed in{' '}
                {scenarios.reduce(
                  (earliest, scenario) =>
                    scenario.result.startDate < earliest
                      ? scenario.result.startDate
                      : earliest,
                  scenarios[0]!.result.startDate,
                )}{' '}
                rupees for every scenario.
              </p>
              {compared.some((entry) => entry.differentCashFlows) ? (
                <p className="notice notice-warning">
                  <strong>Different cash flows</strong> — amounts, timing or funding
                  differ; a higher end value does not establish a better choice.
                </p>
              ) : null}
              {compared.some(
                (entry) =>
                  entry.result.kind === 'ppf' ||
                  entry.result.kind === 'scss' ||
                  entry.result.kind === 'frsb',
              ) ? (
                <p className="notice notice-info">
                  Government savings, bonds, bank deposits and market plans have different
                  tax treatment and access rules. Figures are before tax and do not rank
                  products.
                </p>
              ) : null}
              {compared.map(({ result, realEndPaise }, index) => {
                const total = Object.values(result.endingBalancesPaise).reduce(
                  (sum, value) => sum + value,
                  0,
                )
                return (
                  <article
                    key={scenarios[index]!.id}
                    className="calculator-comparison-card"
                  >
                    <h4>{scenarios[index]!.label}</h4>
                    <dl>
                      <dt>External contributions</dt>
                      <dd>{formatMoney(result.contributedPaise)}</dd>
                      <dt>Cash received</dt>
                      <dd>{formatMoney(result.withdrawnPaise)}</dd>
                      <dt>End value</dt>
                      <dd>{formatMoney(total)}</dd>
                      <dt>Inflation-adjusted end value</dt>
                      <dd>
                        {realEndPaise === null
                          ? 'Unavailable at this date'
                          : formatMoney(realEndPaise)}
                      </dd>
                      <dt>Liquidity and depletion</dt>
                      <dd>{liquidityNote(result.kind)}</dd>
                      <dt>Dated annualized return (XIRR)</dt>
                      <dd>
                        {result.xirrPercent === null
                          ? 'Unavailable for these cash flows'
                          : `${result.xirrPercent.toFixed(2)}%`}
                      </dd>
                    </dl>
                    {result.warnings.map((warning, warningIndex) => (
                      <p key={warningIndex} className="field-hint">
                        {warning}
                      </p>
                    ))}
                  </article>
                )
              })}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
