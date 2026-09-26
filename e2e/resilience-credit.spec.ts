import { expect } from '@playwright/test'

import { appPin, createWorkspace, openSection, test } from './support/finance'

test('actual card statement reminders distinguish partial from full manual payment', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'Stateful phone workflow')
  await createWorkspace(page)
  await openSection(page, 'Loans & credit')
  await page.getByRole('button', { name: 'Add credit card' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add credit card' })
  await dialog.getByLabel('Account name').fill('Work card')
  await dialog.getByLabel('Opening balance').fill('-10000')
  await dialog.getByLabel('Statement date').fill('2026-02-10')
  await dialog.getByLabel('Actual statement due date').fill('2026-02-15')
  await dialog.getByLabel('Statement total').fill('10000')
  await dialog.getByLabel('Statement minimum').fill('1000')
  await dialog.getByRole('button', { name: 'Add credit card' }).click()

  await expect(
    page.locator('.credit-card-detail').filter({ hasText: 'Work card' }),
  ).toContainText('₹10,000')
  await openSection(page, 'Alerts')
  await expect(page.getByText('Work card statement needs review')).toBeVisible()

  await openSection(page, 'Loans & credit')
  await page.getByRole('button', { name: 'Edit Work card' }).click()
  const edit = page.getByRole('dialog', { name: 'Edit credit card' })
  await edit.getByLabel('Amount paid on statement').fill('2000')
  await edit.getByRole('button', { name: 'Save changes' }).click()
  await openSection(page, 'Alerts')
  await expect(page.getByText(/₹8,000 remains after the recorded payment/u)).toBeVisible()

  await openSection(page, 'Loans & credit')
  await page.getByRole('button', { name: 'Edit Work card' }).click()
  const finalEdit = page.getByRole('dialog', { name: 'Edit credit card' })
  await finalEdit.getByLabel('Amount paid on statement').fill('10000')
  await finalEdit.getByRole('button', { name: 'Save changes' }).click()
  await openSection(page, 'Alerts')
  await expect(page.getByText('Work card statement needs review')).toHaveCount(0)

  await page.reload()
  await page.getByLabel('App PIN').fill(appPin)
  await page.getByRole('button', { name: 'Unlock', exact: true }).click()
  await openSection(page, 'Loans & credit')
  await page.getByRole('button', { name: 'Edit Work card' }).click()
  await expect(
    page.getByRole('dialog', { name: 'Edit credit card' }).getByLabel('Statement total'),
  ).toHaveValue('10000.00')
})
