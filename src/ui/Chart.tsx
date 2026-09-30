import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { useId, useLayoutEffect, useRef, useState } from 'react'

import { formatMoney } from '../domain/money'
import type { ISODate, Paise } from '../domain/types'
import { ScrollableTable } from './ScrollableTable'

interface TrendPoint {
  date: ISODate
  label: string
  value: Paise
}

interface TrendChartProps {
  label: string
  points: readonly TrendPoint[]
  color?: string
  interpolation?: 'linear' | 'step-after'
}

const height = 260
const gridLineCount = 4

export function TrendChart({
  label,
  points,
  color = 'var(--accent)',
  interpolation = 'linear',
}: TrendChartProps) {
  const titleId = useId()
  const hintId = useId()
  const container = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const empty = points.length === 0
  useLayoutEffect(() => {
    const element = container.current
    if (!element) return
    setWidth(element.getBoundingClientRect().width)
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setWidth(entry.contentRect.width)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [empty])
  if (empty) {
    return (
      <div className="chart chart-empty" role="img" aria-label={`${label}. No data yet.`}>
        No trend data yet
      </div>
    )
  }
  const plot = {
    left: Math.min(68, width * 0.26),
    right: width - 12,
    top: 16,
    bottom: height - 36,
  }
  const ordered = [...points].sort((left, right) => left.date.localeCompare(right.date))
  const firstDate = parseISO(ordered[0]!.date)
  const daySpan = differenceInCalendarDays(parseISO(ordered.at(-1)!.date), firstDate)

  const values = points.map((point) => point.value)
  const rawMinimum = Math.min(...values)
  const rawMaximum = Math.max(...values)
  const padding =
    rawMinimum === rawMaximum
      ? Math.max(Math.abs(rawMinimum) * 0.05, 100)
      : (rawMaximum - rawMinimum) * 0.08
  const minimum = rawMinimum - padding
  const maximum = rawMaximum + padding
  const range = maximum - minimum
  const horizontalRange = plot.right - plot.left
  const verticalRange = plot.bottom - plot.top
  const coordinates = ordered.map((point) => ({
    ...point,
    x:
      plot.left +
      (daySpan === 0
        ? horizontalRange / 2
        : (differenceInCalendarDays(parseISO(point.date), firstDate) / daySpan) *
          horizontalRange),
    y: plot.bottom - ((point.value - minimum) / range) * verticalRange,
  }))
  const linePoints = coordinates
    .flatMap(({ x, y }, index) =>
      interpolation === 'step-after' && index > 0
        ? [`${x},${coordinates[index - 1]!.y}`, `${x},${y}`]
        : [`${x},${y}`],
    )
    .join(' ')
  const areaPoints = `${plot.left},${plot.bottom} ${linePoints} ${plot.right},${plot.bottom}`
  const labelIndexes = daySpan === 0 ? [0] : [0, coordinates.length - 1]

  return (
    <div className="chart" ref={container}>
      {width > 0 ? (
        <svg
          className="chart-canvas"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-labelledby={titleId}
          aria-describedby={hintId}
        >
          <title id={titleId}>{label}</title>
          {Array.from({ length: gridLineCount + 1 }, (_, index) => {
            const fraction = index / gridLineCount
            const y = plot.top + fraction * verticalRange
            const value = maximum - fraction * range
            return (
              <g key={index}>
                <line
                  x1={plot.left}
                  x2={plot.right}
                  y1={y}
                  y2={y}
                  className="chart-grid-line"
                />
                <text x={plot.left - 10} y={y + 4} className="chart-axis-value">
                  {formatMoney(Math.round(value), { compact: true })}
                </text>
              </g>
            )
          })}
          {linePoints ? (
            <>
              <polygon points={areaPoints} fill={color} opacity="0.08" />
              <polyline
                points={linePoints}
                fill="none"
                stroke={color}
                strokeWidth="3"
                vectorEffect="non-scaling-stroke"
              />
              {coordinates.length < 14
                ? coordinates.map((point, index) => (
                    <circle
                      key={`${point.date}-${index}`}
                      cx={point.x}
                      cy={point.y}
                      r="4"
                      fill={color}
                      vectorEffect="non-scaling-stroke"
                    >
                      <title>
                        {point.label}: {formatMoney(point.value)}
                      </title>
                    </circle>
                  ))
                : null}
            </>
          ) : null}
          {labelIndexes.map((index) => {
            const point = coordinates[index]
            if (!point) return null
            return (
              <text
                key={`${point.label}-${index}`}
                x={point.x}
                y={height - 10}
                className="chart-axis-label"
                textAnchor={daySpan === 0 ? 'middle' : index === 0 ? 'start' : 'end'}
              >
                {point.label}
              </text>
            )
          })}
        </svg>
      ) : null}
      <p id={hintId} className="sr-only">
        Expand View values for exact dated amounts.
      </p>
      <details className="chart-values">
        <summary>View values</summary>
        <ScrollableTable label={`${label} values`}>
          <table className="data-table">
            <caption>{label}</caption>
            <tbody>
              {ordered.map((point, index) => (
                <tr key={`${point.date}-${index}`}>
                  <th scope="row">{format(parseISO(point.date), 'dd MMM yyyy')}</th>
                  <td>{formatMoney(point.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollableTable>
      </details>
    </div>
  )
}
