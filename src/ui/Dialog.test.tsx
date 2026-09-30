// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Dialog } from './Dialog'

afterEach(cleanup)

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

  it('traps focus around visible controls including scroll regions, not collapsed fields', async () => {
    const user = userEvent.setup()
    render(
      <Dialog open title="Transaction" onClose={() => {}}>
        <label>
          Amount
          <input data-autofocus />
        </label>
        <button type="button">More details</button>
        <div role="region" aria-label="Exact values" tabIndex={0}>
          Values
        </div>
        <div hidden>
          <label>
            Hidden note
            <input />
          </label>
        </div>
      </Dialog>,
    )
    expect(screen.getByLabelText('Amount')).toHaveFocus()
    screen.getByRole('region', { name: 'Exact values' }).focus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus()
    await user.tab({ shift: true })
    expect(screen.getByRole('region', { name: 'Exact values' })).toHaveFocus()
  })

  it('keeps input focus on a parent rerender and restores the opener on unmount', () => {
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const content = (
      <>
        <label>
          Amount
          <input data-autofocus />
        </label>
        <label>
          Description
          <input />
        </label>
      </>
    )
    const { rerender, unmount } = render(
      <Dialog open title="Transaction" onClose={() => {}}>
        {content}
      </Dialog>,
    )
    screen.getByLabelText('Description').focus()
    rerender(
      <Dialog open title="Transaction" onClose={() => {}}>
        {content}
      </Dialog>,
    )
    expect(screen.getByLabelText('Description')).toHaveFocus()
    unmount()
    expect(opener).toHaveFocus()
    opener.remove()
  })

  it('recovers focus when a workflow replaces its focused action with a file field', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const { rerender } = render(
      <>
        <button type="button">Background action</button>
        <Dialog open title="Restore" onClose={onClose}>
          <button type="button">Create safety backup</button>
        </Dialog>
      </>,
    )
    expect(screen.getByRole('button', { name: 'Create safety backup' })).toHaveFocus()
    rerender(
      <>
        <button type="button">Background action</button>
        <Dialog open title="Restore" onClose={onClose}>
          <label>
            Saved safety file
            <input type="file" />
          </label>
          <button type="button" disabled>
            Verify and restore
          </button>
        </Dialog>
      </>,
    )
    expect(screen.getByLabelText('Saved safety file')).toHaveFocus()
    screen.getByRole('button', { name: 'Background action' }).focus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus()
  })
})
