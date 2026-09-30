import { formatMoney } from '../../domain/money'

interface CashFlowPoint {
  key: string
  label: string
  income: number
  expense: number
  refund?: number
}

export function CashFlowChart({
  points,
  selectedKey,
  onSelect,
}: {
  points: readonly CashFlowPoint[]
  selectedKey: string
  onSelect: (key: string) => void
}) {
  const maximum = Math.max(
    1,
    ...points.map((point) =>
      Math.max(point.income, point.expense + (point.refund ?? 0), point.refund ?? 0),
    ),
  )
  const hasRefunds = points.some((point) => (point.refund ?? 0) > 0)

  return (
    <div
      className={`cashflow-chart${hasRefunds ? ' cashflow-has-refunds' : ''}`}
      role="group"
      aria-label="Income and expenses by report interval"
    >
      <div className="cashflow-legend">
        <span>
          <i className="cashflow-swatch cashflow-income" /> Income
        </span>
        <span>
          <i className="cashflow-swatch cashflow-expense" />{' '}
          {hasRefunds ? 'Paid expenses' : 'Expenses'}
        </span>
        {hasRefunds ? (
          <span>
            <i className="cashflow-swatch cashflow-refund" /> Reimbursements
          </span>
        ) : null}
        <span className="cashflow-maximum">
          Highest: {formatMoney(maximum, { compact: true })}
        </span>
      </div>
      <div className="cashflow-scroll">
        <div className="cashflow-bars">
          {points.map((point) => (
            <button
              key={point.key}
              type="button"
              className="cashflow-interval"
              aria-label={`Inspect ${point.label}`}
              aria-pressed={selectedKey === point.key}
              onClick={() => onSelect(point.key)}
            >
              <span className="cashflow-pair" aria-hidden="true">
                <span
                  className={`cashflow-bar cashflow-income${point.income === 0 ? ' cashflow-zero' : ''}`}
                  style={{ height: `${(point.income / maximum) * 100}%` }}
                />
                <span
                  className={`cashflow-bar cashflow-expense${point.expense + (point.refund ?? 0) === 0 ? ' cashflow-zero' : ''}`}
                  style={{
                    height: `${((point.expense + (point.refund ?? 0)) / maximum) * 100}%`,
                  }}
                />
                {hasRefunds ? (
                  <span
                    className={`cashflow-bar cashflow-refund${!point.refund ? ' cashflow-zero' : ''}`}
                    style={{ height: `${((point.refund ?? 0) / maximum) * 100}%` }}
                  />
                ) : null}
              </span>
              <span className="cashflow-interval-label">{point.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
