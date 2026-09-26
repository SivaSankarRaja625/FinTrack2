import { expect } from '@playwright/test'

import { appPin, createWorkspace, openSection, test } from './support/finance'

test('job-change and debt thresholds persist and show explainable reminders', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'Stateful phone workflow')
  await createWorkspace(page)
  await openSection(page, 'Resilience')
  await page.getByLabel('Financial dependents').fill('2')
  await page.getByLabel('Job-change review date').fill('2026-02-15')
  await page.getByRole('button', { name: 'Save protection profile' }).click()
  await page.getByLabel('Loan rate review threshold (%)').fill('12')
  await page.getByLabel('Single-holding concentration threshold (%)').fill('70')
  await page.getByRole('button', { name: 'Save review thresholds' }).click()
  await openSection(page, 'Alerts')
  await expect(page.getByText('Review cover for a job change')).toBeVisible()
  await openSection(page, 'Resilience')
  await page.getByRole('button', { name: 'Mark job-change review complete' }).click()
  await page.getByRole('button', { name: 'Mark tax reviewed' }).click()
  await openSection(page, 'Alerts')
  await expect(page.getByText('Review cover for a job change')).toHaveCount(0)
  await page.reload()
  await page.getByLabel('App PIN').fill(appPin)
  await page.getByRole('button', { name: 'Unlock', exact: true }).click()
  await openSection(page, 'Resilience')
  await expect(page.getByLabel('Financial dependents')).toHaveValue('2')
  await expect(page.getByLabel('Loan rate review threshold (%)')).toHaveValue('12')
  await expect(page.getByText('Tax and financial documents: 2026-02-14')).toBeVisible()
})

test('claim sheet reveals sensitive details only while explicitly open', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'Stateful phone workflow')
  await createWorkspace(page)
  await openSection(page, 'Insurance')
  await page.getByRole('button', { name: 'Add policy' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Add insurance policy' })
  await dialog.getByLabel('Insurer', { exact: true }).fill('Example insurer')
  await dialog.getByLabel('Policy name').fill('Family health')
  await dialog.getByLabel('Policy number').fill('EXAMPLE-0042')
  await dialog.getByLabel('Cover amount').fill('500000')
  await dialog.getByLabel('Premium', { exact: true }).fill('12000')
  await dialog.getByLabel('Claim contact').fill('claims@example.invalid')
  await dialog.getByLabel('Nominee', { exact: true }).fill('Alex')
  await dialog.getByRole('button', { name: 'Add policy' }).click()
  await openSection(page, 'Resilience')
  await expect(page.getByText('EXAMPLE-0042')).toHaveCount(0)
  await expect(page.getByText(/never exported as a plaintext/u)).toBeVisible()
  await page.getByRole('button', { name: 'Show claim/contact sheet' }).click()
  const sheet = page.getByRole('list', { name: 'Claim and contact sheet' })
  await expect(sheet.getByText(/EXAMPLE-0042/u)).toBeVisible()
  await expect(sheet.getByText(/claims@example.invalid/u)).toBeVisible()
  await page.getByRole('button', { name: 'Hide claim/contact sheet' }).click()
  await expect(sheet).toHaveCount(0)
  await expect(page.getByText('EXAMPLE-0042')).toHaveCount(0)
})

test('recorded loan rate and fresh holding values drive chosen review thresholds', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'Stateful phone workflow')
  await createWorkspace(page)
  await openSection(page, 'Resilience')
  await page.getByLabel('Loan rate review threshold (%)').fill('12')
  await page.getByLabel('Single-holding concentration threshold (%)').fill('70')
  await page.getByRole('button', { name: 'Save review thresholds' }).click()

  await openSection(page, 'Loans & credit')
  await page.getByRole('button', { name: 'Add loan' }).first().click()
  const debt = page.getByRole('dialog', { name: 'Add loan' })
  await debt.getByLabel('Loan name').fill('Education loan')
  await debt.getByLabel('Original principal').fill('100000')
  await debt.getByLabel('Current outstanding').fill('80000')
  await debt.getByLabel('Base annual interest rate (%)').fill('18')
  await debt.getByRole('button', { name: 'Add loan' }).click()

  await openSection(page, 'Investments')
  for (const [name, units] of [
    ['Large fund', '9'],
    ['Small fund', '1'],
  ]) {
    await page.getByRole('button', { name: 'Add holding' }).first().click()
    const holding = page.getByRole('dialog', { name: 'Add holding' })
    await holding.getByLabel('Holding name').fill(name)
    await holding.getByLabel('Units', { exact: true }).fill(units)
    await holding.getByLabel('Average unit cost').fill('100')
    await holding.getByLabel('Current unit price').fill('100')
    await holding.getByRole('button', { name: 'Add holding' }).click()
  }
  await openSection(page, 'Alerts')
  const loanAlert = page.locator('article.alert-card').filter({
    hasText: 'Education loan rate meets your review threshold',
  })
  await expect(loanAlert).toBeVisible()
  await loanAlert.getByText('Why this alert').click()
  await expect(
    loanAlert.getByText(/Recorded rate 18%; chosen threshold 12%/u),
  ).toBeVisible()
  await expect(
    page.getByText('Large fund is 90% of recorded, included holdings.'),
  ).toBeVisible()
})
