import { useCallback, useEffect, useMemo, useState } from 'react'

import { useFinance } from '../../app/FinanceContext'
import { createImportBatch } from '../../domain/csv'
import { entityTimestamps, newId, nowIso } from '../../domain/id'
import { formatMoney } from '../../domain/money'
import {
  previewSmsTransactions,
  type SmsCandidatePreview,
} from '../../domain/sms'
import type { ImportBatch, Transaction } from '../../domain/types'
import { fetchInboxSms, requestSmsPermission } from '../../platform/sms'
import { Dialog } from '../../ui/Dialog'
import { Icon } from '../../ui/Icon'
import { ScrollableTable } from '../../ui/ScrollableTable'
import { useToast } from '../../ui/Toast'

interface CandidateRow extends SmsCandidatePreview {
  selected: boolean
  selectedAccountId: string
  selectedCategoryId: string
}

export function SmsImportDialog({ onClose }: { onClose: () => void }) {
  const { data, commitImport } = useFinance()
  const { notify } = useToast()

  const [preset, setPreset] = useState<'1d' | '3d' | '7d' | 'custom'>('1d')
  const [customFrom, setCustomFrom] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return d.toISOString().split('T')[0]
  })
  const [customTo, setCustomTo] = useState(() => new Date().toISOString().split('T')[0])

  const [loading, setLoading] = useState(true)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [candidates, setCandidates] = useState<CandidateRow[]>([])

  const defaultAccountId = useMemo(
    () => data.accounts.find((a) => !a.archived)?.id ?? '',
    [data.accounts],
  )

  const scan = useCallback(async () => {
    setLoading(true)
    setPermissionDenied(false)

    const granted = await requestSmsPermission()
    if (!granted) {
      setPermissionDenied(true)
      setLoading(false)
      return
    }

    let sinceMs: number
    let untilMs: number | undefined

    if (preset === '1d') {
      sinceMs = Date.now() - 24 * 60 * 60 * 1000
    } else if (preset === '3d') {
      sinceMs = Date.now() - 3 * 24 * 60 * 60 * 1000
    } else if (preset === '7d') {
      sinceMs = Date.now() - 7 * 24 * 60 * 60 * 1000
    } else {
      sinceMs = new Date(`${customFrom}T00:00:00`).getTime()
      untilMs = new Date(`${customTo}T23:59:59.999`).getTime()
    }

    try {
      const messages = await fetchInboxSms(
        untilMs !== undefined ? { sinceMs, untilMs } : { sinceMs },
      )
      const previews = previewSmsTransactions({
        messages,
        accounts: data.accounts,
        categories: data.categories,
        existingTransactions: data.transactions,
      })

      setCandidates(
        previews.map((item) => ({
          ...item,
          selected: !item.duplicate,
          selectedAccountId: item.matchedAccountId ?? defaultAccountId,
          selectedCategoryId: item.suggestedCategoryId ?? '',
        })),
      )
    } catch {
      notify('Failed to read SMS messages from device inbox', 'error')
    } finally {
      setLoading(false)
    }
  }, [customFrom, customTo, data.accounts, data.categories, data.transactions, defaultAccountId, notify, preset])

  useEffect(() => {
    void scan()
  }, [scan])

  const selectedCount = candidates.filter((c) => c.selected).length

  const handleToggleAll = () => {
    const allSelected = candidates.every((c) => c.selected)
    setCandidates((prev) => prev.map((c) => ({ ...c, selected: !allSelected })))
  }

  const handleCommit = async () => {
    const selected = candidates.filter((c) => c.selected)
    if (selected.length === 0) return

    setSubmitting(true)
    const batchId = newId()
    const now = nowIso()

    const transactions: Transaction[] = selected.map((c) => ({
      id: newId(),
      accountId: c.selectedAccountId,
      destinationAccountId: null,
      categoryId: c.selectedCategoryId || null,
      kind: c.kind,
      amountPaise: c.amountPaise,
      date: c.date,
      description: c.merchant || 'Expense',
      note: c.reference ? `Ref: ${c.reference}` : '',
      tags: ['sms-import'],
      cleared: true,
      splits: [],
      recurringRuleId: null,
      importBatchId: batchId,
      ...entityTimestamps(),
    }))

    const batch: ImportBatch = {
      ...createImportBatch(
        'SMS inbox import',
        transactions,
        candidates.filter((c) => c.duplicate).length,
        now,
      ),
      id: batchId,
    }

    try {
      await commitImport(transactions, batch)
      notify(
        `Imported ${transactions.length} transaction${transactions.length === 1 ? '' : 's'} from SMS`,
        'success',
      )
      onClose()
    } catch {
      notify('Could not commit imported SMS transactions', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open
      title="Scan SMS expenses"
      description="Review candidate expenses parsed from your SMS inbox."
      onClose={onClose}
    >
      <div className="stack form-stack">
        <div className="cluster" style={{ justifyContent: 'space-between' }}>
          <div className="field">
            <span>Scan timeframe</span>
            <div className="cluster">
              <button
                type="button"
                className={`button ${preset === '1d' ? 'button-primary' : 'button-secondary'}`}
                onClick={() => setPreset('1d')}
              >
                Last 24 hours
              </button>
              <button
                type="button"
                className={`button ${preset === '3d' ? 'button-primary' : 'button-secondary'}`}
                onClick={() => setPreset('3d')}
              >
                Last 3 days
              </button>
              <button
                type="button"
                className={`button ${preset === '7d' ? 'button-primary' : 'button-secondary'}`}
                onClick={() => setPreset('7d')}
              >
                Last 7 days
              </button>
              <button
                type="button"
                className={`button ${preset === 'custom' ? 'button-primary' : 'button-secondary'}`}
                onClick={() => setPreset('custom')}
              >
                Custom
              </button>
            </div>
          </div>
        </div>

        {preset === 'custom' ? (
          <div className="form-grid">
            <label className="field">
              <span>From date</span>
              <input
                type="date"
                className="input"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
            </label>
            <label className="field">
              <span>To date</span>
              <input
                type="date"
                className="input"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </label>
          </div>
        ) : null}

        {loading ? (
          <p className="muted">Scanning SMS inbox...</p>
        ) : permissionDenied ? (
          <div className="notice notice-danger" role="alert">
            <p>
              Permission to read SMS was denied. Please grant the SMS permission in Android
              settings to scan expenses.
            </p>
          </div>
        ) : candidates.length === 0 ? (
          <div className="card card-body">
            <p className="muted">No financial debit or credit SMS found in this timeframe.</p>
          </div>
        ) : (
          <div className="stack">
            <div className="cluster" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <p className="muted">
                Found {candidates.length} message{candidates.length === 1 ? '' : 's'} (
                {candidates.filter((c) => c.duplicate).length} potential duplicate
                {candidates.filter((c) => c.duplicate).length === 1 ? '' : 's'})
              </p>
              <button
                type="button"
                className="button button-secondary button-small"
                onClick={handleToggleAll}
              >
                {candidates.every((c) => c.selected) ? 'Deselect all' : 'Select all'}
              </button>
            </div>

            <ScrollableTable label="Parsed SMS messages">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>Use</th>
                    <th>Date</th>
                    <th>Payee / Details</th>
                    <th>Amount</th>
                    <th>Account</th>
                    <th>Category</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((candidate, idx) => (
                    <tr key={candidate.smsId || idx} className={candidate.duplicate ? 'row-duplicate' : ''}>
                      <td>
                        <input
                          type="checkbox"
                          checked={candidate.selected}
                          onChange={(e) => {
                            const checked = e.target.checked
                            setCandidates((prev) =>
                              prev.map((c, i) => (i === idx ? { ...c, selected: checked } : c)),
                            )
                          }}
                          aria-label={`Select ${candidate.merchant}`}
                        />
                      </td>
                      <td>
                        <time dateTime={candidate.date}>{candidate.date}</time>
                      </td>
                      <td>
                        <strong>{candidate.merchant}</strong>
                        {candidate.duplicate ? (
                          <span className="badge badge-warning" style={{ marginLeft: 6 }}>
                            Duplicate
                          </span>
                        ) : null}
                      </td>
                      <td>
                        <span className={`tabular ${candidate.kind === 'income' ? 'text-positive' : 'text-danger'}`}>
                          {formatMoney(candidate.amountPaise)}
                        </span>
                      </td>
                      <td>
                        <select
                          className="select select-compact"
                          value={candidate.selectedAccountId}
                          onChange={(e) => {
                            const val = e.target.value
                            setCandidates((prev) =>
                              prev.map((c, i) => (i === idx ? { ...c, selectedAccountId: val } : c)),
                            )
                          }}
                        >
                          {data.accounts
                            .filter((a) => !a.archived)
                            .map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name}
                              </option>
                            ))}
                        </select>
                      </td>
                      <td>
                        <select
                          className="select select-compact"
                          value={candidate.selectedCategoryId}
                          onChange={(e) => {
                            const val = e.target.value
                            setCandidates((prev) =>
                              prev.map((c, i) => (i === idx ? { ...c, selectedCategoryId: val } : c)),
                            )
                          }}
                        >
                          <option value="">(Uncategorized)</option>
                          {data.categories
                            .filter((c) => !c.archived && c.kind === candidate.kind)
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollableTable>
          </div>
        )}

        <footer className="cluster modal-actions" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" className="button button-secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            type="button"
            className="button button-primary"
            disabled={selectedCount === 0 || submitting || loading}
            onClick={() => void handleCommit()}
          >
            <Icon name="plus" size={17} />
            {submitting
              ? 'Importing...'
              : `Import ${selectedCount} expense${selectedCount === 1 ? '' : 's'}`}
          </button>
        </footer>
      </div>
    </Dialog>
  )
}
