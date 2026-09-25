import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  description: string
  action?: ReactNode
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action ? <div className="page-action">{action}</div> : null}
    </header>
  )
}

interface EmptyStateProps {
  title: string
  description: string
  action?: ReactNode
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  )
}

interface MetricProps {
  label: string
  value: ReactNode
  detail?: ReactNode
  tone?: 'default' | 'positive' | 'danger'
}

export function Metric({ label, value, detail, tone = 'default' }: MetricProps) {
  return (
    <div className="metric">
      <span className="metric-label">{label}</span>
      <strong
        className={`metric-value${tone === 'positive' ? ' text-positive' : tone === 'danger' ? ' text-danger' : ''}`}
      >
        {value}
      </strong>
      {detail ? <span className="metric-detail">{detail}</span> : null}
    </div>
  )
}
