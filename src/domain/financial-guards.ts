import { financialSourceState, finalizeFinancialEvents } from './financial-events'
import { validateGoalFunding } from './goals'
import { calculateAccountBalances } from './calculations'
import type { CollectionName, FinanceData, FinancialSourceState } from './types'

export function financialSourceKind(
  collection: CollectionName,
): FinancialSourceState['kind'] | null {
  switch (collection) {
    case 'loans':
      return 'loan'
    case 'investments':
      return 'investment'
    case 'insurancePolicies':
      return 'policy'
    case 'recurringRules':
      return 'recurring'
    case 'assets':
      return 'asset'
    case 'transactions':
      return 'expense'
    default:
      return null
  }
}

export function guardDirectSave(
  current: FinanceData,
  next: FinanceData,
  collection: CollectionName,
  id: string,
) {
  if (collection === 'financialEvents')
    throw new Error('Financial events must be managed through their source action')
  if (collection === 'goals') {
    const goal = next.goals.find((item) => item.id === id)
    if (goal)
      validateGoalFunding(
        goal,
        current.goals,
        calculateAccountBalances(current.accounts, current.transactions),
      )
  }
  if (collection === 'transactions') {
    if (current.transactions.find((item) => item.id === id)?.financialEventId)
      throw new Error(
        'This transaction is linked. Undo the event or finalize its cash link before editing.',
      )
    if (current.transactions.some((item) => item.reimbursementOf === id))
      throw new Error('Undo reimbursements before editing the original expense')
  }
  const kind = financialSourceKind(collection)
  for (const event of current.financialEvents.filter(
    (item) => !item.finalized && item.before.kind === kind && item.sourceId === id,
  )) {
    if (
      JSON.stringify(financialSourceState(current, event.kind, id)) !==
      JSON.stringify(financialSourceState(next, event.kind, id))
    ) {
      throw new Error(
        'This balance has linked history. Finalize its cash links in Financial activity before correcting the balance or dates.',
      )
    }
  }
}

export function prepareSourceRemoval(
  data: FinanceData,
  collection: CollectionName,
  id: string,
  timestamp: string,
): FinanceData {
  const linkedAccountId =
    collection === 'loans'
      ? data.loans.find((item) => item.id === id)?.accountId
      : collection === 'investments'
        ? data.investments.find((item) => item.id === id)?.accountId
        : null
  if (linkedAccountId) {
    const linked = data.accounts.find((item) => item.id === linkedAccountId)
    const otherSource =
      collection === 'loans'
        ? data.loans.some((item) => item.id !== id && item.accountId === linkedAccountId)
        : data.investments.some(
            (item) => item.id !== id && item.accountId === linkedAccountId,
          )
    if (
      linked &&
      !linked.archived &&
      linked.includeInNetWorth &&
      !otherSource &&
      (collection === 'loans'
        ? linked.type === 'loan'
        : ['investment', 'retirement'].includes(linked.type)) &&
      (calculateAccountBalances(data.accounts, data.transactions).get(linkedAccountId) ??
        0) !== 0
    ) {
      throw new Error(
        'The linked account would reappear in net worth. Reconcile it to zero, exclude it, or archive it in Activity before deleting the last linked record.',
      )
    }
  }
  if (collection === 'financialEvents')
    throw new Error('Undo or finalize the financial event instead')
  if (
    collection === 'transactions' &&
    data.transactions.some((item) => item.reimbursementOf === id)
  )
    throw new Error('Undo reimbursements before deleting the original expense')
  if (collection === 'transactions') {
    return {
      ...data,
      importBatches: data.importBatches.map((batch) =>
        batch.createdTransactionIds.includes(id)
          ? {
              ...batch,
              createdTransactionIds: batch.createdTransactionIds.filter(
                (transactionId) => transactionId !== id,
              ),
              removedTransactionIds: [
                ...new Set([...(batch.removedTransactionIds ?? []), id]),
              ],
              updatedAt: timestamp,
            }
          : batch,
      ),
    }
  }
  const kind = financialSourceKind(collection)
  let next =
    kind && kind !== 'expense' ? finalizeFinancialEvents(data, kind, id, timestamp) : data
  if (collection === 'loans' || collection === 'insurancePolicies') {
    const ownerKind = collection === 'loans' ? 'loan' : 'policy'
    const linkedRules = next.recurringRules.filter(
      (rule) => rule.obligation?.kind === ownerKind && rule.obligation.id === id,
    )
    for (const rule of linkedRules)
      next = finalizeFinancialEvents(next, 'recurring', rule.id, timestamp)
    const ids = new Set(linkedRules.map((rule) => rule.id))
    next = {
      ...next,
      recurringRules: next.recurringRules.map((rule) =>
        ids.has(rule.id)
          ? { ...rule, obligation: undefined, active: false, updatedAt: timestamp }
          : rule,
      ),
    }
  }
  return next
}
