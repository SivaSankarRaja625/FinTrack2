import { expect } from '@playwright/test'

import { appPin, createWorkspace, openSection, test } from './support/finance'

test('Settings save profile changes and an expense category across navigation', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'Stateful phone workflow')
  await createWorkspace(page)
  await openSection(page, 'Settings')
  await page.getByRole('button', { name: 'Profile & preferences' }).click()
  const expectedIncome = page.getByLabel('Expected monthly take-home')
  await expectedIncome.fill('125000')
  await page.getByRole('button', { name: 'Save profile' }).click()
  await page.getByRole('button', { name: 'Categories' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Professional development')
  await page.getByRole('combobox', { name: 'Type', exact: true }).selectOption({
    label: 'Expense',
  })
  await page.getByRole('button', { name: 'Add category' }).click()
  await expect(page.getByText('Professional development', { exact: true })).toBeVisible()

  await openSection(page, 'Transactions')
  await openSection(page, 'Settings')
  await page.getByRole('button', { name: 'Profile & preferences' }).click()
  await expect(page.getByLabel('Expected monthly take-home')).toHaveValue('125000.00')
  await page.getByRole('button', { name: 'Categories' }).click()
  await expect(page.getByText('Professional development', { exact: true })).toBeVisible()
})

test('Alerts preserve configured thresholds and display active and history views', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'Stateful phone workflow')
  await createWorkspace(page)
  await openSection(page, 'Alerts')
  await page.getByRole('tab', { name: 'Settings' }).click()
  await page.getByLabel('Budget warning percentage').fill('55')
  await page.getByRole('button', { name: 'Save thresholds' }).click()
  await page.getByRole('tab', { name: 'History' }).click()
  await expect(page.getByRole('tab', { name: 'History' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await openSection(page, 'Settings')
  await openSection(page, 'Alerts')
  await page.getByRole('tab', { name: 'Settings' }).click()
  await expect(page.getByLabel('Budget warning percentage')).toHaveValue('55')
  await page.getByRole('tab', { name: 'Active' }).click()
  await expect(page.getByRole('tab', { name: 'Active' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
})

test('changing the app PIN accepts the new PIN after locking', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'Stateful phone workflow')
  test.slow()
  await createWorkspace(page)
  await openSection(page, 'Settings')
  await page.getByRole('button', { name: 'Security' }).click()
  await page.getByLabel('Current PIN').fill(appPin)
  await page.getByLabel('New PIN', { exact: true }).fill('Replacement2026')
  await page.getByLabel('Confirm new PIN').fill('Replacement2026')
  await page.getByRole('button', { name: 'Change PIN' }).click()
  await page.getByRole('button', { name: 'Lock FinTrack' }).click()
  await expect(page.getByRole('heading', { name: 'Unlock FinTrack' })).toBeVisible()
  await page.getByLabel('App PIN').fill('Replacement2026')
  await page.getByRole('button', { name: 'Unlock', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
})
