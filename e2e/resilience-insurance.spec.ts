import { expect } from '@playwright/test'

import { appPin, createWorkspace, openSection, test } from './support/finance'

test('insurance shows individual cover rather than adding unlike policies', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'Stateful phone workflow')
  await createWorkspace(page)
  await openSection(page, 'Insurance')
  await page.getByRole('button', { name: 'Add policy' }).first().click()
  const health = page.getByRole('dialog', { name: 'Add insurance policy' })
  await health.getByLabel('Insurer', { exact: true }).fill('Example insurer')
  await health.getByLabel('Policy name').fill('Family health')
  await health.getByLabel('Cover amount').fill('500000')
  await health.getByLabel('Premium', { exact: true }).fill('12000')
  await health.getByLabel('Insured people').fill('Ananya, Amma')
  await health.getByLabel('Cover source').selectOption('personal')
  await health.getByRole('button', { name: 'Add policy' }).click()
  await expect(
    page.getByRole('list', { name: 'Policies' }).getByText('Ananya, Amma'),
  ).toBeVisible()
  await expect(page.getByText('₹5,00,000 cover')).toBeVisible()
  await expect(page.getByText('Total cover', { exact: true })).toHaveCount(0)

  await page.getByRole('button', { name: 'Add policy' }).first().click()
  const term = page.getByRole('dialog', { name: 'Add insurance policy' })
  await term.getByLabel('Policy type').selectOption('term-life')
  await term.getByLabel('Insurer', { exact: true }).fill('Other insurer')
  await term.getByLabel('Policy name').fill('Term cover')
  await term.getByLabel('Cover amount').fill('10000000')
  await term.getByLabel('Premium', { exact: true }).fill('15000')
  await term.getByLabel('Insured people').fill('Ananya')
  await term.getByRole('button', { name: 'Add policy' }).click()
  await expect(page.getByText('₹1,00,00,000 cover')).toBeVisible()
  await expect(page.getByText('Total cover', { exact: true })).toHaveCount(0)

  await page.reload()
  await page.getByLabel('App PIN').fill(appPin)
  await page.getByRole('button', { name: 'Unlock', exact: true }).click()
  await openSection(page, 'Insurance')
  await expect(
    page.getByRole('list', { name: 'Policies' }).getByText('Ananya, Amma'),
  ).toBeVisible()
})

test('paying a premium does not silently confirm an insurance renewal', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'Stateful phone workflow')
  await createWorkspace(page)
  await openSection(page, 'Insurance')
  await page.getByRole('button', { name: 'Add policy' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Add insurance policy' })
  await dialog.getByLabel('Insurer', { exact: true }).fill('Example insurer')
  await dialog.getByLabel('Policy name').fill('Health plan')
  await dialog.getByLabel('Cover amount').fill('500000')
  await dialog.getByLabel('Premium', { exact: true }).fill('12000')
  await dialog.getByLabel('Next premium due').fill('2026-02-15')
  await dialog.getByLabel('Renewal date (optional)').fill('2026-02-15')
  await dialog.getByRole('button', { name: 'Add policy' }).click()
  await openSection(page, 'Alerts')
  await expect(
    page.getByText('Health plan premium and renewal need review'),
  ).toBeVisible()

  await openSection(page, 'Insurance')
  await page.getByRole('button', { name: 'Record premium payment' }).click()
  await openSection(page, 'Alerts')
  await expect(page.getByText('Health plan renewal needs confirmation')).toBeVisible()
  await expect(page.getByText('Health plan premium and renewal need review')).toHaveCount(
    0,
  )

  await openSection(page, 'Insurance')
  await page.getByRole('button', { name: 'Confirm policy renewal' }).click()
  await openSection(page, 'Alerts')
  await expect(page.getByText('Health plan renewal needs confirmation')).toHaveCount(0)
})
