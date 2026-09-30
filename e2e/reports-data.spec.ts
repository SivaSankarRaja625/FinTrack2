import { readFile } from 'node:fs/promises'

import AxeBuilder from '@axe-core/playwright'
import { expect } from '@playwright/test'

import { createWorkspace, expectMetricValues, openSection, test } from './support/finance'
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
  await page.setViewportSize({ width: 390, height: 844 })
  const monthBounds = await page.getByLabel('Month', { exact: true }).boundingBox()
  expect(monthBounds!.width).toBeGreaterThanOrEqual(185)
  const barsBounds = await page.locator('.cashflow-bars').boundingBox()
  const navigationBounds = await page
    .getByRole('navigation', { name: 'Primary sections' })
    .boundingBox()
  expect(barsBounds!.y + barsBounds!.height).toBeLessThan(navigationBounds!.y)

  const metrics = page.locator('.metric-group')
  await expectMetricValues(metrics, {
    Income: '₹1,000',
    Expenses: '₹250',
    'Net cash flow': '₹750',
    Transactions: '3',
  })
  await expect(
    page.locator('.composition-row').filter({ hasText: 'Groceries' }).locator('strong'),
  ).toHaveText('₹150')
  await expect(
    page.locator('.composition-row').filter({ hasText: 'Dining' }).locator('strong'),
  ).toHaveText('₹100')
  await expect(
    page.locator('.composition-row').filter({ hasText: 'Net worth' }).locator('strong'),
  ).toHaveText('₹650')
  const chart = page.getByRole('group', {
    name: 'Income and expenses by report interval',
  })
  await expect(chart).toBeVisible()
  await chart.getByRole('button', { name: 'Inspect 28 Feb' }).click()
  const selected = page.getByRole('region', { name: 'Selected report interval' })
  await expect(selected).toContainText('28 Feb 2026')
  await expectMetricValues(selected, {
    Income: '₹0',
    Expenses: '₹250',
    'Net cash flow': '-₹250',
  })
  await expect(selected).toContainText('End of month groceries')
  await expect(selected).not.toContainText('=Internal transfer')
  await page.getByText('View values', { exact: true }).click()
  await expect(page.locator('.data-table tbody tr')).toHaveCount(2)
  await expect(page.locator('.data-table tbody tr').first().locator('td')).toHaveText([
    '01 Feb',
    '₹1,000',
    '₹0',
    '₹1,000',
  ])
  await expect(page.locator('.data-table tbody tr').last().locator('td')).toHaveText([
    '28 Feb',
    '₹0',
    '₹250',
    '-₹250',
  ])
  await expect(
    page.locator('.reports-page .data-table').first().getByRole('button'),
  ).toHaveCount(0)
  await page.setViewportSize({ width: 320, height: 720 })
  const values = page.getByRole('region', { name: 'Cash-flow values' })
  await expect(values).toHaveAttribute('tabindex', '0')
  await values.focus()
  await values.press('ArrowRight')
  await expect
    .poll(() => values.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0)
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value
    }, theme)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(320)
    const audit = await new AxeBuilder({ page })
      .include('.cashflow-chart')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
    expect(
      audit.violations.filter(
        ({ impact }) => impact === 'critical' || impact === 'serious',
      ),
    ).toEqual([])
  }

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
  expect(csv).toContain(
    '"2026-02-01","income","Report savings","Salary","February salary","1000.00",""',
  )
  expect(csv).toContain(
    '"2026-02-28","expense","Report savings","","End of month groceries","250.00",""',
  )
  expect(csv).toContain('"\'=Internal transfer"')
  expect(csv).not.toContain('March transport')

  await page.getByLabel('Report period').selectOption('financial-year')
  await expect(page.locator('.report-range strong')).toHaveText(
    '01 Apr 2025 – 31 Mar 2026',
  )
  await expect(selected).toContainText('March transport')
  await chart.getByRole('button', { name: 'Inspect Feb 26' }).click()
  await expect(selected).toContainText('February salary')
  await expect(selected).toContainText('End of month groceries')
  await expect(selected).not.toContainText('=Internal transfer')
  await expectMetricValues(metrics, {
    Income: '₹1,000',
    Expenses: '₹350',
    'Net cash flow': '₹650',
    Transactions: '4',
  })
  await expectMetricValues(selected, {
    Income: '₹1,000',
    Expenses: '₹250',
    'Net cash flow': '₹750',
  })
  await page.getByLabel('Financial year containing').fill('2027-02')
  await expect(page.locator('.report-range strong')).toHaveText(
    '01 Apr 2026 – 31 Mar 2027',
  )
  await expect(page.getByRole('button', { name: 'Export CSV' })).toBeDisabled()
  await expect(selected).toHaveCount(0)
  await expectMetricValues(metrics, {
    Income: '₹0',
    Expenses: '₹0',
    'Net cash flow': '₹0',
    Transactions: '0',
  })
  await expect(
    page.locator('.composition-row').filter({ hasText: 'Net worth' }).locator('strong'),
  ).toHaveText('₹650')
})

test('Reports keep large exact interval values separate at 320px', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'Phone-width visual check')
  await createWorkspace(page)
  await page.setViewportSize({ width: 320, height: 720 })
  await openSection(page, 'Transactions')
  await addAccount(page, 'High-value account')
  await addTransaction(page, {
    kind: 'Income',
    date: '2026-02-14',
    account: 'High-value account',
    amount: '10000000',
    category: 'Salary',
    description: 'Large income',
  })
  await addTransaction(page, {
    kind: 'Expense',
    date: '2026-02-14',
    account: 'High-value account',
    amount: '10000000',
    category: 'Groceries',
    description: 'Large expense',
  })
  await openSection(page, 'Reports')
  const interval = page.getByRole('region', { name: 'Selected report interval' })
  await expect(interval.locator('.metric-value')).toHaveText([
    '₹1,00,00,000',
    '₹1,00,00,000',
    '₹0',
  ])
  const bounds = await interval.locator('.metric-value').evaluateAll((values) =>
    values.slice(0, 2).map((value) => {
      const range = document.createRange()
      range.selectNodeContents(value)
      const { left, right, top, bottom } = range.getBoundingClientRect()
      return { left, right, top, bottom }
    }),
  )
  expect(bounds[0].bottom <= bounds[1].top || bounds[0].right <= bounds[1].left).toBe(
    true,
  )
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320)
})
