// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useFinance } from '../../app/FinanceContext'
import { useSecurity } from '../../app/SecurityContext'
import { createDefaultSettings, emptyFinanceData } from '../../domain/defaults'
import { downloadBytes, estimateStorage, readFileBytes } from '../../platform/files'
import type * as FileServices from '../../platform/files'
import { ToastProvider } from '../../ui/Toast'
import { SettingsPage } from './SettingsPage'

vi.mock('../../app/FinanceContext', () => ({ useFinance: vi.fn() }))
vi.mock('../../app/SecurityContext', () => ({ useSecurity: vi.fn() }))
vi.mock('../../platform/files', async (original) => ({
  ...(await original<typeof FileServices>()),
  downloadBytes: vi.fn(),
  estimateStorage: vi.fn(),
  readFileBytes: vi.fn(),
}))

beforeEach(() => {
  const data = emptyFinanceData()
  data.settings = [createDefaultSettings()]
  data.profiles = [
    {
      id: 'review-profile',
      createdAt: '2026-02-01T00:00:00Z',
      updatedAt: '2026-02-01T00:00:00Z',
      name: 'Ananya',
      currency: 'INR',
      locale: 'en-IN',
      monthlyIncomePaise: 12000000,
      essentialMonthlyPaise: 4500000,
      payDay: 1,
      emergencyFundMonths: 6,
    },
  ]
  vi.mocked(useFinance).mockReturnValue({
    recordFinancialEvent: vi.fn(),
    undoFinancialEvent: vi.fn(),
    finalizeFinancialEvents: vi.fn(),
    data,
    alerts: [],
    attachmentMetadata: [],
    loading: false,
    error: null,
    notificationStatus: {
      supported: false,
      permission: 'unsupported',
      scheduled: 0,
      error: null,
    },
    save: vi.fn(),
    saveMany: vi.fn(),
    remove: vi.fn(),
    removeMany: vi.fn(),
    addAttachment: vi.fn(),
    getAttachment: vi.fn(),
    deleteAttachment: vi.fn(),
    exportCompleteBackup: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    verifyCompleteBackup: vi.fn().mockRejectedValue(new Error('Wrong backup PIN')),
    restoreCompleteBackup: vi.fn(),
    setAndroidBackup: vi.fn(),
    dismissAlert: vi.fn(),
    snoozeAlert: vi.fn(),
    restoreAlert: vi.fn(),
    syncNotifications: vi.fn(),
    commitImport: vi.fn(),
    rollbackImport: vi.fn(),
    refresh: vi.fn(),
  })
  vi.mocked(useSecurity).mockReturnValue({
    status: 'unlocked',
    workspace: null,
    bootstrapNotice: null,
    hasPendingSystemRestore: false,
    setup: vi.fn(),
    restoreNew: vi.fn(),
    unlock: vi.fn(),
    lock: vi.fn(),
    changePin: vi.fn(),
    wipe: vi.fn(),
    discardSystemRestore: vi.fn(),
    setAutoLockMinutes: vi.fn(),
  })
  vi.mocked(estimateStorage).mockResolvedValue({ usage: 0, quota: 0 })
  vi.mocked(downloadBytes).mockResolvedValue('shared')
  vi.mocked(readFileBytes).mockResolvedValue(new Uint8Array([1, 2, 3]))
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function openBackup() {
  render(
    <ToastProvider>
      <SettingsPage />
    </ToastProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Backup & restore' }))
  fireEvent.change(screen.getByLabelText('Backup PIN', { exact: true }), {
    target: { value: 'Backup2026' },
  })
  fireEvent.change(screen.getByLabelText('Confirm backup PIN'), {
    target: { value: 'Backup2026' },
  })
}

describe('guided backup presentation', () => {
  it('shows verification failures without discarding the selected saved file or claiming recovery', async () => {
    openBackup()
    fireEvent.click(screen.getByRole('button', { name: 'Verify an existing file' }))
    const file = new File(['saved bytes'], 'saved.finapp')
    fireEvent.change(screen.getByLabelText('Saved .finapp file to verify'), {
      target: { files: [file] },
    })
    fireEvent.change(screen.getByLabelText('Saved backup PIN'), {
      target: { value: 'Wrong2026' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Verify saved backup' }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Wrong backup PIN'),
    )
    expect(screen.getByRole('button', { name: 'Verify saved backup' })).toBeEnabled()
    expect(screen.getByText('No dated backup verified')).toBeVisible()
    expect(screen.getByLabelText('Saved backup PIN')).toHaveValue('Wrong2026')
  })

  it('treats a closed share sheet as pending, not a verified saved file', async () => {
    openBackup()
    fireEvent.click(screen.getByRole('button', { name: 'Export complete backup' }))
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: '2. Reopen and verify' })).toBeVisible(),
    )
    expect(screen.getByRole('status', { name: 'Backup progress' })).toHaveTextContent(
      'reopen',
    )
    expect(screen.getByText('No dated backup verified')).toBeVisible()
    expect(useFinance().verifyCompleteBackup).not.toHaveBeenCalled()
  })

  it('keeps failed export retryable and prevents another operation while exporting', async () => {
    let rejectExport: (error: Error) => void = () => {}
    vi.mocked(downloadBytes).mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectExport = reject
        }),
    )
    openBackup()
    fireEvent.click(screen.getByRole('button', { name: 'Export complete backup' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Encrypting…' })).toBeDisabled(),
    )
    expect(screen.getByRole('button', { name: 'Verify an existing file' })).toBeDisabled()
    rejectExport(new Error('Save cancelled'))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Save cancelled'),
    )
    expect(screen.getByLabelText('Backup PIN', { exact: true })).toHaveValue('Backup2026')
    expect(screen.getByRole('button', { name: 'Export complete backup' })).toBeEnabled()
    expect(screen.getByText('No dated backup verified')).toBeVisible()
  })
})
