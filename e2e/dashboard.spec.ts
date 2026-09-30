import { expect } from '@playwright/test'

import { createWorkspace, openSection, test } from './support/finance'
import { addAccount, addTransaction } from './support/records'

test('Home offers direct expense entry and visible attention without scrolling', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile')
  await page.setViewportSize({ width: 390, height: 844 })
  await createWorkspace(page)
  await expect(page.getByRole('link', { name: 'Add account', exact: true })).toBeVisible()
  await openSection(page, 'Transactions')
  await addAccount(page, 'Home cash', '1000')
  await page.getByRole('link', { name: 'Home', exact: true }).click()
  const attention = page.locator('.dashboard-alert-row').first()
  const bounds = await attention.boundingBox()
  const nav = await page
    .getByRole('navigation', { name: 'Primary sections' })
    .boundingBox()
  expect(bounds!.y + bounds!.height).toBeLessThan(nav!.y)
  await page.getByRole('button', { name: 'Add expense', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Add transaction', exact: true })
  await expect(dialog.getByLabel('Amount', { exact: true })).toBeFocused()
  await dialog.getByLabel('Amount', { exact: true }).fill('120')
  await dialog.getByLabel('Description', { exact: true }).fill('Home groceries')
  await dialog.getByRole('button', { name: 'Add transaction', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(
    page.locator('.metric').filter({ hasText: 'Current net worth' }),
  ).toContainText('₹880')
  await page.getByRole('button', { name: 'Add expense', exact: true }).click()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.locator('.dashboard-transaction-row')).toHaveCount(1)
  await openSection(page, 'Transactions')
  await page.locator('.activity-accounts > summary').click()
  await page.getByRole('button', { name: /Home cash.*₹880/ }).click()
  const account = page.getByRole('dialog', { name: 'Edit account' })
  await account.getByRole('checkbox', { name: /Archive this account/ }).check()
  await account.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Add transaction', exact: true }),
  ).toHaveCount(0)
  await page.getByRole('link', { name: 'Home', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Add account', exact: true })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Add expense', exact: true }),
  ).toHaveCount(0)
})

test('Dashboard reflects saved cash flow and links back to its source records', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'Stateful phone workflow')
  await createWorkspace(page)
  await openSection(page, 'Transactions')
  await addAccount(page, 'Dashboard cash', '1000')
  await addTransaction(page, {
    kind: 'Income',
    date: '2026-02-14',
    account: 'Dashboard cash',
    category: 'Salary',
    amount: '2000',
    description: 'Dashboard salary',
  })
  await addTransaction(page, {
    kind: 'Expense',
    date: '2026-02-14',
    account: 'Dashboard cash',
    category: 'Groceries',
    amount: '250',
    description: 'Dashboard groceries',
  })

  await page.getByRole('link', { name: 'Home', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Financial overview' })).toBeVisible()
  await expect(page.locator('.metric').filter({ hasText: 'Net worth' })).toContainText(
    '₹2,750',
  )
  await expect(page.getByText('Dashboard groceries', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'View ledger' }).click()
  await expect(
    page.getByRole('heading', { name: 'Transactions', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Edit Dashboard groceries' }),
  ).toBeVisible()
})
