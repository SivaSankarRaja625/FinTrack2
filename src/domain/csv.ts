import { isIsoDate } from './dates'
import { newId } from './id'
import { rupeesToPaise } from './money'
import type {
  Category,
  EntityId,
  ImportBatch,
  Transaction,
  TransactionKind,
} from './types'

export interface CsvMapping {
  date: string
  description: string
  amount: string
  type: string | null
  debit: string | null
  credit: string | null
  category: string | null
  reference: string | null
}

export interface CsvPreviewRow {
  rowNumber: number
  values: Record<string, string>
  transaction: Omit<Transaction, 'createdAt' | 'updatedAt'> | null
  error: string | null
  duplicate: boolean
}

export function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = []
  let row: string[] = []
  let value = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]
    if (char === '"' && quoted && next === '"') {
      value += '"'
      index += 1
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === ',' && !quoted) {
      row.push(value.trim())
      value = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1
      row.push(value.trim())
      if (row.some((cell) => cell !== '')) rows.push(row)
      row = []
      value = ''
    } else {
      value += char
    }
  }
  row.push(value.trim())
  if (row.some((cell) => cell !== '')) rows.push(row)

  const headers = rows.shift()?.map((header) => header.trim()) ?? []
  if (headers.length === 0) return []
  return rows.map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])),
  )
}

function normalizeDate(value: string): string | null {
  const trimmed = value.trim()
  if (isIsoDate(trimmed)) return trimmed
  const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/u.exec(trimmed)
  if (!match) return null
  const [, day = '', month = '', year = ''] = match
  const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  return isIsoDate(iso) ? iso : null
}

function normalizeKind(value: string, amountPaise: number): TransactionKind {
  const normalized = value.trim().toLowerCase()
  if (['cr', 'credit', 'income', 'deposit'].includes(normalized)) return 'income'
  if (['dr', 'debit', 'expense', 'withdrawal'].includes(normalized)) return 'expense'
  return amountPaise < 0 ? 'expense' : 'income'
}

export function transactionFingerprint(
  transaction: Pick<
    Transaction,
    'accountId' | 'date' | 'amountPaise' | 'description' | 'kind'
  >,
): string {
  return [
    transaction.accountId,
    transaction.date,
    Math.abs(transaction.amountPaise).toString(),
    transaction.kind,
    transaction.description.toLowerCase().replace(/\s+/gu, ' ').trim(),
  ].join('|')
}

export function previewCsvTransactions(input: {
  rows: Array<Record<string, string>>
  mapping: CsvMapping
  accountId: EntityId
  categories: readonly Category[]
  existing: readonly Transaction[]
  importBatchId: EntityId
}): CsvPreviewRow[] {
  const fingerprints = new Set(input.existing.map(transactionFingerprint))
  const categoryMap = new Map(
    input.categories.map((category) => [category.name.toLowerCase(), category.id]),
  )

  return input.rows.map((values, index) => {
    try {
      const dateValue = values[input.mapping.date] ?? ''
      const date = normalizeDate(dateValue)
      if (!date) throw new Error(`Invalid date “${dateValue}”`)

      const debit = input.mapping.debit
        ? rupeesToPaise(values[input.mapping.debit] ?? '')
        : 0
      const credit = input.mapping.credit
        ? rupeesToPaise(values[input.mapping.credit] ?? '')
        : 0
      const rawAmount =
        input.mapping.debit || input.mapping.credit
          ? credit > 0
            ? credit
            : -Math.abs(debit)
          : rupeesToPaise(values[input.mapping.amount] ?? '')
      if (rawAmount === 0) throw new Error('Amount is zero or missing')

      const typeValue = input.mapping.type ? (values[input.mapping.type] ?? '') : ''
      const kind = normalizeKind(typeValue, rawAmount)
      const description = (values[input.mapping.description] ?? '').trim()
      if (!description) throw new Error('Description is missing')

      const categoryName = input.mapping.category
        ? (values[input.mapping.category] ?? '').trim().toLowerCase()
        : ''
      const categoryId = categoryMap.get(categoryName) ?? null
      const reference = input.mapping.reference
        ? (values[input.mapping.reference] ?? '').trim()
        : ''
      const transaction: Omit<Transaction, 'createdAt' | 'updatedAt'> = {
        id: newId(),
        accountId: input.accountId,
        destinationAccountId: null,
        categoryId,
        kind,
        amountPaise: Math.abs(rawAmount),
        date,
        description,
        note: reference,
        tags: [],
        cleared: true,
        splits: [],
        recurringRuleId: null,
        importBatchId: input.importBatchId,
      }
      const fingerprint = transactionFingerprint(transaction)
      const duplicate = fingerprints.has(fingerprint)
      fingerprints.add(fingerprint)
      return {
        rowNumber: index + 2,
        values,
        transaction,
        error: null,
        duplicate,
      }
    } catch (error) {
      return {
        rowNumber: index + 2,
        values,
        transaction: null,
        error: error instanceof Error ? error.message : 'Invalid row',
        duplicate: false,
      }
    }
  })
}

function csvCell(value: string | number): string {
  const text = String(value)
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function transactionsToCsv(
  transactions: readonly Transaction[],
  accountNames: ReadonlyMap<string, string>,
  categoryNames: ReadonlyMap<string, string>,
): string {
  const headers = [
    'Date',
    'Description',
    'Type',
    'Amount (INR)',
    'Account',
    'Category',
    'Note',
  ]
  const rows = transactions.map((transaction) => [
    transaction.date,
    transaction.description,
    transaction.kind,
    (transaction.amountPaise / 100).toFixed(2),
    accountNames.get(transaction.accountId) ?? '',
    transaction.categoryId ? (categoryNames.get(transaction.categoryId) ?? '') : '',
    transaction.note,
  ])
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
}

export function createImportBatch(
  filename: string,
  transactions: readonly Transaction[],
  duplicateCount: number,
  timestamp: string,
): ImportBatch {
  return {
    id: newId(),
    filename,
    importedAt: timestamp,
    rowCount: transactions.length,
    createdTransactionIds: transactions.map((transaction) => transaction.id),
    duplicateCount,
    rolledBackAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}
