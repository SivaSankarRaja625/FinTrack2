import { expect, type Page } from '@playwright/test'

export async function addAccount(page: Page, name: string, openingBalance = '0') {
  await page.getByRole('button', { name: 'Add account' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Add account' })
  await dialog.getByLabel('Account name').fill(name)
  await dialog.getByLabel('Opening balance').fill(openingBalance)
  await dialog.getByRole('button', { name: 'Add account' }).click()
  await expect(dialog).toBeHidden()
}

interface NewTransaction {
  kind: 'Expense' | 'Income' | 'Transfer'
  date: string
  account: string
  amount: string
  description: string
  category?: string
  destination?: string
  splits?: Array<{ category: string; amount: string }>
}

export async function addTransaction(page: Page, transaction: NewTransaction) {
  await page.getByRole('button', { name: 'Add transaction' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Add transaction' })
  await dialog.getByLabel('Type').selectOption({ label: transaction.kind })
  await dialog.getByLabel('Date').fill(transaction.date)
  await dialog
    .getByLabel(transaction.kind === 'Transfer' ? 'From account' : 'Account', {
      exact: true,
    })
    .selectOption({ label: transaction.account })
  if (transaction.destination) {
    await dialog.getByLabel('To account').selectOption({ label: transaction.destination })
  }
  if (transaction.splits) {
    for (const [index, split] of transaction.splits.entries()) {
      await dialog.getByRole('button', { name: 'Add split' }).click()
      await dialog
        .getByLabel(`Split ${index + 1} category`)
        .selectOption({ label: split.category })
      await dialog.getByLabel(`Split ${index + 1} amount`).fill(split.amount)
    }
  } else if (transaction.category) {
    await dialog.getByLabel('Category').selectOption({ label: transaction.category })
  }
  await dialog.getByLabel('Amount', { exact: true }).fill(transaction.amount)
  await dialog.getByLabel('Description').fill(transaction.description)
  await dialog.getByRole('button', { name: 'Add transaction' }).click()
  await expect(dialog).toBeHidden()
}
