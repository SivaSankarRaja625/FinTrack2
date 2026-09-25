import { expect } from '@playwright/test'

import { createWorkspace, openSection, test } from './support/finance'
import { addAccount, addTransaction } from './support/records'

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
