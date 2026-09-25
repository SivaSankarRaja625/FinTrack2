// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Dialog } from './Dialog'

describe('Dialog', () => {
  it('labels the modal, traps focus, and closes on Escape', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <Dialog open title="Add account" description="Account details" onClose={onClose}>
        <label>
          Name
          <input />
        </label>
        <button type="button">Save</button>
      </Dialog>,
    )

    expect(screen.getByRole('dialog', { name: 'Add account' })).toHaveAttribute(
      'aria-modal',
      'true',
    )
    expect(screen.getByRole('textbox')).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
  })
})
