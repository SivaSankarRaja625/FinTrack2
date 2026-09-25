import { expect } from '@playwright/test'

import { createWorkspace, openSection, test } from './support/finance'

test('generated alerts can be dismissed, restored, and snoozed', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'Stateful phone workflow')
  await createWorkspace(page)
  await openSection(page, 'Alerts')
  const expectedIncome = page
    .locator('.alert-card')
    .filter({ hasText: 'Expected income is not recorded' })
  await expect(expectedIncome).toBeVisible()
  await expectedIncome.getByRole('button', { name: 'Dismiss this occurrence' }).click()
  await expect(expectedIncome).toHaveCount(0)
  await page.getByRole('tab', { name: 'History' }).click()
  await page
    .locator('.history-row')
    .filter({ hasText: 'Expected income is not recorded' })
    .getByRole('button', { name: 'Allow again' })
    .click()
  await page.getByRole('tab', { name: 'Active' }).click()
  await expect(expectedIncome).toBeVisible()

  const backupDue = page
    .locator('.alert-card')
    .filter({ hasText: 'Complete backup is due' })
  await expect(backupDue).toBeVisible()
  await backupDue.getByRole('button', { name: 'Snooze 1 day' }).click()
  await expect(backupDue).toHaveCount(0)
  await page.getByRole('tab', { name: 'History' }).click()
  await expect(
    page.locator('.history-row').filter({ hasText: 'Complete backup is due' }),
  ).toBeVisible()
})
