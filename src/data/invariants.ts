import type { AttachmentMeta, FinanceData } from '../domain/types'

export function validateRelations(
  data: FinanceData,
  attachments: readonly AttachmentMeta[] = [],
): void {
  if (data.profiles.length !== 1) {
    throw new Error('The workspace must contain exactly one user profile')
  }
  if (data.settings.length !== 1) {
    throw new Error('The workspace must contain exactly one settings record')
  }
  const accountIds = new Set(data.accounts.map((item) => item.id))
  const categoryIds = new Set(data.categories.map((item) => item.id))
  const transactionIds = new Set(data.transactions.map((item) => item.id))
  const attachmentIds = new Set(attachments.map((item) => item.id))

  for (const transaction of data.transactions) {
    if (!accountIds.has(transaction.accountId)) {
      throw new Error(`Transaction “${transaction.description}” has no source account`)
    }
    if (
      transaction.destinationAccountId &&
      !accountIds.has(transaction.destinationAccountId)
    ) {
      throw new Error(
        `Transaction “${transaction.description}” has no destination account`,
      )
    }
    if (transaction.categoryId && !categoryIds.has(transaction.categoryId)) {
      throw new Error(`Transaction “${transaction.description}” has no category`)
    }
    for (const split of transaction.splits) {
      if (!categoryIds.has(split.categoryId)) {
        throw new Error(`A split in “${transaction.description}” has no category`)
      }
    }
    if (
      transaction.splits.length > 0 &&
      transaction.splits.reduce((sum, split) => sum + split.amountPaise, 0) !==
        transaction.amountPaise
    ) {
      throw new Error(`The splits in “${transaction.description}” do not balance`)
    }
    if (
      transaction.kind === 'transfer' &&
      (!transaction.destinationAccountId ||
        transaction.destinationAccountId === transaction.accountId)
    ) {
      throw new Error(`Transfer “${transaction.description}” has invalid accounts`)
    }
  }

  for (const budget of data.budgets) {
    if (!categoryIds.has(budget.categoryId)) {
      throw new Error(`Budget “${budget.name}” has no category`)
    }
  }

  for (const recurring of data.recurringRules) {
    if (!accountIds.has(recurring.accountId)) {
      throw new Error(`Recurring item “${recurring.name}” has no source account`)
    }

    if (
      recurring.destinationAccountId &&
      !accountIds.has(recurring.destinationAccountId)
    ) {
      throw new Error(`Recurring item “${recurring.name}” has no destination account`)
    }
  }
  for (const loan of data.loans) {
    if (loan.accountId && !accountIds.has(loan.accountId)) {
      throw new Error(`Loan “${loan.name}” references a missing account`)
    }
  }
  for (const holding of data.investments) {
    if (holding.accountId && !accountIds.has(holding.accountId)) {
      throw new Error(`Holding “${holding.name}” references a missing account`)
    }
  }
  for (const goal of data.goals) {
    if (goal.linkedAccountId && !accountIds.has(goal.linkedAccountId)) {
      throw new Error(`Goal “${goal.name}” references a missing account`)
    }
  }

  for (const batch of data.importBatches) {
    for (const id of batch.createdTransactionIds) {
      if (!transactionIds.has(id) && batch.rolledBackAt === null) {
        throw new Error(`Import batch “${batch.filename}” references missing data`)
      }
    }
  }

  for (const policy of data.insurancePolicies) {
    for (const id of policy.attachmentIds) {
      if (!attachmentIds.has(id)) {
        throw new Error(`Policy “${policy.policyName}” references a missing document`)
      }
      const metadata = attachments.find((attachment) => attachment.id === id)
      if (metadata?.ownerId !== policy.id || metadata.ownerType !== 'insurance') {
        throw new Error(`Policy “${policy.policyName}” has invalid document ownership`)
      }
    }
  }

  const policyIds = new Set(data.insurancePolicies.map((policy) => policy.id))
  for (const attachment of attachments) {
    if (!policyIds.has(attachment.ownerId)) {
      throw new Error(`Document “${attachment.filename}” has no owning policy`)
    }
  }
}
