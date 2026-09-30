import { expect } from '@playwright/test'

import { createWorkspace, openSection, test } from './support/finance'
import { addAccount, addTransaction } from './support/records'

test('Activity shows its ledger first and applies inclusive dates without losing valid filters', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile')
  await page.setViewportSize({ width: 390, height: 844 })
  await createWorkspace(page)
  await openSection(page, 'Transactions')
  await addAccount(page, 'Dated account')
  for (const date of ['2026-01-31', '2026-02-01', '2026-02-14', '2026-03-01']) {
    await addTransaction(page, {
      kind: 'Income',
      date,
      account: 'Dated account',
      amount: '100',
      category: 'Salary',
      description: `Income ${date}`,
    })
  }
  await openSection(page, 'Transactions')
  const row = page.getByRole('button', { name: 'Edit Income 2026-03-01' })
  const rowBounds = await row.boundingBox()
  const navBounds = await page
    .getByRole('navigation', { name: 'Primary sections' })
    .boundingBox()
  expect(rowBounds!.y + rowBounds!.height).toBeLessThan(navBounds!.y)
  await expect(page.getByLabel('Date filter')).toHaveValue('all')
  await page.getByLabel('Date filter').selectOption('custom')
  await page.getByLabel('From date').fill('2026-02-01')
  await page.getByLabel('To date').fill('2026-02-14')
  await expect(
    page
      .getByRole('list', { name: 'Transactions' })
      .getByRole('button', { name: /^Edit/ }),
  ).toHaveCount(2)
  await page.getByLabel('To date').fill('2026-01-31')
  await expect(page.getByRole('alert')).toContainText('End date')
  await expect(
    page
      .getByRole('list', { name: 'Transactions' })
      .getByRole('button', { name: /^Edit/ }),
  ).toHaveCount(2)
  await page.getByRole('button', { name: 'Clear filters' }).click()
  await expect(
    page
      .getByRole('list', { name: 'Transactions' })
      .getByRole('button', { name: /^Edit/ }),
  ).toHaveCount(4)
})

test('amount-first entry retains details and reveals a collapsed split error', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile')
  await createWorkspace(page)
  await openSection(page, 'Transactions')
  await addAccount(page, 'Daily account')
  await page.getByRole('button', { name: 'Add transaction', exact: true }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Add transaction', exact: true })
  await expect(dialog.getByLabel('Amount', { exact: true })).toBeFocused()
  await expect(dialog.getByLabel('Note', { exact: true })).toBeHidden()
  await dialog.getByLabel('Amount', { exact: true }).fill('100')
  await dialog.getByLabel('Description', { exact: true }).fill('Shared groceries')
  const details = dialog.getByRole('button', { name: 'More details', exact: true })
  await details.click()
  await dialog.getByLabel('Note', { exact: true }).fill('Reimbursable')
  await dialog.getByRole('button', { name: 'Add split', exact: true }).click()
  await dialog.getByLabel('Split 1 amount', { exact: true }).fill('60')
  await details.click()
  await dialog.getByRole('button', { name: 'Add transaction', exact: true }).click()
  await expect(details).toHaveAttribute('aria-expanded', 'true')
  await expect(
    dialog.getByText('Split amounts must add up to the transaction amount'),
  ).toBeVisible()
  await expect(dialog.getByLabel('Split 1 amount', { exact: true })).toBeFocused()
  await expect(dialog.getByLabel('Note', { exact: true })).toHaveValue('Reimbursable')
  await dialog.getByLabel('Split 1 amount', { exact: true }).fill('100')
  await dialog.getByRole('button', { name: 'Add transaction', exact: true }).click()
  await expect(dialog).toBeHidden()
  await page.getByRole('button', { name: 'Edit Shared groceries', exact: true }).click()
  const edit = page.getByRole('dialog', { name: 'Edit transaction', exact: true })
  await expect(edit.getByLabel('Note', { exact: true })).toBeVisible()
  await expect(edit.getByLabel('Note', { exact: true })).toHaveValue('Reimbursable')
  await expect(edit.getByLabel('Split 1 amount', { exact: true })).toHaveValue('100.00')
  await edit.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(
    page
      .getByRole('list', { name: 'Transactions' })
      .getByRole('button', { name: /^Edit / }),
  ).toHaveCount(1)
})

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

test('amount-first entry keeps adjustment signs and validates transfer destinations', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile')
  await createWorkspace(page)
  await openSection(page, 'Transactions')
  await addAccount(page, 'Adjustment account', '1000')
  await addAccount(page, 'Destination', '0')
  await page.getByRole('button', { name: 'Add transaction', exact: true }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Add transaction', exact: true })
  await dialog.getByLabel('Amount', { exact: true }).fill('-50')
  await dialog.getByLabel('Description', { exact: true }).fill('Balance reconciliation')
  await dialog.getByRole('button', { name: 'Add transaction', exact: true }).click()
  await expect(dialog.getByText('Enter a valid positive INR amount')).toBeVisible()
  await dialog.getByLabel('Type', { exact: true }).selectOption('adjustment')
  await dialog.getByRole('button', { name: 'Add transaction', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(
    page.locator('.account-tile').filter({ hasText: 'Adjustment account' }),
  ).toContainText('₹950')
  await page.getByRole('button', { name: 'Add transaction', exact: true }).first().click()
  await dialog.getByLabel('Type', { exact: true }).selectOption('transfer')
  await expect(
    dialog.getByLabel('From account', { exact: true }).locator('option:checked'),
  ).toHaveText('Adjustment account')
  await dialog.getByLabel('Amount', { exact: true }).fill('25')
  await dialog.getByLabel('Description', { exact: true }).fill('Move cash')
  await dialog.getByRole('button', { name: 'Add transaction', exact: true }).click()
  await expect(dialog.getByText('Choose a destination account')).toBeVisible()
  await dialog.getByLabel('To account').selectOption({ label: 'Destination' })
  await dialog.getByRole('button', { name: 'Add transaction', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(
    page.locator('.account-tile').filter({ hasText: 'Adjustment account' }),
  ).toContainText('₹925')
  await expect(
    page.locator('.account-tile').filter({ hasText: 'Destination' }),
  ).toContainText('₹25')
})
