// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { compareLoanPrepayment } from '../../domain/calculators/debt'
import { LoanBalanceChart } from './LoanBalanceChart'

afterEach(cleanup)

const input = {
  balancePaise: 1_200_000,
  annualRatePercent: '0',
  remainingMonths: 12,
  prepaymentMonth: 1,
  prepaymentPaise: 1_100_000,
  feePaise: 0,
  strategy: 'reduce-tenure',
} as const

describe('LoanBalanceChart', () => {
  it('plots a single-EMI payoff from the opening balance and keeps inspected balances exact', () => {
    render(<LoanBalanceChart result={compareLoanPrepayment(input)} />)

    const chart = screen.getByRole('group', { name: 'Loan principal comparison' })
    const image = within(chart).getByRole('img', {
      name: /Remaining loan principal by EMI.*starting at ₹12,000.*paid off after EMI 1/i,
    })
    expect(image.querySelectorAll('polyline')).toHaveLength(2)
    expect(within(chart).getByRole('slider', { name: 'Selected EMI' })).toHaveAttribute(
      'aria-valuetext',
      'EMI 1: without prepayment ₹11,000; with prepayment ₹0',
    )
    fireEvent.change(within(chart).getByRole('slider', { name: 'Selected EMI' }), {
      target: { value: '12' },
    })
    expect(within(chart).getByRole('slider', { name: 'Selected EMI' })).toHaveAttribute(
      'aria-valuetext',
      'EMI 12: without prepayment ₹0; with prepayment ₹0',
    )
    expect(chart).toHaveTextContent('Paid off after EMI 1')
  })

  it('clamps an inspected EMI when recalculation shortens the baseline tenure', () => {
    const { rerender } = render(
      <LoanBalanceChart result={compareLoanPrepayment(input)} />,
    )
    const slider = screen.getByRole('slider', { name: 'Selected EMI' })
    fireEvent.change(slider, { target: { value: '12' } })
    rerender(
      <LoanBalanceChart
        result={compareLoanPrepayment({
          ...input,
          remainingMonths: 6,
          prepaymentPaise: 1_000_000,
        })}
      />,
    )
    expect(slider).toHaveValue('6')
    expect(slider).toHaveAttribute(
      'aria-valuetext',
      'EMI 6: without prepayment ₹0; with prepayment ₹0',
    )
  })
})
