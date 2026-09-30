// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TrendChart } from './Chart'

let resize: ResizeObserverCallback
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 320,
    height: 260,
    x: 0,
    y: 0,
    left: 0,
    right: 320,
    top: 0,
    bottom: 260,
    toJSON: () => ({}),
  })
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        resize = callback
      }
      observe() {}
      disconnect() {}
    },
  )
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('TrendChart', () => {
  it('provides exact values in an accessible table', () => {
    render(
      <TrendChart
        label="Net worth history"
        points={[
          { date: '2026-04-01', label: 'April', value: 100_000 },
          { date: '2026-05-01', label: 'May', value: 125_000 },
        ]}
      />,
    )

    expect(screen.getByRole('img', { name: 'Net worth history' })).toBeInTheDocument()
    fireEvent.click(screen.getByText('View values', { exact: true }))
    const table = screen.getByRole('table', { name: 'Net worth history' })
    expect(within(table).getByText('01 Apr 2026')).toBeInTheDocument()
    expect(within(table).getByText('₹1,000')).toBeInTheDocument()
  })

  it('renders a clear empty state without invalid chart coordinates', () => {
    render(<TrendChart label="Cash-flow history" points={[]} />)

    expect(
      screen.getByRole('img', { name: 'Cash-flow history. No data yet.' }),
    ).toHaveTextContent('No trend data yet')
  })

  it('uses calendar gaps rather than row positions and updates its measured viewBox', () => {
    render(
      <TrendChart
        label="Dated balances"
        points={[
          { date: '2026-02-01', label: '01 Feb', value: 100_000 },
          { date: '2026-02-02', label: '02 Feb', value: 125_000 },
          { date: '2026-02-11', label: '11 Feb', value: 90_000 },
        ]}
      />,
    )
    const svg = screen.getByRole('img', { name: 'Dated balances' })
    const xs = svg
      .querySelector('polyline')!
      .getAttribute('points')!
      .trim()
      .split(/\s+/)
      .map((pair) => Number(pair.split(',')[0]))
    expect((xs[1]! - xs[0]!) / (xs[2]! - xs[0]!)).toBeCloseTo(0.1, 5)
    expect(svg).toHaveAttribute('viewBox', '0 0 320 260')
    act(() =>
      resize(
        [{ contentRect: { width: 390 } } as ResizeObserverEntry],
        {} as ResizeObserver,
      ),
    )
    expect(svg).toHaveAttribute('viewBox', '0 0 390 260')
  })

  it('keeps same-day negative balances finite and exposes every observation', () => {
    render(
      <TrendChart
        label="Same-day balances"
        interpolation="step-after"
        points={[
          { date: '2026-02-01', label: '01 Feb', value: -100_000 },
          { date: '2026-02-01', label: '01 Feb', value: -100_000 },
        ]}
      />,
    )
    const points = screen
      .getByRole('img')
      .querySelector('polyline')!
      .getAttribute('points')!
    expect(points).not.toMatch(/NaN|Infinity/)
    const xs = points.split(' ').map((pair) => pair.split(',')[0])
    expect(new Set(xs).size).toBe(1)
    fireEvent.click(screen.getByText('View values', { exact: true }))
    expect(screen.getByRole('table').querySelectorAll('tbody tr')).toHaveLength(2)
  })

  it('centers a single zero observation and never renders unmeasured geometry', () => {
    const { container } = render(
      <TrendChart
        label="One observation"
        points={[{ date: '2026-02-01', label: '01 Feb', value: 0 }]}
      />,
    )
    expect(
      screen.getByRole('img').querySelector('polyline')!.getAttribute('points'),
    ).not.toMatch(/NaN|Infinity/)
    act(() =>
      resize(
        [{ contentRect: { width: 0 } } as ResizeObserverEntry],
        {} as ResizeObserver,
      ),
    )
    expect(container.querySelector('svg')).toBeNull()
    fireEvent.click(screen.getByText('View values', { exact: true }))
    expect(screen.getByRole('table')).toHaveTextContent('₹0')
  })
})
