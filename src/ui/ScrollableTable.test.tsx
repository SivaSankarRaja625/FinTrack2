// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it } from 'vitest'

import { ScrollableTable } from './ScrollableTable'

afterEach(cleanup)

it('makes exact financial values reachable as a labelled keyboard stop', async () => {
  const user = userEvent.setup()
  render(
    <ScrollableTable label="Cash-flow values">
      <table>
        <caption>Cash flow</caption>
        <tbody>
          <tr>
            <th>February</th>
            <td>₹1,000</td>
          </tr>
        </tbody>
      </table>
    </ScrollableTable>,
  )
  await user.tab()
  expect(screen.getByRole('region', { name: 'Cash-flow values' })).toHaveFocus()
  expect(screen.getByRole('table', { name: 'Cash flow' })).toHaveTextContent('₹1,000')
})
