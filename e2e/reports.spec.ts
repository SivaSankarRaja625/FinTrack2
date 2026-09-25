import { expect } from '@playwright/test'

import { createWorkspace, openSection, test } from './support/finance'
import { addAccount } from './support/records'

async function openReports(page: Parameters<typeof createWorkspace>[0]) {
  await createWorkspace(page)
  await openSection(page, 'Reports')
  await expect(page.getByRole('heading', { name: 'Reports', exact: true })).toBeVisible()
}

test('Reports keeps current-position labels readable at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  await openReports(page)
  await openSection(page, 'Transactions')
  await addAccount(page, 'Long balance account', '999999999999')
  await openSection(page, 'Reports')

  const rows = page.locator('.composition-row')
  await expect(rows.filter({ hasText: 'Net worth' }).locator('strong')).toHaveText(
    '₹9,99,99,99,99,999',
  )
  for (const name of ['Net worth', 'Total debt', 'Investment value', 'Investment gain']) {
    const row = rows.filter({ hasText: name })
    const label = row.getByText(name, { exact: true })
    const amount = row.locator('strong')
    await expect(label).toBeVisible()
    expect(await label.evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(
      await label.evaluate((element) => element.clientWidth),
    )
    expect(await amount.evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(
      await amount.evaluate((element) => element.clientWidth),
    )
  }
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320)
})

test('clearing the month never replaces Reports with an error screen', async ({
  page,
}) => {
  await openReports(page)

  const month = page.getByLabel('Month', { exact: true })
  const previousMonth = await month.inputValue()
  const previousRange = await page.locator('.report-range strong').innerText()
  expect(previousMonth).toBe('2026-02')
  await month.fill('')

  await expect(page.getByRole('heading', { name: 'Reports', exact: true })).toBeVisible()
  await expect(month).toHaveValue('')
  await expect(month).toHaveAttribute('aria-invalid', 'true')
  await expect(page.locator('.report-range strong')).toHaveText(previousRange)
  await expect(page.getByText(/choose a month to view the report/i)).toBeVisible()

  await month.fill('2026-01')
  await expect(month).toHaveAttribute('aria-invalid', 'false')
  await expect(page.locator('.report-range strong')).toHaveText(
    '01 Jan 2026 – 31 Jan 2026',
  )
})
