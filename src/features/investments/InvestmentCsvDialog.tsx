import Decimal from 'decimal.js'
import { useState } from 'react'

import { useFinance } from '../../app/FinanceContext'
import { parseCsv } from '../../domain/csv'
import { isIsoDate } from '../../domain/dates'
import { entityTimestamps, newId } from '../../domain/id'
import { rupeesToPaise } from '../../domain/money'
import type { InvestmentHolding, InvestmentType } from '../../domain/types'
import { downloadText } from '../../platform/files'
import { Dialog } from '../../ui/Dialog'
import { useToast } from '../../ui/Toast'

const investmentTypes = new Set<InvestmentType>([
  'equity',
  'mutual-fund',
  'etf',
  'fixed-deposit',
  'ppf',
  'epf',
  'nps',
  'bond',
  'gold',
  'other',
])

const template =
  'Name,Symbol,Type,Units,Average Cost,Current Price,Price Date,Total Cost,Account\nExample Fund,EXAMPLE,mutual-fund,10.5,1000,1125,31/03/2026,10500,\n'

function normalizeDate(value: string): string | null {
  if (isIsoDate(value)) return value
  const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/u.exec(value)
  if (!match) return null
  const [, day = '', month = '', year = ''] = match
  const date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  return isIsoDate(date) ? date : null
}

export function InvestmentCsvDialog({ onClose }: { onClose: () => void }) {
  const { data, saveMany } = useFinance()
  const { notify } = useToast()
  const [holdings, setHoldings] = useState<InvestmentHolding[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  const parseFile = async (file: File) => {
    const parsed = parseCsv(await file.text())
    const next: InvestmentHolding[] = []
    const problems: string[] = []
    const existingKeys = new Set(
      data.investments.map((holding) =>
        (holding.symbol || holding.name).trim().toLowerCase(),
      ),
    )
    const accountByName = new Map(
      data.accounts.map((account) => [account.name.trim().toLowerCase(), account.id]),
    )

    parsed.forEach((row, index) => {
      try {
        const name = (row.Name ?? '').trim()
        const symbol = (row.Symbol ?? '').trim().toUpperCase()
        const rawType = (row.Type ?? '').trim()
        if (!name) throw new Error('Name is missing')
        if (!investmentTypes.has(rawType as InvestmentType)) {
          throw new Error(`Unknown investment type “${rawType}”`)
        }
        const key = (symbol || name).toLowerCase()
        if (existingKeys.has(key)) throw new Error('Holding already exists')
        const units = new Decimal((row.Units ?? '').replaceAll(',', ''))
        if (!units.isFinite() || units.isNegative()) {
          throw new Error('Units are invalid')
        }
        const averageCostPaise = rupeesToPaise(row['Average Cost'] ?? '')
        const currentPricePaise = rupeesToPaise(row['Current Price'] ?? '')
        const priceDate = normalizeDate((row['Price Date'] ?? '').trim())
        if (!priceDate) throw new Error('Price Date is invalid')
        const investedPaise = (row['Total Cost'] ?? '').trim()
          ? rupeesToPaise(row['Total Cost'] ?? '')
          : units
              .mul(averageCostPaise)
              .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
              .toNumber()
        const accountName = (row.Account ?? '').trim().toLowerCase()
        const accountId = accountName ? accountByName.get(accountName) : null
        if (accountName && !accountId) throw new Error('Linked account was not found')
        const timestamps = entityTimestamps()
        const id = newId()
        next.push({
          id,
          name,
          symbol,
          type: rawType as InvestmentType,
          accountId: accountId ?? null,
          units: units.toString(),
          averageCostPaise,
          currentPricePaise,
          priceDate,
          investedPaise,
          activities: [],
          priceHistory: [{ id: newId(), date: priceDate, pricePaise: currentPricePaise }],
          includeInNetWorth: true,
          ...timestamps,
        })
        existingKeys.add(key)
      } catch (error) {
        problems.push(
          `Row ${index + 2}: ${error instanceof Error ? error.message : 'Invalid row'}`,
        )
      }
    })
    setHoldings(next)
    setErrors(problems)
  }

  const exportTemplate = async () => {
    try {
      const result = await downloadText(
        template,
        'fintrack-investments-template.csv',
        'text/csv;charset=utf-8',
      )
      notify(
        result === 'shared'
          ? 'Investment template ready to save or share'
          : 'Investment template downloaded',
      )
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : 'Investment template could not be exported',
        'error',
      )
    }
  }

  const importHoldings = async () => {
    setSubmitting(true)
    try {
      await saveMany('investments', holdings)
      notify(`${holdings.length} holding${holdings.length === 1 ? '' : 's'} imported`)
      onClose()
    } catch (error) {
      setErrors([
        error instanceof Error ? error.message : 'The holdings could not be imported',
      ])
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open
      title="Import investment holdings"
      description="Use the fixed template for a reviewable, local-only import. No data leaves this device."
      onClose={onClose}
      footer={
        <div className="cluster cluster-between" style={{ width: '100%' }}>
          <button type="button" className="button button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="button"
            disabled={holdings.length === 0 || errors.length > 0 || submitting}
            onClick={() => void importHoldings()}
          >
            {submitting ? 'Importing…' : `Import ${holdings.length || ''} holdings`}
          </button>
        </div>
      }
    >
      <div className="stack">
        <div className="info-panel">
          <strong>Required columns</strong>
          <p>
            Name, Symbol, Type, Units, Average Cost, Current Price, Price Date, Total
            Cost, Account.
          </p>
          <button
            type="button"
            className="button button-secondary button-small"
            onClick={() => void exportTemplate()}
          >
            Export template
          </button>
        </div>
        <label className="field">
          <span>CSV file</span>
          <input
            className="input"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void parseFile(file)
            }}
          />
        </label>
        {holdings.length > 0 ? (
          <p className="muted">
            {holdings.length} valid holding{holdings.length === 1 ? '' : 's'} ready to
            import.
          </p>
        ) : null}
        {errors.length > 0 ? (
          <div className="error-panel" role="alert">
            <strong>Resolve these rows before importing</strong>
            <ul>
              {errors.slice(0, 8).map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Dialog>
  )
}
