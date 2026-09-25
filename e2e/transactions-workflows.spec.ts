import { expect } from '@playwright/test'

import { createWorkspace, openSection, test } from './support/finance'
import { addAccount, addTransaction } from './support/records'

test('editing and deleting a transaction reconcile the ledger and cash flow', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'Stateful phone workflow')
  test.slow()
  await createWorkspace(page)
  await openSection(page, 'Transactions')
  await addAccount(page, 'Daily cash', '1000')
  await addAccount(page, 'Savings', '500')
  await addTransaction(page, {
    kind: 'Expense',
    date: '2026-02-14',
    account: 'Daily cash',
    category: 'Groceries',
    amount: '120',
    description: 'Weekly groceries',
  })

  const search = page.getByLabel('Search transactions')
  await search.fill('unrelated purchase')
  await expect(page.getByRole('button', { name: 'Edit Weekly groceries' })).toHaveCount(0)
  await search.fill('Weekly groceries')
  await page.getByRole('button', { name: 'Edit Weekly groceries' }).click()
  const edit = page.getByRole('dialog', { name: 'Edit transaction' })
  await edit.getByLabel('Amount', { exact: true }).fill('90')
  await edit.getByLabel('Description').fill('Updated groceries')
  await edit.getByRole('button', { name: 'Save changes' }).click()
  await expect(edit).toBeHidden()
  await search.fill('')
  await expect(page.getByRole('button', { name: 'Edit Updated groceries' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit Weekly groceries' })).toHaveCount(0)

  await addTransaction(page, {
    kind: 'Income',
    date: '2026-02-14',
    account: 'Savings',
    category: 'Salary',
    amount: '2000',
    description: 'Salary received',
  })
  await addTransaction(page, {
    kind: 'Transfer',
    date: '2026-02-14',
    account: 'Savings',
    destination: 'Daily cash',
    amount: '300',
    description: 'Move savings',
  })
  await openSection(page, 'Reports')
  const metrics = page.locator('.metric-group')
  await expect(
    metrics.locator('.metric').filter({ hasText: 'Income' }).locator('strong'),
  ).toHaveText('₹2,000')
  await expect(
    metrics.locator('.metric').filter({ hasText: 'Expenses' }).locator('strong'),
  ).toHaveText('₹90')
  await expect(
    metrics.locator('.metric').filter({ hasText: 'Net cash flow' }).locator('strong'),
  ).toHaveText('₹1,910')

  await openSection(page, 'Transactions')
  await page.getByRole('button', { name: 'Delete Updated groceries' }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Delete', exact: true })
    .click()
  await expect(page.getByRole('button', { name: 'Edit Updated groceries' })).toHaveCount(
    0,
  )
  await openSection(page, 'Reports')
  await expect(
    metrics.locator('.metric').filter({ hasText: 'Expenses' }).locator('strong'),
  ).toHaveText('₹0')
  await expect(
    metrics.locator('.metric').filter({ hasText: 'Net cash flow' }).locator('strong'),
  ).toHaveText('₹2,000')
})
