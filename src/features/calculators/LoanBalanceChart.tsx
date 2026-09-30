import { useId, useState } from 'react'

import type { PrepaymentResult, RepaymentSchedule } from '../../domain/calculators/debt'
import { formatMoney } from '../../domain/money'

const width = 800
const height = 210
const plot = { left: 8, right: width - 8, top: 12, bottom: height - 12 }

function balanceAt(schedule: RepaymentSchedule, emi: number, opening: number): number {
  if (emi === 0) return opening
  if (emi > schedule.rows.length) return 0
  const row = schedule.rows[emi - 1]
  if (!row || row.emiNumber !== emi) throw new Error(`Missing balance for EMI ${emi}`)
  return row.closingPaise
}

export function LoanBalanceChart({ result }: { result: PrepaymentResult }) {
  const inputId = useId()
  const [inspected, setInspected] = useState<number | null>(null)
  const first = result.baseline.rows[0]
  const prepaymentEmi = result.prepaid.rows.find(
    (row) => row.prepaymentPaise > 0,
  )?.emiNumber
  if (!first || !prepaymentEmi) {
    throw new Error('The loan comparison needs a baseline EMI and an extra payment')
  }
  const opening = first.closingPaise + first.paymentPaise - first.interestPaise
  const lastEmi = result.baseline.rows.length
  const payoffEmi = result.prepaid.rows.length
  const emi = Math.min(inspected ?? prepaymentEmi, lastEmi)
  const baselineBalance = balanceAt(result.baseline, emi, opening)
  const prepaidBalance = balanceAt(result.prepaid, emi, opening)
  const x = (index: number) => plot.left + (index / lastEmi) * (plot.right - plot.left)
  const y = (balance: number) =>
    plot.bottom - (balance / opening) * (plot.bottom - plot.top)
  const line = (schedule: RepaymentSchedule) => {
    const coordinates = [
      { emiNumber: 0, closingPaise: opening },
      ...schedule.rows,
      ...(schedule.rows.length < lastEmi
        ? [{ emiNumber: lastEmi, closingPaise: 0 }]
        : []),
    ]
    return coordinates
      .map(({ emiNumber, closingPaise }) => `${x(emiNumber)},${y(closingPaise)}`)
      .join(' ')
  }

  return (
    <section
      className="loan-balance-chart"
      role="group"
      aria-label="Loan principal comparison"
    >
      <h3>Remaining principal by EMI</h3>
      <div className="loan-balance-legend">
        <span>
          <i className="loan-line-key loan-line-key-baseline" aria-hidden="true" />{' '}
          Without prepayment
        </span>
        <span>
          <i className="loan-line-key loan-line-key-prepaid" aria-hidden="true" /> With
          prepayment
        </span>
      </div>
      <svg
        className="loan-balance-visual"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Remaining loan principal by EMI, starting at ${formatMoney(opening)}; without prepayment ends after EMI ${lastEmi}; with prepayment paid off after EMI ${payoffEmi}`}
      >
        <line
          className="chart-grid-line"
          x1={plot.left}
          x2={plot.right}
          y1={plot.top}
          y2={plot.top}
        />
        <line
          className="chart-grid-line"
          x1={plot.left}
          x2={plot.right}
          y1={plot.bottom}
          y2={plot.bottom}
        />
        <line
          className="loan-balance-selected-line"
          x1={x(emi)}
          x2={x(emi)}
          y1={plot.top}
          y2={plot.bottom}
        />
        <polyline
          className="loan-balance-baseline"
          points={line(result.baseline)}
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
        <polyline
          className="loan-balance-prepaid"
          points={line(result.prepaid)}
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
        <circle
          className="loan-balance-baseline-point"
          cx={x(emi)}
          cy={y(baselineBalance)}
          r="5"
          vectorEffect="non-scaling-stroke"
        />
        <circle
          className="loan-balance-prepaid-point"
          cx={x(emi)}
          cy={y(prepaidBalance)}
          r="5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="loan-balance-axes">
        <span>EMI 0: {formatMoney(opening)}</span>
        <span>EMI {lastEmi}: ₹0</span>
      </div>
      <label htmlFor={inputId}>Selected EMI</label>
      <input
        id={inputId}
        type="range"
        min="0"
        max={lastEmi}
        step="1"
        value={emi}
        aria-valuetext={`EMI ${emi}: without prepayment ${formatMoney(baselineBalance)}; with prepayment ${formatMoney(prepaidBalance)}`}
        onChange={(event) => setInspected(Number(event.target.value))}
      />
      <div className="loan-balance-values">
        <div>
          <span>Without prepayment · EMI {emi}</span>
          <strong>{formatMoney(baselineBalance)}</strong>
        </div>
        <div>
          <span>With prepayment · EMI {emi}</span>
          <strong>{formatMoney(prepaidBalance)}</strong>
        </div>
      </div>
      {emi > payoffEmi ? (
        <p className="field-hint">
          Paid off after EMI {payoffEmi}; no further EMI is scheduled in the prepayment
          scenario.
        </p>
      ) : null}
    </section>
  )
}
