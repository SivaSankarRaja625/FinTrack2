import { expect } from '@playwright/test'

import { appPin, createWorkspace, openSection, test } from './support/finance'

test('designated bank cash and optional second-line holdings stay separate', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'Stateful phone workflow')
  await createWorkspace(page)
  await openSection(page, 'Transactions')
  await page.getByRole('button', { name: 'Add account' }).first().click()
  const account = page.getByRole('dialog', { name: 'Add account' })
  await account.getByLabel('Account name').fill('Emergency bank')
  await account.getByLabel('Opening balance').fill('50000')
  await account.getByLabel('Count as immediate emergency reserve').check()
  await account.getByRole('button', { name: 'Add account' }).click()

  await openSection(page, 'Resilience')
  await expect(page.getByText('₹50,000', { exact: true })).toBeVisible()
  await expect(page.getByText('₹2,70,000', { exact: true })).toBeVisible()
  await page.getByLabel('Medical cost if needed').fill('10000')
  await page.getByLabel('Months without income').selectOption('3')
  await expect(page.getByText('₹95,000', { exact: true })).toBeVisible()

  await openSection(page, 'Investments')
  await page.getByRole('button', { name: 'Add holding' }).first().click()
  const holding = page.getByRole('dialog', { name: 'Add holding' })
  await holding.getByLabel('Holding name').fill('Chosen liquid fund')
  await holding.getByLabel('Units', { exact: true }).fill('200')
  await holding.getByLabel('Average unit cost').fill('100')
  await holding.getByLabel('Current unit price').fill('100')
  await holding.getByLabel('Reserve instrument').selectOption('liquid-fund')
  await holding.getByLabel('Expected access days').fill('2')
  await holding.getByRole('button', { name: 'Add holding' }).click()
  await openSection(page, 'Resilience')
  await expect(
    page
      .locator('.metric')
      .filter({ hasText: 'Second-line reserve' })
      .getByText('₹20,000'),
  ).toBeVisible()
  await expect(page.getByText(/not guaranteed to be immediate/u)).toBeVisible()
  await expect(page.getByLabel('Medical cost if needed')).toHaveValue('0')
  await page.getByLabel('Medical cost if needed').fill('10000')
  await page
    .getByLabel('Also count second-line funds after confirming access and risks')
    .check()
  await expect(
    page
      .locator('.metric')
      .filter({ hasText: 'Scenario shortfall' })
      .getByText('₹75,000'),
  ).toBeVisible()

  await page.reload()
  await page.getByLabel('App PIN').fill(appPin)
  await page.getByRole('button', { name: 'Unlock', exact: true }).click()
  await openSection(page, 'Resilience')
  await expect(page.getByLabel('Medical cost if needed')).toHaveValue('0')
  await expect(
    page.getByLabel('Also count second-line funds after confirming access and risks'),
  ).not.toBeChecked()
  await expect(page.getByText('₹50,000', { exact: true })).toBeVisible()
  await expect(
    page
      .locator('.metric')
      .filter({ hasText: 'Second-line reserve' })
      .getByText('₹20,000'),
  ).toBeVisible()
})
