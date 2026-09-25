// @vitest-environment jsdom

import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { TrendChart } from './Chart'

describe('TrendChart', () => {
  it('provides exact values in an accessible table', () => {
    render(
      <TrendChart
        label="Net worth history"
        points={[
          { label: 'April', value: 100_000 },
          { label: 'May', value: 125_000 },
        ]}
      />,
    )

    expect(screen.getByRole('img', { name: 'Net worth history' })).toBeInTheDocument()
    const table = screen.getByRole('table', { name: 'Net worth history' })
    expect(within(table).getByText('April')).toBeInTheDocument()
    expect(within(table).getByText('₹1,000')).toBeInTheDocument()
  })

  it('renders a clear empty state without invalid chart coordinates', () => {
    render(<TrendChart label="Cash-flow history" points={[]} />)

    expect(
      screen.getByRole('img', { name: 'Cash-flow history. No data yet.' }),
    ).toHaveTextContent('No trend data yet')
  })
})
