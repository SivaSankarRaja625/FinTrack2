import type { ReactNode } from 'react'

export function ScrollableTable({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="table-wrap" role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  )
}
