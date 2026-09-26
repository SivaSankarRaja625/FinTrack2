import { useState } from 'react'
import { Link } from 'react-router-dom'

import { useFinance } from '../../app/FinanceContext'
import { formatMoney, rupeesToPaise } from '../../domain/money'
import {
  calculateEmergencyReserve,
  calculateShockScenario,
  estimateEssentialMonthlySpend,
} from '../../domain/resilience'
import { Icon } from '../../ui/Icon'
import { Metric, PageHeader } from '../../ui/Page'
import { ClaimSheet } from './ClaimSheet'
import { ProtectionReview } from './ProtectionReview'

export function ResiliencePage() {
  const { data } = useFinance()
  const profile = data.profiles[0]
  const [medicalInput, setMedicalInput] = useState('0')
  const [months, setMonths] = useState(3)
  const [includeSecondLine, setIncludeSecondLine] = useState(false)
  const [includeEmis, setIncludeEmis] = useState(false)
  if (!profile) return null

  const reserve = calculateEmergencyReserve(data, profile, new Date())
  const observedEssentialsPaise = estimateEssentialMonthlySpend(data, new Date())
  const medicalValid = /^\d{0,10}(?:\.\d{0,2})?$/u.test(medicalInput)
  const extraEmisPaise = includeEmis
    ? data.loans
        .filter((loan) => loan.active)
        .reduce((sum, loan) => sum + loan.emiPaise, 0)
    : 0
  const availablePaise =
    reserve.immediatePaise + (includeSecondLine ? reserve.secondaryPaise : 0)
  const scenario = medicalValid
    ? calculateShockScenario({
        availablePaise,
        monthlyEssentialsPaise: profile.essentialMonthlyPaise,
        additionalMonthlyPaise: extraEmisPaise,
        medicalPaise: rupeesToPaise(medicalInput),
        monthsWithoutIncome: months,
      })
    : null
  const employerPolicies = data.insurancePolicies.filter(
    (policy) => policy.active && policy.coverage?.source === 'employer',
  )

  return (
    <div className="page">
      <PageHeader
        title="Resilience"
        description="Accessible reserves, income-shock scenarios and protection reviews from your local records."
      />
      <section className="page-grid metric-group">
        <div className="card card-body span-4">
          <Metric
            label="Immediate emergency reserve"
            value={formatMoney(reserve.immediatePaise)}
          />
        </div>
        <div className="card card-body span-4">
          <Metric
            label="Second-line reserve"
            value={formatMoney(reserve.secondaryPaise)}
            detail="Manual prices; access may take days"
          />
        </div>
        <div className="card card-body span-4">
          <Metric
            label="Reserve target"
            value={formatMoney(reserve.targetPaise)}
            detail={`${profile.emergencyFundMonths} months × entered essentials`}
          />
        </div>
      </section>
      <section className="card card-body stack">
        <h2>Which money is counted?</h2>
        <p>
          Only accounts you designated as emergency money count as immediate cash.
          Overdrafts reduce it. Goal-linked accounts are excluded. Separately marked,
          unlocked deposits and user-verified overnight or liquid funds count only as
          second-line reserves when their price is recent and expected access is within
          seven days.
        </p>
        {!reserve.designated ? (
          <p className="notice notice-warning">
            No reserve sources are designated.{' '}
            <Link to="/transactions">Tag an account</Link> or{' '}
            <Link to="/investments">review a holding</Link> before relying on this figure.
          </p>
        ) : null}
        {reserve.exclusions.length > 0 ? (
          <ul>
            {reserve.exclusions.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : null}
        <p className="field-hint">
          Funds are market-linked and not guaranteed to be immediate. Redemption timing,
          NAV, exit loads, tax and restrictions must be checked against the actual scheme
          or bank. FinTrack does not buy or recommend products.
        </p>
      </section>
      <section className="card">
        <header className="card-header">
          <div>
            <h2>No-income and medical-cost check</h2>
            <p className="muted">
              A scenario, not a prediction: no salary, severance, insurance payout or
              investment return is assumed.
            </p>
          </div>
        </header>
        <div className="card-body stack">
          <p>
            Entered essentials {formatMoney(profile.essentialMonthlyPaise)} per month.
            Recent recorded essential spending averaged{' '}
            {formatMoney(observedEssentialsPaise)} over the last three completed months.
          </p>
          {observedEssentialsPaise > profile.essentialMonthlyPaise ? (
            <p className="inline-warning">
              The entered essential-expense figure is lower than recent recorded spending.
              Review it in <Link to="/settings">Settings</Link>.
            </p>
          ) : null}
          <div className="form-grid">
            <label className="field">
              <span>Months without income</span>
              <select
                className="select"
                value={months}
                onChange={(event) => setMonths(Number(event.target.value))}
              >
                {[1, 3, 6, 12].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Medical cost if needed</span>
              <input
                className="input"
                inputMode="decimal"
                value={medicalInput}
                onChange={(event) => setMedicalInput(event.target.value)}
              />
              {!medicalValid ? (
                <small className="field-error">
                  Enter a nonnegative rupee amount with at most two decimals.
                </small>
              ) : null}
            </label>
          </div>
          <label className="check-row">
            <input
              type="checkbox"
              checked={includeEmis}
              onChange={(event) => setIncludeEmis(event.target.checked)}
            />
            <span>
              Add recorded loan EMIs (
              {formatMoney(
                extraEmisPaise ||
                  data.loans
                    .filter((loan) => loan.active)
                    .reduce((sum, loan) => sum + loan.emiPaise, 0),
              )}
              /month) only if not already included in essentials
            </span>
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={includeSecondLine}
              onChange={(event) => setIncludeSecondLine(event.target.checked)}
            />
            <span>Also count second-line funds after confirming access and risks</span>
          </label>
          {scenario ? (
            <div className="page-grid metric-group">
              <div className="card card-body span-4">
                <Metric
                  label="Scenario need"
                  value={formatMoney(scenario.requiredPaise)}
                />
              </div>
              <div className="card card-body span-4">
                <Metric
                  label="Scenario shortfall"
                  value={formatMoney(scenario.shortfallPaise)}
                />
              </div>
              <div className="card card-body span-4">
                <Metric
                  label="Months of essentials covered"
                  value={String(scenario.monthsCovered)}
                />
              </div>
            </div>
          ) : null}
          <p className="field-hint">
            Current premiums, card dues and recurring bills may already be included in
            your entered essentials. Check the <Link to="/plan">cash-flow plan</Link>{' '}
            before treating this as a complete list of obligations.
          </p>
        </div>
      </section>
      <section className="card card-body stack">
        <h2>Protection review</h2>
        <p>
          {employerPolicies.length} recorded active employer{' '}
          {employerPolicies.length === 1 ? 'policy' : 'policies'} may change or end with a
          job change. Confirm replacement cover and access to claim contacts with the
          insurer or employer; do not infer that a recorded policy is in force.
        </p>
        {profile.financialDependents || data.loans.some((loan) => loan.active) ? (
          <p>
            If anyone depends on your income or jointly shares liabilities, use the{' '}
            <Link to="/calculators">life-cover gap illustration</Link> as a review
            starting point, not a purchase recommendation.
          </p>
        ) : (
          <p>
            If no one depends on your income and you have no joint obligations, additional
            term cover may not be a priority. Review health, accident and disability
            protection for your situation.
          </p>
        )}
        <Link to="/insurance" className="button button-secondary">
          <Icon name="insurance" size={17} />
          Review policies
        </Link>
      </section>
      <ClaimSheet policies={data.insurancePolicies.filter((policy) => policy.active)} />
      <ProtectionReview />
    </div>
  )
}
