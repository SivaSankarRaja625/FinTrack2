import { readFile } from 'node:fs/promises'

import { expect } from '@playwright/test'

import { createWorkspace, openSection, test } from './support/finance'
import { addAccount, addTransaction } from './support/records'

test('Reports reconcile dated cash flow, category totals, CSV, and financial years', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'Stateful phone workflow')
  test.slow()
  await createWorkspace(page)
  await openSection(page, 'Transactions')
  await addAccount(page, 'Report savings')
  await addAccount(page, 'Report cash')
  await addTransaction(page, {
    kind: 'Income',
    date: '2026-02-01',
    account: 'Report savings',
    amount: '1000',
    category: 'Salary',
    description: 'February salary',
  })
  await addTransaction(page, {
    kind: 'Expense',
    date: '2026-02-28',
    account: 'Report savings',
    amount: '250',
    description: 'End of month groceries',
    splits: [
      { category: 'Groceries', amount: '150' },
      { category: 'Dining', amount: '100' },
    ],
  })
  await addTransaction(page, {
    kind: 'Transfer',
    date: '2026-02-15',
    account: 'Report savings',
    destination: 'Report cash',
    amount: '40',
    description: '=Internal transfer',
  })
  await addTransaction(page, {
    kind: 'Expense',
    date: '2026-03-01',
    account: 'Report savings',
    amount: '100',
    category: 'Transport',
    description: 'March transport',
  })
  await openSection(page, 'Reports')

  const metrics = page.locator('.metric-group')
  await expect(
    metrics.locator('.metric').filter({ hasText: 'Income' }).locator('strong'),
  ).toHaveText('₹1,000')
  await expect(
    metrics.locator('.metric').filter({ hasText: 'Expenses' }).locator('strong'),
  ).toHaveText('₹250')
  await expect(
    metrics.locator('.metric').filter({ hasText: 'Net cash flow' }).locator('strong'),
  ).toHaveText('₹750')
  await expect(
    page.locator('.composition-row').filter({ hasText: 'Groceries' }).locator('strong'),
  ).toHaveText('₹150')
  await expect(
    page.locator('.composition-row').filter({ hasText: 'Dining' }).locator('strong'),
  ).toHaveText('₹100')
  await expect(
    page.locator('.composition-row').filter({ hasText: 'Net worth' }).locator('strong'),
  ).toHaveText('₹650')
  await expect(
    page.getByRole('img', { name: 'Net cash flow by report interval' }),
  ).toBeVisible()
  await expect(page.locator('.data-table tbody tr')).toHaveCount(2)

  await page.getByRole('button', { name: 'Export CSV' }).click()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page
      .getByRole('dialog', { name: 'Export an unencrypted CSV?' })
      .getByRole('button', { name: 'Export CSV' })
      .click(),
  ])
  expect(download.suggestedFilename()).toBe(
    'fintrack-report-2026-02-01-to-2026-02-28.csv',
  )
  const csv = await readFile(await download.path(), 'utf8')
  expect(csv).toContain(
    '"Date","Type","Account","Category","Description","Amount INR","Note"',
  )
  expect(csv).toContain('"2026-02-01","income"')
  expect(csv).toContain('"2026-02-28","expense"')
  expect(csv).toContain('"\'=Internal transfer"')
  expect(csv).not.toContain('March transport')

  await page.getByLabel('Report period').selectOption('financial-year')
  await expect(page.locator('.report-range strong')).toHaveText(
    '01 Apr 2025 – 31 Mar 2026',
  )
  await expect(
    metrics.locator('.metric').filter({ hasText: 'Expenses' }).locator('strong'),
  ).toHaveText('₹350')
  await page.getByLabel('Financial year containing').fill('2027-02')
  await expect(page.locator('.report-range strong')).toHaveText(
    '01 Apr 2026 – 31 Mar 2027',
  )
  await expect(page.getByRole('button', { name: 'Export CSV' })).toBeDisabled()
  await expect(
    page.locator('.composition-row').filter({ hasText: 'Net worth' }).locator('strong'),
  ).toHaveText('₹650')
})
