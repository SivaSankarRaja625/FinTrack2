import { formatMoney } from '../../domain/money'
import type { ScenarioResult } from '../../domain/calculators/types'
import { Metric } from '../../ui/Page'
import type { CalculatorOutput } from './types'

const bankKinds = new Set(['fd', 'rd'])

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
        {output.kind === 'scenario' && bankKinds.has(output.result.kind)
          ? 'Contractual bank terms are user-entered; bank rounding and actual payouts may differ.'
          : 'Market returns are hypothetical, not forecasts. Actual NAVs, loads and taxes may differ.'}
      </p>
      <p className="field-hint">
        No live rates or product data are used. Source authority: user-entered bank
        contract terms for deposits; user-entered assumptions for market illustrations.
        Reviewed 25 September 2026. Tax and TDS are not calculated.
      </p>
    </section>
  )
}
