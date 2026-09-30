import type { Transaction } from './types'

export function expenseImpact(transaction: Transaction): number {
  return transaction.reimbursementOf
    ? -transaction.amountPaise
    : transaction.kind === 'expense'
      ? transaction.amountPaise
      : 0
}

export function expenseAllocations(transaction: Transaction) {
  const amount = expenseImpact(transaction)
  if (amount === 0) return []
  if (!transaction.splits.length)
    return [{ categoryId: transaction.categoryId, amountPaise: amount }]
  const sign = transaction.reimbursementOf ? -1 : 1
  return transaction.splits.map((split) => ({
    categoryId: split.categoryId,
    amountPaise: split.amountPaise * sign,
  }))
}
