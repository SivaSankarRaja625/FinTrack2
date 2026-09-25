import { formatMoney } from '../../domain/money'
import type { RepaymentSchedule } from '../../domain/calculators/debt'
import type { ScenarioResult } from '../../domain/calculators/types'
import { Metric } from '../../ui/Page'
import type { CalculatorOutput } from './types'

function LoanSchedule({
  title,
  schedule,
}: {
  title: string
  schedule: RepaymentSchedule
}) {
  return (
    <details className="calculator-schedule">
      <summary>{title} repayment schedule</summary>
      <div className="table-wrap">
        <table className="data-table">
          <caption>{title} monthly loan payments</caption>
          <thead>
            <tr>
              <th scope="col">EMI date</th>
              <th scope="col">Interest</th>
              <th scope="col">EMI paid</th>
              <th scope="col">Extra principal</th>
              <th scope="col">Balance</th>
            </tr>
          </thead>
          <tbody>
            {schedule.rows.map((row) => (
              <tr key={row.date}>
                <td>{row.date}</td>
                <td>{formatMoney(row.interestPaise)}</td>
                <td>{formatMoney(row.paymentPaise)}</td>
                <td>{formatMoney(row.prepaymentPaise)}</td>
                <td>{formatMoney(row.closingPaise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

function ScenarioDetail({ result }: { result: ScenarioResult }) {
  const balance = Object.values(result.endingBalancesPaise).reduce(
    (total, value) => total + value,
    0,
  )
  const contributions = result.events.filter((event) => event.kind === 'contribution')
  const scheduled = contributions.filter((event) =>
    event.label.toLowerCase().includes('instalment'),
  )
  const first = scheduled[0]
  const last = scheduled.at(-1)
  return (
    <div className="calculator-scenario">
      <div className="calculator-metrics">
        <Metric
          label="External contributions"
          value={formatMoney(result.contributedPaise)}
        />
        <Metric label="Cash received" value={formatMoney(result.withdrawnPaise)} />
        <Metric label="End value" value={formatMoney(balance)} />
        <Metric label="Gain or interest" value={formatMoney(result.gainPaise)} />
        {Object.entries(result.endingBalancesPaise).length > 1
          ? Object.entries(result.endingBalancesPaise).map(([account, value]) => (
              <Metric
                key={account}
                label={`${account} balance`}
                value={formatMoney(value)}
              />
            ))
          : null}
        <Metric
          label="Dated annualized return (XIRR)"
          value={
            result.xirrPercent === null
              ? 'Unavailable for these cash flows'
              : `${result.xirrPercent.toFixed(2)}%`
          }
        />
        {result.kind === 'lump-sum' && result.contributedPaise > 0 ? (
          <Metric
            label="Money multiple (not an annualized return)"
            value={`${(balance / result.contributedPaise).toFixed(2)}x`}
          />
        ) : null}
        {result.kind === 'step-up-sip' && first && last ? (
          <>
            <Metric label="First instalment" value={formatMoney(first.deltaPaise)} />
            <Metric label="Final instalment" value={formatMoney(last.deltaPaise)} />
          </>
        ) : null}
      </div>
      <p className="field-hint">
        Evaluation: {result.startDate} to {result.endDate}. Amounts are rounded to paise
        at posting boundaries.
      </p>
      <h3>Assumptions</h3>
      {['sip', 'step-up-sip', 'swp', 'retirement'].includes(result.kind) &&
      result.assumptions.some((assumption) =>
        /effective annual return:\s*0%/iu.test(assumption),
      ) ? (
        <p className="field-hint">No return is assumed</p>
      ) : null}
      <ul className="calculator-list">
        {result.assumptions.map((assumption, index) => (
          <li key={`${index}-${assumption}`}>{assumption}</li>
        ))}
      </ul>
      {result.warnings.length > 0 ? (
        <div className="notice notice-warning" role="status">
          <ul className="calculator-list">
            {result.warnings.map((warning, index) => (
              <li key={`${index}-${warning}`}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {result.kind === 'swp' || result.kind === 'retirement' ? (
        <p className="field-hint">
          Withdrawals are cash received, not guaranteed income or profit. If the corpus is
          depleted, the first unmet withdrawal date is noted above.
        </p>
      ) : null}
      {result.kind === 'stp' ? (
        <p className="field-hint">
          Every STP transfer is a source redemption and a target subscription, not a new
          external contribution.
        </p>
      ) : null}
      <details className="calculator-schedule">
        <summary>Calculation schedule</summary>
        <div className="table-wrap">
          <table className="data-table">
            <caption>Dated cash flows and illustrative changes</caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Account and event</th>
                <th scope="col">Amount</th>
              </tr>
            </thead>
            <tbody>
              {result.events.map((event, index) => (
                <tr key={`${event.date}-${event.account}-${index}`}>
                  <td>{event.date}</td>
                  <td>
                    {event.account}: {event.label}
                  </td>
                  <td className="tabular">{formatMoney(event.deltaPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}

export function CalculatorResult({ output }: { output: CalculatorOutput }) {
  if (output.kind === 'metric') {
    return (
      <section
        className="card card-body calculator-result"
        aria-label="Calculation result"
      >
        <h2>Illustration</h2>
        <Metric label={output.label} value={output.value} />
        <p className="field-hint">{output.note}</p>
        <p className="field-hint">
          This is a hypothetical calculation, not a product recommendation. Actual taxes
          and charges are not included.
        </p>
      </section>
    )
  }

  if (output.kind === 'breakdown') {
    return (
      <section
        className="card card-body calculator-result"
        aria-label="Calculation result"
      >
        <h2>Illustration</h2>
        <Metric label={output.label} value={output.value} />
        <div className="calculator-metrics">
          {output.details.map(({ label, value }) => (
            <Metric key={label} label={label} value={value} />
          ))}
        </div>
        <p className="notice notice-info">{output.note}</p>
        <p className="field-hint">
          Needs-based protection illustration; not a regulatory cover amount or an
          investment return. No live insurer data. Reviewed 25 September 2026.
        </p>
      </section>
    )
  }

  if (output.kind === 'loan') {
    const { baseline, prepaid, monthsSaved, netInterestSavedPaise } = output.result
    return (
      <section
        className="card card-body calculator-result"
        aria-label="Calculation result"
      >
        <h2>Illustration</h2>
        <div className="calculator-metrics">
          <Metric
            label="Net nominal interest saved after charge"
            value={formatMoney(netInterestSavedPaise)}
          />
          <Metric label="Months saved" value={`${monthsSaved} months`} />
          <Metric
            label="Original monthly EMI"
            value={formatMoney(baseline.monthlyEmiPaise)}
          />
          <Metric
            label="EMI after prepayment"
            value={
              prepaid.monthlyEmiPaise === 0
                ? 'No further EMI'
                : formatMoney(prepaid.monthlyEmiPaise)
            }
          />
          <Metric
            label="Interest without prepayment"
            value={formatMoney(baseline.interestPaise)}
          />
          <Metric
            label="Interest with prepayment"
            value={formatMoney(prepaid.interestPaise)}
          />
          <Metric
            label="Entered prepayment charge"
            value={formatMoney(output.feePaise)}
          />
          <Metric
            label="New final payment"
            value={prepaid.rows.at(-1)?.date ?? 'Not available'}
          />
        </div>
        <LoanSchedule title="Without prepayment" schedule={baseline} />
        <LoanSchedule title="With prepayment" schedule={prepaid} />
        <p className="notice notice-info">
          Constant entered rate, monthly reducing interest at annual rate / 12 and
          prepayment after the selected EMI. Savings are nominal, with no assumed
          investment return, tax benefit or future rate reset. Confirm your lender&apos;s
          recalculated schedule and disclosed charges.
        </p>
        <p className="field-hint">
          RBI Pre-payment Charges on Loans Directions, 2025: floating-rate non-business
          loans to individuals sanctioned or renewed from 1 January 2026 have no
          prepayment charge. Other contracts may differ. Reviewed 25 September 2026.
        </p>
      </section>
    )
  }

  const scenarioKind =
    output.kind === 'scenario' ? output.result.kind : output.results[0]?.kind
  return (
    <section className="card card-body calculator-result" aria-label="Calculation result">
      <h2>Illustration</h2>
      {output.details?.map(({ label, value }) => (
        <Metric key={label} label={label} value={value} />
      ))}
      {output.kind === 'paired' ? <p className="field-hint">{output.label}</p> : null}
      {output.kind === 'paired' ? (
        output.results.map((result, index) => {
          const name =
            output.resultLabels?.[index] ?? (index === 0 ? 'Starting now' : 'Alternative')
          return (
            <section key={index} aria-label={`${name} scenario`}>
              <h3>{name}</h3>
              <ScenarioDetail result={result} />
            </section>
          )
        })
      ) : (
        <ScenarioDetail result={output.result} />
      )}
      <p className="notice notice-info">
        {scenarioKind === 'ppf'
          ? 'PPF rates change with government notifications. All future rates are entered assumptions; actual interest and maturity access depend on scheme rules.'
          : scenarioKind === 'scss'
            ? 'SCSS payouts are separate cash receipts, not reinvested. Actual payment is on the first working day; holiday timing and account treatment may differ.'
            : scenarioKind === 'frsb'
              ? 'Floating bond coupons are separate cash receipts, not reinvested. Actual payment days, broken-period interest and TDS may differ.'
              : scenarioKind === 'fd' || scenarioKind === 'rd'
                ? 'Contractual bank terms are user-entered; bank rounding and actual payouts may differ.'
                : 'Market returns are hypothetical, not forecasts. Actual NAVs, loads and taxes may differ.'}
      </p>
      <p className="field-hint">
        {scenarioKind === 'ppf'
          ? 'Rule source: Public Provident Fund Scheme, 2019 (paragraphs 4, 7, 11).'
          : scenarioKind === 'scss'
            ? 'Rule source: Senior Citizens Savings Scheme, 2019 (paragraphs 4, 5, 7), as amended in 2023.'
            : scenarioKind === 'frsb'
              ? 'Rule source: RBI Floating Rate Savings Bonds, 2020 (Taxable), revised operational guidelines of 2 April 2026, sections 5-7; initial fixed coupon per the 2020 issue circular.'
              : 'Source authority: user-entered bank contract terms for deposits; user-entered assumptions for market illustrations.'}{' '}
        No live rates or product data are used. Reviewed 25 September 2026. Tax and TDS
        are not calculated.
      </p>
    </section>
  )
}
