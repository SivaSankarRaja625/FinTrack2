import AxeBuilder from '@axe-core/playwright'
import { expect } from '@playwright/test'

import { createWorkspace, expectMetricValues, openSection, test } from './support/finance'
import { addAccount, addTransaction } from './support/records'

test('date, account and search filters combine without changing monthly cash flow', async ({
  page,
}) => {
  test.slow()
  await createWorkspace(page)
  await openSection(page, 'Transactions')
  await addAccount(page, 'Salary account', '1000')
  await addAccount(page, 'Daily account')
  await addTransaction(page, {
    kind: 'Transfer',
    date: '2026-02-14',
    account: 'Salary account',
    destination: 'Daily account',
    amount: '250',
    description: 'Moving money',
  })
  await addTransaction(page, {
    kind: 'Expense',
    date: '2026-01-31',
    account: 'Daily account',
    amount: '10',
    category: 'Groceries',
    description: 'Previous groceries',
  })
  await addTransaction(page, {
    kind: 'Expense',
    date: '2026-02-14',
    account: 'Daily account',
    amount: '50',
    category: 'Groceries',
    description: 'Current groceries',
  })
  await addTransaction(page, {
    kind: 'Income',
    date: '2026-02-14',
    account: 'Salary account',
    amount: '100',
    category: 'Salary',
    description: 'Current income',
  })

  await page.getByLabel('Date filter').selectOption('custom')
  await page.getByLabel('From date').fill('2026-02-14')
  await page.getByLabel('To date').fill('2026-02-14')
  await page.getByLabel('Filter by account').selectOption({ label: 'Daily account' })
  const records = page
    .getByRole('list', { name: 'Transactions' })
    .getByRole('button', { name: /^Edit / })
  await expect(records).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'Edit Previous groceries' })).toHaveCount(
    0,
  )
  await page.getByLabel('Search transactions').fill('moving')
  await expect(records).toHaveCount(1)
  await expect(records).toHaveAccessibleName('Edit Moving money')

  await page.getByLabel('Filter by account').selectOption({ label: 'Salary account' })
  await expect(records).toHaveCount(1)
  await expect(records).toHaveAccessibleName('Edit Moving money')
  await page.locator('.activity-monthly > summary').click()
  const summary = page.getByRole('region', { name: 'Monthly transaction summary' })
  await expect(
    summary.locator('.metric').filter({ hasText: 'Income this month' }),
  ).toContainText('₹100')
  await expect(
    summary.locator('.metric').filter({ hasText: 'Expenses this month' }),
  ).toContainText('₹50')
  await expect(
    summary.locator('.metric').filter({ hasText: 'Net cash flow' }),
  ).toContainText('₹50')
  await page.getByLabel('Search transactions').fill('no matching description')
  await expect(
    page.getByRole('heading', { name: 'No matching transactions' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Clear filters' }).click()
  await expect(page.getByLabel('Date filter')).toHaveValue('all')
  await expect(page.getByLabel('Filter by account')).toHaveValue('all')
  await expect(records).toHaveCount(4)
  const accounts = page.locator('.activity-accounts')
  if (!(await accounts.evaluate((element) => element.hasAttribute('open')))) {
    await accounts.locator('summary').click()
  }
  await expect(
    page
      .locator('.account-tile')
      .filter({ hasText: 'Salary account' })
      .locator('strong.tabular'),
  ).toHaveText('₹850')
  await expect(
    page
      .locator('.account-tile')
      .filter({ hasText: 'Daily account' })
      .locator('strong.tabular'),
  ).toHaveText('₹190')
  await openSection(page, 'Net worth')
  await expectMetricValues(page.locator('.metric-group'), {
    'Net worth': '₹1,040',
    Debt: '₹0',
  })
  const composition = page.getByRole('group', { name: 'Net worth composition' })
  await expect(
    composition.getByRole('button', { name: /Cash & accounts/ }).locator('strong'),
  ).toHaveText('₹1,040')
  await expect(
    composition.getByRole('button', { name: /Investments/ }).locator('strong'),
  ).toHaveText('₹0')
  await expect(
    composition.getByRole('button', { name: /Manual assets/ }).locator('strong'),
  ).toHaveText('₹0')
  await expect(
    composition.getByRole('button', { name: /^Debt/ }).locator('strong'),
  ).toHaveText('₹0')
  await page.getByRole('link', { name: 'Home', exact: true }).click()
  await expectMetricValues(page.locator('.dashboard-summary'), {
    'Current net worth': '₹1,040',
    'Income this month': '₹100',
    'Expenses this month': '₹50',
    'Monthly cash flow': '₹50',
  })
})

test('forecast values remain exact and keyboard accessible as a dated chart resizes', async ({
  page,
}) => {
  test.slow()
  await createWorkspace(page)
  await openSection(page, 'Transactions')
  await addAccount(page, 'Forecast account', '5000')
  await openSection(page, 'Plan & cash flow')
  for (const [kind, name, amount, date] of [
    ['income', 'Stipend', '2000', '2026-02-16'],
    ['expense', 'Rent', '1200', '2026-02-20'],
  ] as const) {
    await page.getByRole('button', { name: 'Add recurring item' }).first().click()
    const dialog = page.getByRole('dialog', { name: 'Add recurring item', exact: true })
    await dialog.getByLabel('Name', { exact: true }).fill(name)
    await dialog.getByLabel('Type', { exact: true }).selectOption(kind)
    await dialog.getByLabel('Amount', { exact: true }).fill(amount)
    await dialog.getByLabel('Next expected date').fill(date)
    await dialog.getByLabel('Ends (optional)').fill(date)
    await dialog.getByRole('button', { name: 'Add recurring item', exact: true }).click()
    await expect(dialog).toBeHidden()
  }

  const chart = page.getByRole('img', { name: 'Projected liquid balance' })
  const positions = await chart
    .locator('circle')
    .evaluateAll((points) => points.map((point) => Number(point.getAttribute('cx'))))
  expect(positions).toHaveLength(3)
  // February 16 is two days into the six-day February 14–20 span.
  expect((positions[1]! - positions[0]!) / (positions[2]! - positions[0]!)).toBeCloseTo(
    1 / 3,
    5,
  )

  const valuesControl = page.locator('.chart-values > summary')
  await valuesControl.focus()
  await valuesControl.press('Enter')
  const values = page.getByRole('table', { name: 'Projected liquid balance' })
  await expect(values).toBeVisible()
  await expect(values.locator('tbody tr')).toHaveText([
    '14 Feb 2026₹5,000',
    '16 Feb 2026₹7,000',
    '20 Feb 2026₹5,800',
  ])
  await valuesControl.press('Enter')
  await expect(values).toBeHidden()
  await valuesControl.press('Enter')
  await expect(values.locator('tbody tr')).toHaveCount(3)

  for (const [width, theme] of [
    [320, 'light'],
    [390, 'dark'],
  ] as const) {
    await page.setViewportSize({ width, height: 844 })
    await page.evaluate((nextTheme) => {
      document.documentElement.dataset.theme = nextTheme
    }, theme)
    await expect
      .poll(() =>
        chart.evaluate((element) => {
          const svg = element as SVGSVGElement
          return Math.abs(svg.viewBox.baseVal.width - svg.getBoundingClientRect().width)
        }),
      )
      .toBeLessThan(1)
    const labels = await chart.locator('text').evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect()
        const plot = element.closest('svg')!.getBoundingClientRect()
        return {
          fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
          left: rect.left - plot.left,
          right: plot.right - rect.right,
        }
      }),
    )
    for (const label of labels) {
      expect(label.fontSize).toBeGreaterThanOrEqual(12)
      expect(label.left).toBeGreaterThanOrEqual(-1)
      expect(label.right).toBeGreaterThanOrEqual(-1)
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width)
    const audit = await new AxeBuilder({ page })
      .include('.chart')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
    expect(
      audit.violations.filter(
        ({ impact }) => impact === 'critical' || impact === 'serious',
      ),
    ).toEqual([])
  }
})
