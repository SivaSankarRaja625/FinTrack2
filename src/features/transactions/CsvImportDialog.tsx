import { useMemo, useState } from 'react'

import { useFinance } from '../../app/FinanceContext'
import {
  createImportBatch,
  parseCsv,
  previewCsvTransactions,
  type CsvMapping,
} from '../../domain/csv'
import { entityTimestamps, newId, nowIso } from '../../domain/id'
import type { Transaction } from '../../domain/types'
import { Dialog } from '../../ui/Dialog'
import { Icon } from '../../ui/Icon'
import { useToast } from '../../ui/Toast'

function findHeader(headers: string[], candidates: string[]): string {
  return (
    headers.find((header) =>
      candidates.some((candidate) => header.toLowerCase().includes(candidate)),
    ) ?? ''
  )
}

function automaticMapping(headers: string[]): CsvMapping {
  return {
    date: findHeader(headers, ['date']),
    description: findHeader(headers, ['description', 'narration', 'details', 'payee']),
    amount: findHeader(headers, ['amount']),
    type: findHeader(headers, ['type', 'dr/cr']) || null,
    debit: findHeader(headers, ['debit', 'withdrawal']) || null,
    credit: findHeader(headers, ['credit', 'deposit']) || null,
    category: findHeader(headers, ['category']) || null,
    reference: findHeader(headers, ['reference', 'ref no', 'utr']) || null,
  }
}

export function CsvImportDialog({ onClose }: { onClose: () => void }) {
  const { data, commitImport } = useFinance()
  const { notify } = useToast()
  const [filename, setFilename] = useState('')
  const [rows, setRows] = useState<Array<Record<string, string>>>([])
  const [mapping, setMapping] = useState<CsvMapping | null>(null)
  const [accountId, setAccountId] = useState(
    data.accounts.find((account) => !account.archived)?.id ?? '',
  )
  const [batchId, setBatchId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const headers = rows[0] ? Object.keys(rows[0]) : []

  const preview = useMemo(() => {
    if (
      !mapping ||
      !accountId ||
      !mapping.date ||
      !mapping.description ||
      (!mapping.amount && !mapping.debit && !mapping.credit)
    ) {
      return []
    }
    return previewCsvTransactions({
      rows,
      mapping,
      accountId,
      categories: data.categories,
      existing: data.transactions,
      importBatchId: batchId,
    })
  }, [accountId, batchId, data.categories, data.transactions, mapping, rows])

  const validRows = preview.filter((row) => row.transaction !== null && !row.duplicate)
  const invalidCount = preview.filter((row) => row.error).length
  const duplicateCount = preview.filter((row) => row.duplicate).length

  const onFile = async (file: File | null) => {
    setError(null)
    if (!file) {
      setRows([])
      setMapping(null)
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('CSV imports are limited to 10 MB per file')
      return
    }
    try {
      const parsed = parseCsv(await file.text())
      if (parsed.length === 0) throw new Error('The CSV contains no data rows')
      const nextHeaders = Object.keys(parsed[0] ?? {})
      setFilename(file.name)
      setRows(parsed)
      setMapping(automaticMapping(nextHeaders))
      setBatchId(newId())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The CSV could not be read')
    }
  }

  const updateMapping = (key: keyof CsvMapping, value: string) => {
    setMapping((current) =>
      current
        ? {
            ...current,
            [key]: value || (['date', 'description', 'amount'].includes(key) ? '' : null),
          }
        : current,
    )
  }

  const onImport = async () => {
    setError(null)
    if (!mapping || validRows.length === 0) {
      setError('There are no valid non-duplicate rows to import')
      return
    }
    setSubmitting(true)
    try {
      const timestamp = nowIso()
      const transactions = validRows.map((row) => ({
        ...row.transaction!,
        ...entityTimestamps(),
      })) satisfies Transaction[]
      const batch = {
        ...createImportBatch(filename, transactions, duplicateCount, timestamp),
        id: batchId,
        rowCount: rows.length,
      }
      await commitImport(transactions, batch)
      notify(
        `${transactions.length} transaction${transactions.length === 1 ? '' : 's'} imported`,
      )
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The import failed')
    } finally {
      setSubmitting(false)
    }
  }

  const mappingSelect = (key: keyof CsvMapping, label: string, required = false) => (
    <div className="field">
      <label htmlFor={`mapping-${key}`}>
        {label}
        {required ? ' *' : ''}
      </label>
      <select
        id={`mapping-${key}`}
        className="select"
        value={mapping?.[key] ?? ''}
        onChange={(event) => updateMapping(key, event.target.value)}
      >
        <option value="">Not present</option>
        {headers.map((header) => (
          <option key={header} value={header}>
            {header}
          </option>
        ))}
      </select>
    </div>
  )

  return (
    <Dialog
      open
      title="Import transactions from CSV"
      description="Review the mapping and likely duplicates before anything is saved."
      size="large"
      onClose={onClose}
      footer={
        <div className="cluster cluster-between" style={{ width: '100%' }}>
          <span className="muted">
            {validRows.length} ready · {duplicateCount} duplicate · {invalidCount} invalid
          </span>
          <div className="cluster">
            <button type="button" className="button button-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="button"
              disabled={submitting || validRows.length === 0}
              onClick={() => void onImport()}
            >
              <Icon name="upload" size={17} />
              {submitting ? 'Importing…' : `Import ${validRows.length}`}
            </button>
          </div>
        </div>
      }
    >
      <div className="stack">
        <div className="form-grid">
          <div className="field">
            <label htmlFor="csv-file">CSV statement</label>
            <input
              id="csv-file"
              type="file"
              className="input file-input"
              accept=".csv,text/csv"
              onChange={(event) => void onFile(event.target.files?.[0] ?? null)}
            />
          </div>
          <div className="field">
            <label htmlFor="import-account">Account</label>
            <select
              id="import-account"
              className="select"
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
            >
              <option value="">Choose account</option>
              {data.accounts
                .filter((account) => !account.archived)
                .map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
            </select>
          </div>
        </div>

        {mapping ? (
          <>
            <hr className="divider" />
            <div>
              <h3>Column mapping</h3>
              <p className="field-hint">
                Use either one signed amount column, or separate debit and credit columns.
              </p>
            </div>
            <div className="mapping-grid">
              {mappingSelect('date', 'Date', true)}
              {mappingSelect('description', 'Description', true)}
              {mappingSelect('amount', 'Signed amount')}
              {mappingSelect('debit', 'Debit')}
              {mappingSelect('credit', 'Credit')}
              {mappingSelect('type', 'Debit / credit type')}
              {mappingSelect('category', 'Category')}
              {mappingSelect('reference', 'Reference')}
            </div>
          </>
        ) : null}

        {preview.length > 0 ? (
          <>
            <hr className="divider" />
            <div>
              <h3>Preview</h3>
              <p className="field-hint">
                Dates in DD/MM/YYYY and YYYY-MM-DD are supported. Duplicate-looking rows
                are not imported.
              </p>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Type</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 10).map((row) => (
                    <tr key={row.rowNumber}>
                      <td>{row.rowNumber}</td>
                      <td>{row.transaction?.date ?? '—'}</td>
                      <td>{row.transaction?.description ?? 'Invalid row'}</td>
                      <td>{row.transaction?.kind ?? '—'}</td>
                      <td>
                        <span
                          className={`badge${
                            row.error
                              ? ' badge-danger'
                              : row.duplicate
                                ? ' badge-warning'
                                : ' badge-positive'
                          }`}
                          title={row.error ?? undefined}
                        >
                          {row.error ? 'Invalid' : row.duplicate ? 'Duplicate' : 'Ready'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.length > 10 ? (
              <p className="field-hint">
                Showing 10 of {preview.length} rows. All rows are validated before import.
              </p>
            ) : null}
          </>
        ) : null}

        {error ? (
          <div className="notice notice-error" role="alert">
            <Icon name="alerts" size={18} />
            <span>{error}</span>
          </div>
        ) : null}
      </div>
    </Dialog>
  )
}
