import { useId } from 'react'

import { formatMoney } from '../domain/money'
import type { Paise } from '../domain/types'

interface TrendPoint {
  label: string
  value: Paise
}

interface TrendChartProps {
  label: string
  points: TrendPoint[]
  color?: string
}

const width = 800
const height = 260
const plot = {
  left: 88,
  right: width - 16,
  top: 16,
  bottom: height - 36,
}
const gridLineCount = 4

export function TrendChart({ label, points, color = '#0f766e' }: TrendChartProps) {
  const titleId = useId()
  const tableId = useId()
  if (points.length === 0) {
    return (
      <div className="chart chart-empty" role="img" aria-label={`${label}. No data yet.`}>
        No trend data yet
      </div>
    )
  }

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
  const coordinates = points.map((point, index) => ({
    ...point,
    x:
      plot.left +
      (points.length === 1
        ? horizontalRange / 2
        : (index / (points.length - 1)) * horizontalRange),
    y: plot.bottom - ((point.value - minimum) / range) * verticalRange,
  }))
  const linePoints = coordinates.map(({ x, y }) => `${x},${y}`).join(' ')
  const areaPoints = `${plot.left},${plot.bottom} ${linePoints} ${plot.right},${plot.bottom}`
  const labelIndexes = [
    ...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]),
  ]

  return (
    <div className="chart">
      <svg
        className="chart-canvas"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={titleId}
        aria-describedby={tableId}
        preserveAspectRatio="none"
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
              ? coordinates.map((point) => (
                  <circle
                    key={`${point.label}-${point.x}`}
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
              textAnchor={
                index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'
              }
            >
              {point.label}
            </text>
          )
        })}
      </svg>
      <table id={tableId} className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {points.map((point) => (
            <tr key={point.label}>
              <th>{point.label}</th>
              <td>{formatMoney(point.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
